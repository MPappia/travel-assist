import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { matchSite } from "@/lib/bookmarklet/shared";
import { SITE_CONFIGS } from "@/lib/bookmarklet/sites";
import { presetByKey } from "@/lib/domain/comparison-presets";
import { buildFlightNotes, formatDurationInput, parseDurationInput } from "@/lib/domain/flights";
import { detectListingKind, extractListing } from "@/lib/listing-extract";
import { defaultComparisonFor, mapFlightToCriteria, NEW_COMPARISON } from "@/lib/listing-extract/criteria-mapping";
import { extractFlightFromText, looksLikeFlight, parseDuration, type FlightFields } from "@/lib/listing-extract/flight";
import { applyFlightLlmValues, buildFlightLlmRequest, parseFlightLlmContent } from "@/lib/listing-extract/llm";
import { runListingExtraction } from "@/server/listing-import";

const NOW = new Date("2026-10-01T12:00:00Z");
const fixture = (name: string) => readFileSync(`tests/fixtures/listings/${name}`, "utf8");
const flat = (fields: FlightFields | undefined) =>
  Object.fromEntries(
    Object.entries(fields ?? {})
      .filter(([k]) => k !== "outbound" && k !== "inbound")
      .map(([k, f]) => [k, f!.value]),
  );

describe("extracteur de vols — fixtures synthétiques", () => {
  it("Google Flights (fr) : aller avec escale, retour direct, 2 passagers, bagage payant", () => {
    const result = extractListing(
      { url: "https://www.google.com/travel/flights/booking?tfs=abc", text: fixture("google-flights-fr.synthetic.txt") },
      { now: NOW },
    );
    expect(result.kind).toBe("flight");
    expect(flat(result.flight)).toEqual({
      title: "CDG → NRT (aller-retour) · Finnair, Japan Airlines",
      totalPrice: 1248,
      currency: "EUR",
      passengers: 2,
      outboundDuration: 845,
      inboundDuration: 885,
      stops: 1,
      checkedBag: false,
      airlines: "Finnair, Japan Airlines",
      outboundSchedule: "CDG 10:05 → NRT 08:10 (+1)",
      inboundSchedule: "NRT 11:00 → CDG 17:45",
    });
    const outbound = result.flight!.outbound!.value;
    expect(outbound.segments.map((s) => [s.from.code, s.to.code, s.flightNumber, s.departure])).toEqual([
      ["CDG", "HEL", "AY 1572", "2027-03-19T10:05"],
      ["HEL", "NRT", "AY 73", "2027-03-19T17:10"],
    ]);
    // Arrivée le lendemain (+1)
    expect(outbound.segments[1].arrival).toBe("2027-03-20T08:10");
    expect(outbound.layovers).toEqual([{ airport: { code: "HEL", name: "Helsinki" }, durationMin: 190 }]);
    expect(result.flight!.inbound!.value.segments).toHaveLength(1);
    // Provenance affichée
    expect(result.flight!.checkedBag).toMatchObject({ source: "regex", note: "Bagage en soute : frais" });
    expect(result.flight!.stops?.note).toBe("aller + retour");
  });

  it("Skyscanner (fr) : prix par personne multiplié par les passagers, escale au retour", () => {
    const result = extractListing(
      { url: "https://www.skyscanner.fr/transport/vols/par/lis/", text: fixture("skyscanner-fr.synthetic.txt") },
      { now: NOW },
    );
    expect(result.kind).toBe("flight");
    const flight = result.flight!;
    expect(flight.totalPrice).toEqual({ value: 428, source: "regex", note: "214 EUR par personne × 2 passagers" });
    expect(flat(flight)).toMatchObject({
      passengers: 2,
      outboundDuration: 155,
      inboundDuration: 265,
      stops: 1,
      checkedBag: true,
      airlines: "TAP Air Portugal, Vueling",
    });
    expect(flight.inbound!.value.segments.map((s) => s.flightNumber)).toEqual(["VY 8461", "VY 8022"]);
    expect(flight.inbound!.value.layovers[0]).toEqual({ airport: { code: "BCN", name: "Barcelone" }, durationMin: 65 });
  });

  it("page générique (en) : aller simple en livres, repéré sans configuration de site", () => {
    const text = fixture("flight-confirmation-en.synthetic.txt");
    expect(looksLikeFlight(text)).toBe(true);
    const result = extractListing({ url: "https://example.com/booking/summary", text }, { now: NOW });
    expect(result.kind).toBe("flight");
    expect(flat(result.flight)).toEqual({
      title: "LHR → JFK · British Airways",
      totalPrice: 642,
      currency: "GBP",
      passengers: 1,
      outboundDuration: 485,
      stops: 0,
      checkedBag: true,
      airlines: "British Airways",
      outboundSchedule: "LHR 09:15 → JFK 12:20",
    });
    expect(result.flight!.outbound!.value.segments[0].flightNumber).toBe("BA 117");
    expect(result.flight!.inbound).toBeUndefined();
  });

  it("ne prend pas une annonce de logement pour un vol", () => {
    for (const name of ["booking-fr.txt", "airbnb-en.txt", "abritel-fr.synthetic.txt", "airbnb-fr.synthetic.txt"]) {
      expect(looksLikeFlight(fixture(name)), name).toBe(false);
      expect(extractListing({ text: fixture(name) }, { now: NOW }).kind, name).toBe("lodging");
    }
    // Un hôtel qui cite l'aéroport proche et ses horaires d'accueil reste un logement.
    expect(looksLikeFlight("Hôtel près de l'aéroport (CDG) et d'Orly (ORY)\nRéception 07:00 – 23:00")).toBe(false);
  });

  it("extrait ce qu'il peut d'un texte partiel, sans inventer", () => {
    const fields = extractFlightFromText("Vol Paris → Rome\nPrix : 189 €\nBagage en soute non inclus", { now: NOW });
    expect(flat(fields)).toEqual({ totalPrice: 189, currency: "EUR", checkedBag: false });
  });
});

describe("choix de l'extracteur", () => {
  it("par domaine (configuration des sites), puis indice du comparatif, puis contenu", () => {
    const flightText = fixture("google-flights-fr.synthetic.txt");
    expect(detectListingKind({ url: "https://www.google.fr/travel/flights/search?q=x", text: "" })).toBe("flight");
    expect(detectListingKind({ url: "https://www.skyscanner.net/transport/flights/lond/nyca/", text: "" })).toBe("flight");
    expect(detectListingKind({ url: "https://www.booking.com/hotel/fr/x.html", text: flightText })).toBe("lodging");
    expect(detectListingKind({ text: "Prix : 189 €", kindHint: "flight" })).toBe("flight");
    expect(detectListingKind({ text: flightText, kindHint: "lodging" })).toBe("lodging");
    expect(detectListingKind({ text: flightText })).toBe("flight");
  });

  it("Google : seules les pages /travel/flights relèvent de l'extracteur de vols", () => {
    expect(matchSite("www.google.com", "/travel/flights/booking", SITE_CONFIGS)?.id).toBe("google-flights");
    expect(matchSite("www.google.co.uk", "/travel/flights", SITE_CONFIGS)?.id).toBe("google-flights");
    expect(matchSite("www.google.com", "/search", SITE_CONFIGS)).toBeNull();
    expect(matchSite("www.google.com", "/travel/hotels/paris", SITE_CONFIGS)).toBeNull();
    expect(matchSite("www.skyscanner.fr", "/transport/vols/par/lis/", SITE_CONFIGS)?.kind).toBe("flight");
    expect(matchSite("secure.booking.com", "/hotel/fr/x.html", SITE_CONFIGS)?.kind).toBe("lodging");
  });
});

describe("durées", () => {
  it("lit les durées affichées par les sites", () => {
    expect(parseDuration("14 h 05")).toBe(845);
    expect(parseDuration("2h 55")).toBe(175);
    expect(parseDuration("8 hr 5 min")).toBe(485);
    expect(parseDuration("45 min")).toBe(45);
    expect(parseDuration("Direct")).toBeNull();
  });

  it("saisie et affichage au format « 14 h 05 »", () => {
    expect(formatDurationInput(845)).toBe("14 h 05");
    expect(formatDurationInput(45)).toBe("45 min");
    expect(formatDurationInput(undefined)).toBe("");
    for (const input of ["14 h 05", "14h05", "14:05", "845"]) expect(parseDurationInput(input), input).toBe(845);
    expect(parseDurationInput("3 h")).toBe(180);
    expect(parseDurationInput("45 min")).toBe(45);
    expect(parseDurationInput("")).toBeNull();
    expect(parseDurationInput("longtemps")).toBeNull();
  });
});

describe("pré-remplissage d'un comparatif « Vols »", () => {
  const criteria = presetByKey("flights").criteria.map((c, i) => ({ ...c, id: `c${i}` }));

  it("associe chaque champ au critère du modèle par son nom", () => {
    const flight = extractListing({ text: fixture("google-flights-fr.synthetic.txt"), kindHint: "flight" }, { now: NOW }).flight;
    const values = flat(flight) as Parameters<typeof mapFlightToCriteria>[1];
    const matches = mapFlightToCriteria(criteria, values);
    expect(Object.fromEntries(matches.map((m) => [m.criterion.name, m.value]))).toEqual({
      "Prix total": 1248,
      "Durée totale aller": 845,
      "Durée totale retour": 885,
      "Nombre d'escales": 1,
      "Bagage soute inclus": false,
      "Compagnie(s)": "Finnair, Japan Airlines",
      "Horaires aller": "CDG 10:05 → NRT 08:10 (+1)",
      "Horaires retour": "NRT 11:00 → CDG 17:45",
    });
    expect(matches.every((m) => m.matchedBy === "nom")).toBe(true);
  });

  it("propose le comparatif « Vols » du voyage, sinon sa création", () => {
    const comparisons = [
      { id: "l", name: "Logements", kind: "LODGING" },
      { id: "v", name: "Transport aérien", kind: "FLIGHTS" },
    ];
    expect(defaultComparisonFor("flight", comparisons)).toBe("v");
    expect(defaultComparisonFor("lodging", comparisons)).toBe("l");
    expect(defaultComparisonFor("flight", [{ id: "g", name: "Vols Lisbonne", kind: "GENERIC" }])).toBe("g");
    expect(defaultComparisonFor("flight", [{ id: "l", name: "Logements", kind: "LODGING" }])).toBe(NEW_COMPARISON);
    expect(defaultComparisonFor("lodging", undefined)).toBe(NEW_COMPARISON);
  });

  it("résume trajets, passagers et date de relevé dans les notes", () => {
    const flight = extractListing({ text: fixture("skyscanner-fr.synthetic.txt"), kindHint: "flight" }, { now: NOW }).flight!;
    const notes = buildFlightNotes(
      { outbound: flight.outbound?.value, inbound: flight.inbound?.value, passengers: 2, currency: "EUR" },
      { domain: "skyscanner.fr", capturedAt: new Date(2026, 9, 1), priceNote: flight.totalPrice?.note },
    );
    expect(notes).toContain("Aller : CDG→LIS TP 433 (2027-07-12 08:40).");
    expect(notes).toContain("Retour : LIS→BCN VY 8461 (2027-07-19 18:25), BCN→CDG VY 8022 (2027-07-19 22:20) ; escale : BCN 1 h 05.");
    expect(notes).toContain("2 passagers.");
    expect(notes).toContain("Prix : 214 EUR par personne × 2 passagers.");
    expect(notes).toContain("Prix relevé sur skyscanner.fr le 1 octobre 2026.");
  });
});

describe("étage LLM des vols", () => {
  const config = { baseUrl: "http://llm.local/v1", model: "test-model", apiKey: null };
  const chat = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

  it("demande un JSON strict et valide champ par champ", () => {
    const request = buildFlightLlmRequest({ model: "m", text: "texte", url: null, missing: ["checkedBag"] });
    expect(request.response_format.json_schema.strict).toBe(true);
    expect(request.messages[1].content).toContain("checkedBag");
    // 42 passagers : valeur invalide ignorée, les autres champs sont conservés
    expect(parseFlightLlmContent("pas du JSON")).toBeNull();
    expect(parseFlightLlmContent('{"totalPrice": 300, "currency": "eur", "stops": null, "passengers": 42}')).toEqual({
      totalPrice: 300,
      currency: "EUR",
    });
  });

  it("ne remplace jamais une valeur trouvée par l'extracteur déterministe", () => {
    const merged = applyFlightLlmValues({ totalPrice: { value: 642, source: "regex" as const } }, { totalPrice: 1, checkedBag: true });
    expect(merged).toEqual({ totalPrice: { value: 642, source: "regex" }, checkedBag: { value: true, source: "llm" } });
  });

  it("complète les champs vides, sans champs « retour » pour un aller simple", async () => {
    const fetchImpl = vi.fn(async () =>
      chat('{"title":null,"totalPrice":999,"currency":null,"passengers":null,"outboundDuration":null,"inboundDuration":600,"stops":null,"checkedBag":null,"airlines":null,"outboundSchedule":null,"inboundSchedule":"JFK 18:00 → LHR 06:00"}'),
    );
    const text = fixture("flight-confirmation-en.synthetic.txt").replace("1 checked bag included", "");
    const extraction = await runListingExtraction({ text }, { llm: config, fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW });
    expect(extraction.kind).toBe("flight");
    expect(extraction.llm.status).toBe("ok");
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages[1].content).toContain("checkedBag");
    expect(body.messages[1].content).not.toContain("inboundDuration");
    // prix déterministe conservé ; champs « retour » ignorés
    expect(extraction.flight!.totalPrice).toMatchObject({ value: 642, source: "regex" });
    expect(extraction.flight!.inboundDuration).toBeUndefined();
    expect(extraction.flight!.inboundSchedule).toBeUndefined();
  });
});

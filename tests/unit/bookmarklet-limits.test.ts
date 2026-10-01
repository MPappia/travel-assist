import { readFileSync } from "node:fs";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { buildBookmarklet } from "@/lib/bookmarklet/generate";
import { IMPORT_LIMITS } from "@/lib/bookmarklet/limits";
import { extractListing } from "@/lib/listing-extract";
import { parseImportPayload } from "@/lib/listing-extract/payload";

import { buildBookingPage } from "../fixtures/listings/build-booking-page.mjs";

const NOW = new Date("2026-10-01T12:00:00Z");

/** Exécute le favori généré (minifié) sur une page et capture les champs envoyés. */
async function submit(html: string, pageUrl: string) {
  const dom = new JSDOM(html, { url: pageUrl, runScripts: "outside-only", pretendToBeVisual: true });
  const sent: Record<string, string>[] = [];
  dom.window.HTMLFormElement.prototype.submit = function (this: HTMLFormElement) {
    const fields: Record<string, string> = {};
    for (const el of Array.from(this.elements) as HTMLTextAreaElement[]) {
      // Comme un navigateur : les sauts de ligne des <textarea> partent en \r\n
      fields[el.name] = el.value.replace(/\r?\n/g, "\r\n");
    }
    sent.push(fields);
  };
  const { code } = await buildBookmarklet("http://localhost:3000");
  dom.window.eval(code);
  expect(sent).toHaveLength(1);
  return sent[0];
}

describe("favori sur une page Booking volumineuse", () => {
  it("respecte les limites partagées, même après conversion des sauts de ligne", async () => {
    const html = buildBookingPage();
    const fields = await submit(html, "https://www.booking.com/hotel/jp/apa-ryogoku.fr.html?checkin=2027-03-01&group_adults=2");

    expect(fields.text.length).toBeLessThanOrEqual(IMPORT_LIMITS.text);
    expect(fields.jsonld.length).toBeLessThanOrEqual(IMPORT_LIMITS.jsonLd);
    expect(fields.title.length).toBeLessThanOrEqual(IMPORT_LIMITS.title);
    expect(fields.url.length).toBeLessThanOrEqual(IMPORT_LIMITS.url);
    for (const value of Object.values(JSON.parse(fields.meta) as Record<string, string>)) {
      expect(value.length).toBeLessThanOrEqual(IMPORT_LIMITS.metaValue);
    }
    const total = Object.entries(fields).reduce((n, [k, v]) => n + k.length + 2 + encodeURIComponent(v).length, 0);
    expect(total).toBeLessThan(IMPORT_LIMITS.maxBodyBytes / 10);

    // JSON-LD : seul l'hôtel, sans avis ni équipements
    const jsonLd = JSON.parse(fields.jsonld) as string[];
    expect(jsonLd).toHaveLength(1);
    const hotel = JSON.parse(jsonLd[0]);
    expect(hotel["@type"]).toBe("Hotel");
    expect(hotel.review).toBeUndefined();
    expect(hotel.amenityFeature).toBeUndefined();

    // Texte : début de page + tableau des chambres repéré par #hprt-table (les avis sont écartés)
    expect(fields.text).toContain("APA Hotel & Resort Ryogoku Ekimae Tower");
    expect(fields.text).toContain("Tarif actuel € 371");
    expect(fields.text).not.toContain("Commentaire 1500");
    const notes = JSON.parse(fields.truncated) as string[];
    expect(notes).toEqual([
      expect.stringMatching(/^JSON-LD : 3 blocs → 1, \d+ Ko → 1 Ko/),
      expect.stringMatching(/^Texte : \d[\d ]+ → \d[\d ]+ caractères \(début de page \+ zone repérée \(#hprt-table\)\)$/),
    ]);
  });

  it("le serveur accepte l'envoi tel quel et l'extraction trouve prix, chambre, note et annulation", async () => {
    const fields = await submit(buildBookingPage(), "https://www.booking.com/hotel/jp/apa-ryogoku.fr.html");
    const result = parseImportPayload(fields);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Rien à tronquer côté serveur : seules les réductions du favori sont signalées
    expect(result.source.warnings).toHaveLength(2);
    expect(result.source.warnings!.every((w) => !w.includes("réduit par le serveur"))).toBe(true);

    const { fields: extracted } = extractListing(result.source, { now: NOW });
    expect(extracted.totalPrice?.value).toBe(371);
    expect(extracted.totalPrice?.note).toContain("Chambre Double - Non-Fumeurs - Sans Vue");
    expect(extracted.rating).toMatchObject({ value: 4.1, source: "jsonld" });
    expect(extracted.freeCancellation).toMatchObject({ value: true, note: "Annulation gratuite avant le 28 février 2027" });
    expect(extracted.nights?.value).toBe(5);
    expect(extracted.beds?.value).toBe(1);
  });

  it("la même page envoyée sans réduction (ancien favori) est réduite par le serveur, sans rejet", () => {
    const html = buildBookingPage();
    const dom = new JSDOM(html);
    const raw = {
      url: "https://www.booking.com/hotel/jp/apa-ryogoku.fr.html",
      jsonld: JSON.stringify(
        Array.from(dom.window.document.querySelectorAll('script[type="application/ld+json"]')).map((s) => s.textContent ?? ""),
      ),
      text: (dom.window.document.body.textContent ?? "").replace(/\n/g, "\r\n"),
    };
    expect(raw.text.length).toBeGreaterThan(100_000);
    expect(raw.jsonld.length).toBeGreaterThan(500_000);
    const result = parseImportPayload(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.text!.length).toBeLessThanOrEqual(IMPORT_LIMITS.text);
    expect(result.source.warnings!.every((w) => w.endsWith("(réduit par le serveur)"))).toBe(true);
    const { fields: extracted } = extractListing(result.source, { now: NOW });
    expect(extracted.totalPrice?.value).toBe(371);
    expect(extracted.rating?.value).toBe(4.1);
  });
});

describe("non-régression Airbnb", () => {
  it("la fiche Airbnb réelle passe par le favori sans réduction et donne la même extraction", async () => {
    const text = readFileSync("tests/fixtures/listings/airbnb-en.txt", "utf8");
    const html = `<!doctype html><html><head><title>Cabin - Airbnb</title></head><body><pre>${text.replace(/</g, "&lt;")}</pre></body></html>`;
    const fields = await submit(html, "https://www.airbnb.fr/rooms/123456");
    expect(JSON.parse(fields.truncated)).toEqual([]);
    const result = parseImportPayload(fields);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.warnings).toEqual([]);
    const { fields: extracted } = extractListing(result.source, { now: NOW });
    expect(Object.fromEntries(Object.entries(extracted).map(([k, f]) => [k, f!.value]))).toMatchObject({
      totalPrice: 227,
      nights: 1,
      rating: 4.84,
      reviewCount: 37,
      beds: 4,
      bedrooms: 2,
      guests: 6,
      freeCancellation: true,
    });
  });
});

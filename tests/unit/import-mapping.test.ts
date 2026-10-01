import { describe, expect, it } from "vitest";

import { COMPARISON_PRESETS } from "@/lib/domain/comparison-presets";
import { mapListingToCriteria, type MappableCriterion } from "@/lib/listing-extract/criteria-mapping";
import { buildImportNotes } from "@/lib/listing-extract/notes";
import { parseImportPayload, pastedContentSchema } from "@/lib/listing-extract/payload";

const lodging: MappableCriterion[] = COMPARISON_PRESETS.find((p) => p.key === "lodging")!.criteria.map((c, i) => ({
  ...c,
  id: `c${i}`,
}));

describe("mapListingToCriteria", () => {
  it("pré-remplit les critères du modèle « Logements »", () => {
    const matches = mapListingToCriteria(lodging, {
      totalPrice: 371,
      pricePerNight: 74.2,
      rating: 4.1,
      beds: 1,
      bedrooms: 1,
      freeCancellation: true,
      address: "Sumida",
    });
    expect(matches.map((m) => [m.criterion.name, m.value, m.matchedBy])).toEqual([
      ["Prix total du séjour", 371, "nom"],
      ["Note", 4.1, "nom"],
      ["Couchages", 1, "nom"],
      ["Annulation gratuite", true, "nom"],
    ]);
  });

  it("distingue prix total et prix par nuit, nombre d'avis et note", () => {
    const criteria: MappableCriterion[] = [
      { id: "a", name: "Prix / nuit", type: "NUMBER", unit: "€" },
      { id: "b", name: "Coût total", type: "NUMBER", unit: "€" },
      { id: "c", name: "Nombre d'avis", type: "NUMBER", unit: "" },
      { id: "d", name: "Évaluation", type: "RATING", unit: "" },
      { id: "e", name: "Quartier", type: "TEXT", unit: "" },
      { id: "f", name: "Notes", type: "TEXT", unit: "" },
      { id: "g", name: "Capacité", type: "NUMBER", unit: "" },
    ];
    const matches = mapListingToCriteria(criteria, {
      totalPrice: 900,
      pricePerNight: 150,
      reviewCount: 37,
      rating: 4.84,
      address: "Alfama",
      guests: 6,
    });
    expect(Object.fromEntries(matches.map((m) => [m.field, m.criterion.id]))).toEqual({
      pricePerNight: "a",
      totalPrice: "b",
      reviewCount: "c",
      rating: "d",
      guests: "g",
      address: "e",
    });
  });

  it("se rabat sur l'unité seulement sans ambiguïté et respecte les types", () => {
    const single = mapListingToCriteria([{ id: "x", name: "Hébergement", type: "NUMBER", unit: "€" }], { totalPrice: 500 });
    expect(single).toEqual([expect.objectContaining({ matchedBy: "unité", value: 500 })]);

    const ambiguous = mapListingToCriteria(
      [
        { id: "x", name: "Hébergement", type: "NUMBER", unit: "€" },
        { id: "y", name: "Ménage", type: "NUMBER", unit: "€" },
      ],
      { totalPrice: 500 },
    );
    expect(ambiguous).toEqual([]);

    // Une note hors 1–5 ne pré-remplit rien ; un critère texte ne reçoit pas de nombre.
    expect(mapListingToCriteria([{ id: "n", name: "Note", type: "RATING", unit: "" }], { rating: 0.5 })).toEqual([]);
    expect(mapListingToCriteria([{ id: "n", name: "Prix", type: "TEXT", unit: "" }], { totalPrice: 10 })).toEqual([]);
  });
});

describe("validation des données reçues", () => {
  const ok = (raw: Record<string, string>) => {
    const result = parseImportPayload(raw);
    if (!result.ok) throw new Error(result.error);
    return result.source;
  };

  it("accepte le formulaire du favori et ne garde que les balises og/twitter", () => {
    expect(
      ok({
        v: "2",
        url: "https://www.booking.com/hotel/jp/apa.fr.html",
        title: "APA Hotel",
        meta: JSON.stringify({ "og:title": "APA", description: "ignoré" }),
        jsonld: JSON.stringify(['{"@type":"Hotel"}']),
        images: JSON.stringify(["https://cf.bstatic.com/a.jpg"]),
        text: "Texte",
        truncated: JSON.stringify(["JSON-LD : 7 blocs → 1"]),
      }),
    ).toEqual({
      url: "https://www.booking.com/hotel/jp/apa.fr.html",
      title: "APA Hotel",
      meta: { "og:title": "APA" },
      jsonLd: ['{"@type":"Hotel"}'],
      images: ["https://cf.bstatic.com/a.jpg"],
      text: "Texte",
      warnings: ["JSON-LD : 7 blocs → 1"],
    });
  });

  it("accepte le texte Booking reçu avec des \\r\\n (cause du rejet) sans le tronquer", () => {
    // ~29 000 caractères en \n, mais ~30 000+ une fois les sauts de ligne convertis en \r\n par le navigateur
    const lines = Array.from({ length: 1037 }, (_, i) => `Ligne ${i}`.padEnd(27, "."));
    const text = lines.join("\r\n");
    expect(text.length).toBeGreaterThan(30_000);
    expect(lines.join("\n").length).toBeLessThanOrEqual(30_000);
    const source = ok({ text });
    expect(source.text).toBe(lines.join("\n"));
    expect(source.warnings).toEqual([]);
  });

  it("tronque au lieu de rejeter, avec un avertissement par champ", () => {
    const source = ok({
      url: `https://www.booking.com/hotel/x.html?${"q=1&".repeat(1000)}`,
      text: `Titre\n${"x".repeat(120_000)}`,
      meta: "{",
      images: JSON.stringify(["https://a/1", "https://a/2", "file:///etc/passwd", "https://a/3", "https://a/4"]),
      jsonld: JSON.stringify([JSON.stringify({ "@type": "Hotel", name: "H", review: "r".repeat(200_000) })]),
    });
    expect(source.url).toBe("https://www.booking.com/hotel/x.html");
    expect(source.text!.length).toBeLessThanOrEqual(30_000);
    expect(source.images).toEqual(["https://a/1", "https://a/2", "https://a/3"]);
    expect(source.jsonLd).toEqual([JSON.stringify({ "@type": "Hotel", name: "H" })]);
    expect(source.warnings).toEqual([
      "URL : paramètres retirés (réduit par le serveur)",
      "Balises og/twitter illisibles, ignorées (réduit par le serveur)",
      expect.stringMatching(/^JSON-LD : 1 bloc → 1, \d+ Ko → 1 Ko.*\(réduit par le serveur\)$/),
      "Images : 2 ignorée(s) (réduit par le serveur)",
      expect.stringMatching(/^Texte : 120 006 → \d[\d ]* caractères \(début de page seulement.*\(réduit par le serveur\)$/),
    ]);
  });

  it("refuse une adresse qui n'est pas en http(s)", () => {
    expect(parseImportPayload({ url: "javascript:alert(1)" }).ok).toBe(false);
  });

  it("copier-coller : accepte un texte long, refuse au-delà de 2 Mo", () => {
    expect(pastedContentSchema.parse({ text: "x".repeat(150_000), url: "" }).text).toHaveLength(150_000);
    expect(pastedContentSchema.safeParse({ text: "court" }).success).toBe(false);
    expect(pastedContentSchema.safeParse({ text: "é".repeat(1_000_001) }).success).toBe(false);
  });
});

describe("buildImportNotes", () => {
  it("résume le séjour, la chambre et l'annulation", () => {
    const notes = buildImportNotes(
      {
        domain: "booking.com",
        fields: {
          checkIn: { value: "2027-03-01", source: "regex" },
          checkOut: { value: "2027-03-06", source: "regex" },
          nights: { value: 5, source: "regex" },
          totalPrice: { value: 371, source: "regex", note: "Chambre Double : le moins cher des 59 tarifs" },
          freeCancellation: { value: true, source: "regex", note: "Annulation gratuite avant le 28 février 2027" },
        },
      },
      new Date("2026-10-01T12:00:00Z"),
    );
    expect(notes).toBe(
      [
        "Tarif relevé pour un séjour du 1 mars 2027 au 6 mars 2027 (5 nuits).",
        "Prix : Chambre Double : le moins cher des 59 tarifs.",
        "Annulation : Annulation gratuite avant le 28 février 2027.",
        "Importé depuis booking.com le 1 octobre 2026.",
      ].join("\n"),
    );
  });
});

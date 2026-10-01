import { describe, expect, it } from "vitest";

import { COMPARISON_PRESETS } from "@/lib/domain/comparison-presets";
import { mapListingToCriteria, type MappableCriterion } from "@/lib/listing-extract/criteria-mapping";
import { buildImportNotes } from "@/lib/listing-extract/notes";
import { bookmarkletPayloadSchema, pastedContentSchema, payloadToSource } from "@/lib/listing-extract/payload";

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
  it("accepte le formulaire du bookmarklet et ne garde que les balises og/twitter", () => {
    const parsed = bookmarkletPayloadSchema.parse({
      v: "1",
      url: "https://www.booking.com/hotel/jp/apa.fr.html",
      title: "APA Hotel",
      meta: JSON.stringify({ "og:title": "APA", description: "ignoré" }),
      jsonld: JSON.stringify(['{"@type":"Hotel"}']),
      images: JSON.stringify(["https://cf.bstatic.com/a.jpg"]),
      text: "Texte",
    });
    expect(payloadToSource(parsed)).toEqual({
      url: "https://www.booking.com/hotel/jp/apa.fr.html",
      title: "APA Hotel",
      meta: { "og:title": "APA" },
      jsonLd: ['{"@type":"Hotel"}'],
      images: ["https://cf.bstatic.com/a.jpg"],
      text: "Texte",
      warnings: [],
    });
  });

  it.each([
    ["texte trop long", { text: "a".repeat(30_001) }],
    ["URL non http", { url: "javascript:alert(1)" }],
    ["trop d'images", { images: JSON.stringify(["https://a/1", "https://a/2", "https://a/3", "https://a/4"]) }],
    ["JSON invalide", { meta: "{" }],
    ["image non http", { images: JSON.stringify(["file:///etc/passwd"]) }],
  ])("refuse : %s", (_label, payload) => {
    expect(bookmarkletPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("tronque le texte collé au lieu de le refuser", () => {
    const parsed = pastedContentSchema.parse({ text: "x".repeat(40_000), url: "" });
    expect(parsed.text).toHaveLength(30_000);
    expect(pastedContentSchema.safeParse({ text: "court" }).success).toBe(false);
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

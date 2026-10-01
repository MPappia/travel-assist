import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { IMPORT_LIMITS } from "@/lib/bookmarklet/limits";
import { pruneJsonLd, reduceListingText } from "@/lib/bookmarklet/shared";

const booking = readFileSync("tests/fixtures/listings/booking-fr.txt", "utf8");
const filler = (n: number) => Array.from({ length: n }, (_, i) => `Avis ${i} : très bon séjour, personnel aimable.`).join("\n");

describe("reduceListingText", () => {
  it("laisse intact un texte sous la limite et normalise les \\r\\n", () => {
    expect(reduceListingText("a\r\nb", IMPORT_LIMITS)).toEqual({ text: "a\nb", note: null });
  });

  it("garde le début de page et la zone des tarifs repérée par son en-tête", () => {
    const [top, rates] = booking.split("Disponibilité");
    const long = `${top}\n${filler(3000)}\nDisponibilité${rates}`;
    expect(long.length).toBeGreaterThan(100_000);
    const { text, note } = reduceListingText(long, IMPORT_LIMITS);
    expect(text.length).toBeLessThanOrEqual(IMPORT_LIMITS.text);
    expect(text).toContain("APA Hotel & Resort Ryogoku Ekimae Tower");
    expect(text).toContain("[…]");
    expect(text).toContain("Tarif actuel € 371");
    expect(note).toMatch(/début de page \+ zone des tarifs repérée par son en-tête/);
  });

  it("utilise la zone fournie par le DOM, sinon se rabat sur les montants en €", () => {
    const long = `Titre\n${filler(3000)}\n`;
    const fromDom = reduceListingText(long, IMPORT_LIMITS, "Chambre\n€ 120 par nuit", "#hprt-table");
    expect(fromDom.text.endsWith("Chambre\n€ 120 par nuit")).toBe(true);
    expect(fromDom.note).toContain("#hprt-table");

    const withAmounts = `${long}Offres\n€ 120\n€ 130 la nuit\n€ 150\nFin`;
    expect(reduceListingText(withAmounts, IMPORT_LIMITS).text).toContain("€ 130 la nuit");
    expect(reduceListingText(withAmounts, IMPORT_LIMITS).note).toContain("repérée par ses montants");
  });
});

describe("pruneJsonLd", () => {
  const hotel = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: "APA Hotel",
    aggregateRating: { "@type": "AggregateRating", ratingValue: 8.2, bestRating: 10, reviewCount: 16054 },
    review: Array.from({ length: 2000 }, (_, i) => ({ "@type": "Review", reviewBody: `Avis ${i} `.repeat(20) })),
    amenityFeature: Array.from({ length: 500 }, (_, i) => ({ name: `Équipement ${i}` })),
  };

  it("retire avis et champs inutilisés, écarte les types inutiles", () => {
    const blocks = [JSON.stringify(hotel), JSON.stringify({ "@type": "FAQPage", mainEntity: [] }), "{invalide"];
    expect(blocks[0].length).toBeGreaterThan(300_000);
    const { blocks: kept, note } = pruneJsonLd(blocks, IMPORT_LIMITS.jsonLd, IMPORT_LIMITS.jsonLdBlocks);
    expect(kept).toHaveLength(1);
    const node = JSON.parse(kept[0]);
    expect(node).toEqual({
      "@context": "https://schema.org",
      "@type": "Hotel",
      name: "APA Hotel",
      aggregateRating: { "@type": "AggregateRating", ratingValue: 8.2, bestRating: 10, reviewCount: 16054 },
    });
    expect(note).toMatch(/^JSON-LD : 3 blocs → 1, \d+ Ko → 1 Ko, types inutiles, avis et champs non utilisés retirés, 1 illisible$/);
  });

  it("garde les @graph contenant un type utile et respecte la limite", () => {
    const graph = JSON.stringify({ "@graph": [{ "@type": "WebPage", name: "x" }, { "@type": "Product", name: "P" }] });
    const hotelOnly = pruneJsonLd([JSON.stringify(hotel)], 10_000, 10).blocks;
    const limit = JSON.stringify(hotelOnly).length + 10; // place pour le bloc Hotel seulement
    const { blocks, note } = pruneJsonLd([graph, JSON.stringify(hotel)], limit, 10);
    // Le bloc Hotel (plus utile) passe en premier ; le @graph ne tient plus dans la limite.
    expect(blocks.map((b) => JSON.parse(b)["@type"] ?? "graph")).toEqual(["Hotel"]);
    expect(note).toContain("1 bloc(s) utile(s) écarté(s) faute de place");
    const roomy = pruneJsonLd([graph], 10_000, 10).blocks;
    expect(JSON.parse(roomy[0])["@graph"]).toEqual([{ "@type": "Product", name: "P" }]);
  });
});

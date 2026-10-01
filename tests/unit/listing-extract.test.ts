import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { extractListing, missingFields } from "@/lib/listing-extract";
import { parseStayDates } from "@/lib/listing-extract/dates";
import { parseAmount } from "@/lib/listing-extract/numbers";
import { parseRoomRates } from "@/lib/listing-extract/text";
import type { ListingFields } from "@/lib/listing-extract/types";

const NOW = new Date("2026-10-01T12:00:00Z");
const fixture = (name: string) => readFileSync(`tests/fixtures/listings/${name}`, "utf8");
const values = (fields: ListingFields) => Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f!.value]));
const sources = (fields: ListingFields) => Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f!.source]));

describe("fiches réelles fournies (texte copié depuis le navigateur)", () => {
  it("Airbnb (en) : prix total remisé, capacité, lits, note, annulation", () => {
    const { fields } = extractListing({ text: fixture("airbnb-en.txt") }, { now: NOW });
    expect(values(fields)).toMatchObject({
      title: "Cabin D/LakeSaiko 3-min/MtFujiView/BBQ/Wood stove",
      address: "Fujikawaguchiko, Japan",
      totalPrice: 227, // et non 253, le prix barré
      nights: 1,
      pricePerNight: 227,
      checkIn: "2027-03-19",
      checkOut: "2027-03-20",
      rating: 4.84,
      reviewCount: 37,
      beds: 4, // « 6 guests2 bedrooms4 beds » : compteurs collés
      bedrooms: 2,
      guests: 6,
      freeCancellation: true,
    });
    expect(fields.description?.value).toMatch(/^Weekend House Saiko offers luxury/);
    expect(fields.freeCancellation?.note).toBe("Free cancellation before March 14");
    expect(new Set(Object.values(sources(fields)))).toEqual(new Set(["regex"]));
  });

  it("Booking (fr) : tarif le moins cher pour 2 voyageurs, note /10 convertie", () => {
    const { fields } = extractListing({ text: fixture("booking-fr.txt") }, { now: NOW });
    expect(values(fields)).toMatchObject({
      title: "APA Hotel & Resort Ryogoku Ekimae Tower",
      address: "Préfecture de Tokyo, Tokyo, Sumida-ku Yokoami 1-11-10, Japon",
      totalPrice: 371,
      nights: 5,
      pricePerNight: 74.2,
      checkIn: "2027-03-01",
      checkOut: "2027-03-06",
      rating: 4.1,
      reviewCount: 16054,
      beds: 1, // « 1 lit double » de la chambre retenue
      guests: 2,
      freeCancellation: true,
    });
    expect(fields.totalPrice?.note).toContain("Chambre Double - Non-Fumeurs - Sans Vue");
    expect(fields.totalPrice?.note).toContain("pour 2 voyageurs");
    expect(fields.rating?.note).toBe("8,2/10 converti en 4,1/5");
    expect(fields.checkIn?.note).toBe("année déduite");
    expect(fields.description?.value).toMatch(/^Situé à Tokyo/);
  });

  it("Booking : analyse du tableau des chambres", () => {
    const rates = parseRoomRates(fixture("booking-fr.txt"));
    expect(rates.length).toBeGreaterThan(100);
    expect(rates[0]).toMatchObject({ room: "Chambre Double - Non-Fumeurs - Sans Vue", beds: 1, capacity: 2, price: 371 });
    const single = rates.find((r) => r.room === "Chambre Simple - Non-Fumeurs - Sans Vue");
    expect(single).toMatchObject({ capacity: 1, price: 324 });
    // Un tarif sans « Tarif actuel » prend le montant affiché seul
    expect(parseRoomRates("Chambre Familiale\n3 lits simples\nPersonnes max.: 4\n€ 1 008\nNon remboursable")).toEqual([
      {
        room: "Chambre Familiale",
        beds: 3,
        capacity: 4,
        price: 1008,
        freeCancellation: false,
        cancellationNote: "Non remboursable",
      },
    ]);
  });
});

describe("fiches synthétiques", () => {
  it("Abritel (fr) : total, prix par nuit, note /10", () => {
    const { fields } = extractListing({ text: fixture("abritel-fr.synthetic.txt") }, { now: NOW });
    expect(values(fields)).toMatchObject({
      title: "Maison avec piscine à 5 min de la plage",
      address: "Saint-Jean-de-Luz, Pyrénées-Atlantiques, France",
      totalPrice: 1450,
      pricePerNight: 207,
      nights: 7,
      checkIn: "2027-07-12",
      checkOut: "2027-07-19",
      rating: 4.7,
      reviewCount: 48,
      beds: 5,
      bedrooms: 4,
      guests: 8,
      freeCancellation: true,
    });
    expect(fields.pricePerNight?.note).toBeUndefined(); // lu sur la page, pas calculé
  });

  it("Airbnb (fr) : « au lieu de », nuits, dates jour/mois", () => {
    const { fields } = extractListing({ text: fixture("airbnb-fr.synthetic.txt") }, { now: NOW });
    expect(values(fields)).toMatchObject({
      title: "Studio lumineux avec terrasse – Alfama",
      address: "Lisbonne, Portugal",
      totalPrice: 368,
      nights: 3,
      checkIn: "2027-04-12",
      checkOut: "2027-04-15",
      rating: 4.92,
      reviewCount: 126,
      beds: 1,
      bedrooms: 1,
      guests: 2,
      freeCancellation: true,
    });
    expect(fields.pricePerNight).toMatchObject({ value: 122.67, note: "calculé : total ÷ 3 nuits" });
  });

  it("données du bookmarklet : og puis JSON-LD avant le texte, et provenance de chaque champ", () => {
    const { fields, images, siteName, domain } = extractListing(
      {
        url: "https://www.abritel.fr/location-vacances/p1234567",
        title: "Maison avec piscine à Saint-Jean-de-Luz - Abritel",
        meta: {
          "og:title": "Maison avec piscine à 5 min de la plage",
          "og:image": "/img/1.jpg",
          "og:site_name": "Abritel",
        },
        jsonLd: [
          "{invalide",
          JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              { "@type": "BreadcrumbList" },
              {
                "@type": ["VacationRental"],
                name: "Nom JSON-LD",
                description: "Description JSON-LD",
                address: { "@type": "PostalAddress", addressLocality: "Saint-Jean-de-Luz", addressCountry: "FR" },
                numberOfBedrooms: 4,
                occupancy: { "@type": "QuantitativeValue", maxValue: 8 },
                aggregateRating: { ratingValue: "9.6", bestRating: "10", reviewCount: 48 },
                offers: { "@type": "Offer", price: "1450", priceCurrency: "EUR" },
              },
            ],
          }),
        ],
        images: ["https://cdn.example.com/a.jpg", "https://www.abritel.fr/img/1.jpg"],
        text: "Maison\n5 lits\n1 200 € au total\nAnnulation gratuite",
      },
      { now: NOW },
    );
    expect(sources(fields)).toMatchObject({
      title: "og",
      description: "jsonld",
      image: "og",
      address: "jsonld",
      bedrooms: "jsonld",
      guests: "jsonld",
      rating: "jsonld",
      totalPrice: "jsonld",
      beds: "regex",
      freeCancellation: "regex",
    });
    expect(values(fields)).toMatchObject({
      title: "Maison avec piscine à 5 min de la plage",
      image: "https://www.abritel.fr/img/1.jpg",
      address: "Saint-Jean-de-Luz, FR",
      rating: 4.8,
      totalPrice: 1450,
    });
    expect(fields.rating?.note).toBe("9,6/10 converti en 4,8/5");
    expect(images).toEqual(["https://www.abritel.fr/img/1.jpg", "https://cdn.example.com/a.jpg"]);
    expect(siteName).toBe("Abritel");
    expect(domain).toBe("abritel.fr");
  });

  it("utilise le <title> nettoyé et og:title résumé (Airbnb)", () => {
    const { fields } = extractListing({
      title: "Cabane au bord du lac - Airbnb",
      meta: { "og:description": "Cabane · ★4,84 · 2 chambres · 4 lits · 1,5 salle de bain" },
    });
    expect(fields.title).toEqual({ value: "Cabane au bord du lac", source: "og", note: "balise <title>" });
    expect(values(fields)).toMatchObject({ rating: 4.84, bedrooms: 2, beds: 4 });
    expect(fields.rating?.source).toBe("og");
  });

  it("retire le suffixe de tarifs des titres Booking", () => {
    const fr = extractListing({ title: "APA Hotel & Resort Ryogoku Ekimae Tower, Tokyo – Tarifs 2027" });
    expect(fr.fields.title?.value).toBe("APA Hotel & Resort Ryogoku Ekimae Tower, Tokyo");
    const en = extractListing({ title: "Hotel Sintra – Updated 2027 Prices" });
    expect(en.fields.title?.value).toBe("Hotel Sintra");
  });

  it("liste les champs manquants pour l'étage LLM", () => {
    const { fields } = extractListing({ text: "Petite maison\n3 lits" });
    expect(missingFields(fields)).toContain("totalPrice");
    expect(missingFields(fields)).not.toContain("beds");
  });
});

describe("utilitaires", () => {
  it.each([
    ["227", 227],
    ["1 008", 1008],
    ["1 450", 1450],
    ["1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["74,5", 74.5],
    ["1,234", 1234],
  ])("parseAmount(%s) = %d", (raw, expected) => expect(parseAmount(raw)).toBe(expected));

  it("ignore des dates incohérentes", () => {
    expect(parseStayDates("CHECK-IN 3/20/2027 CHECKOUT 3/19/2027")).toBeNull();
    expect(parseStayDates("du 12 juil. – 19 juil.", new Date("2027-08-01T00:00:00Z"))).toEqual({
      checkIn: "2028-07-12",
      checkOut: "2028-07-19",
      inferredYear: true,
    });
  });
});

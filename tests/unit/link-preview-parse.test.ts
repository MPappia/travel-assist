import { describe, expect, it } from "vitest";

import { decodeHtmlEntities, extractJsonLd, parseLinkPreview, previewCompleteness } from "@/lib/link-preview/parse";

const bookingLike = `<!doctype html><html><head>
<meta charset="utf-8">
<title>Hôtel du Chiado – Booking</title>
<meta property="og:title" content="Hôtel do Chiado, Lisbonne &ndash; Tarifs 2026" />
<meta property="og:description" content="Situ&eacute; au c&#x153;ur de Lisbonne, à 200 m du métro." />
<meta property="og:image" content="/images/hotel.jpg" />
<meta property="og:site_name" content="Booking.com" />
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Hotel","name":"Hotel do Chiado","image":"https://cf.bstatic.com/x.jpg","aggregateRating":{"ratingValue":8.9}}</script>
</head><body>…</body></html>`;

describe("parseLinkPreview", () => {
  it("lit les balises Open Graph en priorité et résout les URL relatives", () => {
    const preview = parseLinkPreview(bookingLike, "https://www.booking.com/hotel/pt/chiado.fr.html?checkin=2026-07-01");
    expect(preview).toEqual({
      title: "Hôtel do Chiado, Lisbonne – Tarifs 2026",
      description: "Situé au cœur de Lisbonne, à 200 m du métro.",
      image: "https://www.booking.com/images/hotel.jpg",
      siteName: "Booking.com",
      domain: "booking.com",
    });
    expect(previewCompleteness(preview)).toBe("OK");
  });

  it("se rabat sur le JSON-LD quand Open Graph est absent", () => {
    const html = `<html><head><title>Annonce</title>
      <script type="application/ld+json">
        [{"@type":"BreadcrumbList"},{"@graph":[{"@type":"WebPage","name":"Page"},
         {"@type":["VacationRental"],"name":"Maison avec piscine","description":"6 couchages",
          "image":[{"@type":"ImageObject","url":"https://img.example/1.jpg"}]}]}]
      </script></head></html>`;
    const preview = parseLinkPreview(html, "https://www.abritel.fr/location/123");
    expect(preview.title).toBe("Maison avec piscine");
    expect(preview.description).toBe("6 couchages");
    expect(preview.image).toBe("https://img.example/1.jpg");
    expect(preview.domain).toBe("abritel.fr");
  });

  it("utilise <title> et meta description en dernier recours", () => {
    const html = `<head><TITLE> Mon   gîte </TITLE><meta name='description' content='Calme'></head>`;
    const preview = parseLinkPreview(html, "http://gite.example/");
    expect(preview.title).toBe("Mon gîte");
    expect(preview.description).toBe("Calme");
    expect(preview.image).toBeNull();
    expect(previewCompleteness(preview)).toBe("OK");
  });

  it("gère une page sans aucune information (ex. défi anti-robot)", () => {
    const preview = parseLinkPreview("<html><head></head><body><script>challenge()</script></body></html>", "https://airbnb.fr/rooms/1");
    expect(previewCompleteness(preview)).toBe("FAILED");
    expect(preview.domain).toBe("airbnb.fr");
  });

  it("ignore les images non http(s) et le JSON-LD invalide", () => {
    const html = `<head><meta property="og:title" content="X"><meta property="og:image" content="javascript:alert(1)">
      <script type="application/ld+json">{invalid</script></head>`;
    const preview = parseLinkPreview(html, "https://example.com/");
    expect(preview.image).toBeNull();
    expect(previewCompleteness(preview)).toBe("PARTIAL");
  });

  it("tronque les descriptions trop longues", () => {
    const long = "a".repeat(800);
    const preview = parseLinkPreview(`<meta property="og:description" content="${long}">`, "https://example.com/");
    expect(preview.description!.length).toBe(500);
  });
});

describe("helpers", () => {
  it("décode les entités HTML", () => {
    expect(decodeHtmlEntities("L&apos;h&ocirc;tel &amp; spa &#8211; 5&#x2605;")).toBe("L'hôtel & spa – 5★");
    expect(decodeHtmlEntities("&unknown;")).toBe("&unknown;");
  });

  it("choisit le nœud JSON-LD le plus pertinent", () => {
    const html = `<script type="application/ld+json">{"@type":"WebPage","name":"P"}</script>
      <script type="application/ld+json">{"@type":"Product","name":"Q"}</script>`;
    expect(extractJsonLd(html)?.name).toBe("Q");
  });
});

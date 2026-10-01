// FIXTURE SYNTHÉTIQUE (structure) construite à partir du TEXTE RÉEL d'une annonce Booking (booking-fr.txt) :
// en attendant le HTML réel, on reproduit les traits qui posent problème — un texte de page de plus de
// 100 000 caractères où le tableau des chambres (#hprt-table) arrive après de longs avis et une FAQ, et
// un JSON-LD de plusieurs centaines de Ko (avis, équipements, FAQ, fil d'Ariane).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function buildBookingPage() {
  const text = readFileSync(here("./booking-fr.txt"), "utf8");
  const split = text.indexOf("Disponibilité");
  const top = text.slice(0, split);
  const rates = text.slice(split);

  const reviews = Array.from(
    { length: 1500 },
    (_, i) => `Commentaire ${i + 1} — Séjour agréable, chambre propre, personnel attentionné ; le onsen est un vrai plus.`,
  ).join("\n");
  const faq = Array.from({ length: 300 }, (_, i) => `Question ${i + 1} : Quels sont les horaires du petit-déjeuner ?\nRéponse : de 6 h 30 à 10 h.`).join("\n");

  const hotel = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: "APA Hotel & Resort Ryogoku Ekimae Tower",
    description: "Situé à Tokyo, l'établissement 3 étoiles APA Hotel & Resort Ryogoku Ekimae Tower comprend une salle de sport.",
    image: "https://cf.bstatic.com/xdata/images/hotel/max1024x768/apa-ryogoku.jpg",
    address: { "@type": "PostalAddress", streetAddress: "Yokoami 1-11-10", addressLocality: "Tokyo", addressCountry: "JP" },
    aggregateRating: { "@type": "AggregateRating", ratingValue: 8.2, bestRating: 10, reviewCount: 16054 },
    priceRange: "Prix pour vos dates à partir de € 324",
    review: Array.from({ length: 1500 }, (_, i) => ({
      "@type": "Review",
      author: { "@type": "Person", name: `Voyageur ${i}` },
      reviewRating: { "@type": "Rating", ratingValue: 8 + (i % 3) },
      reviewBody: "Très bon emplacement, chambres propres et confortables, bains onsen agréables. ".repeat(3),
    })),
    amenityFeature: Array.from({ length: 400 }, (_, i) => ({ "@type": "LocationFeatureSpecification", name: `Équipement ${i}`, value: true })),
  };
  const jsonLd = [
    hotel,
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: Array.from({ length: 200 }, (_, i) => ({ "@type": "Question", name: `Q${i}`, acceptedAnswer: { "@type": "Answer", text: "Réponse ".repeat(30) } })) },
  ];

  return `<!doctype html>
<!-- FIXTURE SYNTHÉTIQUE : structure imitant Booking, texte réel de booking-fr.txt -->
<html lang="fr"><head><meta charset="utf-8">
<title>APA Hotel &amp; Resort Ryogoku Ekimae Tower, Tokyo – Tarifs 2027</title>
<link rel="canonical" href="https://www.booking.com/hotel/jp/apa-ryogoku.fr.html">
<meta property="og:title" content="APA Hotel &amp; Resort Ryogoku Ekimae Tower, Tokyo">
<meta property="og:image" content="https://cf.bstatic.com/xdata/images/hotel/max1024x768/apa-ryogoku.jpg">
<meta property="og:site_name" content="Booking.com">
${jsonLd.map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`).join("\n")}
</head><body>
<pre id="hotel-header">${escape(top)}</pre>
<pre id="reviews">${escape(reviews)}</pre>
<pre id="faq">${escape(faq)}</pre>
<div id="hprt-table"><pre>${escape(rates)}</pre></div>
</body></html>`;
}

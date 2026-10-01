// Faux services Photon, OpenRouteService et SerpApi pour les tests end-to-end (aucun appel réseau réel).
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

import { buildBookingPage } from "../fixtures/listings/build-booking-page.mjs";

const PORT = Number(process.env.MOCK_PORT ?? 3101);
export const MOCK_ORS_KEY = "test-key";
export const MOCK_SERPAPI_KEY = "test-serpapi-key";
let serpApiSearches = 0;

const PLACES = [
  ["Lyon", 45.764, 4.8357, "France"],
  ["Annecy", 45.8992, 6.1294, "France"],
  ["Chamonix-Mont-Blanc", 45.9237, 6.8694, "France"],
  ["Genève", 46.2044, 6.1432, "Suisse"],
  ["Grenoble", 45.1885, 5.7245, "France"],
  ["Briançon", 44.8986, 6.6436, "France"],
  ["Lac perdu", 45.5, 6.5, "France"], // point « non routable »
];
const UNROUTABLE = [6.5, 45.5];
const SPEEDS = { "driving-car": 80, "cycling-regular": 16, "foot-walking": 4.5 }; // km/h

function haversine([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function feature([name, lat, lng, country]) {
  return { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { name, country } };
}

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  // Page d'annonce fictive sur laquelle les tests exécutent le bookmarklet
  if (req.method === "GET" && url.pathname === "/annonce") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(readFileSync("tests/fixtures/listings/page-with-metadata.synthetic.html", "utf8"));
  }
  // Page d'annonce volumineuse (structure Booking, texte > 100 000 car., JSON-LD de plusieurs centaines de Ko)
  if (req.method === "GET" && url.pathname === "/annonce-volumineuse") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(buildBookingPage());
  }
  // SerpApi (Google Flights) : allers, retours (departure_token), quota épuisé pour l'origine « QQQ »
  if (req.method === "GET" && (url.pathname === "/search.json" || url.pathname === "/account.json")) {
    if (url.searchParams.get("api_key") !== MOCK_SERPAPI_KEY) return json(res, 401, { error: "Invalid API key." });
    if (url.pathname === "/account.json") {
      return json(res, 200, { api_key: MOCK_SERPAPI_KEY, searches_per_month: 250, this_month_usage: serpApiSearches, total_searches_left: 250 - serpApiSearches });
    }
    if (url.searchParams.get("departure_id") === "QQQ") return json(res, 429, { error: "Your account has run out of searches." });
    serpApiSearches += 1;
    const name = url.searchParams.has("departure_token") ? "google-flights-return" : "google-flights-outbound";
    return json(res, 200, JSON.parse(readFileSync(`tests/fixtures/serpapi/${name}.synthetic.json`, "utf8")));
  }
  if (req.method === "GET" && url.pathname === "/api") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    return json(res, 200, { features: PLACES.filter((p) => p[0].toLowerCase().includes(q)).map(feature) });
  }
  if (req.method === "GET" && url.pathname === "/reverse") {
    return json(res, 200, { features: [feature(["Lieu cliqué", 0, 0, "France"])] });
  }
  const match = url.pathname.match(/^\/v2\/directions\/([\w-]+)\/geojson$/);
  if (req.method === "POST" && match) {
    if (req.headers.authorization !== MOCK_ORS_KEY) return json(res, 401, { error: "Unauthorized" });
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const { coordinates } = JSON.parse(raw);
      const bad = coordinates.findIndex(([lng, lat]) => lng === UNROUTABLE[0] && lat === UNROUTABLE[1]);
      if (bad >= 0) {
        return json(res, 404, {
          error: {
            code: 2010,
            message: `Could not find routable point within a radius of 1000.0 meters of specified coordinate ${bad}: ${UNROUTABLE.join(" ")}.`,
          },
        });
      }
      const speed = SPEEDS[match[1]] ?? 50;
      const segments = coordinates.slice(1).map((c, i) => {
        const distance = Math.round(haversine(coordinates[i], c) * 1.3);
        return { distance, duration: Math.round((distance / 1000 / speed) * 3600) };
      });
      const sum = (k) => segments.reduce((s, x) => s + x[k], 0);
      json(res, 200, {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates },
            properties: { segments, summary: { distance: sum("distance"), duration: sum("duration") } },
          },
        ],
      });
    });
    return;
  }
  json(res, 404, { error: "not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`Faux services sur http://127.0.0.1:${PORT}`));

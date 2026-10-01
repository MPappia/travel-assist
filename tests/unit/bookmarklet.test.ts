import { readFileSync } from "node:fs";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { buildBookmarklet } from "@/lib/bookmarklet/generate";
import { IMPORT_LIMITS } from "@/lib/bookmarklet/limits";
import { matchSite, pruneJsonLd, reduceListingText } from "@/lib/bookmarklet/shared";
import { DEFAULT_ZONE_HEADERS, SITE_CONFIGS } from "@/lib/bookmarklet/sites";
import { sendToTravelerAssist } from "@/lib/bookmarklet/source";

const html = readFileSync("tests/fixtures/listings/page-with-metadata.synthetic.html", "utf8");
const PAGE_URL = "https://www.abritel.fr/location-vacances/p1234567?dates=2027-07-12";
const APP_URL = "http://localhost:3000";

interface Submission {
  action: string;
  method: string;
  target: string;
  fields: Record<string, string>;
  attachedWhenSubmitted: boolean;
}

/** Crée un DOM de test ; form.submit() (non implémenté par jsdom) est remplacé par une capture. */
function setup(markup = html) {
  const dom = new JSDOM(markup, { url: PAGE_URL, runScripts: "outside-only", pretendToBeVisual: true });
  const submissions: Submission[] = [];
  dom.window.HTMLFormElement.prototype.submit = function (this: HTMLFormElement) {
    const fields: Record<string, string> = {};
    for (const el of Array.from(this.elements) as HTMLTextAreaElement[]) fields[el.name] = el.value;
    submissions.push({
      action: this.action,
      method: this.method,
      target: this.target,
      fields,
      attachedWhenSubmitted: this.isConnected,
    });
  };
  return { dom, submissions };
}

/** Appelle le code source du favori avec la même configuration que le favori généré. */
function runBookmarklet(doc: Document, appUrl = APP_URL, debug = false) {
  return sendToTravelerAssist(
    appUrl,
    { limits: IMPORT_LIMITS, sites: SITE_CONFIGS, defaultZoneHeaders: DEFAULT_ZONE_HEADERS, debug },
    doc,
    { reduceListingText, pruneJsonLd, matchSite },
  );
}

function expectPayload(sub: Submission) {
  expect(sub.action).toBe("http://localhost:3000/import");
  expect(sub.method).toBe("post");
  expect(sub.target).toBe("_blank");
  expect(sub.attachedWhenSubmitted).toBe(true);

  const { fields } = sub;
  expect(fields.v).toBe("2");
  expect(fields.url).toBe("https://www.abritel.fr/location-vacances/p1234567");
  expect(fields.title).toBe("Maison avec piscine à Saint-Jean-de-Luz - Abritel");
  expect(JSON.parse(fields.meta)).toEqual({
    "og:title": "Maison avec piscine à 5 min de la plage",
    "og:description": "Grande maison familiale, jardin et piscine chauffée.",
    "og:image": "https://images.example.com/maison-1.jpg",
    "og:site_name": "Abritel",
    "twitter:card": "summary_large_image",
    "twitter:image": "https://images.example.com/maison-2.jpg",
  });
  // Seul le bloc utile est gardé (le fil d'Ariane est écarté)
  const jsonLd = JSON.parse(fields.jsonld) as string[];
  expect(jsonLd).toHaveLength(1);
  expect(JSON.parse(jsonLd[0])["@type"]).toBe("VacationRental");
  expect(JSON.parse(fields.truncated)).toEqual([expect.stringMatching(/^JSON-LD : 2 blocs → 1/)]);
  // og:image, twitter:image (déjà vue dans la page), puis la plus grande image http(s) restante ; ni logo ni data:
  expect(JSON.parse(fields.images)).toEqual([
    "https://images.example.com/maison-1.jpg",
    "https://images.example.com/maison-2.jpg",
    "https://www.abritel.fr/photos/salon.jpg",
  ]);
  expect(fields.text).toContain("1 450 € au total");
  expect(fields.text).not.toContain("ne doit pas apparaître");
  expect(fields.text).not.toContain("VacationRental");
}

describe("bookmarklet (code source)", () => {
  it("collecte la page et l'envoie par un formulaire POST, retiré ensuite du DOM", () => {
    const { dom, submissions } = setup();
    runBookmarklet(dom.window.document);
    expect(submissions).toHaveLength(1);
    expectPayload(submissions[0]);
    expect(dom.window.document.querySelector("form")).toBeNull();
  });

  it("tronque le texte à 30 000 caractères et se rabat sur l'URL de la page", () => {
    const long = "a".repeat(40_000);
    const { dom, submissions } = setup(`<html><head><title>T</title></head><body><p>${long}</p></body></html>`);
    runBookmarklet(dom.window.document, `${APP_URL}/`);
    const { fields, action } = submissions[0];
    expect(action).toBe("http://localhost:3000/import");
    expect(fields.text).toHaveLength(30_000);
    expect(fields.url).toBe(PAGE_URL);
    expect(JSON.parse(fields.images)).toEqual([]);
    expect(JSON.parse(fields.meta)).toEqual({});
    expect(JSON.parse(fields.truncated)[0]).toMatch(/^Texte : 40 000 → 30 000 caractères \(début de page seulement/);
  });

  it("prévient l'utilisateur si la CSP du site bloque l'envoi", () => {
    const { dom } = setup();
    const alerts: string[] = [];
    dom.window.alert = (message?: string) => void alerts.push(String(message));
    runBookmarklet(dom.window.document);
    const event = new dom.window.Event("securitypolicyviolation") as Event & { violatedDirective: string };
    event.violatedDirective = "form-action";
    dom.window.document.dispatchEvent(event);
    expect(alerts[0]).toContain("Coller le contenu de la page");
  });
});

describe("bookmarklet généré", () => {
  it("produit une URL javascript: minifiée et encodée qui fonctionne telle quelle", async () => {
    const bookmarklet = await buildBookmarklet(APP_URL);
    expect(bookmarklet.href.startsWith("javascript:")).toBe(true);
    expect(bookmarklet.href).not.toMatch(/[\s"<>]/);
    expect(bookmarklet.code).not.toContain("⚠️"); // commentaires retirés
    const sources = [sendToTravelerAssist, reduceListingText, pruneJsonLd, matchSite].reduce((n, f) => n + f.toString().length, 0);
    expect(bookmarklet.code.length).toBeLessThan(sources);

    const { dom, submissions } = setup();
    // Le navigateur décode l'URL javascript: avant de l'exécuter dans la page.
    const completion = dom.window.eval(decodeURIComponent(bookmarklet.href.slice("javascript:".length)));
    // Valeur indéfinie : sinon le navigateur remplacerait la page par le résultat du script.
    expect(completion).toBeUndefined();
    expect(submissions).toHaveLength(1);
    expectPayload(submissions[0]);
  });

  it("injecte l'URL de l'application", async () => {
    const bookmarklet = await buildBookmarklet("https://voyages.example.org/app");
    const { dom, submissions } = setup();
    dom.window.eval(bookmarklet.code);
    expect(submissions[0].action).toBe("https://voyages.example.org/app/import");
  });
});

describe("favori de diagnostic", () => {
  it("affiche la taille de chaque champ, telle qu'envoyée, sans rien soumettre", async () => {
    const { dom, submissions } = setup();
    const alerts: string[] = [];
    dom.window.alert = (message?: string) => void alerts.push(String(message));
    const bookmarklet = await buildBookmarklet(APP_URL, { debug: true });
    expect(dom.window.eval(bookmarklet.code)).toBeUndefined();
    expect(submissions).toHaveLength(0);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("rien n'a été envoyé");
    // Les sauts de ligne deviennent \r\n à l'envoi : la taille envoyée est plus grande que le texte.
    const textLine = alerts[0].split("\n").find((l) => l.startsWith("text : "))!;
    const [, chars, sent] = textLine.match(/text : (\d+) car\. → (\d+) envoyés/)!;
    expect(Number(sent)).toBeGreaterThan(Number(chars));
    expect(alerts[0]).toMatch(/jsonld : \d+ car\./);
    expect(alerts[0]).toMatch(/Total : \d+ Ko/);
  });
});

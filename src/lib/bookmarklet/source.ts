// Code du bookmarklet « Envoyer à Traveler Assist », maintenu en clair.
//
// ⚠️ Cette fonction est sérialisée avec Function.prototype.toString() puis minifiée (voir generate.ts) :
// elle doit rester AUTONOME — aucune référence à un import, une constante ou une fonction du module,
// uniquement ses paramètres, des variables locales et les objets du navigateur. Les limites
// (limits.ts), la configuration des sites (sites.ts) et les fonctions de réduction (shared.ts) lui sont
// passées en paramètres à la génération. Les types TypeScript sont effacés à la compilation.
//
// Au clic, elle collecte des informations sur la page courante, les réduit aux limites partagées avec le
// serveur, et les envoie par un <form method="POST" target="_blank"> (pas de fetch : pas de CORS).
// Le serveur ne crée rien sans confirmation de l'utilisateur.
import type { ImportLimits } from "@/lib/bookmarklet/limits";
import type { matchSite, pruneJsonLd, reduceListingText } from "@/lib/bookmarklet/shared";
import type { SiteConfig } from "@/lib/bookmarklet/sites";

export interface BookmarkletOptions {
  /** Mode diagnostic : affiche la taille de chaque champ au lieu d'envoyer. */
  debug?: boolean;
}

export interface BookmarkletConfig extends BookmarkletOptions {
  limits: ImportLimits;
  sites: SiteConfig[];
  defaultZoneHeaders: string[];
}

export interface BookmarkletHelpers {
  reduceListingText: typeof reduceListingText;
  pruneJsonLd: typeof pruneJsonLd;
  matchSite: typeof matchSite;
}

export function sendToTravelerAssist(
  appUrl: string,
  config: BookmarkletConfig,
  doc: Document,
  helpers: BookmarkletHelpers,
): HTMLFormElement | null {
  const limits = config.limits;
  const truncated: string[] = [];
  const win = doc.defaultView;

  function absolute(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
      const resolved = new URL(url, doc.baseURI);
      return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.href : null;
    } catch {
      return null;
    }
  }
  /** Texte visible d'un élément (innerText, ou textContent sans scripts quand innerText est absent). */
  function visibleText(el: HTMLElement | null): string {
    if (!el) return "";
    if (typeof el.innerText === "string") return el.innerText;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, style, noscript, template").forEach((n) => n.remove());
    return clone.textContent || "";
  }
  /**
   * Le navigateur convertit les sauts de ligne en \r\n à l'envoi : on tronque pour que la longueur
   * réellement transmise respecte la limite.
   */
  function fitSent(value: string, max: number): string {
    let v = value;
    for (let i = 0; i < 5; i++) {
      const sent = v.length + (v.match(/\n/g) || []).length;
      if (sent <= max) return v;
      v = v.slice(0, Math.max(0, v.length - (sent - max)));
    }
    return v;
  }

  // 1. URL canonique
  const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const ogUrl = doc.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  let url = absolute(canonical?.getAttribute("href")) || absolute(ogUrl?.content) || doc.location.href;
  if (url.length > limits.url) {
    url = doc.location.origin + doc.location.pathname;
    truncated.push("URL : paramètres retirés (adresse trop longue)");
  }
  url = url.slice(0, limits.url);

  // 2. Balises og:* et twitter:*
  const meta: Record<string, string> = {};
  let metaCut = 0;
  doc.querySelectorAll<HTMLMetaElement>("meta[property], meta[name]").forEach((el) => {
    const key = (el.getAttribute("property") || el.getAttribute("name") || "").toLowerCase();
    if ((key.indexOf("og:") === 0 || key.indexOf("twitter:") === 0) && el.content && !(key in meta)) {
      if (Object.keys(meta).length >= limits.metaEntries) return void metaCut++;
      if (el.content.length > limits.metaValue) metaCut++;
      meta[key.slice(0, 100)] = el.content.slice(0, limits.metaValue);
    }
  });
  if (metaCut) truncated.push(`Balises og/twitter : ${metaCut} tronquée(s) ou ignorée(s)`);

  // 3. JSON-LD : blocs utiles uniquement, élagués
  const rawJsonLd: string[] = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    const text = (el.textContent || "").trim();
    if (text) rawJsonLd.push(text);
  });
  const pruned = helpers.pruneJsonLd(rawJsonLd, limits.jsonLd, limits.jsonLdBlocks);
  if (pruned.note) truncated.push(pruned.note);

  // 4. Images principales : balises sociales d'abord, puis les plus grandes images de la page
  const images: string[] = [];
  const addImage = (src: string | null | undefined) => {
    const abs = absolute(src);
    if (abs && abs.length <= limits.imageUrl && images.indexOf(abs) < 0 && images.length < limits.images) images.push(abs);
  };
  addImage(meta["og:image:secure_url"]);
  addImage(meta["og:image"]);
  addImage(meta["twitter:image"]);
  Array.prototype.slice
    .call(doc.images)
    .map((img: HTMLImageElement) => {
      const rect = img.getBoundingClientRect();
      const area = Math.max(
        rect.width * rect.height,
        img.naturalWidth * img.naturalHeight,
        (Number(img.getAttribute("width")) || 0) * (Number(img.getAttribute("height")) || 0),
      );
      return { src: img.currentSrc || img.src, area };
    })
    .filter((c: { area: number }) => c.area >= 40000) // ~ 200 × 200 px : ignore icônes et avatars
    .sort((a: { area: number }, b: { area: number }) => b.area - a.area)
    .forEach((c: { src: string }) => addImage(c.src));

  // 5. Texte : début de page + zone pertinente (tarifs, détail du vol) si la page est trop longue,
  //    ou toujours sur les sites où plusieurs offres se mélangent (vols)
  const rawText = visibleText(doc.body);
  const site = helpers.matchSite(doc.location.hostname, doc.location.pathname, config.sites);
  let ratesText: string | null = null;
  let ratesSource: string | null = null;
  if (rawText.length > limits.text || (site && site.alwaysUseZone)) {
    const selectors = site ? site.zoneSelectors : [];
    for (const selector of selectors) {
      let el: HTMLElement | null = null;
      try {
        el = doc.querySelector<HTMLElement>(selector);
      } catch {
        el = null; // sélecteur invalide : ignoré
      }
      const t = visibleText(el);
      if (t.trim()) {
        ratesText = t;
        ratesSource = selector;
        break;
      }
    }
    if (!ratesText) {
      const headers = site ? site.zoneHeaders : config.defaultZoneHeaders;
      const tables = Array.prototype.slice.call(doc.querySelectorAll("table, [role='table'], [role='grid']")) as HTMLElement[];
      for (const table of tables) {
        const t = visibleText(table);
        if (headers.some((h) => t.indexOf(h) >= 0)) {
          ratesText = t;
          ratesSource = "tableau « " + (headers.filter((h) => t.indexOf(h) >= 0)[0] || "") + " »";
          break;
        }
      }
    }
  }
  const reduced = helpers.reduceListingText(rawText, limits, ratesText, ratesSource, {
    force: !!(site && site.alwaysUseZone),
    headChars: site && site.headChars ? site.headChars : undefined,
  });
  if (reduced.note) truncated.push(reduced.note);
  const text = fitSent(reduced.text, limits.text);

  const fields: Record<string, string> = {
    v: "2",
    url,
    title: fitSent(doc.title || "", limits.title),
    meta: JSON.stringify(meta),
    jsonld: JSON.stringify(pruned.blocks),
    images: JSON.stringify(images),
    text,
    truncated: JSON.stringify(truncated.slice(0, limits.truncatedNotes)),
  };

  if (config.debug) {
    // Tailles telles que le serveur les recevra : le navigateur convertit les sauts de ligne des
    // <textarea> en \r\n à l'envoi, puis le formulaire est encodé (application/x-www-form-urlencoded).
    const lines = Object.keys(fields).map((name) => {
      const value = fields[name];
      const sent = value.replace(/\r?\n/g, "\r\n");
      const encoded = encodeURIComponent(sent).length;
      return `${name} : ${value.length} car. → ${sent.length} envoyés (${Math.round(encoded / 1024)} Ko encodés)`;
    });
    const total = Object.keys(fields).reduce(
      (sum, name) => sum + name.length + 2 + encodeURIComponent(fields[name].replace(/\r?\n/g, "\r\n")).length,
      0,
    );
    const report =
      `Traveler Assist — diagnostic (rien n'a été envoyé)\n\n${lines.join("\n")}\n\nTotal : ${Math.round(total / 1024)} Ko` +
      `\nSite : ${site ? site.id : "non configuré"} ; texte brut : ${rawText.length} car. ; zone : ${ratesSource || "non repérée dans le DOM"}` +
      (truncated.length ? `\n\nRéductions :\n- ${truncated.join("\n- ")}` : "");
    if (win) win.alert(report);
    return null;
  }

  const form = doc.createElement("form");
  form.method = "POST";
  form.action = appUrl.replace(/\/+$/, "") + "/import";
  form.target = "_blank";
  form.acceptCharset = "UTF-8";
  form.style.display = "none";
  Object.keys(fields).forEach((name) => {
    const input = doc.createElement("textarea");
    input.name = name;
    input.value = fields[name];
    form.appendChild(input);
  });

  // Certains sites interdisent l'envoi de formulaires vers d'autres domaines (CSP form-action).
  const onViolation = (event: SecurityPolicyViolationEvent) => {
    if (String(event.violatedDirective).indexOf("form-action") === 0 && win) {
      win.alert(
        "Ce site bloque l'envoi vers Traveler Assist.\n" +
          "Copiez le contenu de la page (Ctrl+A, Ctrl+C) puis utilisez « Coller le contenu de la page » dans l'application.",
      );
    }
  };
  doc.addEventListener("securitypolicyviolation", onViolation);
  if (win) win.setTimeout(() => doc.removeEventListener("securitypolicyviolation", onViolation), 3000);

  (doc.body || doc.documentElement).appendChild(form);
  form.submit();
  form.remove();
  return form;
}

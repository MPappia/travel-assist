// Code du bookmarklet « Envoyer à Traveler Assist », maintenu en clair.
//
// ⚠️ Cette fonction est sérialisée avec Function.prototype.toString() puis minifiée (voir generate.ts) :
// elle doit rester AUTONOME — aucune référence à un import, une constante ou une fonction du module,
// uniquement des variables locales et les objets du navigateur. Les types TypeScript sont effacés à la compilation.
//
// Au clic, elle collecte des informations sur la page courante et les envoie à l'application par un
// <form method="POST" target="_blank"> (pas de fetch : pas de CORS). Le serveur ne crée rien sans
// confirmation de l'utilisateur.

/** Nombre maximal de caractères de texte envoyés. */
export const MAX_TEXT_LENGTH = 30_000;
/** Nombre maximal d'images envoyées. */
export const MAX_IMAGES = 3;

export interface BookmarkletOptions {
  /** Mode diagnostic : affiche la taille de chaque champ au lieu d'envoyer. */
  debug?: boolean;
}

export function sendToTravelerAssist(
  appUrl: string,
  options: BookmarkletOptions = {},
  doc: Document = document,
): HTMLFormElement | null {
  const MAX_TEXT = 30000; // = MAX_TEXT_LENGTH (dupliqué : la fonction doit rester autonome)
  const MAX_IMG = 3; // = MAX_IMAGES

  function absolute(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
      const resolved = new URL(url, doc.baseURI);
      return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.href : null;
    } catch {
      return null;
    }
  }

  // 1. URL canonique
  const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const ogUrl = doc.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  const url = absolute(canonical?.getAttribute("href")) || absolute(ogUrl?.content) || doc.location.href;

  // 2. Balises og:* et twitter:*
  const meta: Record<string, string> = {};
  doc.querySelectorAll<HTMLMetaElement>("meta[property], meta[name]").forEach((el) => {
    const key = (el.getAttribute("property") || el.getAttribute("name") || "").toLowerCase();
    if ((key.indexOf("og:") === 0 || key.indexOf("twitter:") === 0) && el.content && !(key in meta)) {
      meta[key] = el.content.slice(0, 2000);
    }
  });

  // 3. Blocs JSON-LD (texte brut, analysé côté serveur)
  const jsonLd: string[] = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    const text = (el.textContent || "").trim();
    if (text && jsonLd.length < 10) jsonLd.push(text.slice(0, 100000));
  });

  // 4. Images principales : balises sociales d'abord, puis les plus grandes images de la page
  const images: string[] = [];
  const addImage = (src: string | null | undefined) => {
    const abs = absolute(src);
    if (abs && images.indexOf(abs) < 0 && images.length < MAX_IMG) images.push(abs);
  };
  addImage(meta["og:image:secure_url"]);
  addImage(meta["og:image"]);
  addImage(meta["twitter:image"]);
  const candidates = Array.prototype.slice
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
    .sort((a: { area: number }, b: { area: number }) => b.area - a.area);
  candidates.forEach((c: { src: string }) => addImage(c.src));

  // 5. Texte visible (innerText ; repli sur textContent sans scripts ni styles)
  let text = doc.body ? doc.body.innerText : "";
  if (typeof text !== "string" && doc.body) {
    const clone = doc.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, style, noscript, template").forEach((el) => el.remove());
    text = clone.textContent || "";
  }
  text = (text || "").slice(0, MAX_TEXT);

  // Envoi par formulaire POST dans un nouvel onglet
  const fields: Record<string, string> = {
    v: "1",
    url,
    title: (doc.title || "").slice(0, 500),
    meta: JSON.stringify(meta),
    jsonld: JSON.stringify(jsonLd),
    images: JSON.stringify(images),
    text,
  };
  if (options.debug) {
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
    const report = `Traveler Assist — diagnostic (rien n'a été envoyé)\n\n${lines.join("\n")}\n\nTotal : ${Math.round(total / 1024)} Ko`;
    if (doc.defaultView) doc.defaultView.alert(report);
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
  const win = doc.defaultView;
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

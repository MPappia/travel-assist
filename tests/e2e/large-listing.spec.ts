import { expect, test } from "@playwright/test";

import { createTrip } from "./helpers";

test("une annonce volumineuse (JSON-LD de plusieurs centaines de Ko, texte > 100 000 caractères) passe sans rejet", async ({
  page,
  context,
}) => {
  await createTrip(page, { name: "Tokyo en mars" });
  await page.goto("/import/setup");
  const href = await page.getByTestId("bookmarklet-code").inputValue();

  await page.goto("http://127.0.0.1:3101/annonce-volumineuse");
  const sizes = await page.evaluate(() => ({
    text: document.body.innerText.length,
    jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).reduce(
      (n, s) => n + (s.textContent ?? "").length,
      0,
    ),
  }));
  expect(sizes.text).toBeGreaterThan(100_000);
  expect(sizes.jsonLd).toBeGreaterThan(300_000);

  const popupPromise = context.waitForEvent("page");
  await page.evaluate((code) => window.eval(code), decodeURIComponent(href.slice("javascript:".length)));
  const popup = await popupPromise;
  await popup.waitForURL(/\/import\/[a-z0-9]+$/); // et non /import/setup?erreur=…

  await expect(popup.getByLabel("Prix total (€)")).toHaveValue("371");
  await expect(popup.getByText(/Chambre Double - Non-Fumeurs - Sans Vue/).first()).toBeVisible();
  await expect(popup.getByLabel("Note (/5)")).toHaveValue("4,1");
  await expect(popup.getByLabel("Annulation gratuite", { exact: true })).toHaveValue("true");

  // Les réductions sont signalées discrètement
  const warnings = popup.getByTestId("import-warnings");
  await expect(warnings).toContainText("Page volumineuse : données réduites avant analyse");
  await warnings.locator("summary").click();
  await expect(warnings).toContainText("JSON-LD : 3 blocs → 1");
  // Page servie hors booking.com : pas de sélecteur de site, la zone est repérée par l'en-tête du tableau
  // (le chemin #hprt-table est couvert par le test unitaire sur une URL booking.com).
  await expect(warnings).toContainText(/Texte : [\d\s]+ → [\d\s]+ caractères \(début de page \+ zone des tarifs repérée par son en-tête\)/);
});

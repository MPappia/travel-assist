import { expect, test } from "@playwright/test";

import { createTrip } from "./helpers";

// Texte d'annonce sans aucune note ni distance : l'import ne remplit qu'une partie des critères.
const LISTING_WITHOUT_RATING = [
  "Chalet des Aravis",
  "Chalet · 6 voyageurs · 3 chambres · 4 lits",
  "900 € au total",
  "7 nuits · 1 juil. – 8 juil. 2027",
  "Annulation gratuite jusqu'au 20 juin",
].join("\n");

test("un import sans note obtient un score partiel, non pénalisé", async ({ page }) => {
  await createTrip(page, { name: "Été dans les Aravis" });
  await page.getByRole("link", { name: "Comparatifs" }).click();
  await page.getByRole("button", { name: "Nouveau comparatif" }).click();
  await page.getByRole("dialog").getByLabel("Nom", { exact: true }).fill("Logements Aravis");
  await page.getByRole("dialog").getByRole("button", { name: "Créer le comparatif" }).click();
  await expect(page.getByRole("heading", { name: "Logements Aravis" })).toBeVisible();

  // Élément de référence, saisi entièrement à la main (5 critères sur 5)
  await page.getByRole("button", { name: "Ajouter manuellement" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titre").fill("Gîte complet");
  await dialog.getByLabel("Prix total du séjour (€)").fill("900");
  await dialog.getByLabel("Note", { exact: true }).selectOption("5");
  await dialog.getByLabel("Couchages", { exact: true }).fill("4");
  await dialog.getByLabel("Distance au centre (km)").fill("2");
  await dialog.getByLabel("Annulation gratuite").selectOption("true");
  await dialog.getByRole("button", { name: "Ajouter" }).click();
  await expect(dialog).toBeHidden();

  // Annonce importée par copier-coller, sans note
  await page.getByRole("button", { name: "Ajouter manuellement" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Coller le contenu de la page" }).click();
  await dialog.getByRole("textbox", { name: "Contenu de la page" }).fill(LISTING_WITHOUT_RATING);
  await dialog.getByRole("button", { name: "Analyser le contenu" }).click();
  await page.waitForURL(/\/import\//);
  await expect(page.getByLabel("Note (/5)")).toHaveValue("");
  const prefill = page.getByTestId("criteria-prefill");
  await expect(prefill).toContainText("« Prix total du séjour » ← 900 €");
  await expect(prefill).not.toContainText("« Note »");
  await page.getByRole("button", { name: "Ajouter au comparatif" }).click();
  await page.waitForURL(/\/comparisons\/[a-z0-9]+$/);

  const columns = page.getByTestId("comparison-column");
  await expect(columns).toHaveCount(2);
  const imported = await columns.evaluateAll((cols) => cols.findIndex((c) => c.getAttribute("data-item-title") === "Chalet des Aravis"));
  const reference = 1 - imported;
  const scores = page.getByTestId("comparison-score");

  // Ancienne règle : note et distance comptées 0 → 56/100. Nouvelle règle : seuls les critères renseignés comptent.
  await expect(scores.nth(imported)).toContainText("100");
  const partial = scores.nth(imported).getByTestId("partial-score");
  await expect(partial).toContainText("Score partiel");
  await expect(partial).toContainText("Note");
  await expect(partial).toContainText("Distance au centre");
  await expect(partial).toContainText("non pénalisé, 56 % du poids évalué");

  // L'élément complet garde un score complet, et le verdict signale la comparaison partielle
  await expect(scores.nth(reference)).toContainText("100");
  await expect(scores.nth(reference).getByTestId("partial-score")).toHaveCount(0);
  const verdict = page.getByTestId("comparison-verdict");
  await expect(verdict).toContainText("à égalité");
  await expect(verdict).toContainText("Score partiel");
});

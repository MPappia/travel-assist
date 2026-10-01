import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { createTrip } from "./helpers";

test("coller une fiche de vol, l'ajouter au comparatif « Vols », la retenir et retrouver la dépense Transport", async ({ page }) => {
  await createTrip(page, { name: "Tokyo en mars", destination: "Tokyo", budget: "4000" });
  await page.getByRole("link", { name: "Comparatifs" }).click();
  await page.getByRole("button", { name: "Nouveau comparatif" }).click();
  const comparisonDialog = page.getByRole("dialog");
  await comparisonDialog.getByRole("button", { name: "Vols", exact: true }).click();
  await expect(comparisonDialog.getByLabel("Nom", { exact: true })).toHaveValue("Vols");
  await comparisonDialog.getByRole("button", { name: "Créer le comparatif" }).click();
  await expect(page.getByRole("heading", { name: "Vols" })).toBeVisible();

  // Copier-coller de la page Google Flights : le comparatif « Vols » oriente l'extracteur.
  await page.getByRole("button", { name: "Ajouter manuellement" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Coller le contenu de la page" }).click();
  await dialog
    .getByRole("textbox", { name: "Contenu de la page" })
    .fill(readFileSync("tests/fixtures/listings/google-flights-fr.synthetic.txt", "utf8"));
  await dialog.getByRole("button", { name: "Analyser le contenu" }).click();

  await page.waitForURL(/\/import\/[a-z0-9]+\?comparison=/);
  await expect(page.getByTestId("flight-import-form")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Titre", exact: true })).toHaveValue("CDG → NRT (aller-retour) · Finnair, Japan Airlines");
  await expect(page.getByRole("textbox", { name: "Prix total", exact: true })).toHaveValue("1248");
  await expect(page.getByRole("textbox", { name: "Passagers", exact: true })).toHaveValue("2");
  await expect(page.getByRole("textbox", { name: "Durée totale aller", exact: true })).toHaveValue("14 h 05");
  await expect(page.getByRole("textbox", { name: "Escales (aller + retour)", exact: true })).toHaveValue("1");
  await expect(page.getByTestId("flight-legs")).toContainText("CDG 10:05 → NRT 08:10 (+1)");
  await expect(page.getByTestId("flight-legs")).toContainText("Source : texte de la page");
  await expect(page.locator("#import-comparison option:checked")).toHaveText("Vols");
  await expect(page.getByTestId("criteria-prefill")).toContainText("« Durée totale aller » ← 14 h 05");
  await expect(page.getByLabel("Notes de l'élément")).toHaveValue(/Aller : CDG→HEL AY 1572/);

  await page.getByRole("button", { name: "Ajouter au comparatif" }).click();
  await page.waitForURL(/\/comparisons\/[a-z0-9]+$/);
  const title = "CDG → NRT (aller-retour) · Finnair, Japan Airlines";
  await expect(page.getByTestId("comparison-column").filter({ hasText: title })).toBeVisible();
  await expect(page.getByTestId("price-age")).toHaveText("prix relevé aujourd'hui");
  await expect(page.getByTestId("flight-summary")).toContainText("2 passagers");
  await expect(page.getByTestId("criterion-row").filter({ hasText: "Prix total" })).toContainText("1 248 €");
  await expect(page.getByTestId("criterion-row").filter({ hasText: "Durée totale retour" })).toContainText("14 h 45");
  await expect(page.getByTestId("criterion-row").filter({ hasText: "Bagage soute inclus" })).toContainText("Non");

  // Retenir le vol : la dépense est créée dans la catégorie Transport.
  await page.getByRole("button", { name: `Actions pour « ${title} »` }).click();
  await page.getByRole("menuitem", { name: "Retenir" }).click();
  await page.getByRole("button", { name: "Ajouter au budget" }).click();
  const expenseDialog = page.getByRole("dialog");
  await expect(expenseDialog.getByLabel("Montant (€)")).toHaveValue("1248");
  await expenseDialog.getByRole("button", { name: "Créer la dépense" }).click();
  await expect(page.getByTestId("item-expense")).toContainText("1 248");

  await page.getByRole("link", { name: "Budget" }).click();
  const row = page.getByTestId("expense-row").filter({ hasText: "CDG → NRT" });
  await expect(row).toContainText("Transport");
  await expect(row).toContainText("1 248");
});

test("rechercher des vols via SerpApi (service simulé) : retour à la demande, cache 6 h, quota", async ({ page }) => {
  await createTrip(page, { name: "Tokyo en avril", destination: "Tokyo" });
  await page.getByRole("link", { name: "Comparatifs" }).click();
  await page.getByRole("button", { name: "Nouveau comparatif" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Vols", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Créer le comparatif" }).click();
  await expect(page.getByRole("heading", { name: "Vols" })).toBeVisible();

  const panel = page.getByTestId("flight-search");
  await expect(panel.getByTestId("serpapi-usage")).toContainText("0 / 250 recherche ce mois-ci");
  await panel.getByRole("button", { name: "Afficher" }).click();
  await panel.getByLabel("Origine (IATA)").fill("cdg");
  await panel.getByLabel("Destination (IATA)").fill("NRT");
  await panel.getByLabel("Aller", { exact: true }).fill("2027-03-19");
  await panel.getByLabel("Retour (facultatif)").fill("2027-03-30");
  await panel.getByLabel("Passagers").fill("2");
  await panel.getByRole("button", { name: "Rechercher" }).click();

  const results = panel.getByTestId("flight-search-results");
  await expect(results).toContainText("2 résultats");
  await expect(results).not.toContainText("cache");
  await expect(results).toContainText("CDG 10:05 → NRT 08:10 (+1)");
  await expect(panel.getByTestId("serpapi-usage")).toContainText("1 / 250 recherche ce mois-ci");

  // Le retour n'est demandé qu'au clic.
  await results.getByRole("button", { name: "Choisir le retour" }).first().click();
  const returns = results.getByRole("list", { name: "Vols retour" });
  await expect(returns).toContainText("NRT 11:00 → CDG 17:45");
  await returns.getByRole("button", { name: "Ajouter au comparatif" }).click();
  await expect(returns.getByRole("button", { name: "Ajouté" })).toBeDisabled();

  const title = "CDG → NRT (aller-retour) · Finnair, Japan Airlines";
  await expect(page.getByTestId("comparison-column").filter({ hasText: title })).toBeVisible();
  await expect(page.getByTestId("price-age")).toHaveText("prix relevé aujourd'hui");
  await expect(page.getByTestId("criterion-row").filter({ hasText: "Prix total" })).toContainText("1 248 €");
  await expect(page.getByTestId("criterion-row").filter({ hasText: "Nombre d'escales" })).toContainText("1");

  // Même recherche : servie par le cache, aucun crédit consommé.
  await panel.getByRole("button", { name: "Rechercher" }).click();
  await expect(results).toContainText("cache : aucun crédit consommé");
  await expect(panel.getByTestId("serpapi-usage")).toContainText("2 / 250");

  // Quota épuisé : message explicite.
  await panel.getByLabel("Origine (IATA)").fill("QQQ");
  await panel.getByRole("button", { name: "Rechercher" }).click();
  await expect(panel.getByTestId("flight-search-error")).toContainText("Quota SerpApi atteint");
});

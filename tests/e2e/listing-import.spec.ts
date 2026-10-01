import { expect, test } from "@playwright/test";

import { createTrip } from "./helpers";

test("importer une annonce avec le bookmarklet, vérifier puis l'ajouter à un comparatif", async ({ page, context }) => {
  await createTrip(page, { name: "Été basque" });

  // Récupère le code du favori tel que l'utilisateur l'installe
  await page.goto("/import/setup");
  const href = await page.getByTestId("bookmarklet-code").inputValue();
  expect(href.startsWith("javascript:")).toBe(true);

  // Sur la page d'annonce (autre origine), le clic sur le favori exécute ce code
  await page.goto("http://127.0.0.1:3101/annonce");
  const popupPromise = context.waitForEvent("page");
  await page.evaluate((code) => window.eval(code), decodeURIComponent(href.slice("javascript:".length)));
  const popup = await popupPromise;
  await popup.waitForURL(/\/import\/[a-z0-9]+$/);
  await expect(popup.getByRole("heading", { name: "Vérifier l'annonce importée" })).toBeVisible();

  // Données extraites, avec leur provenance
  await expect(popup.getByLabel("Titre")).toHaveValue("Maison avec piscine à 5 min de la plage");
  await expect(popup.getByLabel("Prix total (€)")).toHaveValue("1450");
  await expect(popup.getByLabel("Note (/5)")).toHaveValue("4,8");
  await expect(popup.getByLabel("Couchages (lits)")).toHaveValue("5");
  await expect(popup.getByText("Source : données structurées").first()).toBeVisible();

  // Nouveau comparatif « Logements » proposé par défaut, avec les critères pré-remplis visibles
  await expect(popup.getByLabel("Voyage", { exact: true })).toHaveValue(/.+/);
  const prefill = popup.getByTestId("criteria-prefill");
  await expect(prefill).toContainText("« Prix total du séjour » ← 1 450 €");
  await expect(prefill).toContainText("« Note » ← 4,8/5");
  await expect(prefill).toContainText("« Couchages » ← 5");

  // L'utilisateur corrige le prix et refuse de pré-remplir les couchages
  await popup.getByLabel("Prix total (€)").fill("1 390");
  await expect(prefill).toContainText("« Prix total du séjour » ← 1 390 €");
  await popup.getByRole("checkbox", { name: /Couchages/ }).click();

  await popup.getByRole("button", { name: "Ajouter au comparatif" }).click();
  await popup.waitForURL(/\/comparisons\/[a-z0-9]+$/);
  await expect(popup.getByRole("heading", { name: "Logements" })).toBeVisible();

  const column = popup.getByTestId("comparison-column").filter({ hasText: "Maison avec piscine" });
  await expect(column).toBeVisible();
  await expect(column.getByTestId("link-preview")).toHaveAttribute("data-status", "OK");
  const priceRow = popup.getByTestId("criterion-row").filter({ hasText: "Prix total du séjour" });
  await expect(priceRow).toContainText(/1\s390 €/);
  await expect(popup.getByTestId("criterion-row").filter({ hasText: "Note" }).first()).toContainText("4,8/5");
  await expect(popup.getByTestId("criterion-row").filter({ hasText: "Couchages" })).not.toContainText("5");

  // L'import en attente a été consommé
  await popup.goBack();
  await popup.reload();
  await expect(popup.getByText("Import introuvable ou expiré")).toBeVisible();
});

test("un envoi invalide renvoie vers l'aide sans rien créer", async ({ request }) => {
  const response = await request.post("/import", {
    form: { url: "javascript:alert(1)", text: "x" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toContain("/import/setup?erreur=invalide");
});

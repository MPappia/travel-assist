import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { createTrip } from "./helpers";

test("coller le contenu d'une annonce Airbnb, vérifier puis l'ajouter au comparatif courant", async ({ page }) => {
  await createTrip(page, { name: "Japon au printemps" });
  await page.getByRole("link", { name: "Comparatifs" }).click();
  await page.getByRole("button", { name: "Nouveau comparatif" }).click();
  await page.getByRole("dialog").getByLabel("Nom", { exact: true }).fill("Logements Fuji");
  await page.getByRole("dialog").getByRole("button", { name: "Créer le comparatif" }).click();
  await expect(page.getByRole("heading", { name: "Logements Fuji" })).toBeVisible();

  await page.getByRole("button", { name: "Ajouter manuellement" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Coller le contenu de la page" }).click();
  await dialog.getByRole("textbox", { name: "Contenu de la page" }).fill(readFileSync("tests/fixtures/listings/airbnb-en.txt", "utf8"));
  await dialog.getByLabel("Adresse de l'annonce (facultatif)").fill("https://www.airbnb.fr/rooms/123456");
  await dialog.getByRole("button", { name: "Analyser le contenu" }).click();

  await page.waitForURL(/\/import\/[a-z0-9]+\?comparison=/);
  await expect(page.getByLabel("Titre")).toHaveValue("Cabin D/LakeSaiko 3-min/MtFujiView/BBQ/Wood stove");
  await expect(page.getByLabel("Prix total (€)")).toHaveValue("227");
  await expect(page.getByLabel("Couchages (lits)")).toHaveValue("4");
  await expect(page.getByText("Source : texte de la page").first()).toBeVisible();
  // Le comparatif d'où vient l'utilisateur est présélectionné
  await expect(page.locator("#import-comparison option:checked")).toHaveText("Logements Fuji");

  await page.getByRole("button", { name: "Ajouter au comparatif" }).click();
  await page.waitForURL(/\/comparisons\/[a-z0-9]+$/);
  const column = page.getByTestId("comparison-column").filter({ hasText: "Cabin D/LakeSaiko" });
  await expect(column).toBeVisible();
  await expect(page.getByTestId("criterion-row").filter({ hasText: "Prix total du séjour" })).toContainText("227 €");
  await expect(page.getByTestId("criterion-row").filter({ hasText: "Couchages" })).toContainText("4");
  await expect(page.getByTestId("criterion-row").filter({ hasText: "Annulation gratuite" })).toContainText("Oui");
});

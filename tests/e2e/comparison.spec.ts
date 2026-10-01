import { expect, test, type Page } from "@playwright/test";

import { createTrip } from "./helpers";

async function addItem(page: Page, title: string, values: Record<string, string>) {
  await page.getByRole("button", { name: "Ajouter manuellement" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titre").fill(title);
  for (const [label, value] of Object.entries(values)) {
    // « Prix total du séjour (€) » : on ignore l'unité affichée entre parenthèses.
    const field = dialog.getByLabel(new RegExp(`^${label}(\\s\\(.*\\))?$`));
    if ((await field.evaluate((el) => el.tagName)) === "SELECT") await field.selectOption(value);
    else await field.fill(value);
  }
  await dialog.getByRole("button", { name: "Ajouter" }).click();
  await expect(dialog).toBeHidden();
}

test("comparer 3 logements sur 5 critères, retenir le gagnant et l'ajouter au budget", async ({ page }) => {
  await createTrip(page, { name: "Week-end à Lisbonne", destination: "Lisbonne", budget: "1500" });
  await page.getByRole("link", { name: "Comparatifs" }).click();
  await page.getByRole("button", { name: "Nouveau comparatif" }).click();

  const dialog = page.getByRole("dialog");
  // Modèle « Logements » par défaut : 5 critères pondérés.
  await expect(dialog.getByTestId("criterion-editor-row")).toHaveCount(5);
  await dialog.getByLabel("Nom", { exact: true }).fill("Logements Lisbonne");
  await dialog.getByRole("button", { name: "Créer le comparatif" }).click();
  await expect(page.getByRole("heading", { name: "Logements Lisbonne" })).toBeVisible();

  await addItem(page, "Appartement Alfama", {
    "Prix total du séjour": "900",
    Note: "4",
    Couchages: "4",
    "Distance au centre": "2",
    "Annulation gratuite": "true",
  });
  await addItem(page, "Studio Belém", {
    "Prix total du séjour": "600",
    Note: "3",
    Couchages: "2",
    "Distance au centre": "5",
    "Annulation gratuite": "false",
  });
  await addItem(page, "Loft Chiado", {
    "Prix total du séjour": "750",
    Note: "5",
    Couchages: "4",
    "Distance au centre": "1",
    "Annulation gratuite": "true",
  });

  // Classement : Chiado (83) > Alfama > Belém, colonnes triées par score.
  const columns = page.getByTestId("comparison-column");
  await expect(columns).toHaveCount(3);
  await expect(columns.nth(0)).toHaveAttribute("data-item-title", "Loft Chiado");
  await expect(columns.nth(2)).toHaveAttribute("data-item-title", "Studio Belém");
  await expect(page.getByTestId("comparison-score").first()).toContainText("83");

  // Verdict lisible : qui gagne et pourquoi.
  const verdict = page.getByTestId("comparison-verdict");
  await expect(verdict).toContainText("Loft Chiado arrive en tête avec 83/100");
  await expect(verdict).toContainText("Fait la différence sur");

  // Meilleures valeurs mises en évidence (prix le plus bas chez Belém).
  const priceRow = page.getByTestId("criterion-row").filter({ hasText: "Prix total du séjour" });
  await expect(priceRow.locator("td[data-best]")).toHaveCount(1);
  await expect(priceRow.locator("td[data-best]")).toContainText("600");

  // Écarter un élément : il passe hors course.
  await page.getByRole("button", { name: "Actions pour « Studio Belém »" }).click();
  await page.getByRole("menuitem", { name: "Écarter" }).click();
  await expect(page.getByTestId("comparison-score").nth(2)).toContainText("Hors course");

  // Retenir le gagnant puis créer la dépense (montant pré-rempli depuis le critère de prix).
  await page.getByRole("button", { name: "Actions pour « Loft Chiado »" }).click();
  await page.getByRole("menuitem", { name: "Retenir" }).click();
  await page.getByRole("button", { name: "Ajouter au budget" }).click();
  const expenseDialog = page.getByRole("dialog");
  await expect(expenseDialog.getByLabel("Montant (€)")).toHaveValue("750");
  await expenseDialog.getByRole("button", { name: "Créer la dépense" }).click();
  await expect(page.getByTestId("item-expense")).toContainText("750");

  await page.getByRole("link", { name: "Budget" }).click();
  await expect(page.getByTestId("expense-row")).toContainText("Loft Chiado");
  await expect(page.getByTestId("budget-committed")).toContainText("750");
});

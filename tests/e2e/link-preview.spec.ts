import { expect, test } from "@playwright/test";

import { createTrip } from "./helpers";

test("coller un lien qui échoue crée quand même l'élément, éditable à la main", async ({ page }) => {
  await createTrip(page, { name: "Vacances Porto" });
  await page.getByRole("link", { name: "Comparatifs" }).click();
  await page.getByRole("button", { name: "Nouveau comparatif" }).click();
  await page.getByRole("dialog").getByLabel("Nom", { exact: true }).fill("Logements Porto");
  await page.getByRole("dialog").getByRole("button", { name: "Créer le comparatif" }).click();
  await expect(page.getByRole("heading", { name: "Logements Porto" })).toBeVisible();

  // Collage d'une URL (domaine .invalid : ne résout jamais) → création immédiate malgré l'échec.
  const input = page.getByLabel("Lien de l'annonce");
  await input.focus();
  await input.evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, "https://www.annonce-introuvable.invalid/rooms/42");

  const column = page.getByTestId("comparison-column").first();
  await expect(column).toHaveAttribute("data-item-title", "annonce-introuvable.invalid");
  const preview = column.getByTestId("link-preview");
  await expect(preview).toHaveAttribute("data-status", "FAILED");
  await expect(preview).toContainText("Aperçu indisponible");
  await expect(input).toHaveValue("");

  // Garde anti-SSRF : une adresse locale n'est jamais appelée, l'élément est créé avec un message.
  await input.fill("http://127.0.0.1/admin");
  await input.press("Enter");
  await expect(page.getByTestId("comparison-column")).toHaveCount(2);
  await expect(page.getByTestId("link-preview").filter({ hasText: "Adresse privée non autorisée" })).toBeVisible();
  // Sans aucune valeur renseignée, pas de classement ni de verdict trompeur.
  await expect(page.getByTestId("comparison-verdict")).toHaveCount(0);
  await expect(page.getByTestId("comparison-score").first()).toContainText("À compléter");

  // Une URL invalide est refusée avant tout appel.
  await input.fill("ftp://exemple.fr/fichier");
  await input.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Adresse http(s) invalide" })).toBeVisible();

  // Tout se complète à la main.
  await page.getByRole("button", { name: "Actions pour « annonce-introuvable.invalid »" }).click();
  await page.getByRole("menuitem", { name: "Modifier" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titre").fill("Duplex Ribeira");
  await dialog.getByLabel("Prix total du séjour (€)").fill("640");
  await dialog.getByLabel("Note", { exact: true }).selectOption("4");
  await dialog.getByLabel("Description").fill("Vue sur le Douro");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog).toBeHidden();

  const edited = page.getByTestId("comparison-column").filter({ hasText: "Duplex Ribeira" });
  await expect(edited).toContainText("Vue sur le Douro");
  await expect(page.getByTestId("criterion-row").filter({ hasText: "Prix total du séjour" })).toContainText("640");

  // Le bouton « rafraîchir » relance l'extraction sans rien casser.
  await edited.getByRole("button", { name: "Rafraîchir l'aperçu" }).click();
  await expect(edited.getByTestId("link-preview")).toHaveAttribute("data-status", "FAILED");
  await expect(edited).toContainText("Duplex Ribeira");
});

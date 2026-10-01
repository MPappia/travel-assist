import { expect, test, type Page } from "@playwright/test";

import { createTrip, dateKeyFromToday } from "./helpers";

async function addStop(page: Page, query: string, expectedName: string) {
  const search = page.getByRole("combobox", { name: "Rechercher une adresse" });
  await search.fill(query);
  await page.getByRole("option", { name: new RegExp(expectedName) }).click();
  await expect(page.getByTestId("stop-row").filter({ hasText: expectedName })).toBeVisible();
}

const stopNames = (page: Page) => page.getByTestId("stop-row").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-stop-name")));

test("construire un road trip de 6 étapes, le réordonner et voir le trajet mis à jour", async ({ page }) => {
  await createTrip(page, { name: "Road trip des Alpes" });
  await page.getByRole("link", { name: "Itinéraire" }).click();
  await page.getByRole("button", { name: "Créer un itinéraire" }).click();
  await page.getByRole("dialog").getByLabel("Nom").fill("Boucle alpine");
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText("Recherchez une adresse ou cliquez sur la carte")).toBeVisible();

  await addStop(page, "Lyon", "Lyon");
  await addStop(page, "Anne", "Annecy");
  await addStop(page, "Chamo", "Chamonix-Mont-Blanc");
  await addStop(page, "Genè", "Genève");
  await addStop(page, "Greno", "Grenoble");
  await addStop(page, "Brian", "Briançon");

  const total = page.getByTestId("route-total");
  await expect(page.getByTestId("stop-row")).toHaveCount(6);
  await expect(page.getByTestId("leg")).toHaveCount(5);
  await expect(page.getByTestId("leg").first()).toContainText("km");
  await expect(total).toContainText(/\d+ km · \d+ h/);
  const before = await total.innerText();

  // Réordonner au clavier (glisser-déposer accessible) : Genève passe en dernière position.
  const handle = page.getByRole("button", { name: "Déplacer « Genève »" });
  await handle.focus();
  // dnd-kit anime chaque déplacement : on laisse le temps à chaque étape.
  for (const key of ["Space", "ArrowDown", "ArrowDown", "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
  await expect.poll(() => stopNames(page)).toEqual(["Lyon", "Annecy", "Chamonix-Mont-Blanc", "Grenoble", "Briançon", "Genève"]);
  await expect(total).not.toHaveText(before);
  await expect(total).toContainText(/\d+ km/);

  // L'ordre est enregistré.
  await page.reload();
  await expect.poll(() => stopNames(page)).toEqual(["Lyon", "Annecy", "Chamonix-Mont-Blanc", "Grenoble", "Briançon", "Genève"]);

  // Changement de mode : recalcul automatique.
  await expect(total).toContainText(/\d+ h/);
  const driving = await total.innerText();
  await page.getByRole("radio", { name: "Vélo" }).click();
  await expect(total).not.toHaveText(driving);

  // Suppression d'une étape (avec confirmation).
  await page.getByRole("button", { name: "Supprimer « Grenoble »" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
  await expect(page.getByTestId("stop-row")).toHaveCount(5);

  // Vue jour par jour à partir d'une date et de nuits.
  await page.getByRole("button", { name: "Modifier « Lyon »" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Date d'arrivée").fill(dateKeyFromToday(40));
  await dialog.getByLabel("Nuits sur place").fill("1");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("day")).toHaveCount(2);
  await expect(page.getByTestId("day").first()).toContainText("Nuit à Lyon");
  await expect(page.getByTestId("day").nth(1)).toContainText("Annecy");

  // Point non routable : message clair et étape signalée.
  await addStop(page, "Lac", "Lac perdu");
  const error = page.getByTestId("route-error");
  await expect(error).toHaveAttribute("data-code", "UNROUTABLE_POINT");
  await expect(error).toContainText("L'étape 6 (« Lac perdu ») n'est pas accessible à vélo");
});

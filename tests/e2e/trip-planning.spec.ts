import { expect, test } from "@playwright/test";

import { createTrip, dateKeyFromToday } from "./helpers";

test("créer un voyage, ajouter tâches et dépenses, voir l'avancement sur le tableau de bord", async ({ page }) => {
  const tripUrl = await createTrip(page, { name: "Road trip Portugal", destination: "Portugal", budget: "1000" });

  // Tâches
  await page.getByRole("link", { name: "Tâches" }).click();
  await expect(page.getByText("Aucune tâche")).toBeVisible();

  const addTask = async (title: string, category: string, due?: string) => {
    await page.getByRole("button", { name: "Ajouter une tâche" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titre").fill(title);
    await dialog.getByLabel("Catégorie").selectOption({ label: category });
    if (due) await dialog.getByLabel("Échéance").fill(due);
    await dialog.getByRole("button", { name: "Ajouter" }).click();
    await expect(dialog).toBeHidden();
  };

  await addTask("Renouveler le passeport", "Administratif", dateKeyFromToday(-2));
  await addTask("Réserver la voiture", "Transport", dateKeyFromToday(10));
  await addTask("Acheter un adaptateur", "Bagages");

  const rows = page.getByTestId("task-row");
  await expect(rows).toHaveCount(3);
  // Tri par échéance : la tâche en retard d'abord, mise en évidence.
  await expect(rows.first()).toContainText("Renouveler le passeport");
  await expect(rows.first()).toHaveAttribute("data-overdue", "true");
  await expect(rows.first()).toContainText("En retard");

  // Filtre par catégorie
  await page.getByRole("button", { name: /^Transport/ }).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: /^Toutes/ }).click();

  // Cocher une tâche
  await page.getByRole("checkbox", { name: /Réserver la voiture/ }).click();
  await expect(page.getByText("1/3")).toBeVisible();

  // Budget
  await page.getByRole("link", { name: "Budget" }).click();
  const addExpense = async (label: string, amount: string, status: string, category: string) => {
    await page.getByRole("button", { name: "Ajouter une dépense" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Libellé").fill(label);
    await dialog.getByLabel("Montant (€)").fill(amount);
    await dialog.getByLabel("Statut").selectOption({ label: status });
    await dialog.getByLabel("Catégorie").selectOption({ label: category });
    await dialog.getByRole("button", { name: "Ajouter" }).click();
    await expect(dialog).toBeHidden();
  };
  await addExpense("Location voiture", "420", "Payé", "Transport");
  await addExpense("Hôtels", "500", "Réservé", "Logement");
  await expect(page.getByTestId("budget-total")).toContainText("920");
  await expect(page.getByTestId("budget-alert")).toHaveCount(0);

  // Dépassement : alerte visuelle
  await addExpense("Restaurants", "200", "Estimé", "Repas");
  await expect(page.getByTestId("budget-alert")).toContainText("Budget dépassé");

  // Tableau de bord
  await page.goto("/");
  const card = page.getByTestId("trip-card").filter({ hasText: "Road trip Portugal" });
  await expect(card.getByTestId("trip-card-tasks")).toContainText("1/3");
  await expect(card.getByTestId("trip-card-tasks")).toContainText("1 en retard");
  await expect(card.getByTestId("trip-card-budget")).toContainText("920");
  await expect(card.getByTestId("trip-card-budget")).toContainText(/1\s?000/);

  // Suppression d'une tâche avec confirmation
  await page.goto(`${tripUrl}/tasks`);
  await page.getByRole("button", { name: "Supprimer « Acheter un adaptateur »" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
  await expect(page.getByTestId("task-row")).toHaveCount(2);
});

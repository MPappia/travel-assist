import { expect, type Page } from "@playwright/test";

export function dateKeyFromToday(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Crée un voyage depuis le tableau de bord et attend d'arriver sur sa page. */
export async function createTrip(page: Page, opts: { name: string; destination?: string; budget?: string }) {
  await page.goto("/");
  await page.getByRole("button", { name: "Nouveau voyage" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom du voyage").fill(opts.name);
  if (opts.destination) await dialog.getByLabel("Destination").fill(opts.destination);
  await dialog.getByLabel("Début").fill(dateKeyFromToday(30));
  await dialog.getByLabel("Fin").fill(dateKeyFromToday(37));
  if (opts.budget) await dialog.getByLabel("Budget cible (€)").fill(opts.budget);
  await dialog.getByRole("button", { name: "Créer le voyage" }).click();
  await expect(page.getByRole("heading", { level: 1, name: opts.name })).toBeVisible();
  return page.url();
}

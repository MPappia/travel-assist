// Notes pré-remplies de l'élément importé : ce qui n'a pas de critère mais mérite d'être gardé.
import { formatNumberFr } from "@/lib/listing-extract/numbers";
import type { ListingExtraction } from "@/lib/listing-extract/types";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtDate = (iso: string) => dateFormatter.format(new Date(`${iso}T00:00:00Z`));

export function buildImportNotes(extraction: Pick<ListingExtraction, "fields" | "domain">, today = new Date()): string {
  const { fields } = extraction;
  const lines: string[] = [];
  if (fields.checkIn && fields.checkOut) {
    const nights = fields.nights ? ` (${fields.nights.value} nuit${fields.nights.value > 1 ? "s" : ""})` : "";
    lines.push(`Tarif relevé pour un séjour du ${fmtDate(fields.checkIn.value)} au ${fmtDate(fields.checkOut.value)}${nights}.`);
  } else if (fields.nights) {
    lines.push(`Tarif relevé pour ${fields.nights.value} nuit${fields.nights.value > 1 ? "s" : ""}.`);
  }
  if (fields.totalPrice?.note) lines.push(`Prix : ${fields.totalPrice.note}.`);
  if (fields.freeCancellation?.note) lines.push(`Annulation : ${fields.freeCancellation.note}.`);
  if (fields.guests) lines.push(`Jusqu'à ${fields.guests.value} voyageur${fields.guests.value > 1 ? "s" : ""}.`);
  if (fields.reviewCount && fields.rating) {
    lines.push(`Note ${formatNumberFr(fields.rating.value)}/5 sur ${fields.reviewCount.value.toLocaleString("fr-FR")} avis.`);
  }
  const origin = extraction.domain ? ` depuis ${extraction.domain}` : "";
  lines.push(`Importé${origin} le ${dateFormatter.format(today)}.`);
  return lines.join("\n");
}

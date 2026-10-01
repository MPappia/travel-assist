"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { parseCriterionInput } from "@/lib/domain/criteria-values";
import { mapFlightToCriteria } from "@/lib/listing-extract/criteria-mapping";
import {
  buildSearchedFlight,
  flightSearchSchema,
  type FlightSearchInput,
  type SerpErrorCode,
  type SerpFlightOffer,
} from "@/lib/serpapi/google-flights";
import { flattenErrors, type FieldErrors } from "@/lib/validation";
import { getSerpUsage, isSerpApiEnabled, readCachedFlightSearch, searchGoogleFlights, type SerpUsage } from "@/server/serpapi";

export type FlightSearchResult =
  | { ok: true; data: { offers: SerpFlightOffer[]; fetchedAt: string; fromCache: boolean; usage: SerpUsage } }
  | { ok: false; error: string; code?: SerpErrorCode; fieldErrors?: FieldErrors };

async function flightsComparison(comparisonId: string) {
  return db.comparison.findFirst({ where: { id: comparisonId, kind: "FLIGHTS" }, select: { id: true, tripId: true } });
}

/**
 * Recherche Google Flights via SerpApi (allers, ou retours d'un aller avec `departureToken`).
 * Résultats en cache 6 h par jeu de paramètres : une recherche répétée ne consomme pas de crédit.
 */
export async function searchFlights(
  comparisonId: string,
  input: FlightSearchInput,
  departureToken?: string,
): Promise<FlightSearchResult> {
  if (!isSerpApiEnabled()) return fail("Recherche de vols désactivée (SERPAPI_KEY absente).");
  if (!(await flightsComparison(comparisonId))) return fail("Comparatif « Vols » introuvable");
  const parsed = flightSearchSchema.safeParse(input);
  if (!parsed.success) return fail("Recherche invalide", flattenErrors(parsed.error));

  const result = await searchGoogleFlights(parsed.data, departureToken);
  if (!result.ok) return { ok: false, error: result.error.message, code: result.error.code };
  const usage = await getSerpUsage();
  return {
    ok: true,
    data: { offers: result.search.results.offers, fetchedAt: result.search.fetchedAt, fromCache: result.fromCache, usage },
  };
}

/**
 * Ajoute au comparatif un vol trouvé : l'aller (et le retour choisi) sont relus dans le cache serveur
 * — jamais repris du navigateur — avec le prix, la date de relevé et le lien Google Flights.
 */
export async function addSearchedFlight(
  comparisonId: string,
  input: FlightSearchInput,
  outboundToken: string,
  returnToken?: string,
): Promise<ActionResult<{ title: string }>> {
  if (!isSerpApiEnabled()) return fail("Recherche de vols désactivée (SERPAPI_KEY absente).");
  const comparison = await flightsComparison(comparisonId);
  if (!comparison) return fail("Comparatif « Vols » introuvable");
  const parsed = flightSearchSchema.safeParse(input);
  if (!parsed.success) return fail("Recherche invalide", flattenErrors(parsed.error));
  const params = parsed.data;

  const expired = "Résultats expirés (plus de 6 h) : relancez la recherche.";
  const outboundSearch = await readCachedFlightSearch(params);
  const outbound = outboundSearch?.results.offers.find((o) => o.token === outboundToken);
  if (!outboundSearch || !outbound) return fail(expired);

  let priced = { search: outboundSearch, offer: outbound };
  let inbound: SerpFlightOffer | undefined;
  if (outbound.needsReturn) {
    if (!returnToken) return fail("Choisissez d'abord le vol retour.");
    const returnSearch = await readCachedFlightSearch(params, outboundToken);
    inbound = returnSearch?.results.offers.find((o) => o.token === returnToken);
    if (!returnSearch || !inbound) return fail(expired);
    // Le prix des options « retour » est le total aller-retour.
    priced = { search: returnSearch, offer: inbound };
  }

  const fetchedAt = new Date(priced.search.fetchedAt);
  const flight = buildSearchedFlight({ outbound, inbound, price: priced.offer.price, passengers: params.adults, fetchedAt });
  const criteria = await db.criterion.findMany({ where: { comparisonId } });
  const matches = mapFlightToCriteria(criteria, flight.values);
  const url = priced.search.results.googleFlightsUrl ?? outboundSearch.results.googleFlightsUrl;

  const item = await db.comparisonItem.create({
    data: {
      comparisonId,
      title: flight.title,
      url,
      notes: flight.notes,
      priceCapturedAt: fetchedAt,
      flightDetails: JSON.stringify(flight.details),
      previewStatus: "NONE",
      previewSiteName: "Google Flights",
      previewDomain: url ? "google.com" : null,
    },
  });
  for (const match of matches) {
    const value = parseCriterionInput(match.criterion.type, String(match.value));
    if (value.ok) await db.criterionValue.create({ data: { itemId: item.id, criterionId: match.criterion.id, ...value.value } });
  }

  revalidatePath(`/trips/${comparison.tripId}`, "layout");
  return ok({ title: flight.title });
}

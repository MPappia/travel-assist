"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, CheckIcon, Loader2Icon, PlaneTakeoffIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { legSchedule, stopsOf } from "@/lib/domain/flights";
import { formatDuration, formatMoney } from "@/lib/format";
import type { FlightSearchInput, SerpFlightOffer } from "@/lib/serpapi/google-flights";
import type { FieldErrors } from "@/lib/validation";
import { addSearchedFlight, searchFlights } from "@/server/actions/flight-search";
import type { SerpUsage } from "@/server/serpapi";

const VISIBLE = 8;

interface SearchState {
  input: FlightSearchInput;
  offers: SerpFlightOffer[];
  fetchedAt: string;
  fromCache: boolean;
}

/**
 * Recherche Google Flights via SerpApi (affichée seulement si SERPAPI_KEY est définie côté serveur).
 * Aller-retour : le retour n'est demandé qu'au clic sur « Choisir le retour » (une recherche de plus).
 */
export function FlightSearchPanel({
  comparisonId,
  defaults,
  initialUsage,
}: {
  comparisonId: string;
  defaults: { outboundDate: string; returnDate: string; adults: number };
  initialUsage: SerpUsage;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ from: "", to: "", outboundDate: defaults.outboundDate, returnDate: defaults.returnDate, adults: String(defaults.adults) });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<{ message: string; quota: boolean } | null>(null);
  const [usage, setUsage] = useState(initialUsage);
  const [search, setSearch] = useState<SearchState | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [returns, setReturns] = useState<{ token: string; state: SearchState } | null>(null);
  const [loadingToken, setLoadingToken] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const quotaReached = usage.account?.left === 0;
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: key === "from" || key === "to" ? event.target.value.toUpperCase() : event.target.value }));

  function runSearch(input: FlightSearchInput, departureToken?: string) {
    setError(null);
    setLoadingToken(departureToken ?? "search");
    startTransition(async () => {
      const result = await searchFlights(comparisonId, input, departureToken);
      setLoadingToken(null);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setError({ message: result.error, quota: result.code === "QUOTA" });
        return;
      }
      setErrors({});
      setUsage(result.data.usage);
      const state = { input, offers: result.data.offers, fetchedAt: result.data.fetchedAt, fromCache: result.data.fromCache };
      if (departureToken) setReturns({ token: departureToken, state });
      else {
        setSearch(state);
        setReturns(null);
        setShowAll(false);
      }
    });
  }

  function add(outbound: SerpFlightOffer, inbound?: SerpFlightOffer) {
    if (!search) return;
    const key = inbound?.token ?? outbound.token;
    setLoadingToken(key);
    startTransition(async () => {
      const result = await addSearchedFlight(comparisonId, search.input, outbound.token, inbound?.token);
      setLoadingToken(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAdded((prev) => new Set(prev).add(key));
      toast.success(`Vol ajouté : ${result.data.title}`);
      router.refresh();
    });
  }

  const offers = search ? (showAll ? search.offers : search.offers.slice(0, VISIBLE)) : [];

  return (
    <Card data-testid="flight-search">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <PlaneTakeoffIcon className="size-4" />
            Rechercher des vols
          </CardTitle>
          <CardDescription>
            Google Flights via SerpApi · <UsageLine usage={usage} />
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Masquer" : "Afficher"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="grid grid-cols-1 gap-4">
          <form
            className="grid grid-cols-2 gap-3 sm:grid-cols-6"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              runSearch({ ...form, adults: Number(form.adults) });
            }}
          >
            <FormField label="Origine (IATA)" htmlFor="search-from" error={errors.from} className="content-start">
              <Input id="search-from" value={form.from} onChange={set("from")} maxLength={3} placeholder="CDG" autoComplete="off" />
            </FormField>
            <FormField label="Destination (IATA)" htmlFor="search-to" error={errors.to} className="content-start">
              <Input id="search-to" value={form.to} onChange={set("to")} maxLength={3} placeholder="NRT" autoComplete="off" />
            </FormField>
            <FormField label="Aller" htmlFor="search-out" error={errors.outboundDate} className="content-start">
              <Input id="search-out" type="date" value={form.outboundDate} onChange={set("outboundDate")} />
            </FormField>
            <FormField label="Retour (facultatif)" htmlFor="search-back" error={errors.returnDate} className="content-start">
              <Input id="search-back" type="date" value={form.returnDate} onChange={set("returnDate")} />
            </FormField>
            <FormField label="Passagers" htmlFor="search-adults" error={errors.adults} className="content-start">
              <Input id="search-adults" type="number" min={1} max={9} value={form.adults} onChange={set("adults")} />
            </FormField>
            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={pending || quotaReached}>
                {loadingToken === "search" ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
                Rechercher
              </Button>
            </div>
          </form>
          <p className="text-muted-foreground text-xs">
            Chaque nouvelle recherche consomme un crédit SerpApi (et une de plus pour afficher les retours d&apos;un aller) ;
            une recherche identique dans les 6 h est servie par le cache. Prix total pour tous les passagers, en euros.
          </p>

          {(error || quotaReached) && (
            <p role="alert" className="border-warning/50 bg-warning/10 flex gap-2 rounded-lg border p-3 text-sm" data-testid="flight-search-error">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
              {error?.message ??
                "Quota SerpApi atteint : plus aucune recherche disponible ce mois-ci (quota partagé entre tous les moteurs SerpApi)."}
            </p>
          )}

          {search && (
            <div className="grid gap-2" data-testid="flight-search-results">
              <p className="text-muted-foreground text-xs">
                {search.offers.length} résultat{search.offers.length > 1 ? "s" : ""} · prix relevés le{" "}
                {new Date(search.fetchedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                {search.fromCache && " (cache : aucun crédit consommé)"}
              </p>
              {search.offers.length === 0 && <p className="text-sm">Aucun vol trouvé pour ces critères.</p>}
              <ul className="grid gap-2">
                {offers.map((offer) => (
                  <li key={offer.token} className="grid gap-2 rounded-lg border p-3">
                    <OfferLine offer={offer} label="Aller" priceLabel={offer.needsReturn ? "aller-retour dès" : undefined}>
                      {offer.needsReturn ? (
                        <Button
                          size="sm"
                          variant={returns?.token === offer.token ? "secondary" : "outline"}
                          disabled={pending}
                          onClick={() => runSearch(search.input, offer.token)}
                        >
                          {loadingToken === offer.token && <Loader2Icon className="animate-spin" />}
                          Choisir le retour
                        </Button>
                      ) : (
                        <AddButton added={added.has(offer.token)} loading={loadingToken === offer.token} disabled={pending} onClick={() => add(offer)} />
                      )}
                    </OfferLine>
                    {returns?.token === offer.token && (
                      <ul className="grid gap-2 border-l-2 pl-3" aria-label="Vols retour">
                        {returns.state.offers.length === 0 && <li className="text-sm">Aucun retour proposé pour cet aller.</li>}
                        {returns.state.offers.map((back) => (
                          <li key={back.token}>
                            <OfferLine offer={back} label="Retour" priceLabel="aller-retour">
                              <AddButton
                                added={added.has(back.token)}
                                loading={loadingToken === back.token}
                                disabled={pending}
                                onClick={() => add(offer, back)}
                              />
                            </OfferLine>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              {search.offers.length > VISIBLE && (
                <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setShowAll((s) => !s)}>
                  {showAll ? "Afficher moins" : `Afficher les ${search.offers.length - VISIBLE} autres`}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function UsageLine({ usage }: { usage: SerpUsage }) {
  const { account, local } = usage;
  if (account?.used != null) {
    return (
      <span data-testid="serpapi-usage">
        {account.used}
        {account.limit != null && ` / ${account.limit}`} recherche{account.used > 1 ? "s" : ""} ce mois-ci (compte SerpApi, tous moteurs)
        {account.left != null && ` · ${account.left} restante${account.left > 1 ? "s" : ""}`}
      </span>
    );
  }
  return (
    <span data-testid="serpapi-usage">
      {local} recherche{local > 1 ? "s" : ""} lancée{local > 1 ? "s" : ""} depuis l&apos;application ce mois-ci
    </span>
  );
}

function OfferLine({
  offer,
  label,
  priceLabel,
  children,
}: {
  offer: SerpFlightOffer;
  label: string;
  priceLabel?: string;
  children: React.ReactNode;
}) {
  const stops = stopsOf(offer.leg);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="grid gap-0.5">
        <span className="font-medium">
          {label} · {legSchedule(offer.leg) ?? "horaires inconnus"}
          {offer.best && (
            <Badge variant="secondary" className="ml-2">
              Meilleur choix
            </Badge>
          )}
        </span>
        <span className="text-muted-foreground text-xs">
          {offer.airlines.join(", ") || "compagnie inconnue"}
          {offer.leg.durationMin ? ` · ${formatDuration(offer.leg.durationMin * 60)}` : ""}
          {stops !== undefined && ` · ${stops === 0 ? "direct" : `${stops} escale${stops > 1 ? "s" : ""}`}`}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {offer.price !== null && (
          <span className="text-right tabular-nums">
            {priceLabel && <span className="text-muted-foreground block text-xs">{priceLabel}</span>}
            {formatMoney(Math.round(offer.price * 100))}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

function AddButton({ added, loading, disabled, onClick }: { added: boolean; loading: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Button size="sm" disabled={added || disabled} onClick={onClick}>
      {loading ? <Loader2Icon className="animate-spin" /> : added ? <CheckIcon /> : null}
      {added ? "Ajouté" : "Ajouter au comparatif"}
    </Button>
  );
}

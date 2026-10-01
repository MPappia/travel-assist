"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { LegLine } from "@/components/comparisons/flight-summary";
import { FormField } from "@/components/form-field";
import { CriteriaPrefill, hintFor, ImportWarnings, LlmStatus, NoTripCard } from "@/components/import/import-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { presetByKey } from "@/lib/domain/comparison-presets";
import { formatDurationInput, parseDurationInput } from "@/lib/domain/flights";
import {
  defaultComparisonFor,
  FLIGHT_FIELD_LABELS,
  FLIGHT_MAPPABLE_FIELDS,
  mapFlightToCriteria,
  NEW_COMPARISON,
  type FlightMappableField,
  type FlightMappableValues,
  type MappableCriterion,
} from "@/lib/listing-extract/criteria-mapping";
import type { FlightFieldKey } from "@/lib/listing-extract/flight";
import type { Field, ListingExtraction } from "@/lib/listing-extract/types";
import type { FieldErrors } from "@/lib/validation";
import { confirmFlightImport, discardImport } from "@/server/actions/imports";
import type { ImportTarget } from "@/server/queries";

type EditableKey = Exclude<FlightFieldKey, "outbound" | "inbound">;
const DURATION_FIELDS = new Set<EditableKey>(["outboundDuration", "inboundDuration"]);

function parseNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value.replace(/[\s  €$£]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export function FlightImportForm({
  pendingId,
  url,
  extraction,
  targets,
  defaultTripId,
  defaultComparisonId,
  defaultNotes,
  capturedAt,
  warnings,
}: {
  pendingId: string;
  url: string | null;
  extraction: ListingExtraction;
  targets: ImportTarget[];
  defaultTripId: string;
  defaultComparisonId: string;
  defaultNotes: string;
  /** Date de réception de la page : elle devient la date de relevé du prix. */
  capturedAt: Date;
  warnings: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const flight = extraction.flight ?? {};

  const [values, setValues] = useState<Record<EditableKey, string>>(() => {
    const text = (key: EditableKey) => {
      const field = flight[key] as Field<string | number | boolean> | undefined;
      if (!field) return "";
      if (DURATION_FIELDS.has(key)) return formatDurationInput(field.value as number);
      if (typeof field.value === "number") return String(field.value).replace(".", ",");
      return String(field.value);
    };
    return {
      title: text("title"),
      totalPrice: text("totalPrice"),
      currency: text("currency") || (flight.totalPrice ? "EUR" : ""),
      passengers: text("passengers"),
      outboundDuration: text("outboundDuration"),
      inboundDuration: text("inboundDuration"),
      stops: text("stops"),
      checkedBag: text("checkedBag"),
      airlines: text("airlines"),
      outboundSchedule: text("outboundSchedule"),
      inboundSchedule: text("inboundSchedule"),
    };
  });
  const [tripId, setTripId] = useState(defaultTripId);
  const [comparisonId, setComparisonId] = useState(defaultComparisonId);
  const [rejected, setRejected] = useState<Set<FlightMappableField>>(new Set());

  const trip = targets.find((t) => t.id === tripId);
  const comparison = trip?.comparisons.find((c) => c.id === comparisonId);
  const criteria: MappableCriterion[] =
    comparisonId === NEW_COMPARISON
      ? presetByKey("flights").criteria.map((c, i) => ({ ...c, id: `preset-${i}` }))
      : (comparison?.criteria ?? []);

  const currency = values.currency.trim().toUpperCase();
  const foreignCurrency = currency !== "" && currency !== "EUR";
  const mappable: FlightMappableValues = (() => {
    const result: FlightMappableValues = {};
    for (const field of FLIGHT_MAPPABLE_FIELDS) {
      const raw = values[field].trim();
      if (!raw) continue;
      if (field === "checkedBag") {
        if (raw === "true" || raw === "false") result.checkedBag = raw === "true";
      } else if (field === "airlines" || field === "outboundSchedule" || field === "inboundSchedule") {
        result[field] = raw;
      } else if (DURATION_FIELDS.has(field)) {
        const minutes = parseDurationInput(raw);
        if (minutes !== null) result[field] = minutes;
      } else {
        const n = parseNumber(raw);
        if (n !== undefined) result[field] = n;
      }
    }
    // Le critère « Prix total » est en euros : pas de report d'un prix en devise étrangère.
    if (foreignCurrency) delete result.totalPrice;
    return result;
  })();
  const matches = mapFlightToCriteria(criteria, mappable);
  const unmatched = FLIGHT_MAPPABLE_FIELDS.filter((f) => mappable[f] !== undefined && !matches.some((m) => m.field === f));

  const set = (key: EditableKey) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    for (const match of matches) if (!rejected.has(match.field)) formData.set(`apply:${match.field}`, "on");
    startTransition(async () => {
      const result = await confirmFlightImport(pendingId, formData);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      const { prefilled } = result.data;
      toast.success(
        prefilled.length > 0 ? `Vol ajouté — critères pré-remplis : ${prefilled.join(", ")}` : "Vol ajouté au comparatif",
      );
      router.push(`/trips/${result.data.tripId}/comparisons/${result.data.comparisonId}`);
    });
  }

  if (targets.length === 0) return <NoTripCard />;

  const fieldProps = (key: EditableKey) => ({
    label: FLIGHT_FIELD_LABELS[key],
    htmlFor: `flight-${key}`,
    error: errors[key],
    hint: hintFor(flight[key] as Field<unknown> | undefined),
    className: "content-start",
  });
  const outbound = flight.outbound?.value;
  const inbound = flight.inbound?.value;

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-6" noValidate data-testid="flight-import-form">
      <input type="hidden" name="url" value={url ?? ""} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vol</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground flex items-center gap-1">
                <ExternalLinkIcon className="size-3.5" />
                {extraction.siteName ?? extraction.domain ?? url}
              </a>
            )}
            <span>Prix relevé le {capturedAt.toLocaleDateString("fr-FR")}</span>
            <LlmStatus status={extraction.llm} />
          </CardDescription>
          <ImportWarnings warnings={warnings} />
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <FormField {...fieldProps("title")}>
            <Input id="flight-title" name="title" value={values.title} onChange={set("title")} placeholder="CDG → NRT · Air France" />
          </FormField>

          <div className="grid grid-cols-1 gap-1 text-sm" data-testid="flight-legs">
            <span className="font-medium">Trajets trouvés</span>
            {outbound || inbound ? (
              <ul className="text-muted-foreground grid gap-2 text-xs">
                {outbound && <LegLine label="Aller" leg={outbound} />}
                {inbound && <LegLine label="Retour" leg={inbound} />}
              </ul>
            ) : (
              <p className="text-muted-foreground text-xs">
                Aucun trajet reconnu : renseignez les durées et horaires à la main (ils restent modifiables ensuite).
              </p>
            )}
            {(flight.outbound || flight.inbound) && (
              <p className="text-muted-foreground text-xs">{hintFor((flight.outbound ?? flight.inbound) as Field<unknown>)}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prix et caractéristiques</CardTitle>
          <CardDescription>Durées au format « 14 h 05 ». Escales : total aller + retour.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          {foreignCurrency && (
            <p role="status" className="border-warning/50 bg-warning/10 flex gap-2 rounded-lg border p-3 text-sm" data-testid="currency-warning">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
              Prix en {currency} : il n&apos;est pas reporté dans le critère en euros (conservé dans les notes).
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <FormField {...fieldProps("totalPrice")}>
              <Input id="flight-totalPrice" name="totalPrice" inputMode="decimal" value={values.totalPrice} onChange={set("totalPrice")} />
            </FormField>
            <FormField {...fieldProps("currency")}>
              <Input id="flight-currency" name="currency" value={values.currency} onChange={set("currency")} maxLength={3} />
            </FormField>
            <FormField {...fieldProps("passengers")}>
              <Input id="flight-passengers" name="passengers" inputMode="numeric" value={values.passengers} onChange={set("passengers")} />
            </FormField>
            <FormField {...fieldProps("outboundDuration")}>
              <Input id="flight-outboundDuration" name="outboundDuration" value={values.outboundDuration} onChange={set("outboundDuration")} />
            </FormField>
            <FormField {...fieldProps("inboundDuration")}>
              <Input id="flight-inboundDuration" name="inboundDuration" value={values.inboundDuration} onChange={set("inboundDuration")} />
            </FormField>
            <FormField {...fieldProps("stops")}>
              <Input id="flight-stops" name="stops" inputMode="numeric" value={values.stops} onChange={set("stops")} />
            </FormField>
            <FormField {...fieldProps("checkedBag")}>
              <NativeSelect id="flight-checkedBag" name="checkedBag" value={values.checkedBag} onChange={set("checkedBag")}>
                <option value="">—</option>
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </NativeSelect>
            </FormField>
          </div>
          <FormField {...fieldProps("airlines")}>
            <Input id="flight-airlines" name="airlines" value={values.airlines} onChange={set("airlines")} />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField {...fieldProps("outboundSchedule")}>
              <Input id="flight-outboundSchedule" name="outboundSchedule" value={values.outboundSchedule} onChange={set("outboundSchedule")} />
            </FormField>
            <FormField {...fieldProps("inboundSchedule")}>
              <Input id="flight-inboundSchedule" name="inboundSchedule" value={values.inboundSchedule} onChange={set("inboundSchedule")} />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Destination</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Voyage" htmlFor="import-trip" error={errors.tripId}>
              <NativeSelect
                id="import-trip"
                name="tripId"
                value={tripId}
                onChange={(e) => {
                  setTripId(e.target.value);
                  setComparisonId(defaultComparisonFor("flight", targets.find((t) => t.id === e.target.value)?.comparisons));
                }}
              >
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Comparatif" htmlFor="import-comparison" error={errors.comparisonId}>
              <NativeSelect id="import-comparison" name="comparisonId" value={comparisonId} onChange={(e) => setComparisonId(e.target.value)}>
                {trip?.comparisons.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value={NEW_COMPARISON}>+ Créer un comparatif « Vols »</option>
              </NativeSelect>
            </FormField>
          </div>

          <CriteriaPrefill
            matches={matches}
            rejected={rejected}
            onToggle={(field, applied) =>
              setRejected((prev) => {
                const next = new Set(prev);
                if (applied) next.delete(field);
                else next.add(field);
                return next;
              })
            }
            unmatchedLabels={unmatched.map((f) => FLIGHT_FIELD_LABELS[f])}
          />

          <FormField label="Notes de l'élément" htmlFor="import-notes">
            <Textarea id="import-notes" name="notes" defaultValue={defaultNotes} rows={5} />
          </FormField>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await discardImport(pendingId);
              toast.info("Import abandonné");
              router.push("/");
            })
          }
        >
          Abandonner
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Ajouter au comparatif
        </Button>
      </div>
    </form>
  );
}

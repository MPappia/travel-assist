"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, ExternalLinkIcon, ImageOffIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
import { CriteriaPrefill, hintFor, ImportWarnings, LlmStatus, NoTripCard } from "@/components/import/import-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { presetByKey } from "@/lib/domain/comparison-presets";
import { formatDate, nightsBetween } from "@/lib/format";
import {
  defaultComparisonFor,
  FIELD_LABELS,
  mapListingToCriteria,
  MAPPABLE_FIELDS,
  NEW_COMPARISON,
  type MappableCriterion,
  type MappableField,
  type MappableValues,
} from "@/lib/listing-extract/criteria-mapping";
import type { Field, FieldKey, ListingExtraction } from "@/lib/listing-extract/types";
import { cn } from "@/lib/utils";
import type { FieldErrors } from "@/lib/validation";
import { confirmImport, discardImport } from "@/server/actions/imports";
import type { ImportTarget } from "@/server/queries";

type EditableKey = Exclude<FieldKey, "checkIn" | "checkOut" | "image">;
const NUMBER_FIELDS: EditableKey[] = ["totalPrice", "pricePerNight", "nights", "rating", "reviewCount", "beds", "bedrooms", "guests"];

function toInput(field: Field<string | number | boolean> | undefined): string {
  if (!field) return "";
  if (typeof field.value === "number") return String(field.value).replace(".", ",");
  return String(field.value);
}

function parseNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value.replace(/[\s  €]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export function ImportForm({
  pendingId,
  url,
  extraction,
  targets,
  defaultTripId,
  defaultComparisonId,
  defaultNotes,
  warnings,
}: {
  pendingId: string;
  url: string | null;
  extraction: ListingExtraction;
  targets: ImportTarget[];
  defaultTripId: string;
  defaultComparisonId: string;
  defaultNotes: string;
  /** Réductions appliquées aux données de la page (favori ou serveur). */
  warnings: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const { fields } = extraction;

  const [values, setValues] = useState<Record<EditableKey, string>>(() => ({
    title: toInput(fields.title),
    description: toInput(fields.description),
    address: toInput(fields.address),
    totalPrice: toInput(fields.totalPrice),
    pricePerNight: toInput(fields.pricePerNight),
    nights: toInput(fields.nights),
    rating: toInput(fields.rating),
    reviewCount: toInput(fields.reviewCount),
    beds: toInput(fields.beds),
    bedrooms: toInput(fields.bedrooms),
    guests: toInput(fields.guests),
    freeCancellation: fields.freeCancellation ? String(fields.freeCancellation.value) : "",
  }));
  const [image, setImage] = useState(fields.image?.value ?? extraction.images[0] ?? "");
  const [tripId, setTripId] = useState(defaultTripId);
  const [comparisonId, setComparisonId] = useState(defaultComparisonId);
  const [rejected, setRejected] = useState<Set<MappableField>>(new Set());

  const trip = targets.find((t) => t.id === tripId);
  const comparison = trip?.comparisons.find((c) => c.id === comparisonId);
  // Calculs légers : refaits à chaque rendu.
  const criteria: MappableCriterion[] =
    comparisonId === NEW_COMPARISON
      ? presetByKey("lodging").criteria.map((c, i) => ({ ...c, id: `preset-${i}` }))
      : (comparison?.criteria ?? []);

  const mappable: MappableValues = (() => {
    const result: MappableValues = {};
    for (const field of MAPPABLE_FIELDS) {
      const raw = values[field as EditableKey];
      if (field === "address") {
        if (raw.trim()) result.address = raw.trim();
      } else if (field === "freeCancellation") {
        if (raw === "true" || raw === "false") result.freeCancellation = raw === "true";
      } else {
        const n = parseNumber(raw);
        if (n !== undefined) (result as Record<string, number>)[field] = n;
      }
    }
    return result;
  })();
  const matches = mapListingToCriteria(criteria, mappable);
  const unmatched = MAPPABLE_FIELDS.filter((f) => mappable[f] !== undefined && !matches.some((m) => m.field === f));

  const tripNights = trip?.startDate && trip.endDate ? nightsBetween(trip.startDate, trip.endDate) : null;
  const listingNights = parseNumber(values.nights);
  const nightsMismatch = tripNights !== null && listingNights !== undefined && tripNights > 0 && listingNights !== tripNights;

  const set = (key: EditableKey) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    for (const match of matches) if (!rejected.has(match.field)) formData.set(`apply:${match.field}`, "on");
    startTransition(async () => {
      const result = await confirmImport(pendingId, formData);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      const { prefilled } = result.data;
      toast.success(
        prefilled.length > 0 ? `Élément ajouté — critères pré-remplis : ${prefilled.join(", ")}` : "Élément ajouté au comparatif",
      );
      router.push(`/trips/${result.data.tripId}/comparisons/${result.data.comparisonId}`);
    });
  }

  if (targets.length === 0) return <NoTripCard />;

  const fieldProps = (key: EditableKey) => ({
    label: FIELD_LABELS[key],
    htmlFor: `import-${key}`,
    error: errors[key],
    hint: hintFor(fields[key] as Field<unknown> | undefined),
    // Aides de hauteurs variables : libellés et champs alignés en haut de chaque cellule.
    className: "content-start",
  });

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-6" noValidate>
      <input type="hidden" name="url" value={url ?? ""} />
      <input type="hidden" name="image" value={image} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Annonce</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground flex items-center gap-1">
                <ExternalLinkIcon className="size-3.5" />
                {extraction.siteName ?? extraction.domain ?? url}
              </a>
            )}
            <LlmStatus status={extraction.llm} />
          </CardDescription>
          <ImportWarnings warnings={warnings} />
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <FormField {...fieldProps("title")}>
            <Input id="import-title" name="title" value={values.title} onChange={set("title")} />
          </FormField>

          <div className="grid grid-cols-1 gap-2">
            <span className="text-sm font-medium">Image</span>
            {extraction.images.length > 0 ? (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Image de l'élément">
                {extraction.images.map((src) => (
                  <ImageChoice key={src} src={src} selected={image === src} onSelect={() => setImage(src)} />
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={image === ""}
                  onClick={() => setImage("")}
                  className={cn(
                    "text-muted-foreground flex h-20 w-28 items-center justify-center rounded-md border text-xs",
                    image === "" && "ring-primary ring-2",
                  )}
                >
                  Aucune
                </button>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">Aucune image trouvée sur la page.</p>
            )}
            {fields.image && <p className="text-muted-foreground text-xs">{hintFor(fields.image)}</p>}
          </div>

          <FormField {...fieldProps("description")}>
            <Textarea id="import-description" name="description" value={values.description} onChange={set("description")} rows={3} />
          </FormField>
          <FormField {...fieldProps("address")}>
            <Input id="import-address" name="address" value={values.address} onChange={set("address")} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Séjour et caractéristiques</CardTitle>
          <CardDescription>
            {fields.checkIn && fields.checkOut
              ? `Tarif relevé du ${formatDate(new Date(fields.checkIn.value))} au ${formatDate(new Date(fields.checkOut.value))}.`
              : "Vérifiez que le prix correspond bien à vos dates."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          {nightsMismatch && (
            <p role="status" className="border-warning/50 bg-warning/10 flex gap-2 rounded-lg border p-3 text-sm" data-testid="nights-warning">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
              Le prix couvre {listingNights} nuit{listingNights! > 1 ? "s" : ""}, votre voyage en compte {tripNights}.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {NUMBER_FIELDS.map((key) => (
              <FormField key={key} {...fieldProps(key)}>
                <Input id={`import-${key}`} name={key} inputMode="decimal" value={values[key]} onChange={set(key)} />
              </FormField>
            ))}
            <FormField {...fieldProps("freeCancellation")}>
              <NativeSelect id="import-freeCancellation" name="freeCancellation" value={values.freeCancellation} onChange={set("freeCancellation")}>
                <option value="">—</option>
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </NativeSelect>
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
                  setComparisonId(defaultComparisonFor("lodging", targets.find((t) => t.id === e.target.value)?.comparisons));
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
                <option value={NEW_COMPARISON}>+ Créer un comparatif « Logements »</option>
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
            unmatchedLabels={unmatched.map((f) => FIELD_LABELS[f])}
          />

          <FormField label="Notes de l'élément" htmlFor="import-notes">
            <Textarea id="import-notes" name="notes" defaultValue={defaultNotes} rows={4} />
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

function ImageChoice({ src, selected, onSelect }: { src: string; selected: boolean; onSelect: () => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label="Choisir cette image"
      onClick={onSelect}
      className={cn("bg-muted h-20 w-28 overflow-hidden rounded-md border", selected && "ring-primary ring-2")}
    >
      {broken ? (
        <span className="text-muted-foreground flex h-full items-center justify-center">
          <ImageOffIcon className="size-4" />
        </span>
      ) : (
        // Images d'origines arbitraires : <img> natif (pas de liste blanche next/image).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      )}
    </button>
  );
}

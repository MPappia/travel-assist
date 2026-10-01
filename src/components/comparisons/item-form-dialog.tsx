"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";

import { PasteContentForm } from "@/components/comparisons/paste-content-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";
import { toInputValue, type StoredCriterionValue } from "@/lib/domain/criteria-values";
import { CRITERION_DIRECTION_LABELS, type CriterionDirectionValue, type CriterionTypeValue } from "@/lib/labels";
import { createComparisonItem, updateComparisonItem } from "@/server/actions/comparisons";

export interface ItemFormCriterion {
  id: string;
  name: string;
  type: CriterionTypeValue;
  direction: CriterionDirectionValue;
  unit: string;
}

export interface ItemFormValues {
  id: string;
  title: string;
  url: string | null;
  notes: string;
  previewDescription?: string | null;
  previewImage?: string | null;
  values: (StoredCriterionValue & { criterionId: string })[];
}

export function CriterionValueInput({
  criterion,
  defaultValue,
  invalid,
}: {
  criterion: ItemFormCriterion;
  defaultValue: string;
  invalid?: boolean;
}) {
  const name = `value:${criterion.id}`;
  const id = `item-value-${criterion.id}`;
  if (criterion.type === "BOOLEAN") {
    return (
      <NativeSelect id={id} name={name} defaultValue={defaultValue} aria-invalid={invalid}>
        <option value="">—</option>
        <option value="true">Oui</option>
        <option value="false">Non</option>
      </NativeSelect>
    );
  }
  if (criterion.type === "RATING") {
    return (
      <NativeSelect id={id} name={name} defaultValue={defaultValue} aria-invalid={invalid}>
        <option value="">—</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={String(n)}>
            {"★".repeat(n)}
            {"☆".repeat(5 - n)} ({n})
          </option>
        ))}
        {defaultValue && !["1", "2", "3", "4", "5"].includes(defaultValue) && (
          <option value={defaultValue}>{defaultValue}</option>
        )}
      </NativeSelect>
    );
  }
  return (
    <Input
      id={id}
      name={name}
      defaultValue={defaultValue}
      inputMode={criterion.type === "NUMBER" ? "decimal" : undefined}
      aria-invalid={invalid}
    />
  );
}

export function ItemFormDialog({
  comparisonId,
  criteria,
  item,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  comparisonId: string;
  criteria: ItemFormCriterion[];
  item?: ItemFormValues;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const valueMap = Object.fromEntries((item?.values ?? []).map((v) => [v.criterionId, v]));

  const { pending, errors, setErrors, onSubmit } = useFormAction(
    (formData: FormData) =>
      item ? updateComparisonItem(item.id, formData) : createComparisonItem(comparisonId, formData),
    { successMessage: item ? "Élément mis à jour" : "Élément ajouté", onSuccess: () => setOpen(false) },
  );

  const manualForm = (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate>
      <FormField label="Titre" htmlFor="item-title" error={errors.title}>
        <Input id="item-title" name="title" defaultValue={item?.title} placeholder="Appartement Alfama" autoFocus />
      </FormField>
      <FormField label="Lien (facultatif)" htmlFor="item-url" error={errors.url}>
        <Input id="item-url" name="url" type="url" defaultValue={item?.url ?? ""} placeholder="https://…" />
      </FormField>
      {criteria.length > 0 && (
        <fieldset className="grid grid-cols-1 gap-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Critères</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {criteria.map((criterion) => (
              <FormField
                key={criterion.id}
                label={criterion.unit ? `${criterion.name} (${criterion.unit})` : criterion.name}
                htmlFor={`item-value-${criterion.id}`}
                error={errors[`value:${criterion.id}`]}
                hint={criterion.type === "TEXT" ? "Non noté" : CRITERION_DIRECTION_LABELS[criterion.direction]}
              >
                <CriterionValueInput
                  criterion={criterion}
                  defaultValue={toInputValue(criterion.type, valueMap[criterion.id])}
                  invalid={Boolean(errors[`value:${criterion.id}`])}
                />
              </FormField>
            ))}
          </div>
        </fieldset>
      )}
      {item?.url && (
        <fieldset className="grid grid-cols-1 gap-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Aperçu du lien</legend>
          <FormField label="Description" htmlFor="item-preview-description" error={errors.previewDescription}>
            <Textarea
              id="item-preview-description"
              name="previewDescription"
              defaultValue={item.previewDescription ?? ""}
              rows={2}
            />
          </FormField>
          <FormField label="Image (adresse)" htmlFor="item-preview-image" error={errors.previewImage}>
            <Input
              id="item-preview-image"
              name="previewImage"
              type="url"
              defaultValue={item.previewImage ?? ""}
              placeholder="https://…"
            />
          </FormField>
        </fieldset>
      )}
      <FormField label="Notes" htmlFor="item-notes" error={errors.notes}>
        <Textarea id="item-notes" name="notes" defaultValue={item?.notes} rows={2} />
      </FormField>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {item ? "Enregistrer" : "Ajouter"}
        </Button>
      </DialogFooter>
    </form>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setErrors({});
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{item ? "Modifier l'élément" : "Nouvel élément"}</DialogTitle>
          <DialogDescription>Renseignez ce que vous savez, le reste pourra être complété plus tard.</DialogDescription>
        </DialogHeader>
        {item ? (
          manualForm
        ) : (
          <Tabs defaultValue="manual">
            <TabsList className="w-full">
              <TabsTrigger value="manual">Saisie manuelle</TabsTrigger>
              <TabsTrigger value="paste">Coller le contenu de la page</TabsTrigger>
            </TabsList>
            <TabsContent value="manual">{manualForm}</TabsContent>
            <TabsContent value="paste">
              <PasteContentForm comparisonId={comparisonId} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

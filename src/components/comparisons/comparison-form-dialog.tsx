"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { COMPARISON_PRESETS } from "@/lib/domain/comparison-presets";
import {
  CRITERION_DIRECTIONS,
  CRITERION_DIRECTION_LABELS,
  CRITERION_TYPES,
  CRITERION_TYPE_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type CriterionDirectionValue,
  type ComparisonKindValue,
  type CriterionTypeValue,
  type ExpenseCategoryValue,
} from "@/lib/labels";
import type { FieldErrors } from "@/lib/validation";
import { createComparison, updateComparison } from "@/server/actions/comparisons";

interface CriterionDraft {
  key: string;
  id?: string;
  name: string;
  type: CriterionTypeValue;
  weight: string;
  direction: CriterionDirectionValue;
  unit: string;
}

export interface ComparisonFormValues {
  id: string;
  name: string;
  expenseCategory: ExpenseCategoryValue;
  criteria: { id: string; name: string; type: CriterionTypeValue; weight: number; direction: CriterionDirectionValue; unit: string }[];
}

let keySeq = 0;
const nextKey = () => `c${++keySeq}`;

type CriterionSource = Omit<ComparisonFormValues["criteria"][number], "id"> & { id?: string };

function draftsFrom(criteria: readonly CriterionSource[]): CriterionDraft[] {
  return criteria.map((c) => ({ ...c, key: nextKey(), weight: String(c.weight) }));
}

export function ComparisonFormDialog({
  tripId,
  comparison,
  trigger,
}: {
  tripId: string;
  comparison?: ComparisonFormValues;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const initialPreset = COMPARISON_PRESETS[0];
  const [name, setName] = useState(comparison?.name ?? initialPreset.name);
  const [category, setCategory] = useState<ExpenseCategoryValue>(comparison?.expenseCategory ?? initialPreset.expenseCategory);
  // Le type (logements, vols…) est fixé à la création par le modèle choisi.
  const [kind, setKind] = useState<ComparisonKindValue>(initialPreset.kind);
  const [presetKey, setPresetKey] = useState(initialPreset.key);
  const [criteria, setCriteria] = useState<CriterionDraft[]>(() =>
    draftsFrom(comparison?.criteria ?? initialPreset.criteria),
  );

  function reset() {
    setErrors({});
    setName(comparison?.name ?? initialPreset.name);
    setCategory(comparison?.expenseCategory ?? initialPreset.expenseCategory);
    setKind(initialPreset.kind);
    setPresetKey(initialPreset.key);
    setCriteria(draftsFrom(comparison?.criteria ?? initialPreset.criteria));
  }

  function applyPreset(key: string) {
    const preset = COMPARISON_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setName(preset.name);
    setCriteria(draftsFrom(preset.criteria));
    setCategory(preset.expenseCategory);
    setKind(preset.kind);
    setPresetKey(preset.key);
  }

  function update(key: string, patch: Partial<CriterionDraft>) {
    setCriteria((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function move(index: number, delta: number) {
    setCriteria((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      name,
      expenseCategory: category,
      ...(comparison ? {} : { kind }),
      criteria: criteria.map(({ id, name, type, weight, direction, unit }) => ({
        id,
        name,
        type,
        weight: weight.replace(",", "."),
        direction,
        unit,
      })),
    };
    startTransition(async () => {
      const result = comparison ? await updateComparison(comparison.id, payload) : await createComparison(tripId, payload);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success(comparison ? "Comparatif mis à jour" : "Comparatif créé");
      setOpen(false);
      if (result.data && "id" in result.data) router.push(`/trips/${tripId}/comparisons/${result.data.id}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{comparison ? "Modifier le comparatif" : "Nouveau comparatif"}</DialogTitle>
          <DialogDescription>
            Définissez les critères et leur poids : le score sur 100 est calculé automatiquement.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4" noValidate>
          {!comparison && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Modèle :</span>
              {COMPARISON_PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  type="button"
                  variant={presetKey === preset.key ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={presetKey === preset.key}
                  onClick={() => applyPreset(preset.key)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Nom" htmlFor="comparison-name" error={errors.name}>
              <Input
                id="comparison-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Logements Lisbonne"
              />
            </FormField>
            <FormField
              label="Catégorie budgétaire"
              htmlFor="comparison-category"
              hint="Utilisée pour la dépense d'un élément retenu"
            >
              <NativeSelect
                id="comparison-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategoryValue)}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center justify-between">
              <Label>Critères</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCriteria((list) => [
                    ...list,
                    { key: nextKey(), name: "", type: "NUMBER", weight: "1", direction: "HIGHER_IS_BETTER", unit: "" },
                  ])
                }
              >
                <PlusIcon />
                Ajouter un critère
              </Button>
            </div>
            {criteria.length === 0 && (
              <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
                Aucun critère : ajoutez-en au moins un pour calculer un score.
              </p>
            )}
            <ul className="grid grid-cols-1 gap-2">
              {criteria.map((c, index) => (
                <li key={c.key} className="bg-muted/30 grid grid-cols-1 gap-2 rounded-lg border p-3" data-testid="criterion-editor-row">
                  <div className="flex gap-2">
                    <Input
                      aria-label={`Nom du critère ${index + 1}`}
                      value={c.name}
                      onChange={(e) => update(c.key, { name: e.target.value })}
                      placeholder="Nom du critère"
                      aria-invalid={Boolean(errors[`criteria.${index}.name`])}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Monter"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Descendre"
                      disabled={index === criteria.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDownIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Supprimer le critère ${c.name || index + 1}`}
                      onClick={() => setCriteria((list) => list.filter((x) => x.key !== c.key))}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_80px_80px]">
                    <NativeSelect
                      aria-label="Type"
                      value={c.type}
                      onChange={(e) => update(c.key, { type: e.target.value as CriterionTypeValue })}
                    >
                      {CRITERION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {CRITERION_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </NativeSelect>
                    <NativeSelect
                      aria-label="Sens"
                      value={c.direction}
                      disabled={c.type === "TEXT"}
                      onChange={(e) => update(c.key, { direction: e.target.value as CriterionDirectionValue })}
                    >
                      {CRITERION_DIRECTIONS.map((d) => (
                        <option key={d} value={d}>
                          {CRITERION_DIRECTION_LABELS[d]}
                        </option>
                      ))}
                    </NativeSelect>
                    <Input
                      aria-label="Poids"
                      title="Poids (0 à 10)"
                      inputMode="decimal"
                      value={c.weight}
                      disabled={c.type === "TEXT"}
                      onChange={(e) => update(c.key, { weight: e.target.value })}
                      aria-invalid={Boolean(errors[`criteria.${index}.weight`])}
                    />
                    <Input
                      aria-label="Unité"
                      placeholder="Unité"
                      value={c.unit}
                      disabled={c.type !== "NUMBER"}
                      onChange={(e) => update(c.key, { unit: e.target.value })}
                    />
                  </div>
                  {(errors[`criteria.${index}.name`] || errors[`criteria.${index}.weight`]) && (
                    <p className="text-destructive text-xs" role="alert">
                      {errors[`criteria.${index}.name`] ?? errors[`criteria.${index}.weight`]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {comparison && (
              <p className="text-muted-foreground text-xs">
                Supprimer un critère ou changer son type efface les valeurs déjà saisies pour ce critère.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {comparison ? "Enregistrer" : "Créer le comparatif"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

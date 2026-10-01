"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";
import { centsToInput, toDateKey } from "@/lib/format";
import { TRIP_STATUSES, TRIP_STATUS_LABELS, type TripStatusValue } from "@/lib/labels";
import { createTrip, updateTrip } from "@/server/actions/trips";

export interface TripFormValues {
  id: string;
  name: string;
  destination: string;
  startDate: Date | null;
  endDate: Date | null;
  travelers: number;
  budgetCents: number | null;
  status: TripStatusValue;
  notes: string;
}

export function TripFormDialog({ trip, trigger }: { trip?: TripFormValues; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const isEdit = Boolean(trip);

  const { pending, errors, setErrors, onSubmit } = useFormAction(
    async (formData: FormData) => (trip ? updateTrip(trip.id, formData) : createTrip(formData)),
    {
      successMessage: isEdit ? "Voyage mis à jour" : "Voyage créé",
      onSuccess: (data) => {
        setOpen(false);
        if (data && "id" in data) router.push(`/trips/${data.id}`);
      },
    },
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setErrors({});
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le voyage" : "Nouveau voyage"}</DialogTitle>
          <DialogDescription>Les informations essentielles, tout reste modifiable plus tard.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate>
          <FormField label="Nom du voyage" htmlFor="trip-name" error={errors.name}>
            <Input id="trip-name" name="name" defaultValue={trip?.name} placeholder="Été au Portugal" required autoFocus />
          </FormField>
          <FormField label="Destination" htmlFor="trip-destination" error={errors.destination}>
            <Input id="trip-destination" name="destination" defaultValue={trip?.destination} placeholder="Lisbonne" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Début" htmlFor="trip-start" error={errors.startDate}>
              <Input id="trip-start" name="startDate" type="date" defaultValue={toDateKey(trip?.startDate)} />
            </FormField>
            <FormField label="Fin" htmlFor="trip-end" error={errors.endDate}>
              <Input id="trip-end" name="endDate" type="date" defaultValue={toDateKey(trip?.endDate)} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Voyageurs" htmlFor="trip-travelers" error={errors.travelers}>
              <Input id="trip-travelers" name="travelers" type="number" min={1} defaultValue={trip?.travelers ?? 2} />
            </FormField>
            <FormField label="Budget cible (€)" htmlFor="trip-budget" error={errors.budget}>
              <Input
                id="trip-budget"
                name="budget"
                inputMode="decimal"
                defaultValue={centsToInput(trip?.budgetCents)}
                placeholder="2000"
              />
            </FormField>
          </div>
          <FormField label="Statut" htmlFor="trip-status" error={errors.status}>
            <NativeSelect id="trip-status" name="status" defaultValue={trip?.status ?? "IDEA"}>
              {TRIP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TRIP_STATUS_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Notes" htmlFor="trip-notes" error={errors.notes}>
            <Textarea id="trip-notes" name="notes" defaultValue={trip?.notes} rows={3} />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {isEdit ? "Enregistrer" : "Créer le voyage"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";
import { formatCoordinates } from "@/lib/domain/geocoding";
import { toDateKey } from "@/lib/format";
import { updateStop } from "@/server/actions/routes";

export interface StopValues {
  id: string;
  name: string;
  lat: number;
  lng: number;
  date: Date | null;
  nights: number | null;
  notes: string;
}

export function StopDialog({ stop, trigger }: { stop: StopValues; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { pending, errors, setErrors, onSubmit } = useFormAction((formData: FormData) => updateStop(stop.id, formData), {
    successMessage: "Étape mise à jour",
    onSuccess: () => setOpen(false),
  });

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
          <DialogTitle>Modifier l&apos;étape</DialogTitle>
          <DialogDescription>{formatCoordinates(stop.lat, stop.lng)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField label="Nom" htmlFor="stop-name" error={errors.name}>
            <Input id="stop-name" name="name" defaultValue={stop.name} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date d'arrivée" htmlFor="stop-date" error={errors.date} hint="Facultative">
              <Input id="stop-date" name="date" type="date" defaultValue={toDateKey(stop.date)} />
            </FormField>
            <FormField label="Nuits sur place" htmlFor="stop-nights" error={errors.nights} hint="0 = simple passage">
              <Input
                id="stop-nights"
                name="nights"
                type="number"
                min={0}
                max={60}
                defaultValue={stop.nights ?? ""}
              />
            </FormField>
          </div>
          <FormField label="Notes" htmlFor="stop-notes" error={errors.notes}>
            <Textarea id="stop-notes" name="notes" defaultValue={stop.notes} rows={3} />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

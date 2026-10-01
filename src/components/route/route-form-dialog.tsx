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
import { useFormAction } from "@/hooks/use-form-action";
import { ROUTE_MODES, ROUTE_MODE_LABELS } from "@/lib/labels";
import { createRoute, renameRoute } from "@/server/actions/routes";

export function RouteFormDialog({
  tripId,
  route,
  trigger,
}: {
  tripId: string;
  route?: { id: string; name: string };
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { pending, errors, setErrors, onSubmit } = useFormAction(
    (formData: FormData) => (route ? renameRoute(route.id, formData) : createRoute(tripId, formData)),
    {
      successMessage: route ? "Itinéraire renommé" : "Itinéraire créé",
      onSuccess: (data) => {
        setOpen(false);
        if (data && "id" in data) router.push(`/trips/${tripId}/route?route=${data.id}`);
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
          <DialogTitle>{route ? "Renommer l'itinéraire" : "Nouvel itinéraire"}</DialogTitle>
          <DialogDescription>Un road trip, une randonnée, une boucle à vélo…</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate>
          <FormField label="Nom" htmlFor="route-name" error={errors.name}>
            <Input id="route-name" name="name" defaultValue={route?.name} placeholder="Road trip des Alpes" autoFocus />
          </FormField>
          {!route && (
            <FormField label="Mode" htmlFor="route-mode">
              <NativeSelect id="route-mode" name="mode" defaultValue="DRIVING">
                {ROUTE_MODES.map((m) => (
                  <option key={m} value={m}>
                    {ROUTE_MODE_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {route ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

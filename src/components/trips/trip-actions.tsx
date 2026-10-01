"use client";

import { useRouter } from "next/navigation";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { TripFormDialog, type TripFormValues } from "@/components/trips/trip-form-dialog";
import { Button } from "@/components/ui/button";
import { deleteTrip } from "@/server/actions/trips";

export function TripActions({ trip }: { trip: TripFormValues }) {
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <TripFormDialog
        trip={trip}
        trigger={
          <Button variant="outline" size="sm">
            <PencilIcon />
            Modifier
          </Button>
        }
      />
      <ConfirmDeleteButton
        title={`Supprimer « ${trip.name} » ?`}
        description="Les tâches, dépenses, comparatifs et itinéraires de ce voyage seront supprimés définitivement."
        onConfirm={async () => {
          await deleteTrip(trip.id);
          toast.success("Voyage supprimé");
          router.push("/");
        }}
        trigger={
          <Button variant="outline" size="sm" aria-label="Supprimer le voyage">
            <Trash2Icon />
            <span className="sr-only sm:not-sr-only">Supprimer</span>
          </Button>
        }
      />
    </div>
  );
}

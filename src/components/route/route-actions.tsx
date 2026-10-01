"use client";

import { useRouter } from "next/navigation";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { RouteFormDialog } from "@/components/route/route-form-dialog";
import { Button } from "@/components/ui/button";
import { deleteRoute } from "@/server/actions/routes";

export function RouteActions({ tripId, route }: { tripId: string; route: { id: string; name: string } }) {
  const router = useRouter();
  return (
    <div className="flex gap-1">
      <RouteFormDialog
        tripId={tripId}
        route={route}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label="Renommer l'itinéraire">
            <PencilIcon />
          </Button>
        }
      />
      <ConfirmDeleteButton
        title={`Supprimer « ${route.name} » ?`}
        description="L'itinéraire et toutes ses étapes seront supprimés."
        label="Supprimer l'itinéraire"
        onConfirm={async () => {
          await deleteRoute(route.id);
          toast.success("Itinéraire supprimé");
          router.replace(`/trips/${tripId}/route`);
        }}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label="Supprimer l'itinéraire">
            <Trash2Icon />
          </Button>
        }
      />
    </div>
  );
}

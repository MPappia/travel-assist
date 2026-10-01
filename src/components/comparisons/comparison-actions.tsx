"use client";

import { useRouter } from "next/navigation";
import { SlidersHorizontalIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { ComparisonFormDialog, type ComparisonFormValues } from "@/components/comparisons/comparison-form-dialog";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { deleteComparison } from "@/server/actions/comparisons";

export function ComparisonActions({ tripId, comparison }: { tripId: string; comparison: ComparisonFormValues }) {
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <ComparisonFormDialog
        tripId={tripId}
        comparison={comparison}
        trigger={
          <Button variant="outline" size="sm">
            <SlidersHorizontalIcon />
            Critères
          </Button>
        }
      />
      <ConfirmDeleteButton
        title={`Supprimer « ${comparison.name} » ?`}
        description="Le comparatif, ses critères et ses éléments seront supprimés. Les dépenses déjà créées restent dans le budget."
        onConfirm={async () => {
          await deleteComparison(comparison.id);
          toast.success("Comparatif supprimé");
          router.push(`/trips/${tripId}/comparisons`);
        }}
        trigger={
          <Button variant="outline" size="sm" aria-label="Supprimer le comparatif">
            <Trash2Icon />
          </Button>
        }
      />
    </div>
  );
}

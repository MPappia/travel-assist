"use client";

import { useEffect } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={TriangleAlertIcon}
      title="Quelque chose s'est mal passé"
      description="La page n'a pas pu être affichée. Vos données ne sont pas perdues : réessayez dans un instant."
    >
      <Button variant="outline" onClick={reset}>
        Réessayer
      </Button>
    </EmptyState>
  );
}

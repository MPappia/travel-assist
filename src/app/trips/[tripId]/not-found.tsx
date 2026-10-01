import Link from "next/link";
import { MapIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function TripNotFound() {
  return (
    <EmptyState icon={MapIcon} title="Voyage introuvable" description="Il a peut-être été supprimé.">
      <Button asChild variant="outline">
        <Link href="/">Retour aux voyages</Link>
      </Button>
    </EmptyState>
  );
}

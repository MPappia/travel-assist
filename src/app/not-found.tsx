import Link from "next/link";
import { CompassIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState icon={CompassIcon} title="Page introuvable" description="Cette adresse ne correspond à aucune page.">
      <Button asChild variant="outline">
        <Link href="/">Retour aux voyages</Link>
      </Button>
    </EmptyState>
  );
}

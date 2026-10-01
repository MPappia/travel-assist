import { ScaleIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export default function ComparisonNotFound() {
  return <EmptyState icon={ScaleIcon} title="Comparatif introuvable" description="Il a peut-être été supprimé." />;
}

import { Badge } from "@/components/ui/badge";
import { TRIP_STATUS_LABELS, type TripStatusValue } from "@/lib/labels";

const VARIANTS: Record<TripStatusValue, React.ComponentProps<typeof Badge>["variant"]> = {
  IDEA: "outline",
  PLANNING: "warning",
  BOOKED: "success",
  DONE: "secondary",
};

export function TripStatusBadge({ status }: { status: TripStatusValue }) {
  return <Badge variant={VARIANTS[status]}>{TRIP_STATUS_LABELS[status]}</Badge>;
}

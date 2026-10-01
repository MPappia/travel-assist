"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangleIcon, ArrowDownIcon, BedDoubleIcon, CalendarIcon, GripVerticalIcon, PencilIcon } from "lucide-react";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { StopDialog, type StopValues } from "@/components/route/stop-dialog";
import { Button } from "@/components/ui/button";
import type { DirectionsLeg } from "@/lib/domain/ors";
import { formatDistance, formatDuration, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StopList({
  stops,
  legs,
  legsStale,
  errorIndex,
  onReorder,
  onDelete,
}: {
  stops: StopValues[];
  legs: DirectionsLeg[] | null;
  legsStale: boolean;
  errorIndex?: number;
  onReorder: (ids: string[]) => void;
  onDelete: (stop: StopValues) => Promise<void>;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = stops.findIndex((s) => s.id === active.id);
    const to = stops.findIndex((s) => s.id === over.id);
    onReorder(arrayMove(stops, from, to).map((s) => s.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: "Appuyez sur Espace pour saisir l'étape, utilisez les flèches pour la déplacer, Espace pour la déposer.",
        },
      }}
    >
      <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ol className="grid" data-testid="stop-list">
          {stops.map((stop, index) => (
            <SortableStop
              key={stop.id}
              stop={stop}
              index={index}
              leg={index < stops.length - 1 ? (legs?.[index] ?? null) : null}
              legsStale={legsStale}
              isLast={index === stops.length - 1}
              hasError={errorIndex === index}
              onDelete={onDelete}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableStop({
  stop,
  index,
  leg,
  legsStale,
  isLast,
  hasError,
  onDelete,
}: {
  stop: StopValues;
  index: number;
  leg: DirectionsLeg | null;
  legsStale: boolean;
  isLast: boolean;
  hasError: boolean;
  onDelete: (stop: StopValues) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
      data-testid="stop-row"
      data-stop-name={stop.name}
    >
      <div
        className={cn(
          "bg-card flex items-center gap-2 rounded-lg border px-2 py-2",
          isDragging && "shadow-lg",
          hasError && "border-destructive bg-destructive/5",
        )}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-grab touch-none rounded p-1 active:cursor-grabbing"
          aria-label={`Déplacer « ${stop.name} »`}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            hasError ? "bg-destructive text-white" : "bg-primary text-primary-foreground",
          )}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={stop.name}>
            {stop.name}
          </p>
          {(stop.date || stop.nights) && (
            <p className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
              {stop.date && (
                <span className="flex items-center gap-1">
                  <CalendarIcon className="size-3" />
                  {formatShortDate(stop.date)}
                </span>
              )}
              {stop.nights ? (
                <span className="flex items-center gap-1">
                  <BedDoubleIcon className="size-3" />
                  {stop.nights} nuit{stop.nights > 1 ? "s" : ""}
                </span>
              ) : null}
            </p>
          )}
        </div>
        {hasError && <AlertTriangleIcon className="text-destructive size-4" aria-label="Étape non accessible" />}
        <StopDialog
          stop={stop}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Modifier « ${stop.name} »`}>
              <PencilIcon />
            </Button>
          }
        />
        <ConfirmDeleteButton
          title={`Retirer « ${stop.name} » ?`}
          description="L'étape sera retirée de l'itinéraire, qui sera recalculé."
          label={`Supprimer « ${stop.name} »`}
          onConfirm={() => onDelete(stop)}
        />
      </div>
      {!isLast && (
        <div
          className={cn("text-muted-foreground flex items-center gap-2 py-1.5 pl-[2.6rem] text-xs", legsStale && "opacity-50")}
          data-testid="leg"
        >
          <ArrowDownIcon className="size-3" />
          {leg ? (
            <span className="tabular-nums">
              {formatDistance(leg.distance)} · {formatDuration(leg.duration)}
            </span>
          ) : (
            <span>—</span>
          )}
        </div>
      )}
    </li>
  );
}

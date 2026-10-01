"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, Trash2Icon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ConfirmProps {
  title: string;
  description?: string;
  onConfirm: () => Promise<unknown>;
}

function ConfirmContent({ title, description, onConfirm, close }: ConfirmProps & { close: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description ?? "Cette action est définitive."}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await onConfirm();
              close();
            })
          }
        >
          {pending && <Loader2Icon className="animate-spin" />}
          Supprimer
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

/** Boîte de confirmation de suppression contrôlée (ouverte depuis un menu, par exemple). */
export function ConfirmDialog({
  open,
  onOpenChange,
  ...props
}: ConfirmProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <ConfirmContent {...props} close={() => onOpenChange(false)} />
    </AlertDialog>
  );
}

/** Bouton de suppression avec boîte de confirmation. */
export function ConfirmDeleteButton({
  label = "Supprimer",
  trigger,
  ...props
}: ConfirmProps & { label?: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon-sm" aria-label={label}>
            <Trash2Icon />
          </Button>
        )}
      </AlertDialogTrigger>
      <ConfirmContent {...props} close={() => setOpen(false)} />
    </AlertDialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/action-result";
import type { FieldErrors } from "@/lib/validation";

/**
 * Soumet un formulaire à une server action et gère erreurs de champs, état d'attente et toasts.
 * On utilise onSubmit (et non `action=`) pour ne pas vider le formulaire en cas d'erreur.
 */
export function useFormAction<T>(
  action: (formData: FormData) => Promise<ActionResult<T>>,
  options: { successMessage?: string; onSuccess?: (data: T) => void } = {},
) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          toast.error(result.error);
          return;
        }
        setErrors({});
        if (options.successMessage) toast.success(options.successMessage);
        options.onSuccess?.(result.data);
      } catch (error) {
        console.error(error);
        toast.error("Une erreur inattendue est survenue.");
      }
    });
  }

  return { pending, errors, setErrors, onSubmit };
}

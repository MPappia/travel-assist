"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_TEXT_LENGTH } from "@/lib/listing-extract/payload";
import type { FieldErrors } from "@/lib/validation";
import { createImportFromText } from "@/server/actions/imports";

/**
 * Secours au bookmarklet (et usage sur mobile) : le texte copié depuis la page de l'annonce
 * passe par le même pipeline d'extraction et la même page de confirmation.
 */
export function PasteContentForm({ comparisonId }: { comparisonId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();
  const tooLong = text.length > MAX_TEXT_LENGTH;

  return (
    <form
      className="grid grid-cols-1 gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await createImportFromText({ text, url });
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            toast.error(result.error);
            return;
          }
          router.push(`/import/${result.data.id}?comparison=${comparisonId}`);
        });
      }}
    >
      <p className="text-muted-foreground text-sm">
        Sur la page de l&apos;annonce, sélectionnez tout (Ctrl+A ou ⌘+A, « Tout sélectionner » sur mobile), copiez, puis
        collez ici. Vous vérifierez les informations trouvées avant l&apos;ajout.
      </p>
      <FormField
        label="Contenu de la page"
        htmlFor="paste-text"
        error={errors.text}
        hint={
          tooLong
            ? `${text.length.toLocaleString("fr-FR")} caractères : seuls les ${MAX_TEXT_LENGTH.toLocaleString("fr-FR")} premiers seront analysés.`
            : `${text.length.toLocaleString("fr-FR")} / ${MAX_TEXT_LENGTH.toLocaleString("fr-FR")} caractères`
        }
      >
        <Textarea
          id="paste-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="max-h-72 font-mono text-xs"
          placeholder="Collez ici le texte de l'annonce…"
        />
      </FormField>
      <FormField label="Adresse de l'annonce (facultatif)" htmlFor="paste-url" error={errors.url}>
        <Input id="paste-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </FormField>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !text.trim()}>
          {pending && <Loader2Icon className="animate-spin" />}
          Analyser le contenu
        </Button>
      </div>
    </form>
  );
}

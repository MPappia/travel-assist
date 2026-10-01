"use client";

import { useRef, useState, useTransition } from "react";
import { LinkIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createItemFromUrl } from "@/server/actions/comparisons";

function looksLikeUrl(text: string) {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

/** Coller un lien (Airbnb, Booking, Abritel…) crée un élément avec son aperçu. */
export function PasteLinkForm({ comparisonId }: { comparisonId: string }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(url: string) {
    if (!url.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await createItemFromUrl(comparisonId, url);
        if (!result.ok) {
          setError(result.fieldErrors?.url ?? result.error);
          return;
        }
        setValue("");
        if (result.data.status === "OK") toast.success("Élément ajouté avec son aperçu");
        else if (result.data.status === "PARTIAL") toast.info("Élément ajouté — aperçu partiel, complétez à la main");
        else toast.info(`Élément ajouté sans aperçu : ${result.data.error ?? "extraction impossible"}`);
      } catch (e) {
        console.error(e);
        toast.error("Impossible d'ajouter ce lien.");
      } finally {
        inputRef.current?.focus();
      }
    });
  }

  return (
    <form
      className="grid w-full gap-1 sm:w-auto sm:min-w-96"
      onSubmit={(event) => {
        event.preventDefault();
        submit(value);
      }}
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <LinkIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            ref={inputRef}
            type="url"
            inputMode="url"
            aria-label="Lien de l'annonce"
            placeholder="Coller un lien Airbnb, Booking, Abritel…"
            className="pl-9"
            value={value}
            disabled={pending}
            aria-invalid={Boolean(error)}
            onChange={(e) => setValue(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (looksLikeUrl(text)) {
                e.preventDefault();
                setValue(text.trim());
                submit(text.trim());
              }
            }}
          />
        </div>
        <Button type="submit" disabled={pending || !value.trim()}>
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          {pending ? "Aperçu…" : "Ajouter"}
        </Button>
      </div>
      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

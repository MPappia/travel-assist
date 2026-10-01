"use client";

import { useEffect, useRef, useState } from "react";
import { BookmarkPlusIcon, CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Lien à glisser dans la barre de favoris.
 * React 19 refuse les URL `javascript:` dans `href` : l'attribut est posé directement sur le DOM.
 */
export function BookmarkletLink({ href }: { href: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", href);
  }, [href]);

  return (
    <a
      ref={ref}
      draggable
      data-testid="bookmarklet-link"
      onClick={(event) => {
        event.preventDefault();
        toast.info("Glissez ce bouton dans votre barre de favoris, puis utilisez-le sur une annonce.");
      }}
      className="bg-primary text-primary-foreground inline-flex cursor-grab items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-sm active:cursor-grabbing"
    >
      <BookmarkPlusIcon className="size-4" />
      Envoyer à Traveler Assist
    </a>
  );
}

export function CopyBookmarkletButton({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(href);
          setCopied(true);
          toast.success("Code du favori copié");
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Copie impossible : sélectionnez le code ci-dessous et copiez-le à la main.");
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      Copier le code du favori
    </Button>
  );
}

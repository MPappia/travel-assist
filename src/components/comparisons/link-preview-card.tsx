"use client";

import { useState, useTransition } from "react";
import { ImageOffIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { refreshItemPreview } from "@/server/actions/comparisons";

export interface PreviewFields {
  id: string;
  url: string | null;
  previewStatus: "NONE" | "OK" | "PARTIAL" | "FAILED";
  previewImage: string | null;
  previewDescription: string | null;
  previewSiteName: string | null;
  previewDomain: string | null;
  previewError: string | null;
}

/** Carte d'aperçu d'un lien (image, site, description) avec bouton « rafraîchir ». */
export function LinkPreviewCard({ item }: { item: PreviewFields }) {
  const [pending, startTransition] = useTransition();
  // URL de l'image qui n'a pas pu être chargée (hotlink refusé, image supprimée…).
  const [brokenImage, setBrokenImage] = useState<string | null>(null);
  if (!item.url) return null;
  const image = item.previewImage && item.previewImage !== brokenImage ? item.previewImage : null;

  function refresh() {
    startTransition(async () => {
      const result = await refreshItemPreview(item.id);
      if (!result.ok) toast.error(result.error);
      else if (result.data.status === "FAILED") toast.info(`Aperçu indisponible : ${result.data.error}`);
      else toast.success("Aperçu mis à jour");
    });
  }

  const hasPreview = Boolean(item.previewImage || item.previewDescription);

  return (
    <div className="mt-3 grid grid-cols-1 gap-2" data-testid="link-preview" data-status={item.previewStatus}>
      {image ? (
        // Images hébergées par des domaines arbitraires : <img> natif plutôt que next/image (pas de liste blanche).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          onError={() => setBrokenImage(image)}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="bg-muted h-32 w-full rounded-md border object-cover"
        />
      ) : (
        hasPreview && (
          <div className="bg-muted text-muted-foreground flex h-32 w-full items-center justify-center rounded-md">
            <ImageOffIcon className="size-5" />
          </div>
        )
      )}
      {item.previewDescription && (
        <p className="text-muted-foreground line-clamp-3 text-xs font-normal">{item.previewDescription}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "truncate text-xs font-normal",
            item.previewStatus === "FAILED" ? "text-muted-foreground italic" : "text-muted-foreground",
          )}
          title={item.previewError ?? undefined}
        >
          {item.previewStatus === "FAILED"
            ? `Aperçu indisponible${item.previewError ? ` · ${item.previewError}` : ""}`
            : item.previewStatus === "PARTIAL"
              ? `Aperçu partiel · ${item.previewSiteName ?? item.previewDomain ?? ""}`
              : (item.previewSiteName ?? item.previewDomain)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={refresh}
          disabled={pending}
          aria-label="Rafraîchir l'aperçu"
          title="Rafraîchir l'aperçu"
        >
          <RefreshCwIcon className={cn(pending && "animate-spin")} />
        </Button>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { AlertTriangleIcon, ClipboardPasteIcon, MousePointerClickIcon, ShieldCheckIcon } from "lucide-react";

import { BookmarkletLink, CopyBookmarkletButton } from "@/components/import/bookmarklet-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildBookmarklet } from "@/lib/bookmarklet/generate";

export const metadata: Metadata = { title: "Importer une annonce" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "trop-volumineux":
    "La page envoyée dépasse 2 Mo, même après réduction. Utilisez le copier-coller : dans un comparatif, « Ajouter manuellement » → « Coller le contenu de la page ».",
  illisible: "Les données envoyées par le favori n'ont pas pu être lues. Réessayez, ou utilisez le copier-coller.",
  invalide: "Les données envoyées par le favori sont invalides. Réessayez, ou utilisez le copier-coller ; le favori de diagnostic (ci-dessous) affiche ce qui est envoyé.",
};

export default async function ImportSetupPage({ searchParams }: PageProps<"/import/setup">) {
  const { erreur } = await searchParams;
  const [bookmarklet, diagnostic] = await Promise.all([buildBookmarklet(), buildBookmarklet(undefined, { debug: true })]);
  const error = typeof erreur === "string" ? (ERRORS[erreur] ?? ERRORS.invalide) : null;

  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Importer une annonce depuis le navigateur</h1>
        <p className="text-muted-foreground text-sm">
          Airbnb, Booking ou Abritel bloquent les requêtes automatiques : l&apos;aperçu côté serveur ne remonte souvent
          rien. Ce favori récupère l&apos;annonce directement dans votre navigateur, où la page est déjà affichée.
        </p>
      </div>

      {error && (
        <div role="alert" className="border-destructive/40 bg-destructive/5 text-destructive flex gap-2 rounded-xl border p-4 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Installer le favori</CardTitle>
          <CardDescription>Affichez la barre de favoris (Ctrl+Maj+B, ou ⌘+Maj+B sur Mac), puis glissez-y ce bouton :</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <div className="bg-muted/40 flex justify-center rounded-xl border border-dashed p-6">
            <BookmarkletLink href={bookmarklet.href} />
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Glisser ne fonctionne pas (Safari, mobile…) ?</summary>
            <div className="text-muted-foreground mt-3 grid grid-cols-1 gap-3">
              <ol className="list-decimal space-y-1 pl-5">
                <li>Ajoutez n&apos;importe quelle page à vos favoris et nommez-la « Envoyer à Traveler Assist ».</li>
                <li>Modifiez ce favori et remplacez son adresse par le code ci-dessous.</li>
              </ol>
              <div>
                <CopyBookmarkletButton href={bookmarklet.href} />
              </div>
              <textarea
                readOnly
                aria-label="Code du favori"
                data-testid="bookmarklet-code"
                value={bookmarklet.href}
                rows={4}
                className="bg-muted w-full rounded-md border p-2 font-mono text-xs break-all"
              />
              <div className="grid gap-2 border-t pt-3">
                <p className="text-foreground font-medium">Favori de diagnostic</p>
                <p>
                  En cas d&apos;échec, installez aussi ce favori : sur l&apos;annonce, il affiche la taille de chaque
                  information collectée au lieu de l&apos;envoyer.
                </p>
                <div>
                  <BookmarkletLink href={diagnostic.href} label="Diagnostic Traveler Assist" variant="outline" testId="bookmarklet-debug-link" />
                </div>
              </div>
              <p className="text-xs">
                Les données sont envoyées à <code>{bookmarklet.appUrl}</code> (variable <code>APP_URL</code>). Si vous
                changez cette adresse, réinstallez le favori.
              </p>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MousePointerClickIcon className="size-4" />
            2. L&apos;utiliser sur une annonce
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground grid grid-cols-1 gap-2 text-sm">
          <p>
            Sur la page d&apos;un logement (de préférence avec vos dates et le nombre de voyageurs saisis, pour que le
            prix affiché soit le bon), cliquez sur le favori. Un nouvel onglet s&apos;ouvre avec les informations
            trouvées : vérifiez-les, choisissez le voyage et le comparatif, puis validez.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheckIcon className="size-4" />
              Ce qui est envoyé
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            L&apos;adresse de la page, ses balises de partage (og, twitter), ses données structurées (JSON-LD), trois
            images au plus et le texte visible (30 000 caractères maximum). Rien n&apos;est ajouté sans votre
            confirmation ; une importation non validée est effacée après 24 h.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardPasteIcon className="size-4" />
              Sur mobile ou si le favori est bloqué
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Copiez tout le texte de l&apos;annonce, puis dans un comparatif : « Ajouter manuellement » → onglet « Coller
            le contenu de la page ».
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

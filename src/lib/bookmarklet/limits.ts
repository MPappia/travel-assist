// Limites de taille de l'import d'annonces, partagées par le favori (injectées à sa génération)
// et par la validation serveur (POST /import, copier-coller).

export const IMPORT_LIMITS = {
  url: 2048,
  title: 500,
  metaValue: 2000,
  metaEntries: 100,
  /** JSON-LD : taille totale du tableau sérialisé, après élagage. */
  jsonLd: 150_000,
  jsonLdBlocks: 10,
  images: 3,
  imageUrl: 2048,
  /** Texte : début de page (titre, note, adresse…) + zone des tarifs ; total ≤ `text`. */
  textHead: 8_000,
  textRates: 21_000,
  text: 30_000,
  /** Notes de troncature transmises par le favori. */
  truncatedNotes: 20,
  /**
   * Plafond de sécurité du corps de requête (POST /import, copier-coller) : au-delà seulement, l'envoi
   * est refusé ; en dessous, chaque champ trop long est tronqué avec un avertissement.
   */
  maxBodyBytes: 2_000_000,
} as const;

export type ImportLimits = typeof IMPORT_LIMITS;

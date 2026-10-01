// Configuration par site : type d'annonce (extracteur choisi côté serveur) et zone pertinente de la page,
// visée par le favori (tableau des tarifs d'un hôtel, panneau de détail du vol sélectionné…).
// Table à mettre à jour quand un site change sa mise en page : les sélecteurs sont essayés dans l'ordre,
// puis les blocs dont le texte contient l'un des libellés d'en-tête.
// ⚠️ Les sélecteurs Google Flights et Skyscanner n'ont pas encore été vérifiés sur le HTML réel.

export type ListingKind = "lodging" | "flight";

export interface SiteConfig {
  id: string;
  kind: ListingKind;
  /** Motifs de nom d'hôte : « booking.com » (et ses sous-domaines), « skyscanner.* » (toute extension). */
  hosts: string[];
  /** Préfixes de chemin requis (facultatif). */
  paths?: string[];
  zoneSelectors: string[];
  zoneHeaders: string[];
  /**
   * Toujours envoyer « début de page + zone », même sous la limite de taille : sur les pages de résultats,
   * plusieurs offres se mélangent et seule la zone sélectionnée compte.
   */
  alwaysUseZone?: boolean;
  /** Taille du début de page gardé avec la zone (défaut : limite `textHead`). */
  headChars?: number;
}

/** Libellés d'en-tête de tableau de chambres recherchés sur les sites sans configuration. */
export const DEFAULT_ZONE_HEADERS = ["Type d'hébergement", "Type de logement", "Room type", "Accommodation type"];

export const SITE_CONFIGS: SiteConfig[] = [
  {
    id: "booking",
    kind: "lodging",
    hosts: ["booking.com"],
    zoneSelectors: ["#hprt-table", "[data-testid*='availability']", "#available_rooms", "#rooms_table", "table.roomstable"],
    zoneHeaders: DEFAULT_ZONE_HEADERS,
  },
  {
    id: "google-flights",
    kind: "flight",
    hosts: ["google.*"],
    paths: ["/travel/flights"],
    // Ligne de résultat dépliée, panneau de réservation
    zoneSelectors: ["li [aria-expanded='true']", "[role='listitem'][aria-expanded='true']", "[aria-label*='Détails du vol']", "[aria-label*='Flight details']", "[role='main'] [role='dialog']"],
    zoneHeaders: ["Durée du trajet", "Travel time"],
    alwaysUseZone: true,
    headChars: 1500,
  },
  {
    id: "skyscanner",
    kind: "flight",
    hosts: ["skyscanner.*"],
    zoneSelectors: ["[data-testid='details-page']", "[data-testid*='itinerary']", "[class*='DetailsPanel']", "[class*='BookingPanel']"],
    zoneHeaders: ["Aller ·", "Outbound ·", "Correspondance", "Connection"],
    alwaysUseZone: true,
    headChars: 1500,
  },
];

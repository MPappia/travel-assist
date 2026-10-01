// Repérage de la zone des tarifs par site, utilisé par le favori quand la page est trop longue.
// Table de configuration à mettre à jour quand un site change sa mise en page : les sélecteurs sont
// essayés dans l'ordre, puis les tableaux dont l'en-tête contient l'un des libellés.

export interface SiteConfig {
  /** Domaines concernés (le nom d'hôte se termine par l'un d'eux). */
  domains: string[];
  ratesSelectors: string[];
  ratesHeaders: string[];
}

/** Libellés d'en-tête recherchés sur tous les sites. */
export const DEFAULT_RATES_HEADERS = ["Type d'hébergement", "Type de logement", "Room type", "Accommodation type"];

export const SITE_CONFIGS: SiteConfig[] = [
  {
    domains: ["booking.com"],
    ratesSelectors: ["#hprt-table", "[data-testid*='availability']", "#available_rooms", "#rooms_table", "table.roomstable"],
    ratesHeaders: DEFAULT_RATES_HEADERS,
  },
];

// Vue « jour par jour » d'un road trip à partir des dates/nuits facultatives des étapes.
//
// Une étape sans date hérite de la date de l'étape précédente décalée de ses nuits
// (0 nuit = même journée). Les étapes avant toute date restent « sans date ».
import type { DirectionsLeg } from "@/lib/domain/ors";

export interface PlanStop {
  id: string;
  name: string;
  date: Date | null;
  nights: number | null;
}

export interface DayVisit<S extends PlanStop> {
  stop: S;
  /** Tronçon parcouru pour arriver à cette étape (absent pour la première). */
  legFromPrevious: DirectionsLeg | null;
  /** Date déduite (pas saisie) ? */
  inferredDate: boolean;
  /** Position de l'étape dans l'itinéraire (0 = point de départ). */
  index: number;
}

export interface PlanDay<S extends PlanStop> {
  date: string; // YYYY-MM-DD
  visits: DayVisit<S>[];
  distance: number;
  duration: number;
  /** Étape où l'on dort ce soir-là (null : pas de nuit prévue / dernière étape). */
  overnight: S | null;
  /** Journée sur place, sans déplacement. */
  restDay: boolean;
}

export interface DayPlan<S extends PlanStop> {
  days: PlanDay<S>[];
  unscheduled: S[];
}

const DAY_MS = 86_400_000;
const keyOf = (time: number) => new Date(time).toISOString().slice(0, 10);

export function buildDayPlan<S extends PlanStop>(stops: readonly S[], legs: readonly (DirectionsLeg | undefined)[]): DayPlan<S> {
  const days = new Map<string, PlanDay<S>>();
  const unscheduled: S[] = [];
  let previous: { time: number; nights: number } | null = null;

  const dayFor = (date: string) => {
    let day = days.get(date);
    if (!day) {
      day = { date, visits: [], distance: 0, duration: 0, overnight: null, restDay: false };
      days.set(date, day);
    }
    return day;
  };

  stops.forEach((stop, index) => {
    const leg = index > 0 ? (legs[index - 1] ?? null) : null;
    let time: number | null = null;
    let inferred = false;
    if (stop.date) time = Date.UTC(stop.date.getUTCFullYear(), stop.date.getUTCMonth(), stop.date.getUTCDate());
    else if (previous) {
      time = previous.time + previous.nights * DAY_MS;
      inferred = true;
    }
    if (time === null) {
      unscheduled.push(stop);
      return;
    }

    const day = dayFor(keyOf(time));
    day.visits.push({ stop, legFromPrevious: leg, inferredDate: inferred, index });
    day.restDay = false;
    if (leg) {
      day.distance += leg.distance;
      day.duration += leg.duration;
    }
    const nights = Math.max(0, stop.nights ?? 0);
    if (nights > 0) {
      day.overnight = stop;
      // Journées complètes sur place
      for (let n = 1; n < nights; n++) {
        const rest = dayFor(keyOf(time + n * DAY_MS));
        if (rest.visits.length === 0) {
          rest.restDay = true;
          rest.overnight = stop;
        }
      }
    }
    previous = { time, nights };
  });

  return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), unscheduled };
}

"use client";

import { useEffect, useMemo, useState } from "react";

import type { DirectionsError, DirectionsResult } from "@/lib/domain/ors";
import type { RouteModeValue } from "@/lib/labels";

export interface DirectionsPoint {
  name: string;
  lat: number;
  lng: number;
}

export type DirectionsState =
  | { status: "idle" }
  | { status: "loading"; previous: DirectionsResult | null }
  | { status: "ok"; result: DirectionsResult }
  | { status: "error"; error: DirectionsError };

const DEBOUNCE_MS = 600;

/**
 * Recalcule l'itinéraire quand le mode ou les étapes changent, après un court délai (debounce).
 * Les requêtes obsolètes sont annulées ; l'appel passe par /api/directions (clé côté serveur).
 */
export function useDirections(mode: RouteModeValue, points: DirectionsPoint[]): DirectionsState {
  const signature = useMemo(
    () => JSON.stringify([mode, points.map((p) => [p.name, p.lat.toFixed(5), p.lng.toFixed(5)])]),
    [mode, points],
  );
  const [state, setState] = useState<{ signature: string; value: DirectionsState }>({
    signature: "",
    value: { status: "idle" },
  });

  useEffect(() => {
    const [currentMode, currentPoints] = JSON.parse(signature) as [RouteModeValue, [string, string, string][]];
    if (currentPoints.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/directions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: currentMode,
            points: currentPoints.map(([name, lat, lng]) => ({ name, lat: Number(lat), lng: Number(lng) })),
          }),
          signal: controller.signal,
        });
        const json = (await response.json()) as
          | { ok: true; result: DirectionsResult }
          | { ok: false; error: DirectionsError };
        setState({ signature, value: json.ok ? { status: "ok", result: json.result } : { status: "error", error: json.error } });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(error);
        setState({
          signature,
          value: { status: "error", error: { code: "UNAVAILABLE", message: "Impossible de calculer l'itinéraire." } },
        });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [signature]);

  if (points.length < 2) return { status: "idle" };
  if (state.signature !== signature) {
    // Résultat obsolète : on le garde affiché (grisé) pendant le recalcul.
    return { status: "loading", previous: state.value.status === "ok" ? state.value.result : null };
  }
  return state.value;
}

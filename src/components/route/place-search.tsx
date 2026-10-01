"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2Icon, MapPinIcon, SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { Place } from "@/lib/domain/geocoding";
import { cn } from "@/lib/utils";

const MIN_CHARS = 3;
const DEBOUNCE_MS = 350;

/** Recherche d'adresse avec autocomplétion (Photon via /api/geocode). */
export function PlaceSearch({ onSelect, disabled }: { onSelect: (place: Place) => void; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const skipNext = useRef(false);

  useEffect(() => {
    const q = query.trim();
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    if (q.length < MIN_CHARS) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const json = (await response.json()) as { results?: Place[]; error?: string };
        setResults(json.results ?? []);
        setError(json.error ?? null);
        setActive(0);
        setOpen(true);
      } catch {
        if (!controller.signal.aborted) setError("Recherche impossible");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function choose(place: Place) {
    onSelect(place);
    skipNext.current = true;
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  const showList = open && query.trim().length >= MIN_CHARS;

  return (
    <div className="relative">
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Rechercher une adresse"
        placeholder="Ajouter une étape : ville, adresse, lieu…"
        className="pr-9 pl-9"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim().length < MIN_CHARS) setOpen(false);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!showList || results.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % results.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + results.length) % results.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {loading && (
        <Loader2Icon className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover text-popover-foreground absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border p-1 shadow-md"
        >
          {error ? (
            <li className="text-destructive px-2 py-1.5 text-sm">{error}</li>
          ) : results.length === 0 ? (
            <li className="text-muted-foreground px-2 py-1.5 text-sm">{loading ? "Recherche…" : "Aucun résultat"}</li>
          ) : (
            results.map((place, index) => (
              <li
                key={`${place.label}-${index}`}
                role="option"
                aria-selected={index === active}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm",
                  index === active && "bg-accent text-accent-foreground",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(place)}
              >
                <MapPinIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-medium">{place.name}</span>
                  {place.label !== place.name && (
                    <span className="text-muted-foreground block text-xs">{place.label}</span>
                  )}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

import { describe, expect, it } from "vitest";

import { formatCoordinates, parsePhotonResults } from "@/lib/domain/geocoding";

describe("parsePhotonResults", () => {
  it("construit nom et libellé sans doublons", () => {
    const places = parsePhotonResults({
      features: [
        { geometry: { coordinates: [-9.1393, 38.7223] }, properties: { name: "Lisbonne", state: "Lisbonne", country: "Portugal" } },
        { geometry: { coordinates: [-9.1393, 38.7223] }, properties: { name: "Lisbonne", state: "Lisbonne", country: "Portugal" } },
        {
          geometry: { coordinates: [2.2945, 48.8584] },
          properties: { name: "Tour Eiffel", street: "Avenue Gustave Eiffel", housenumber: "5", city: "Paris", country: "France" },
        },
        { geometry: { coordinates: [1, 2] }, properties: {} },
        { properties: { name: "Sans géométrie" } },
      ],
    });
    expect(places).toEqual([
      { name: "Lisbonne", label: "Lisbonne, Portugal", lat: 38.7223, lng: -9.1393 },
      { name: "Tour Eiffel", label: "Tour Eiffel, 5 Avenue Gustave Eiffel, Paris, France", lat: 48.8584, lng: 2.2945 },
    ]);
  });

  it("se rabat sur l'adresse quand il n'y a pas de nom", () => {
    const [place] = parsePhotonResults({
      features: [{ geometry: { coordinates: [5, 43] }, properties: { street: "Rue de la Paix", housenumber: "3", city: "Marseille" } }],
    });
    expect(place.name).toBe("3 Rue de la Paix");
    expect(place.label).toBe("3 Rue de la Paix, Marseille");
  });

  it("formate des coordonnées", () => {
    expect(formatCoordinates(43.296482, 5.36978)).toBe("43.2965, 5.3698");
  });
});

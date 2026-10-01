import { describe, expect, it } from "vitest";

import { buildOrsRequest, haversine, parseOrsError, parseOrsResponse } from "@/lib/domain/ors";

const ctx = { mode: "DRIVING" as const, names: ["Lyon", "Annecy", "Lac perdu"] };

describe("buildOrsRequest", () => {
  it("choisit le profil selon le mode et transmet les coordonnées [lng, lat]", () => {
    const req = buildOrsRequest("CYCLING", [
      [4.83, 45.76],
      [6.12, 45.9],
    ]);
    expect(req.path).toBe("/v2/directions/cycling-regular/geojson");
    expect(req.body.coordinates).toEqual([
      [4.83, 45.76],
      [6.12, 45.9],
    ]);
    expect(req.body.radiuses).toHaveLength(2);
    expect(req.body.instructions).toBe(false);
  });
});

describe("parseOrsResponse", () => {
  it("extrait tronçons, totaux et tracé", () => {
    const json = {
      type: "FeatureCollection",
      features: [
        {
          geometry: { type: "LineString", coordinates: [[4.83, 45.76], [5.5, 45.8], [6.12, 45.9], [6.5, 45.7]] },
          properties: {
            segments: [
              { distance: 140000, duration: 5400 },
              { distance: 45000, duration: 2700 },
            ],
            summary: { distance: 185000, duration: 8100 },
          },
        },
      ],
    };
    const result = parseOrsResponse(json, 3);
    expect(result.legs).toEqual([
      { distance: 140000, duration: 5400 },
      { distance: 45000, duration: 2700 },
    ]);
    expect(result.distance).toBe(185000);
    expect(result.duration).toBe(8100);
    expect(result.geometry).toHaveLength(4);
  });

  it("complète les tronçons manquants et refuse une réponse vide", () => {
    const result = parseOrsResponse(
      { features: [{ geometry: { coordinates: [[0, 0]] }, properties: { segments: [{ distance: 10, duration: 1 }] } }] },
      3,
    );
    expect(result.legs[1]).toEqual({ distance: 0, duration: 0 });
    expect(result.distance).toBe(10);
    expect(() => parseOrsResponse({}, 2)).toThrow();
  });
});

describe("parseOrsError", () => {
  it("identifie l'étape non routable", () => {
    const error = parseOrsError(
      404,
      { error: { code: 2010, message: "Could not find routable point within a radius of 1000.0 meters of specified coordinate 2: 6.5 45.7." } },
      ctx,
    );
    expect(error.code).toBe("UNROUTABLE_POINT");
    expect(error.stopIndex).toBe(2);
    expect(error.message).toContain("L'étape 3 (« Lac perdu »)");
    expect(error.message).toContain("en voiture");
  });

  it("reconnaît clé invalide, quota et indisponibilité", () => {
    expect(parseOrsError(401, {}, ctx).code).toBe("INVALID_KEY");
    expect(parseOrsError(403, { error: "Access to this API has been disallowed" }, ctx).code).toBe("INVALID_KEY");
    expect(parseOrsError(403, { error: "Daily quota reached" }, ctx).code).toBe("QUOTA");
    expect(parseOrsError(429, { error: "Rate limit exceeded" }, ctx).code).toBe("QUOTA");
    expect(parseOrsError(400, { error: { code: 2004, message: "limit" } }, ctx).code).toBe("TOO_LONG");
    expect(parseOrsError(404, { error: { code: 2009, message: "no route" } }, { ...ctx, mode: "WALKING" }).message).toContain(
      "à pied",
    );
    expect(parseOrsError(502, null, ctx).code).toBe("UNAVAILABLE");
  });
});

describe("haversine", () => {
  it("calcule une distance plausible Paris → Lyon", () => {
    const d = haversine([2.3522, 48.8566], [4.8357, 45.764]);
    expect(d / 1000).toBeGreaterThan(385);
    expect(d / 1000).toBeLessThan(395);
  });
});

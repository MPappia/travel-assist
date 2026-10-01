import { describe, expect, it } from "vitest";

import { presetByKey } from "@/lib/domain/comparison-presets";
import { formatCriterionValue } from "@/lib/domain/criteria-values";
import { legSchedule, parseFlightDetails, priceAge, totalStops, type FlightLeg } from "@/lib/domain/flights";
import { guessPriceCriterion } from "@/lib/domain/scoring";

const leg = (segments: [string, string, string, string][], extra: Partial<FlightLeg> = {}): FlightLeg => ({
  segments: segments.map(([from, to, departure, arrival]) => ({ from: { code: from }, to: { code: to }, departure, arrival })),
  layovers: [],
  ...extra,
});

describe("priceAge", () => {
  const now = new Date(2027, 2, 10, 9, 0);
  it.each([
    [new Date(2027, 2, 10, 8, 0), 0, "prix relevé aujourd'hui", false],
    [new Date(2027, 2, 9, 23, 0), 1, "prix relevé hier", false],
    [new Date(2027, 2, 7, 12, 0), 3, "prix relevé il y a 3 jours", false],
    [new Date(2027, 2, 6, 12, 0), 4, "prix relevé il y a 4 jours", true],
  ])("relevé %s → %d jour(s)", (capturedAt, days, label, stale) => {
    expect(priceAge(capturedAt, now)).toEqual({ days, label, stale });
  });

  it("ne renvoie jamais un âge négatif", () => {
    expect(priceAge(new Date(2027, 2, 12), now).days).toBe(0);
  });
});

describe("trajets", () => {
  const outbound = leg(
    [
      ["CDG", "HEL", "2027-03-19T10:05", "2027-03-19T14:00"],
      ["HEL", "NRT", "2027-03-19T17:10", "2027-03-20T08:10"],
    ],
    { durationMin: 845 },
  );
  const inbound = leg([["NRT", "CDG", "2027-03-30T11:00", "2027-03-30T17:45"]]);

  it("compte les escales sur l'ensemble du voyage", () => {
    expect(totalStops({ outbound, inbound })).toBe(1);
    expect(totalStops({ outbound: { ...outbound, stops: 2 } })).toBe(2);
    expect(totalStops({})).toBeUndefined();
  });

  it("résume les horaires avec le décalage de jour", () => {
    expect(legSchedule(outbound)).toBe("CDG 10:05 → NRT 08:10 (+1)");
    expect(legSchedule(inbound)).toBe("NRT 11:00 → CDG 17:45");
    expect(legSchedule(leg([]))).toBeUndefined();
  });

  it("valide les détails stockés et ignore un contenu invalide", () => {
    const stored = JSON.stringify({ outbound, passengers: 2, currency: "eur", airlines: ["Finnair"] });
    expect(parseFlightDetails(stored)).toMatchObject({ passengers: 2, currency: "EUR", outbound: { durationMin: 845 } });
    expect(parseFlightDetails("{")).toBeNull();
    expect(parseFlightDetails(JSON.stringify({ passengers: 42 }))).toBeNull();
    expect(parseFlightDetails(null)).toBeNull();
  });
});

describe("modèle « Vols »", () => {
  const preset = presetByKey("flights");

  it("propose les critères demandés, en Transport", () => {
    expect(preset.kind).toBe("FLIGHTS");
    expect(preset.expenseCategory).toBe("TRANSPORT");
    expect(preset.criteria.map((c) => [c.name, c.type, c.direction, c.unit])).toEqual([
      ["Prix total", "NUMBER", "LOWER_IS_BETTER", "€"],
      ["Durée totale aller", "NUMBER", "LOWER_IS_BETTER", "min"],
      ["Durée totale retour", "NUMBER", "LOWER_IS_BETTER", "min"],
      ["Nombre d'escales", "NUMBER", "LOWER_IS_BETTER", ""],
      ["Bagage soute inclus", "BOOLEAN", "HIGHER_IS_BETTER", ""],
      ["Compagnie(s)", "TEXT", "HIGHER_IS_BETTER", ""],
      ["Horaires aller", "TEXT", "HIGHER_IS_BETTER", ""],
      ["Horaires retour", "TEXT", "HIGHER_IS_BETTER", ""],
    ]);
    // Le montant de la dépense d'un vol retenu est pré-rempli depuis « Prix total »
    expect(guessPriceCriterion(preset.criteria)?.name).toBe("Prix total");
  });

  it("affiche les durées en heures et minutes", () => {
    const stored = { numberValue: 845, textValue: null, boolValue: null };
    expect(formatCriterionValue("NUMBER", stored, "min")).toBe("14 h 05");
    expect(formatCriterionValue("NUMBER", { ...stored, numberValue: 45 }, "min")).toBe("45 min");
  });
});

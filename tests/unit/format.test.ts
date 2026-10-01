import { describe, expect, it } from "vitest";

import {
  centsToInput,
  formatDateRange,
  formatDistance,
  formatDuration,
  formatMoney,
  nightsBetween,
  parseDateInput,
  parseMoneyToCents,
  toDateKey,
  todayKey,
} from "@/lib/format";

describe("parseMoneyToCents", () => {
  it.each([
    ["12", 1200],
    ["12,5", 1250],
    ["12.55", 1255],
    ["1 234,50 €", 123450],
    ["0", 0],
  ])("convertit %s en %d centimes", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "12,345", "1.2.3"])("refuse %s", (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });
});

describe("dates", () => {
  it("fait l'aller-retour entre saisie et clé de jour", () => {
    const date = parseDateInput("2026-07-14");
    expect(date?.toISOString()).toBe("2026-07-14T00:00:00.000Z");
    expect(toDateKey(date)).toBe("2026-07-14");
  });

  it("refuse une date invalide", () => {
    expect(parseDateInput("14/07/2026")).toBeNull();
    expect(parseDateInput("")).toBeNull();
  });

  it("calcule la clé du jour local", () => {
    expect(todayKey(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("compte les nuits", () => {
    expect(nightsBetween(parseDateInput("2026-07-01")!, parseDateInput("2026-07-08")!)).toBe(7);
  });

  it("formate une plage de dates", () => {
    expect(formatDateRange(null, null)).toBe("Dates à définir");
    expect(formatDateRange(parseDateInput("2026-07-01"), parseDateInput("2026-07-08"))).toContain("→");
  });
});

describe("formatage", () => {
  it("formate les montants en euros", () => {
    expect(formatMoney(123450).replace(/\s/g, " ")).toBe("1 234,5 €");
    expect(centsToInput(123450)).toBe("1234.50");
    expect(centsToInput(2000)).toBe("20");
    expect(centsToInput(null)).toBe("");
  });

  it("formate distances et durées", () => {
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(12_345)).toBe("12,3 km");
    expect(formatDistance(312_000)).toBe("312 km");
    expect(formatDuration(45 * 60)).toBe("45 min");
    expect(formatDuration(2 * 3600)).toBe("2 h");
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe("3 h 05");
  });
});

import { describe, expect, it } from "vitest";

import { buildDayPlan, type PlanStop } from "@/lib/domain/day-plan";

const d = (key: string) => new Date(`${key}T00:00:00.000Z`);
const stop = (id: string, date: string | null, nights: number | null = null): PlanStop => ({
  id,
  name: id,
  date: date ? d(date) : null,
  nights,
});
const leg = (km: number, h: number) => ({ distance: km * 1000, duration: h * 3600 });

describe("buildDayPlan", () => {
  it("regroupe les étapes par jour et cumule les tronçons", () => {
    const plan = buildDayPlan(
      [stop("Lyon", "2026-07-01", 1), stop("Annecy", "2026-07-02"), stop("Chamonix", null, 2), stop("Genève", null)],
      [leg(140, 1.5), leg(100, 1.5), leg(90, 1.25)],
    );
    expect(plan.unscheduled).toEqual([]);
    expect(plan.days.map((day) => day.date)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"]);

    const [first, second, third, fourth] = plan.days;
    expect(first.overnight?.id).toBe("Lyon");
    expect(first.distance).toBe(0);
    // Annecy (date saisie, 0 nuit) puis Chamonix (date déduite) le même jour
    expect(second.visits.map((v) => v.stop.id)).toEqual(["Annecy", "Chamonix"]);
    expect(second.visits[1].inferredDate).toBe(true);
    expect(second.visits.map((v) => v.index)).toEqual([1, 2]);
    expect(second.distance).toBe(240_000);
    expect(second.overnight?.id).toBe("Chamonix");
    // Deuxième nuit à Chamonix : journée sur place
    expect(third).toMatchObject({ restDay: true, visits: [] });
    expect(third.overnight?.id).toBe("Chamonix");
    // Départ vers Genève après 2 nuits
    expect(fourth.visits[0].stop.id).toBe("Genève");
    expect(fourth.visits[0].legFromPrevious).toEqual(leg(90, 1.25));
  });

  it("laisse sans date les étapes qui précèdent toute date", () => {
    const plan = buildDayPlan([stop("A", null), stop("B", "2026-08-10"), stop("C", null)], []);
    expect(plan.unscheduled.map((s) => s.id)).toEqual(["A"]);
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].visits.map((v) => v.stop.id)).toEqual(["B", "C"]);
  });

  it("renvoie un plan vide sans dates", () => {
    expect(buildDayPlan([stop("A", null)], []).days).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { aggregate, diff, filterPeriod, leaderMinGames, played, rollingMean, standings, teamRecord } from "./stats";
import { STAT_KEYS, type Game, type StatLine } from "./types";

function line(v: Partial<StatLine>, dnp = 0): StatLine & { dnp: number } {
  const base = Object.fromEntries(STAT_KEYS.map((k) => [k, null])) as StatLine;
  return { ...base, ...v, dnp };
}

function game(id: number, date: string, h: number, a: number, hs: number | null, as: number | null, status: Game["status"] = "final"): Game {
  return { id, seasonId: 1, date, time: null, phase: null, round: null, venue: null, homeTeamId: h, awayTeamId: a, homeScore: hs,
    awayScore: as, status, detailLevel: "result_only", source: "test", sourceUrl: null, revision: 1, updatedAt: "" };
}

describe("aggregate", () => {
  it("no promedia datos faltantes como cero e informa cuántos partidos tienen el dato", () => {
    const a = aggregate([line({ minutes_sec: 1200, pts: 10, ast: 4 }), line({ minutes_sec: 1200, pts: 20, ast: null })]);
    expect(a.games).toBe(2);
    expect(a.stats.pts.perGame).toBe(15);
    expect(a.stats.ast.perGame).toBe(4); // 4 / 1 partido con dato, no 4 / 2
    expect(a.stats.ast.n).toBe(1);
    expect(a.incompleteKeys).toContain("ast");
    expect(a.stats.stl.perGame).toBeNull();
  });

  it("cero es un valor válido, distinto de sin dato", () => {
    const a = aggregate([line({ minutes_sec: 600, pts: 0 }), line({ minutes_sec: 600, pts: 4 })]);
    expect(a.stats.pts.perGame).toBe(2);
    expect(a.stats.pts.n).toBe(2);
  });

  it("excluye partidos sin jugar (NJ y 0 minutos)", () => {
    const a = aggregate([line({ minutes_sec: 0, pts: 0 }), line({}, 1), line({ minutes_sec: 900, pts: 6 })]);
    expect(a.games).toBe(1);
    expect(a.stats.pts.perGame).toBe(6);
  });

  it("porcentajes acumulados (no promedio de porcentajes)", () => {
    const a = aggregate([
      line({ minutes_sec: 600, fg2m: 1, fg2a: 1, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pts: 2 }),
      line({ minutes_sec: 600, fg2m: 1, fg2a: 9, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pts: 2 }),
    ]);
    expect(a.pct.fg2_pct.value).toBeCloseTo(0.2); // 2/10, no (100% + 11%)/2
    expect(a.pct.fg3_pct.value).toBeNull(); // 0 intentos -> sin dato, no 0%
  });

  it("eFG% y TS%", () => {
    const a = aggregate([line({ minutes_sec: 1800, fg2m: 4, fg2a: 8, fg3m: 2, fg3a: 4, ftm: 4, fta: 5, pts: 18 })]);
    expect(a.pct.efg_pct.value).toBeCloseTo((6 + 0.5 * 2) / 12);
    expect(a.pct.ts_pct.value).toBeCloseTo(18 / (2 * (12 + 0.44 * 5)));
  });

  it("por 40 minutos usa sólo partidos con minutos", () => {
    const a = aggregate([line({ minutes_sec: 1200, pts: 10 }), line({ minutes_sec: null, pts: 30 })]);
    expect(a.stats.pts.per40).toBe(20);
    expect(a.minutesPerGame).toBe(20);
    expect(a.gamesWithMinutes).toBe(1);
  });
});

describe("played", () => {
  it("cuenta partido con datos aunque falten los minutos", () => {
    expect(played(line({ pts: 3 }))).toBe(true);
    expect(played(line({}))).toBe(false);
  });
});

describe("rollingMean", () => {
  it("calcula ventanas completas y deja null si falta un dato", () => {
    expect(rollingMean([2, 4, 6, null, 8, 10, 12], 3)).toEqual([null, null, 4, null, null, null, 10]);
  });
});

describe("diff", () => {
  it("relativa sólo con base positiva; porcentajes en puntos porcentuales", () => {
    expect(diff(10, 15)).toEqual({ abs: 5, rel: 50 });
    expect(diff(0, 5)).toEqual({ abs: 5, rel: null });
    expect(diff(0.4, 0.5, true).abs).toBeCloseTo(10);
    expect(diff(0.4, 0.5, true).rel).toBeNull();
    expect(diff(null, 3)).toEqual({ abs: null, rel: null });
  });
});

describe("equipos", () => {
  const games = [
    game(1, "2026-10-01", 1, 2, 80, 70), game(2, "2026-10-05", 2, 1, 90, 85), game(3, "2026-10-08", 1, 3, 77, 75),
    game(4, "2026-10-12", 3, 1, null, null, "scheduled"),
  ];
  it("récord, racha y diferencia ignoran partidos no finalizados", () => {
    const r = teamRecord(1, games);
    expect([r.games, r.wins, r.losses, r.pf, r.pa, r.diff]).toEqual([3, 2, 1, 242, 235, 7]);
    expect(r.streak).toBe("G1");
    expect([r.homeW, r.awayL]).toEqual([2, 1]);
  });
  it("tabla ordenada por % de victorias", () => {
    expect(standings([1, 2, 3], games).map((r) => r.teamId)).toEqual([1, 2, 3]);
  });
  it("mínimo de partidos para líderes", () => {
    expect(leaderMinGames([10, 9, 7])).toBe(5);
    expect(leaderMinGames([])).toBe(1);
  });
});

describe("filterPeriod", () => {
  const rows = [{ date: "2026-10-01" }, { date: "2026-10-10" }, { date: "2026-10-20" }];
  it("filtra por fechas inclusivas y últimos N", () => {
    expect(filterPeriod(rows, { from: "2026-10-10" })).toHaveLength(2);
    expect(filterPeriod(rows, { to: "2026-10-10" })).toHaveLength(2);
    expect(filterPeriod(rows, { lastN: 1 })).toEqual([{ date: "2026-10-20" }]);
  });
});

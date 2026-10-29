// Cálculos derivados. Toda fórmula está documentada en docs/metricas.md.
// Principio: si falta un dato, el resultado es null (no se rellena con 0),
// y cada agregado informa con cuántos partidos se calculó.

import type { Game, PlayerGameRow, StatKey, StatLine } from "./types";

export type Num = number | null;

/** Estadísticas de conteo que se promedian por partido. */
export const COUNT_KEYS = [
  "pts", "reb", "oreb", "dreb", "ast", "stl", "tov", "blk", "blka", "pf", "pfd",
  "fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta", "plus_minus", "eff",
] as const satisfies readonly StatKey[];
export type CountKey = (typeof COUNT_KEYS)[number];

export const PCT_KEYS = ["fg_pct", "fg2_pct", "fg3_pct", "ft_pct", "efg_pct", "ts_pct"] as const;
export type PctKey = (typeof PCT_KEYS)[number];

export interface StatAgg {
  total: Num;     // suma en los partidos con dato
  perGame: Num;   // total / n
  per40: Num;     // por 40 minutos, sólo con partidos que tienen el dato Y los minutos
  n: number;      // partidos con dato
}

export interface PctAgg { made: number; att: number; value: Num; n: number }

export interface Aggregate {
  games: number;            // partidos disputados (PJ)
  gamesWithMinutes: number;
  minutesTotal: Num;        // en minutos
  minutesPerGame: Num;
  starts: number | null;    // titularidades (null si la fuente no lo informa)
  stats: Record<CountKey, StatAgg>;
  pct: Record<PctKey, PctAgg>;
  incompleteKeys: CountKey[];  // estadísticas que faltan en algún partido
  firstDate: string | null;
  lastDate: string | null;
}

/** Un jugador "disputó" el partido si no figura como NJ y tiene minutos > 0 o algún dato. */
export function played(row: StatLine & { dnp: number }): boolean {
  if (row.dnp) return false;
  if (row.minutes_sec !== null) return row.minutes_sec > 0;
  return COUNT_KEYS.some((k) => row[k] !== null);
}

export function sumNullable(values: Num[]): Num {
  const xs = values.filter((v): v is number => v !== null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
}

export function ratio(num: number, den: number): Num {
  return den > 0 ? num / den : null;
}

export function fgm(r: StatLine): Num {
  return r.fg2m === null || r.fg3m === null ? null : r.fg2m + r.fg3m;
}
export function fga(r: StatLine): Num {
  return r.fg2a === null || r.fg3a === null ? null : r.fg2a + r.fg3a;
}

function pctAgg(rows: StatLine[], made: (r: StatLine) => Num, att: (r: StatLine) => Num): PctAgg {
  let m = 0, a = 0, n = 0;
  for (const r of rows) {
    const mv = made(r), av = att(r);
    if (mv === null || av === null) continue;
    m += mv; a += av; n++;
  }
  return { made: m, att: a, value: ratio(m, a), n };
}

/** Agrega filas jugador-partido (o equipo-partido) en totales, promedios y porcentajes. */
export function aggregate<T extends StatLine & { dnp?: number }>(rows: T[], dates?: string[]): Aggregate {
  const playedRows = rows.filter((r) => played({ ...r, dnp: r.dnp ?? 0 }));
  const games = playedRows.length;
  const withMin = playedRows.filter((r) => r.minutes_sec !== null);
  const minutesTotal = withMin.length ? withMin.reduce((a, r) => a + (r.minutes_sec as number), 0) / 60 : null;
  const stats = {} as Record<CountKey, StatAgg>;
  const incompleteKeys: CountKey[] = [];
  for (const k of COUNT_KEYS) {
    const vals = playedRows.map((r) => r[k]);
    const n = vals.filter((v) => v !== null).length;
    const total = sumNullable(vals);
    // por 40': sólo partidos con el dato y con minutos > 0
    const both = playedRows.filter((r) => r[k] !== null && r.minutes_sec !== null && r.minutes_sec > 0);
    const secs = both.reduce((a, r) => a + (r.minutes_sec as number), 0);
    const per40 = both.length && secs > 0 ? (both.reduce((a, r) => a + (r[k] as number), 0) / secs) * 2400 : null;
    stats[k] = { total, perGame: n ? (total as number) / n : null, per40, n };
    if (n > 0 && n < games) incompleteKeys.push(k);
  }
  const fgaShots = (r: StatLine) => fga(r);
  const pct: Record<PctKey, PctAgg> = {
    fg_pct: pctAgg(playedRows, fgm, fgaShots),
    fg2_pct: pctAgg(playedRows, (r) => r.fg2m, (r) => r.fg2a),
    fg3_pct: pctAgg(playedRows, (r) => r.fg3m, (r) => r.fg3a),
    ft_pct: pctAgg(playedRows, (r) => r.ftm, (r) => r.fta),
    // eFG% = (TC convertidos + 0,5 × triples convertidos) / TC intentados
    efg_pct: (() => {
      const p = pctAgg(playedRows, (r) => (fgm(r) === null || r.fg3m === null ? null : (fgm(r) as number) + 0.5 * r.fg3m), fgaShots);
      return p;
    })(),
    // TS% = PTS / (2 × (TC intentados + 0,44 × TL intentados))
    ts_pct: pctAgg(playedRows, (r) => r.pts,
      (r) => (fga(r) === null || r.fta === null ? null : 2 * ((fga(r) as number) + 0.44 * r.fta))),
  };
  const starterVals = playedRows.map((r) => (r as unknown as { starter?: number | null }).starter ?? null);
  const starts = starterVals.every((s) => s === null) ? null : starterVals.filter((s) => s === 1).length;
  const sortedDates = dates ? [...dates].sort() : [];
  return {
    games, gamesWithMinutes: withMin.length, minutesTotal,
    minutesPerGame: minutesTotal !== null && withMin.length ? minutesTotal / withMin.length : null,
    starts, stats, pct, incompleteKeys,
    firstDate: sortedDates[0] ?? null, lastDate: sortedDates[sortedDates.length - 1] ?? null,
  };
}

/** Media móvil de los últimos `window` valores. Null si en la ventana falta algún dato o no hay suficientes partidos. */
export function rollingMean(values: Num[], window: number): Num[] {
  return values.map((_, i) => {
    if (i + 1 < window) return null;
    const slice = values.slice(i + 1 - window, i + 1);
    if (slice.some((v) => v === null)) return null;
    return (slice as number[]).reduce((a, b) => a + b, 0) / window;
  });
}

export interface Diff { abs: Num; rel: Num }
/** Diferencia de B respecto de A. La relativa (%) sólo tiene sentido si A ≠ 0 y ambos son ≥ 0. */
export function diff(a: Num, b: Num, isPercentage = false): Diff {
  if (a === null || b === null) return { abs: null, rel: null };
  const abs = isPercentage ? (b - a) * 100 : b - a; // en porcentajes: puntos porcentuales
  const rel = !isPercentage && a > 0 && b >= 0 ? ((b - a) / a) * 100 : null;
  return { abs, rel };
}

// ------------------------------------------------------------- equipos

export interface TeamRecord {
  teamId: number; games: number; wins: number; losses: number; pf: number; pa: number;
  diff: number; winPct: Num; pfPerGame: Num; paPerGame: Num; homeW: number; homeL: number;
  awayW: number; awayL: number; streak: string; last5: ("G" | "P")[];
}

export function isCompleted(g: Game): boolean {
  return g.status === "final" && g.homeScore !== null && g.awayScore !== null;
}

/** Récord de un equipo a partir de resultados finalizados (calculado por la app). */
export function teamRecord(teamId: number, games: Game[]): TeamRecord {
  const done = games.filter((g) => isCompleted(g) && (g.homeTeamId === teamId || g.awayTeamId === teamId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const r: TeamRecord = { teamId, games: 0, wins: 0, losses: 0, pf: 0, pa: 0, diff: 0, winPct: null,
    pfPerGame: null, paPerGame: null, homeW: 0, homeL: 0, awayW: 0, awayL: 0, streak: "-", last5: [] };
  const results: ("G" | "P")[] = [];
  for (const g of done) {
    const home = g.homeTeamId === teamId;
    const own = (home ? g.homeScore : g.awayScore) as number;
    const opp = (home ? g.awayScore : g.homeScore) as number;
    const win = own > opp;
    r.games++; r.pf += own; r.pa += opp;
    if (win) { r.wins++; if (home) r.homeW++; else r.awayW++; } else { r.losses++; if (home) r.homeL++; else r.awayL++; }
    results.push(win ? "G" : "P");
  }
  r.diff = r.pf - r.pa;
  r.winPct = ratio(r.wins, r.games);
  r.pfPerGame = ratio(r.pf, r.games);
  r.paPerGame = ratio(r.pa, r.games);
  r.last5 = results.slice(-5);
  if (results.length) {
    const lastRes = results[results.length - 1];
    let n = 0;
    for (let i = results.length - 1; i >= 0 && results[i] === lastRes; i--) n++;
    r.streak = `${lastRes}${n}`;
  }
  return r;
}

/**
 * Tabla de posiciones calculada: % de victorias, luego diferencia de puntos.
 * NO replica los criterios oficiales de desempate (resultado entre sí, etc.).
 */
export function standings(teamIds: number[], games: Game[]): TeamRecord[] {
  return teamIds.map((id) => teamRecord(id, games)).filter((r) => r.games > 0)
    .sort((a, b) => (b.winPct ?? 0) - (a.winPct ?? 0) || b.wins - a.wins || b.diff - a.diff);
}

// ------------------------------------------------------------- filtros de período

export interface Period { from?: string; to?: string; lastN?: number }

/** Filtra filas por fecha (inclusive) y/o últimos N partidos disputados. Las filas deben venir con fecha. */
export function filterPeriod<T extends { date: string }>(rows: T[], p: Period): T[] {
  let out = rows.filter((r) => (!p.from || r.date >= p.from) && (!p.to || r.date <= p.to));
  out = [...out].sort((a, b) => a.date.localeCompare(b.date));
  if (p.lastN && p.lastN > 0) out = out.slice(-p.lastN);
  return out;
}

export type DatedRow = PlayerGameRow & { date: string };

/** Mínimo de partidos para figurar entre los líderes: la mitad de los PJ del equipo con más partidos. */
export function leaderMinGames(teamGamesPlayed: number[]): number {
  const max = Math.max(0, ...teamGamesPlayed);
  return Math.max(1, Math.ceil(max / 2));
}

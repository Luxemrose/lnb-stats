// Categorías de rankings y reglas de calificación (mismo criterio en Inicio y en Estadísticas).
import type { PlayerSummary } from "./derive";
import { GLOSSARY } from "./glossary";
import type { CountKey, PctKey } from "./stats";

export type View = "perGame" | "total" | "per40";

export interface Metric {
  id: string;
  label: string;          // nombre largo
  short: string;          // abreviatura de columna
  kind: "count" | "pct" | "minutes";
  key?: CountKey;
  pct?: PctKey;
  /** intentos mínimos por partido para que un porcentaje califique */
  minAttPerGame?: number;
  attLabel?: string;
  hint?: string;
  group: "Anotación" | "Tiro" | "Rebotes" | "Juego" | "Defensa" | "Global";
}

export const METRICS: Metric[] = [
  { id: "pts", label: "Puntos", short: "PTS", kind: "count", key: "pts", group: "Anotación" },
  { id: "fg3m", label: "Triples convertidos", short: "T3C", kind: "count", key: "fg3m", group: "Anotación" },
  { id: "ftm", label: "Libres convertidos", short: "TLC", kind: "count", key: "ftm", group: "Anotación" },
  { id: "fg3_pct", label: "% de triples", short: "T3%", kind: "pct", pct: "fg3_pct", minAttPerGame: 2, attLabel: "2 triples intentados por partido", hint: GLOSSARY.fg3, group: "Tiro" },
  { id: "fg_pct", label: "% de campo", short: "TC%", kind: "pct", pct: "fg_pct", minAttPerGame: 5, attLabel: "5 tiros de campo intentados por partido", hint: GLOSSARY.fg, group: "Tiro" },
  { id: "ft_pct", label: "% de libres", short: "TL%", kind: "pct", pct: "ft_pct", minAttPerGame: 2, attLabel: "2 libres intentados por partido", hint: GLOSSARY.ft, group: "Tiro" },
  { id: "ts_pct", label: "% de tiro verdadero", short: "TS%", kind: "pct", pct: "ts_pct", minAttPerGame: 5, attLabel: "5 tiros de campo intentados por partido", hint: GLOSSARY.ts, group: "Tiro" },
  { id: "efg_pct", label: "% de campo efectivo", short: "eTC%", kind: "pct", pct: "efg_pct", minAttPerGame: 5, attLabel: "5 tiros de campo intentados por partido", hint: GLOSSARY.efg, group: "Tiro" },
  { id: "reb", label: "Rebotes", short: "REB", kind: "count", key: "reb", group: "Rebotes" },
  { id: "oreb", label: "Rebotes ofensivos", short: "RO", kind: "count", key: "oreb", group: "Rebotes" },
  { id: "dreb", label: "Rebotes defensivos", short: "RD", kind: "count", key: "dreb", group: "Rebotes" },
  { id: "ast", label: "Asistencias", short: "AST", kind: "count", key: "ast", group: "Juego" },
  { id: "tov", label: "Pérdidas", short: "PER", kind: "count", key: "tov", group: "Juego" },
  { id: "min", label: "Minutos", short: "MIN", kind: "minutes", group: "Juego" },
  { id: "pfd", label: "Faltas recibidas", short: "FR", kind: "count", key: "pfd", group: "Juego" },
  { id: "stl", label: "Robos", short: "ROB", kind: "count", key: "stl", group: "Defensa" },
  { id: "blk", label: "Tapas", short: "TAP", kind: "count", key: "blk", group: "Defensa" },
  { id: "pf", label: "Faltas cometidas", short: "FC", kind: "count", key: "pf", group: "Defensa" },
  { id: "eff", label: "Valoración", short: "VAL", kind: "count", key: "eff", hint: GLOSSARY.eff, group: "Global" },
  { id: "plus_minus", label: "Más/menos", short: "+/-", kind: "count", key: "plus_minus", hint: GLOSSARY.plusMinus, group: "Global" },
];

export const metricById = (id: string) => METRICS.find((m) => m.id === id) ?? METRICS[0];

/** Valor del jugador para la métrica (null si no hay dato). */
export function metricValue(s: PlayerSummary, m: Metric, view: View): number | null {
  if (m.kind === "minutes") return view === "total" ? s.agg.minutesTotal : view === "per40" ? null : s.agg.minutesPerGame;
  if (m.kind === "pct") return s.agg.pct[m.pct!].value;
  return s.agg.stats[m.key!][view];
}

/** ¿Cumple el mínimo para figurar en el ranking? */
export function qualifies(s: PlayerSummary, m: Metric, minGames: number): boolean {
  if (s.agg.games < Math.max(1, minGames)) return false;
  if (m.kind === "count") return s.agg.stats[m.key!].n === s.agg.games; // el dato debe estar en todos sus partidos
  if (m.kind === "pct") {
    const p = s.agg.pct[m.pct!];
    // TS% y eFG% se miden contra intentos de campo; el resto, contra sus propios intentos
    const att = m.pct === "ts_pct" || m.pct === "efg_pct" ? s.agg.pct.fg_pct.att : p.att;
    return p.value !== null && att / s.agg.games >= (m.minAttPerGame ?? 0);
  }
  return s.agg.minutesPerGame !== null;
}

export function ranking(summaries: PlayerSummary[], m: Metric, view: View, minGames: number): PlayerSummary[] {
  return summaries
    .filter((s) => qualifies(s, m, minGames) && metricValue(s, m, view) !== null)
    .sort((a, b) => (metricValue(b, m, view) as number) - (metricValue(a, m, view) as number));
}

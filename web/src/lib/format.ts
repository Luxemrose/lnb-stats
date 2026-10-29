import type { CountKey, Num, PctKey } from "./stats";

// Terminología habitual del básquet argentino.
export const COUNT_LABELS: Record<CountKey, { short: string; long: string }> = {
  pts: { short: "PTS", long: "Puntos" },
  reb: { short: "REB", long: "Rebotes totales" },
  oreb: { short: "RO", long: "Rebotes ofensivos" },
  dreb: { short: "RD", long: "Rebotes defensivos" },
  ast: { short: "AST", long: "Asistencias" },
  stl: { short: "ROB", long: "Robos" },
  tov: { short: "PER", long: "Pérdidas" },
  blk: { short: "TAP", long: "Tapas" },
  blka: { short: "TAPR", long: "Tapas recibidas" },
  pf: { short: "FC", long: "Faltas cometidas" },
  pfd: { short: "FR", long: "Faltas recibidas" },
  fg2m: { short: "T2C", long: "Dobles convertidos" },
  fg2a: { short: "T2I", long: "Dobles intentados" },
  fg3m: { short: "T3C", long: "Triples convertidos" },
  fg3a: { short: "T3I", long: "Triples intentados" },
  ftm: { short: "TLC", long: "Libres convertidos" },
  fta: { short: "TLI", long: "Libres intentados" },
  plus_minus: { short: "+/-", long: "Más/menos" },
  eff: { short: "VAL", long: "Valoración (oficial)" },
};

export const PCT_LABELS: Record<PctKey, { short: string; long: string }> = {
  fg_pct: { short: "TC%", long: "% tiros de campo" },
  fg2_pct: { short: "T2%", long: "% dobles" },
  fg3_pct: { short: "T3%", long: "% triples" },
  ft_pct: { short: "TL%", long: "% libres" },
  efg_pct: { short: "eTC%", long: "% de campo efectivo (eFG%)" },
  ts_pct: { short: "TS%", long: "% de tiro verdadero (TS%)" },
};

export const MAIN_KEYS: CountKey[] = ["pts", "reb", "ast", "stl", "blk", "tov", "eff"];

const nf1 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export const ND = "s/d"; // sin dato

export function f1(v: Num): string { return v === null || !Number.isFinite(v) ? ND : nf1.format(v); }
export function f0(v: Num): string { return v === null || !Number.isFinite(v) ? ND : nf0.format(v); }
export function pct(v: Num): string { return v === null ? ND : `${nf1.format(v * 100)}%`; }
export function signed(v: Num, digits = 1): string {
  if (v === null) return ND;
  v = Math.round(v * 10 ** digits) / 10 ** digits; // evita "−0,0"
  const s = digits ? nf1.format(Math.abs(v)) : nf0.format(Math.abs(v));
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${s}`;
}
export function mmss(sec: Num): string {
  if (sec === null) return ND;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
export function fdate(iso: string | null | undefined): string {
  if (!iso) return ND;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
export function fdatetime(iso: string | null | undefined): string {
  if (!iso) return ND;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

// ------------------------------------------------------------- CSV

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  // BOM para que Excel en español abra bien las tildes.
  const blob = new Blob([mime.startsWith("text/csv") ? "﻿" + text : text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

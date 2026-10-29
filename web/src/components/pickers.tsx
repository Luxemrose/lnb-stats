import { useMemo, useState } from "react";
import type { Period } from "../lib/stats";
import { Field } from "./ui";
import { fdate } from "../lib/format";

export interface PeriodState { kind: "all" | "last" | "range"; lastN: number; from: string; to: string }
export const defaultPeriod: PeriodState = { kind: "all", lastN: 5, from: "", to: "" };

export function toPeriod(p: PeriodState): Period {
  if (p.kind === "last") return { lastN: p.lastN };
  if (p.kind === "range") return { from: p.from || undefined, to: p.to || undefined };
  return {};
}

export function describePeriod(p: PeriodState, seasonCode: string): string {
  if (p.kind === "last") return `Últimos ${p.lastN} partidos disputados · Temporada ${seasonCode}`;
  if (p.kind === "range" && (p.from || p.to)) {
    return `Del ${p.from ? fdate(p.from) : "inicio"} al ${p.to ? fdate(p.to) : "último partido"} · Temporada ${seasonCode}`;
  }
  return `Temporada ${seasonCode} completa`;
}

export function PeriodPicker({ value, onChange }: { value: PeriodState; onChange: (p: PeriodState) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Período">
        <select className="input" value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value as PeriodState["kind"] })}>
          <option value="all">Temporada completa</option>
          <option value="last">Últimos N partidos</option>
          <option value="range">Entre fechas</option>
        </select>
      </Field>
      {value.kind === "last" && (
        <Field label="Cantidad de partidos">
          <input className="input w-24" type="number" min={1} max={60} value={value.lastN}
            onChange={(e) => onChange({ ...value, lastN: Math.max(1, Number(e.target.value) || 1) })} />
        </Field>
      )}
      {value.kind === "range" && (
        <>
          <Field label="Desde"><input className="input" type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} /></Field>
          <Field label="Hasta"><input className="input" type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} /></Field>
        </>
      )}
    </div>
  );
}

export interface Option { id: number; label: string; sub?: string }

/** Selector múltiple con búsqueda (jugadores o equipos). */
export function MultiPicker({ options, value, onChange, max = 4, placeholder, colors }: {
  options: Option[]; value: number[]; onChange: (ids: number[]) => void; max?: number; placeholder: string; colors: string[];
}) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    if (!n) return [];
    return options.filter((o) => !value.includes(o.id) &&
      o.label.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(n)).slice(0, 8);
  }, [q, options, value]);
  const byId = new Map(options.map((o) => [o.id, o]));
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {value.map((id, i) => (
          <span key={id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: colors[i] }} />
            {byId.get(id)?.label ?? id}
            <button aria-label="Quitar" className="text-muted hover:text-ink" onClick={() => onChange(value.filter((v) => v !== id))}>✕</button>
          </span>
        ))}
      </div>
      {value.length < max ? (
        <div className="relative max-w-md">
          <input className="input w-full" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
          {matches.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
              {matches.map((o) => (
                <li key={o.id}>
                  <button className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                    onClick={() => { onChange([...value, o.id]); setQ(""); }}>
                    <span>{o.label}</span><span className="text-xs text-muted">{o.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : <div className="text-xs text-muted">Máximo {max} a la vez (para que los colores sigan siendo distinguibles).</div>}
    </div>
  );
}

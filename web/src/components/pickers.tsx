import { useMemo, useRef, useState } from "react";
import { CalendarDays, Plus, Search, X } from "lucide-react";
import type { Period } from "../lib/stats";
import { Field, Segmented } from "./ui";
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

/** Período de análisis: temporada completa, últimos N partidos o rango de fechas. */
export function PeriodPicker({ value, onChange }: { value: PeriodState; onChange: (p: PeriodState) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Período" hint="Se aplica a todos los cálculos de la vista. 'Últimos N' usa los últimos partidos disputados por cada uno.">
        <Segmented ariaLabel="Período" value={value.kind} onChange={(kind) => onChange({ ...value, kind })}
          options={[{ value: "all", label: "Temporada" }, { value: "last", label: "Últimos N" }, { value: "range", label: "Fechas", icon: CalendarDays }]} />
      </Field>
      {value.kind === "last" && (
        <Field label="Partidos">
          <Segmented ariaLabel="Cantidad de partidos" value={String(value.lastN)} onChange={(v) => onChange({ ...value, lastN: Number(v) })}
            options={[3, 5, 10].map((n) => ({ value: String(n), label: String(n) }))} />
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

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Buscador con lista desplegable (teclado: ↑ ↓ Enter Esc). */
export function SearchSelect({ options, exclude = [], onPick, placeholder, autoFocus }: {
  options: Option[]; exclude?: number[]; onPick: (id: number) => void; placeholder: string; autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return [];
    return options.filter((o) => !exclude.includes(o.id) && norm(o.label).includes(n)).slice(0, 8);
  }, [q, options, exclude]);
  const pick = (id: number) => { onPick(id); setQ(""); setIdx(0); ref.current?.focus(); };
  return (
    <div className="relative w-full max-w-md">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input ref={ref} autoFocus={autoFocus} className="input w-full pl-9" placeholder={placeholder} value={q}
        role="combobox" aria-expanded={matches.length > 0} aria-autocomplete="list"
        onChange={(e) => { setQ(e.target.value); setIdx(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, matches.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          if (e.key === "Enter" && matches[idx]) { e.preventDefault(); pick(matches[idx].id); }
          if (e.key === "Escape") setQ("");
        }} />
      {matches.length > 0 && (
        <ul role="listbox" className="absolute z-40 mt-1.5 w-full overflow-hidden rounded-xl border border-line-strong bg-surface-2 py-1 shadow-xl">
          {matches.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === idx}>
              <button className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${i === idx ? "bg-surface-3" : "hover:bg-surface-3"}`}
                onMouseEnter={() => setIdx(i)} onClick={() => pick(o.id)}>
                <span className="truncate font-medium">{o.label}</span><span className="shrink-0 text-xs text-muted">{o.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Selector múltiple con chips de color (jugadores o equipos). */
export function MultiPicker({ options, value, onChange, max = 4, placeholder, colors }: {
  options: Option[]; value: number[]; onChange: (ids: number[]) => void; max?: number; placeholder: string; colors: string[];
}) {
  const byId = new Map(options.map((o) => [o.id, o]));
  return (
    <div className="space-y-2.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((id, i) => (
            <span key={id} className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface-2 pl-3 pr-1.5 text-sm">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: colors[i] }} />
              <span className="font-medium">{byId.get(id)?.label ?? id}</span>
              <button aria-label={`Quitar ${byId.get(id)?.label ?? ""}`} className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-ink"
                onClick={() => onChange(value.filter((v) => v !== id))}><X size={13} /></button>
            </span>
          ))}
        </div>
      )}
      {value.length < max
        ? <SearchSelect options={options} exclude={value} placeholder={placeholder} onPick={(id) => onChange([...value, id])} />
        : <div className="flex items-center gap-1.5 text-xs text-muted"><Plus size={12} /> Máximo {max} a la vez, para que los colores sigan siendo distinguibles.</div>}
    </div>
  );
}

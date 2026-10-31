import { Link, useNavigate } from "react-router-dom";
import { Crown, Plus, Shield, Users, X } from "lucide-react";
import { SearchSelect, type Option } from "./pickers";
import { CrestBox, CrestLayer } from "./Crest";
import { InfoTip, Segmented } from "./ui";
import { signed } from "../lib/format";

export interface CmpEntity {
  id: number; name: string; color: string; sub?: string; games: number; minutesPerGame?: number | null;
  kind: "player" | "team"; meta?: string;
  /** equipo cuyo escudo se muestra (el del jugador en el período comparado, o el propio equipo) */
  crestTeamId?: number | null;
}

export interface CmpRow {
  id: string; label: string; hint?: string;
  values: (number | null)[];
  format: (v: number | null) => string;
  better: "max" | "min" | null;   // null = no hay "mejor" (p. ej. partidos jugados)
  isPct?: boolean;                // diferencias en puntos porcentuales
  partial?: boolean[];            // dato faltante en algunos partidos
}

/** Índices con el mejor valor de la fila (empates incluidos). */
export function bestIdx(row: CmpRow): number[] {
  if (!row.better) return [];
  const vals = row.values.map((v, i) => [v, i] as const).filter(([v]) => v !== null) as [number, number][];
  if (vals.length < 2) return [];
  const target = row.better === "max" ? Math.max(...vals.map(([v]) => v)) : Math.min(...vals.map(([v]) => v));
  const winners = vals.filter(([v]) => Math.abs(v - target) < 1e-9).map(([, i]) => i);
  return winners.length === vals.length ? [] : winners;
}

/** Tarjetas de los elegidos + tarjeta para agregar. */
export function CompareSlots({ entities, onRemove, options, onAdd, max = 4, placeholder }: {
  entities: CmpEntity[]; onRemove: (id: number) => void; options: Option[]; onAdd: (id: number) => void; max?: number; placeholder: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {entities.map((e) => (
        <div key={e.id} className="card relative overflow-hidden p-4">
          <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: e.color }} />
          <button className="btn btn-ghost btn-sm btn-icon absolute right-2 top-3" onClick={() => onRemove(e.id)} aria-label={`Quitar ${e.name}`}><X size={15} /></button>
          <Link to={e.kind === "player" ? `/jugadores/${e.id}` : `/equipos/${e.id}`} className="group -mx-4 -mt-1 block pr-8">
            <CrestBox teamId={e.crestTeamId} size="card">
              <span className="block py-2 pl-16 pr-2">
                <span className="block truncate font-semibold group-hover:text-accent-text">{e.name}</span>
                <span className="block truncate text-xs text-muted">{e.sub}</span>
              </span>
            </CrestBox>
          </Link>
          <div className="mt-3 flex gap-4 border-t border-line pt-3 text-xs">
            <span><span className="num block text-base font-bold">{e.games}</span><span className="text-muted">PJ</span></span>
            {e.minutesPerGame !== undefined && <span><span className="num block text-base font-bold">{e.minutesPerGame === null ? "s/d" : e.minutesPerGame.toFixed(1).replace(".", ",")}</span><span className="text-muted">MIN/PJ</span></span>}
            {e.meta && <span><span className="num block text-base font-bold">{e.meta.split(" ")[0]}</span><span className="text-muted">{e.meta.split(" ").slice(1).join(" ")}</span></span>}
          </div>
        </div>
      ))}
      {entities.length < max && (
        <div className="flex min-h-[148px] flex-col justify-center gap-3 rounded-[14px] border border-dashed border-line-strong p-4">
          <span className="flex items-center gap-2 text-sm font-medium text-ink-2"><Plus size={16} className="text-accent-text" />
            {entities.length === 0 ? "Elegí el primero" : entities.length === 1 ? "Agregá otro para comparar" : "Agregar otro (opcional)"}</span>
          <SearchSelect options={options} exclude={entities.map((e) => e.id)} placeholder={placeholder} onPick={onAdd} />
        </div>
      )}
    </div>
  );
}

/** Cara a cara (2 elegidos): barras enfrentadas por estadística; el mejor valor, resaltado. */
export function HeadToHead({ a, b, rows }: { a: CmpEntity; b: CmpEntity; rows: CmpRow[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />{a.name}</span>
        <span className="flex items-center gap-2 text-right">{b.name}<span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} /></span>
      </div>
      {rows.map((r) => {
        const [va, vb] = r.values;
        const best = bestIdx(r);
        const total = Math.abs(va ?? 0) + Math.abs(vb ?? 0);
        const wa = total ? (Math.abs(va ?? 0) / total) * 100 : 50;
        return (
          <div key={r.id}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className={`num w-20 ${best.includes(0) ? "font-bold text-ink" : "text-ink-2"}`}>{r.format(va)}</span>
              <span className="flex items-center gap-1 text-center text-xs font-medium text-muted">{r.label}{r.hint && <InfoTip text={r.hint} />}</span>
              <span className={`num w-20 text-right ${best.includes(1) ? "font-bold text-ink" : "text-ink-2"}`}>{r.format(vb)}</span>
            </div>
            <div className="flex h-2 gap-1">
              <div className="flex flex-1 justify-end overflow-hidden rounded-l-full bg-surface-3">
                <div className="h-full rounded-l-full" style={{ width: `${wa}%`, background: a.color, opacity: best.includes(0) || !best.length ? 1 : 0.45 }} />
              </div>
              <div className="flex flex-1 overflow-hidden rounded-r-full bg-surface-3">
                <div className="h-full rounded-r-full" style={{ width: `${100 - wa}%`, background: b.color, opacity: best.includes(1) || !best.length ? 1 : 0.45 }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Tabla comparativa: mejor valor por fila (si corresponde) y diferencia respecto del primero. */
export function ComparisonTable({ entities, rows, highlight }: { entities: CmpEntity[]; rows: CmpRow[]; highlight: boolean }) {
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-line bg-surface-2 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Estadística</th>
            {entities.map((e) => (
              <th key={e.id} className="relative overflow-hidden border-b border-line bg-surface-2 px-3 py-2.5 text-right text-xs font-semibold">
                <CrestLayer teamId={e.crestTeamId} />
                <span className="crest-content inline-flex items-center gap-1.5 pl-8"><span className="h-2 w-2 rounded-full" style={{ background: e.color }} /><span className="max-w-[140px] truncate">{e.name}</span></span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="num">
          {rows.map((r) => {
            const best = highlight ? bestIdx(r) : [];
            return (
              <tr key={r.id} className="group">
                <td className="sticky left-0 z-10 border-b border-line bg-surface px-3 py-2.5 text-ink-2 group-last:border-0 group-hover:bg-surface-2">
                  <span className="inline-flex items-center gap-1">{r.label}{r.hint && <InfoTip text={r.hint} />}</span>
                </td>
                {r.values.map((v, i) => {
                  const d = i > 0 && v !== null && r.values[0] !== null ? v - (r.values[0] as number) : null;
                  const rel = i > 0 && !r.isPct && v !== null && r.values[0] !== null && (r.values[0] as number) > 0 && v >= 0 ? ((v - (r.values[0] as number)) / (r.values[0] as number)) * 100 : null;
                  return (
                    <td key={i} className="border-b border-line px-3 py-2.5 text-right group-last:border-0 group-hover:bg-surface-2">
                      <span className={`inline-flex items-center gap-1 ${best.includes(i) ? "font-bold text-accent-text" : "font-medium"}`}>
                        {best.includes(i) && <Crown size={12} aria-label="Mejor valor" />}
                        {r.format(v)}{r.partial?.[i] && <sup className="text-warn">*</sup>}
                      </span>
                      {d !== null && Math.abs(d) > 1e-9 && (
                        <span className="block text-[11px] text-muted">{r.isPct ? `${signed(d * 100)} pp` : signed(d)}{rel !== null && r.id !== "plus_minus" ? ` (${signed(rel, 0)}%)` : ""}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Cambia entre comparar jugadores y comparar equipos (las dos rutas existentes). */
export function CompareModeSwitch({ mode }: { mode: "players" | "teams" }) {
  const navigate = useNavigate();
  return (
    <Segmented ariaLabel="Qué comparar" value={mode} onChange={(v) => navigate(v === "players" ? "/comparar" : "/equipos/comparar")}
      options={[{ value: "players", label: "Jugadores", icon: Users }, { value: "teams", label: "Equipos", icon: Shield }]} />
  );
}

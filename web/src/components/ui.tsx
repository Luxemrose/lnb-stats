import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, Download, Inbox, Info,
  type LucideIcon,
} from "lucide-react";
import { downloadText, toCsv } from "../lib/format";
import { useCrest } from "./Crest";

export type Icon = LucideIcon;

// ------------------------------------------------------------- estructura de página

export function PageHeader({ title, subtitle, actions, back, eyebrow, leading }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; leading?: ReactNode;
  back?: { to: string; label: string };
}) {
  const navigate = useNavigate();
  return (
    <div className="mb-6">
      {back && (
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(back.to))}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink" aria-label={`Volver a ${back.label}`}>
          <ArrowLeft size={15} /> {back.label}
        </button>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {leading}
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
            {subtitle && <div className="mt-1 text-sm text-ink-2">{subtitle}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = "", icon: IconC, padded = true, id }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
  icon?: Icon; padded?: boolean; id?: string;
}) {
  return (
    <section id={id} className={`card min-w-0 ${padded ? "p-4 sm:p-5" : ""} ${className}`}>
      {(title || actions) && (
        <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${padded ? "" : "px-4 pt-4 sm:px-5 sm:pt-5"}`}>
          <div className="flex min-w-0 items-start gap-2.5">
            {IconC && <span className="mt-0.5 text-accent"><IconC size={17} /></span>}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold leading-snug">{title}</h2>}
              {subtitle && <div className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</div>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// ------------------------------------------------------------- indicadores

export function StatTile({ label, value, sub, hint, icon: IconC, emphasis = false, rank }: {
  label: string; value: ReactNode; sub?: ReactNode; hint?: string; icon?: Icon; emphasis?: boolean; rank?: ReactNode;
}) {
  return (
    <div className={`card relative min-w-0 overflow-hidden p-4 ${emphasis ? "border-accent/40" : ""}`}>
      {emphasis && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
      <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink-2">
        {IconC && <IconC size={14} className="shrink-0 text-muted" />}<span className="truncate">{label}</span>
        {hint && <InfoTip text={hint} />}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`num text-[28px] font-bold leading-none tracking-tight ${emphasis ? "text-accent-text" : ""}`}>{value}</span>
        {rank && <span className="num whitespace-nowrap rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">{rank}</span>}
      </div>
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Barra horizontal de porcentaje (tiro), con convertidos/intentados visibles. */
export function PctBar({ label, value, made, att, hint }: { label: string; value: number | null; made?: number; att?: number; hint?: string }) {
  const w = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        <span className="flex items-center gap-1 text-ink-2">{label}{hint && <InfoTip text={hint} />}</span>
        <span className="num font-semibold">
          {value === null ? "s/d" : `${(value * 100).toLocaleString("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`}
          {made !== undefined && att !== undefined && <span className="ml-1.5 text-xs font-normal text-muted">{made}/{att}</span>}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="presentation">
        <div className="h-full rounded-full bg-accent" style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------- mensajes

export function Notice({ children, tone = "warn", title }: { children: ReactNode; tone?: "warn" | "info" | "error" | "success"; title?: string }) {
  const map = {
    warn: { cls: "border-warn/30 bg-warn-soft", icon: <AlertTriangle size={16} className="text-warn" /> },
    error: { cls: "border-bad/30 bg-bad-soft", icon: <AlertTriangle size={16} className="text-bad" /> },
    info: { cls: "border-blue/30 bg-blue-soft", icon: <Info size={16} className="text-blue" /> },
    success: { cls: "border-good/30 bg-good-soft", icon: <CheckCircle2 size={16} className="text-good" /> },
  }[tone];
  return (
    <div className={`flex gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm text-ink ${map.cls}`} role="note">
      <span className="mt-0.5 shrink-0">{map.icon}</span>
      <div className="min-w-0">{title && <div className="font-semibold">{title}</div>}<div className="text-ink-2">{children}</div></div>
    </div>
  );
}

export function EmptyState({ title, children, icon: IconC = Inbox, action }: { title: string; children?: ReactNode; icon?: Icon; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted"><IconC size={22} /></span>
      <div className="text-base font-semibold">{title}</div>
      {children && <div className="mt-1.5 max-w-lg text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Distingue datos oficiales de indicadores calculados por la app. */
export function Origin({ kind }: { kind: "oficial" | "calculado" }) {
  return kind === "oficial"
    ? <span className="inline-flex h-5 items-center rounded-md bg-blue-soft px-1.5 text-[11px] font-semibold text-blue" title="Dato tal como lo publica la Liga">Oficial</span>
    : <span className="inline-flex h-5 items-center rounded-md border border-dashed border-line-strong px-1.5 text-[11px] font-semibold text-ink-2" title="Indicador calculado por LNB Stats a partir de datos almacenados (ver Metodología)">Calculado</span>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "bad" | "blue" }) {
  const cls = {
    neutral: "bg-surface-2 text-ink-2", accent: "bg-accent-soft text-accent-text", good: "bg-good-soft text-good",
    bad: "bg-bad-soft text-bad", blue: "bg-blue-soft text-blue",
  }[tone];
  return <span className={`inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

/** Resultado de un partido para un equipo: G (ganado) / P (perdido). */
export function ResultPill({ r }: { r: "G" | "P" }) {
  return <span className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${r === "G" ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}
    title={r === "G" ? "Ganado" : "Perdido"}>{r}</span>;
}

// ------------------------------------------------------------- ayuda contextual

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" className="focus-ring rounded text-muted hover:text-ink" aria-label={text}>
        <Info size={13} />
      </button>
      <span role="tooltip"
        className="pointer-events-none absolute bottom-full right-[-8px] z-50 mb-2 hidden w-60 max-w-[calc(100vw-2rem)] rounded-lg border border-line-strong bg-surface-3 px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink shadow-lg group-focus-within:block group-hover:block sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
        {text}
      </span>
    </span>
  );
}

// ------------------------------------------------------------- identidad visual

/** Iniciales en lugar de foto (la fuente no ofrece fotos utilizables). */
export function Avatar({ name, size = 40, tone = "neutral" }: { name: string; size?: number; tone?: "neutral" | "accent" | string }) {
  const parts = name.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  const ini = name.includes(",") ? `${parts[parts.length > 1 ? 1 : 0]?.[0] ?? ""}${parts[0]?.[0] ?? ""}` : `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`;
  const style = tone === "neutral" ? undefined : tone === "accent" ? { background: "var(--accent-soft)", color: "var(--accent-text)" }
    : { background: `color-mix(in srgb, ${tone} 18%, transparent)`, color: tone };
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-surface-3 font-semibold text-ink-2"
      style={{ width: size, height: size, fontSize: size * 0.36, ...style }}>{ini.toUpperCase()}</span>
  );
}

/** Escudo oficial del equipo (si existe) o, como respaldo, un monograma con sus iniciales. */
export function TeamMark({ name, size = 36, teamId }: { name: string; size?: number; teamId?: number | null }) {
  const url = useCrest(teamId);
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return <img src={url} alt="" aria-hidden loading="lazy" decoding="async" className="shrink-0 object-contain"
      style={{ width: size, height: size }} onError={() => setBroken(true)} />;
  }
  const clean = name.replace(/\(.*?\)/g, "").trim();
  const words = clean.split(/\s+/);
  const ini = (words.length > 1 ? words[0][0] + words[1][0] : clean.slice(0, 2)).toUpperCase();
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-xl border border-line bg-surface-2 font-bold text-ink-2"
      style={{ width: size, height: size, fontSize: size * 0.34 }}>{ini}</span>
  );
}

export function TeamLink({ id, name }: { id: number; name: string }) {
  return <Link className="link font-medium" to={`/equipos/${id}`}>{name}</Link>;
}
export function PlayerLink({ id, name }: { id: number; name: string }) {
  return <Link className="link font-medium" to={`/jugadores/${id}`}>{name}</Link>;
}

// ------------------------------------------------------------- controles

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-ink-2">
      <span className="flex items-center gap-1">{label}{hint && <InfoTip text={hint} />}</span>
      {children}
    </label>
  );
}

export interface SegOption<T extends string> { value: T; label: ReactNode; icon?: Icon }

export function Segmented<T extends string>({ options, value, onChange, size = "md", ariaLabel }: {
  options: SegOption<T>[]; value: T; onChange: (v: T) => void; size?: "sm" | "md"; ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex max-w-full overflow-x-auto rounded-[10px] border border-line bg-surface-2 p-0.5 no-scrollbar">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} role="radio" aria-checked={active} onClick={() => onChange(o.value)}
            className={`focus-ring inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors ${size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]"} ${active ? "bg-surface-3 text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
            {o.icon && <o.icon size={14} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabDef { id: string; label: string; icon?: Icon }

/** Pestañas sincronizadas con la URL (?tab=...), para poder compartir o volver a la misma vista. */
export function useUrlTab(tabs: TabDef[], param = "tab"): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const current = params.get(param);
  const value = tabs.some((t) => t.id === current) ? (current as string) : tabs[0].id;
  const set = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === tabs[0].id) next.delete(param); else next.set(param, id);
    setParams(next, { replace: true });
  };
  return [value, set];
}

export function Tabs({ tabs, value, onChange }: { tabs: TabDef[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button key={t.id} role="tab" aria-selected={active} onClick={() => onChange(t.id)}
            className={`focus-ring relative inline-flex h-11 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors ${active ? "text-ink" : "text-muted hover:text-ink"}`}>
            {t.icon && <t.icon size={15} />}{t.label}
            {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

/** Barra de filtros consistente: se mantiene visible arriba del contenido que filtra. */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="card flex flex-wrap items-end gap-3 p-3 sm:p-4">{children}</div>;
}

// ------------------------------------------------------------- carga

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando datos" className="space-y-6">
      <div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-72" /><Skeleton className="h-4 w-52" /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-[14px]" />)}</div>
      <div className="grid gap-5 xl:grid-cols-3"><Skeleton className="h-80 rounded-[14px] xl:col-span-2" /><Skeleton className="h-80 rounded-[14px]" /></div>
    </div>
  );
}

// ------------------------------------------------------------- tabla profesional

export interface Column<T> {
  key: string;
  label: string;
  title?: string;                 // explicación del encabezado (tooltip nativo)
  value: (row: T) => number | string | null;
  render?: (row: T) => ReactNode;
  align?: "left" | "right";
  sticky?: boolean;               // primera columna fija al desplazar horizontalmente
  highlight?: "max" | "min";      // resalta el mejor valor de la columna
  csv?: boolean;                  // incluir en CSV (por defecto sí)
  width?: string;
}

export function DataTable<T>({ rows, columns, initialSort, initialDir = "desc", csvName, rowKey, pageSize = 25, dense,
  maxHeight, toolbar, rank, emptyText = "Sin filas para mostrar con estos filtros." }: {
  rows: T[]; columns: Column<T>[]; initialSort?: string; initialDir?: "asc" | "desc"; csvName?: string;
  rowKey: (row: T) => string | number; pageSize?: number; dense?: boolean; maxHeight?: number; toolbar?: ReactNode;
  rank?: boolean; emptyText?: string;
}) {
  const [sort, setSort] = useState<string | undefined>(initialSort);
  const [dir, setDir] = useState<"asc" | "desc">(initialDir);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const va = col.value(a), vb = col.value(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;   // "sin dato" siempre al final
      if (vb === null) return -1;
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es");
      return dir === "asc" ? c : -c;
    });
  }, [rows, columns, sort, dir]);

  // Mejor valor por columna (sobre todas las filas filtradas, no sólo la página visible).
  const best = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of columns) {
      if (!c.highlight) continue;
      const vals = rows.map(c.value).filter((v): v is number => typeof v === "number");
      if (vals.length > 1) m.set(c.key, c.highlight === "max" ? Math.max(...vals) : Math.min(...vals));
    }
    return m;
  }, [rows, columns]);

  useEffect(() => { setPage(0); }, [rows.length, sort, dir, size]);
  const pages = size > 0 ? Math.max(1, Math.ceil(sorted.length / size)) : 1;
  const visible = size > 0 ? sorted.slice(page * size, page * size + size) : sorted;
  const pad = dense ? "px-3 py-2" : "px-3 py-2.5";

  const exportCsv = () => {
    if (!csvName) return;
    const cols = columns.filter((c) => c.csv !== false);
    downloadText(csvName, toCsv(cols.map((c) => c.label), sorted.map((r) => cols.map((c) => {
      const v = c.value(r);
      return typeof v === "number" ? Number(v.toFixed(4)) : v;
    }))));
  };

  return (
    <div className="min-w-0">
      {(toolbar || csvName) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {csvName && <button className="btn btn-sm" onClick={exportCsv} title="Descargar todas las filas, con el orden actual"><Download size={14} /> CSV</button>}
        </div>
      )}
      <div className="scrollbar-thin overflow-auto rounded-xl border border-line" style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {rank && <th scope="col" className={`${pad} sticky top-0 z-20 w-10 border-b border-line bg-surface-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted`}>#</th>}
              {columns.map((c) => {
                const active = sort === c.key;
                return (
                  <th key={c.key} scope="col" title={c.title} style={c.width ? { width: c.width } : undefined}
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                    className={`${pad} sticky top-0 whitespace-nowrap border-b border-line bg-surface-2 text-[11px] font-semibold uppercase tracking-wide ${active ? "text-ink" : "text-muted"} ${c.align === "left" ? "text-left" : "text-right"} ${c.sticky ? "left-0 z-30" : "z-20"}`}>
                    <button className={`focus-ring inline-flex items-center gap-1 rounded hover:text-ink ${c.align === "left" ? "" : "flex-row-reverse"}`}
                      onClick={() => {
                        if (sort === c.key) setDir(dir === "asc" ? "desc" : "asc");
                        else { setSort(c.key); setDir(c.align === "left" ? "asc" : "desc"); }
                      }}>
                      {c.label}
                      {active ? (dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} className="opacity-30" />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="num">
            {visible.map((r, i) => (
              <tr key={rowKey(r)} className="group">
                {rank && <td className={`${pad} border-b border-line text-right text-xs text-muted group-last:border-0 group-hover:bg-surface-2`}>{page * size + i + 1}</td>}
                {columns.map((c) => {
                  const v = c.value(r);
                  const isBest = best.has(c.key) && v === best.get(c.key);
                  return (
                    <td key={c.key}
                      className={`${pad} whitespace-nowrap border-b border-line group-last:border-0 group-hover:bg-surface-2 ${c.align === "left" ? "text-left" : "text-right"} ${c.sticky ? "sticky left-0 z-10 bg-surface" : "relative"} ${isBest ? "font-semibold text-accent-text" : ""}`}>
                      {c.render ? c.render(r) : (v ?? <span className="text-muted">s/d</span>)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!visible.length && (
              <tr><td colSpan={columns.length + (rank ? 1 : 0)} className="px-3 py-10 text-center text-sm text-ink-2">{emptyText}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {size > 0 && sorted.length > Math.min(size, 10) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span className="num">{sorted.length ? `${page * size + 1}–${Math.min(sorted.length, (page + 1) * size)} de ${sorted.length}` : "0"}</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5">Filas
              <select className="input h-8 text-xs" value={size} onChange={(e) => setSize(Number(e.target.value))}>
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button className="btn btn-sm btn-icon" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft size={15} /></button>
            <span className="num">{page + 1} / {pages}</span>
            <button className="btn btn-sm btn-icon" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Página siguiente"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

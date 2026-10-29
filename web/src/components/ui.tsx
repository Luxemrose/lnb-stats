import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { downloadText, toCsv } from "../lib/format";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = "" }:
  { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, sub, hint }: { label: string; value: ReactNode; sub?: ReactNode; hint?: string }) {
  return (
    <div className="card p-3" title={hint}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

export function Notice({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "info" }) {
  const cls = tone === "warn"
    ? "border-warn-border bg-warn-bg text-warn-ink"
    : "border-line bg-surface-2 text-ink-2";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`} role="note">{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card px-6 py-10 text-center">
      <div className="text-lg font-semibold">{title}</div>
      {children && <div className="mx-auto mt-2 max-w-xl text-sm text-ink-2">{children}</div>}
    </div>
  );
}

/** Distingue datos oficiales de indicadores calculados por la app. */
export function Origin({ kind }: { kind: "oficial" | "calculado" }) {
  return kind === "oficial"
    ? <span className="rounded border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink-2" title="Dato tal como lo publica la fuente">Oficial</span>
    : <span className="rounded border border-dashed border-line px-1.5 py-0.5 text-[11px] font-medium text-ink-2" title="Indicador calculado por LNB Stats a partir de datos almacenados (ver Metodología)">Calculado</span>;
}

export function TeamLink({ id, name }: { id: number; name: string }) {
  return <Link className="link" to={`/equipos/${id}`}>{name}</Link>;
}
export function PlayerLink({ id, name }: { id: number; name: string }) {
  return <Link className="link" to={`/jugadores/${id}`}>{name}</Link>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
      {label}
      {children}
    </label>
  );
}

// ------------------------------------------------------------- tabla ordenable

export interface Column<T> {
  key: string;
  label: string;
  title?: string;           // descripción (tooltip del encabezado)
  value: (row: T) => number | string | null;
  render?: (row: T) => ReactNode;
  align?: "left" | "right";
  sticky?: boolean;
}

export function DataTable<T>({ rows, columns, initialSort, initialDir = "desc", csvName, rowKey, maxRows, dense }: {
  rows: T[]; columns: Column<T>[]; initialSort?: string; initialDir?: "asc" | "desc"; csvName?: string;
  rowKey: (row: T) => string | number; maxRows?: number; dense?: boolean;
}) {
  const [sort, setSort] = useState<string | undefined>(initialSort);
  const [dir, setDir] = useState<"asc" | "desc">(initialDir);
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const va = col.value(a), vb = col.value(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;   // los "sin dato" siempre al final
      if (vb === null) return -1;
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es");
      return dir === "asc" ? c : -c;
    });
  }, [rows, columns, sort, dir]);
  const visible = maxRows && !showAll ? sorted.slice(0, maxRows) : sorted;
  const pad = dense ? "px-2 py-1" : "px-2.5 py-1.5";

  const exportCsv = () => {
    if (!csvName) return;
    downloadText(csvName, toCsv(columns.map((c) => c.label), sorted.map((r) => columns.map((c) => {
      const v = c.value(r);
      return typeof v === "number" ? Number(v.toFixed(4)) : v;
    }))));
  };

  return (
    <div>
      {csvName && (
        <div className="mb-2 flex justify-end">
          <button className="btn text-xs" onClick={exportCsv} title="Descargar la tabla completa, con el orden actual">Exportar CSV</button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-2">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" title={c.title}
                  className={`${pad} whitespace-nowrap border-b border-line text-xs font-semibold text-ink-2 ${c.align === "left" ? "text-left" : "text-right"} ${c.sticky ? "sticky left-0 z-10 bg-surface-2" : ""}`}>
                  <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => {
                    if (sort === c.key) setDir(dir === "asc" ? "desc" : "asc");
                    else { setSort(c.key); setDir(c.align === "left" ? "asc" : "desc"); }
                  }}>
                    {c.label}
                    <span aria-hidden className="w-2 text-[10px]">{sort === c.key ? (dir === "asc" ? "▲" : "▼") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {visible.map((r) => (
              <tr key={rowKey(r)} className="border-b border-line last:border-0 hover:bg-surface-2">
                {columns.map((c) => (
                  <td key={c.key} className={`${pad} whitespace-nowrap ${c.align === "left" ? "text-left" : "text-right"} ${c.sticky ? "sticky left-0 bg-surface" : ""}`}>
                    {c.render ? c.render(r) : (c.value(r) ?? "s/d")}
                  </td>
                ))}
              </tr>
            ))}
            {!visible.length && (
              <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-ink-2">Sin filas para mostrar con estos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {maxRows && sorted.length > maxRows && (
        <button className="btn mt-2 text-xs" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Mostrar menos" : `Mostrar las ${sorted.length} filas`}
        </button>
      )}
    </div>
  );
}

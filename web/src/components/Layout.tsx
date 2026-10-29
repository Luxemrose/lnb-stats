import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useData } from "../lib/data";
import { fdatetime } from "../lib/format";

const NAV = [
  { to: "/", label: "Panel" },
  { to: "/jugadores", label: "Jugadores" },
  { to: "/comparar", label: "Comparador" },
  { to: "/equipos", label: "Equipos" },
  { to: "/partidos", label: "Partidos" },
  { to: "/contenido", label: "Quinteto Inicial" },
  { to: "/datos", label: "Estado de datos" },
  { to: "/metodologia", label: "Metodología" },
];

export function Layout({ children }: { children: ReactNode }) {
  const { db, mode, setMode, seasonId, setSeasonId } = useData();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const last = db?.ds.meta.lastSuccessfulSync;

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Secciones">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === "/"} onClick={() => setOpen(false)}
          className={({ isActive }) => `rounded-md px-3 py-2 text-sm ${isActive ? "bg-surface-2 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
          {n.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen">
      {mode === "demo" && (
        <div className="sticky top-0 z-40 bg-[#6b4700] px-4 py-1.5 text-center text-sm font-semibold text-white" role="alert">
          MODO DEMOSTRACIÓN · Equipos, jugadores y estadísticas FICTICIOS. No usar para contenido.
          <button className="ml-3 underline" onClick={() => setMode("real")}>Volver a datos reales</button>
        </div>
      )}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-2.5">
          <button className="btn lg:hidden" aria-label="Abrir menú" onClick={() => setOpen(!open)}>☰</button>
          <div className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-6 w-6 rounded-full" style={{ background: "var(--s2)" }} />
            <span className="text-lg font-bold tracking-tight">LNB Stats</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            {db && db.ds.seasons.length > 0 && (
              <label className="flex items-center gap-1.5 text-ink-2">
                Temporada
                <select className="input" value={seasonId ?? ""} onChange={(e) => setSeasonId(Number(e.target.value))}>
                  {db.ds.seasons.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1.5 text-ink-2">
              Datos
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value as "real" | "demo")}>
                <option value="real">Reales</option>
                <option value="demo">Demo (ficticios)</option>
              </select>
            </label>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-5">
        <aside className={`${open ? "fixed inset-0 z-30 block bg-bg p-4 pt-16" : "hidden"} lg:static lg:block lg:w-48 lg:shrink-0 lg:p-0`}>
          {nav}
          <div className="mt-6 border-t border-line pt-3 text-xs text-muted">
            <div className="font-medium text-ink-2">Última actualización</div>
            <div>{last ? fdatetime(last.finished_at) : "Sin sincronizaciones exitosas"}</div>
            {db && <div className="mt-1">Fuente: {db.ds.meta.sourceName}</div>}
          </div>
        </aside>
        <main className="min-w-0 flex-1" key={loc.pathname}>{children}</main>
      </div>
    </div>
  );
}

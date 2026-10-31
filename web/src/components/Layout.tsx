import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowLeftRight, BookOpen, CalendarDays, Clapperboard, Clock, Database, Ellipsis, History, LayoutDashboard, Moon,
  PanelLeftClose, PanelLeftOpen, Search, Settings, Shield, Sun, Trophy, Users, X, type LucideIcon,
} from "lucide-react";
import { useData } from "../lib/data";
import { fdatetime } from "../lib/format";
import { usePrefs } from "../lib/prefs";
import { GlobalSearch } from "./GlobalSearch";

interface NavItem { to: string; label: string; icon: LucideIcon; short?: string }

const MAIN: NavItem[] = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/jugadores", label: "Jugadores", icon: Users },
  { to: "/equipos", label: "Equipos", icon: Shield },
  { to: "/comparar", label: "Comparador", icon: ArrowLeftRight, short: "Comparar" },
  { to: "/partidos", label: "Partidos", icon: CalendarDays },
  { to: "/rankings", label: "Estadísticas", icon: Trophy },
  { to: "/temporadas", label: "Temporadas", icon: History },
];
const TOOLS: NavItem[] = [{ to: "/contenido", label: "Quinteto Inicial", icon: Clapperboard }];
const SYSTEM: NavItem[] = [
  { to: "/datos", label: "Estado de datos", icon: Database },
  { to: "/metodologia", label: "Metodología", icon: BookOpen },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];
const MOBILE_MAIN = ["/", "/jugadores", "/equipos", "/partidos"];

/** Qué sección queda marcada: el comparador de equipos pertenece a "Comparador", no a "Equipos". */
function isActive(to: string, path: string): boolean {
  if (to === "/") return path === "/";
  if (to === "/comparar") return path === "/comparar" || path === "/equipos/comparar";
  if (to === "/equipos") return path.startsWith("/equipos") && path !== "/equipos/comparar";
  return path === to || path.startsWith(`${to}/`);
}

function relTime(iso?: string | null): string {
  if (!iso) return "sin actualizaciones";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="LNB Stats, ir al inicio">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-accent text-accent-ink">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18M5.6 5.6c3.3 3.3 3.3 9.5 0 12.8M18.4 5.6c-3.3 3.3-3.3 9.5 0 12.8" />
        </svg>
      </span>
      {!compact && <span className="text-[17px] font-extrabold tracking-tight">LNB<span className="text-accent-text"> Stats</span></span>}
    </Link>
  );
}

function SideLink({ item, collapsed, path }: { item: NavItem; collapsed: boolean; path: string }) {
  const active = isActive(item.to, path);
  const Icon = item.icon;
  return (
    <NavLink to={item.to} title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined}
      className={`focus-ring group relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors ${active ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"} ${collapsed ? "justify-center px-0" : ""}`}>
      {active && <span aria-hidden className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" />}
      <Icon size={18} className={active ? "text-accent-text" : "text-muted group-hover:text-ink-2"} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

function Sidebar({ path }: { path: string }) {
  const { sidebarCollapsed: c, setSidebarCollapsed } = usePrefs();
  const group = (label: string, items: NavItem[]) => (
    <div className="space-y-0.5">
      {!c && <div className="eyebrow px-3 pb-1.5 pt-4">{label}</div>}
      {c && <div className="my-3 h-px bg-line" />}
      {items.map((it) => <SideLink key={it.to} item={it} collapsed={c} path={path} />)}
    </div>
  );
  return (
    <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-surface transition-[width] lg:flex ${c ? "w-[72px]" : "w-60"}`}>
      <div className={`flex h-16 items-center ${c ? "justify-center" : "px-5"}`}><Logo compact={c} /></div>
      <nav aria-label="Secciones" className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5 pt-2">{MAIN.map((it) => <SideLink key={it.to} item={it} collapsed={c} path={path} />)}</div>
        {group("Herramientas", TOOLS)}
        {group("Sistema", SYSTEM)}
      </nav>
      <div className="border-t border-line p-3">
        <button className={`btn btn-ghost w-full text-ink-2 ${c ? "btn-icon" : "justify-start"}`} onClick={() => setSidebarCollapsed(!c)}
          aria-label={c ? "Expandir menú lateral" : "Contraer menú lateral"} title={c ? "Expandir menú" : undefined}>
          {c ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17} /> Contraer menú</>}
        </button>
      </div>
    </aside>
  );
}

function TopBar({ onSearch }: { onSearch: () => void }) {
  const { db, seasonId, setSeasonId } = useData();
  const { resolvedTheme, setTheme } = usePrefs();
  const last = db?.ds.meta.lastSuccessfulSync?.finished_at;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <div className="lg:hidden"><Logo compact /></div>
        {db && db.ds.seasons.length > 0 && (
          <label className="relative">
            <span className="sr-only">Temporada activa</span>
            <select className="input h-9 cursor-pointer font-semibold" value={seasonId ?? ""} onChange={(e) => setSeasonId(Number(e.target.value))}
              title="Temporada activa">
              {db.ds.seasons.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </select>
          </label>
        )}
        <button onClick={onSearch} aria-label="Buscar jugadores, equipos o partidos"
          className="focus-ring flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 text-sm text-muted transition-colors hover:border-line-strong md:max-w-md">
          <Search size={16} className="shrink-0" />
          <span className="hidden truncate sm:inline">Buscar jugadores, equipos o partidos…</span>
          <span className="truncate sm:hidden">Buscar…</span>
          <kbd className="ml-auto hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] text-muted md:inline">Ctrl K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-muted xl:flex" title={`Última actualización exitosa: ${fdatetime(last)}`}>
            <Clock size={14} /> Actualizado {relTime(last)}
          </span>
          <button className="btn btn-ghost btn-icon" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label={resolvedTheme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"} title="Cambiar tema">
            {resolvedTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link to="/configuracion" className="btn btn-ghost btn-icon hidden sm:inline-flex" aria-label="Configuración" title="Configuración"><Settings size={17} /></Link>
        </div>
      </div>
    </header>
  );
}

function MobileNav({ path, onMore }: { path: string; onMore: () => void }) {
  const items = MAIN.filter((m) => MOBILE_MAIN.includes(m.to));
  const moreActive = !items.some((it) => isActive(it.to, path));
  return (
    <nav aria-label="Secciones principales" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden">
      <div className="grid grid-cols-5">
        {items.map((it) => {
          const active = isActive(it.to, path);
          return (
            <NavLink key={it.to} to={it.to} aria-current={active ? "page" : undefined}
              className={`flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? "text-accent-text" : "text-muted"}`}>
              <it.icon size={20} />{it.short ?? it.label}
            </NavLink>
          );
        })}
        <button onClick={onMore} className={`flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${moreActive ? "text-accent-text" : "text-muted"}`}>
          <Ellipsis size={20} />Más
        </button>
      </div>
    </nav>
  );
}

function MoreSheet({ path, onClose }: { path: string; onClose: () => void }) {
  const items = [...MAIN.filter((m) => !MOBILE_MAIN.includes(m.to)), ...TOOLS, ...SYSTEM];
  return (
    <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={onClose}>
      <div className="pb-safe absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line-strong bg-surface p-4" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Más secciones">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-semibold">Más secciones</span>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {items.map((it) => {
            const active = isActive(it.to, path);
            return (
              <NavLink key={it.to} to={it.to} onClick={onClose}
                className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-center text-xs font-medium ${active ? "border-accent/50 bg-accent-soft text-ink" : "border-line text-ink-2"}`}>
                <it.icon size={20} className={active ? "text-accent-text" : "text-muted"} />{it.label}
              </NavLink>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { mode, setMode } = useData();
  const { sidebarCollapsed } = usePrefs();
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { window.scrollTo(0, 0); setMoreOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
      if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault(); setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen">
      <Sidebar path={pathname} />
      <div className={`transition-[padding] ${sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-60"}`}>
        {mode === "demo" && (
          <div className="bg-[#7a4a00] px-4 py-2 text-center text-sm font-semibold text-white" role="alert">
            Modo demostración · equipos, jugadores y estadísticas FICTICIOS. No usar para contenido.
            <button className="ml-3 underline underline-offset-2" onClick={() => setMode("real")}>Volver a datos reales</button>
          </div>
        )}
        <TopBar onSearch={() => setSearchOpen(true)} />
        <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>
      <MobileNav path={pathname} onMore={() => setMoreOpen(true)} />
      {moreOpen && <MoreSheet path={pathname} onClose={() => setMoreOpen(false)} />}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

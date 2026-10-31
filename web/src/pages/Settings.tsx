import { Link } from "react-router-dom";
import { BookOpen, Database, ExternalLink, Keyboard, Monitor, Moon, PanelLeft, Palette, Sun } from "lucide-react";
import { Card, Notice, PageHeader, Segmented } from "../components/ui";
import { useData } from "../lib/data";
import { fdatetime } from "../lib/format";
import { usePrefs, type ThemePref } from "../lib/prefs";

/** Preferencias del visitante (se guardan en su navegador). */
export default function Settings() {
  const { theme, setTheme, sidebarCollapsed, setSidebarCollapsed } = usePrefs();
  const { db, mode, setMode } = useData();
  return (
    <div className="space-y-5">
      <PageHeader title="Configuración" subtitle="Preferencias de visualización. Se guardan en este navegador." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card icon={Palette} title="Apariencia">
          <div className="space-y-5">
            <div>
              <div className="mb-2 text-sm font-medium">Tema</div>
              <Segmented<ThemePref> ariaLabel="Tema" value={theme} onChange={setTheme}
                options={[{ value: "dark", label: "Oscuro", icon: Moon }, { value: "light", label: "Claro", icon: Sun }, { value: "system", label: "Según el sistema", icon: Monitor }]} />
              <p className="mt-2 text-xs text-muted">El oscuro es el tema principal de LNB Stats. Los colores de los gráficos están ajustados para cada tema.</p>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium"><PanelLeft size={15} /> Menú lateral (computadora)</div>
              <Segmented ariaLabel="Menú lateral" value={sidebarCollapsed ? "c" : "o"} onChange={(v) => setSidebarCollapsed(v === "c")}
                options={[{ value: "o", label: "Expandido" }, { value: "c", label: "Sólo íconos" }]} />
            </div>
          </div>
        </Card>

        <Card icon={Database} title="Origen de los datos">
          <div className="space-y-4">
            <Segmented ariaLabel="Datos" value={mode} onChange={setMode}
              options={[{ value: "real", label: "Datos reales" }, { value: "demo", label: "Demostración (ficticios)" }]} />
            {mode === "demo"
              ? <Notice>Estás viendo datos ficticios, pensados para probar la interfaz. No los uses para contenido.</Notice>
              : <p className="text-sm text-ink-2">Estadísticas oficiales de la Liga Nacional, actualizadas automáticamente todos los días.</p>}
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Fuente</dt><dd className="text-right">{db?.ds.meta.sourceName ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Última actualización</dt><dd className="num">{fdatetime(db?.ds.meta.lastSuccessfulSync?.finished_at)}</dd></div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Link to="/datos" className="btn btn-sm"><Database size={14} /> Estado de datos</Link>
              <Link to="/metodologia" className="btn btn-sm"><BookOpen size={14} /> Metodología</Link>
              {db?.ds.meta.sourceUrl && <a href={db.ds.meta.sourceUrl} target="_blank" rel="noreferrer" className="btn btn-sm"><ExternalLink size={14} /> Sitio de la Liga</a>}
            </div>
          </div>
        </Card>

        <Card icon={Keyboard} title="Atajos de teclado" className="lg:col-span-2">
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            {[["Ctrl / ⌘ + K", "Abrir el buscador"], ["/", "Abrir el buscador"], ["↑ ↓ · Enter · Esc", "Moverse, abrir y cerrar en el buscador"]].map(([k, d]) => (
              <li key={k} className="flex items-center gap-3"><kbd className="rounded-md border border-line bg-surface-2 px-2 py-1 font-sans text-xs">{k}</kbd><span className="text-ink-2">{d}</span></li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

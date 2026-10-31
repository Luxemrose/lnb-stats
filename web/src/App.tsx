import { lazy, Suspense, type ReactNode } from "react";
import { HashRouter, Link, Route, Routes } from "react-router-dom";
import { Database, RefreshCw, SearchX, WifiOff } from "lucide-react";
import { Layout } from "./components/Layout";
import { EmptyState, PageSkeleton } from "./components/ui";
import { DataProvider, useData } from "./lib/data";
import { PrefsProvider } from "./lib/prefs";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Players = lazy(() => import("./pages/Players"));
const PlayerDetail = lazy(() => import("./pages/PlayerDetail"));
const Compare = lazy(() => import("./pages/Compare"));
const Teams = lazy(() => import("./pages/Teams"));
const TeamDetail = lazy(() => import("./pages/TeamDetail"));
const TeamCompare = lazy(() => import("./pages/TeamCompare"));
const Games = lazy(() => import("./pages/Games"));
const GameDetail = lazy(() => import("./pages/GameDetail"));
const Rankings = lazy(() => import("./pages/Rankings"));
const Seasons = lazy(() => import("./pages/Seasons"));
const Content = lazy(() => import("./pages/Content"));
const DataStatus = lazy(() => import("./pages/DataStatus"));
const Methodology = lazy(() => import("./pages/Methodology"));
const SettingsPage = lazy(() => import("./pages/Settings"));

/** Estados de carga / error / base vacía antes de las páginas que necesitan datos. */
function NeedsData({ children }: { children: ReactNode }) {
  const { db, error, loading, mode, setMode, reload } = useData();
  if (loading) return <PageSkeleton />;
  if (error) {
    return (
      <EmptyState icon={WifiOff} title="No se pudieron cargar los datos"
        action={<button className="btn btn-primary" onClick={reload}><RefreshCw size={15} /> Reintentar</button>}>
        {error}
      </EmptyState>
    );
  }
  if (!db || db.ds.games.length === 0) {
    return (
      <EmptyState icon={Database} title={mode === "real" ? "Todavía no hay datos reales cargados" : "La base de demostración está vacía"}
        action={mode === "real" ? <button className="btn" onClick={() => setMode("demo")}>Ver la interfaz con datos ficticios</button> : undefined}>
        LNB Stats sólo muestra estadísticas almacenadas y verificadas. Para cargar datos reales, ejecutá la
        sincronización con la web oficial o importá un CSV (ver <code>README.md</code>).
      </EmptyState>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const d = (el: ReactNode) => <NeedsData>{el}</NeedsData>;
  return (
    <PrefsProvider>
      <DataProvider>
        <HashRouter>
          <Layout>
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route path="/" element={d(<Dashboard />)} />
                <Route path="/jugadores" element={d(<Players />)} />
                <Route path="/jugadores/:id" element={d(<PlayerDetail />)} />
                <Route path="/comparar" element={d(<Compare />)} />
                <Route path="/equipos" element={d(<Teams />)} />
                <Route path="/equipos/comparar" element={d(<TeamCompare />)} />
                <Route path="/equipos/:id" element={d(<TeamDetail />)} />
                <Route path="/partidos" element={d(<Games />)} />
                <Route path="/partidos/:id" element={d(<GameDetail />)} />
                <Route path="/rankings" element={d(<Rankings />)} />
                <Route path="/temporadas" element={d(<Seasons />)} />
                <Route path="/contenido" element={d(<Content />)} />
                <Route path="/datos" element={<DataStatus />} />
                <Route path="/metodologia" element={<Methodology />} />
                <Route path="/configuracion" element={<SettingsPage />} />
                <Route path="*" element={
                  <EmptyState icon={SearchX} title="Página no encontrada" action={<Link className="btn btn-primary" to="/">Ir al inicio</Link>}>
                    La dirección no corresponde a ninguna sección de LNB Stats.
                  </EmptyState>} />
              </Routes>
            </Suspense>
          </Layout>
        </HashRouter>
      </DataProvider>
    </PrefsProvider>
  );
}

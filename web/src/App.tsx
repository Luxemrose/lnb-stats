import { lazy, Suspense, type ReactNode } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { EmptyState } from "./components/ui";
import { DataProvider, useData } from "./lib/data";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Players = lazy(() => import("./pages/Players"));
const PlayerDetail = lazy(() => import("./pages/PlayerDetail"));
const Compare = lazy(() => import("./pages/Compare"));
const Teams = lazy(() => import("./pages/Teams"));
const TeamDetail = lazy(() => import("./pages/TeamDetail"));
const TeamCompare = lazy(() => import("./pages/TeamCompare"));
const Games = lazy(() => import("./pages/Games"));
const GameDetail = lazy(() => import("./pages/GameDetail"));
const Content = lazy(() => import("./pages/Content"));
const DataStatus = lazy(() => import("./pages/DataStatus"));
const Methodology = lazy(() => import("./pages/Methodology"));

/** Muestra estados de carga / error / base vacía antes de las páginas que necesitan datos. */
function NeedsData({ children }: { children: ReactNode }) {
  const { db, error, loading, mode, setMode } = useData();
  if (loading) return <div className="p-6 text-ink-2">Cargando datos…</div>;
  if (error) return <EmptyState title="No se pudieron cargar los datos">{error}</EmptyState>;
  if (!db || db.ds.games.length === 0) {
    return (
      <EmptyState title={mode === "real" ? "Todavía no hay datos reales cargados" : "La base de demostración está vacía"}>
        <p>
          LNB Stats sólo muestra estadísticas almacenadas y verificadas. Para cargar datos reales, ejecutá la
          sincronización con la web oficial o importá un CSV (ver <code>README.md</code>).
        </p>
        {mode === "real" && (
          <button className="btn mt-4" onClick={() => setMode("demo")}>Ver la interfaz con datos ficticios (demo)</button>
        )}
      </EmptyState>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const d = (el: ReactNode) => <NeedsData>{el}</NeedsData>;
  return (
    <DataProvider>
      <HashRouter>
        <Layout>
          <Suspense fallback={<div className="p-6 text-ink-2">Cargando…</div>}>
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
            <Route path="/contenido" element={d(<Content />)} />
            <Route path="/datos" element={<DataStatus />} />
            <Route path="/metodologia" element={<Methodology />} />
            <Route path="*" element={<EmptyState title="Página no encontrada" />} />
          </Routes>
          </Suspense>
        </Layout>
      </HashRouter>
    </DataProvider>
  );
}

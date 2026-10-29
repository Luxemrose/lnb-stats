import { Card, DataTable, EmptyState, Notice, PageHeader, StatTile } from "../components/ui";
import { useData } from "../lib/data";
import { fdatetime } from "../lib/format";

const STATUS: Record<string, string> = { success: "Correcta", partial: "Parcial", failed: "Fallida", running: "En curso" };

export default function DataStatus() {
  const { db, error } = useData();
  if (error) return <EmptyState title="No se pudieron cargar los datos">{error}</EmptyState>;
  if (!db) return null;
  const { meta, games, players, syncLogs, openErrors } = db.ds;
  const byName = players.filter((p) => p.identity === "name").length;
  return (
    <div className="space-y-5">
      <PageHeader title="Estado de los datos" subtitle={`Archivo generado el ${fdatetime(meta.generatedAt)} · ${meta.sourceName}`} />
      {meta.mode === "demo" && <Notice>Estás viendo la base de demostración (datos ficticios).</Notice>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Última actualización exitosa" value={<span className="text-base">{fdatetime(meta.lastSuccessfulSync?.finished_at)}</span>} />
        <StatTile label="Partidos" value={games.length} sub={`${games.filter((g) => g.detailLevel === "box_score").length} con planilla · ${games.filter((g) => g.detailLevel === "result_only").length} sólo resultado`} />
        <StatTile label="Jugadores" value={players.length} sub={byName ? `${byName} identificados sólo por nombre` : "todos con id oficial"} />
        <StatTile label="Errores pendientes" value={openErrors.length} sub="se reintentan con retry-failed" />
      </div>
      <Card title="Historial de actualizaciones">
        <DataTable rows={syncLogs} rowKey={(l) => l.id} dense
          columns={[
            { key: "id", label: "#", value: (l) => l.id },
            { key: "start", label: "Inicio", align: "left", value: (l) => l.started_at, render: (l) => fdatetime(l.started_at) },
            { key: "src", label: "Origen", align: "left", value: (l) => l.source },
            { key: "st", label: "Estado", align: "left", value: (l) => STATUS[l.status] ?? l.status },
            { key: "new", label: "Nuevos", value: (l) => l.games_new },
            { key: "upd", label: "Actualizados", value: (l) => l.games_updated },
            { key: "same", label: "Sin cambios", value: (l) => l.games_unchanged },
            { key: "rej", label: "Rechazados", value: (l) => l.games_rejected },
            { key: "msg", label: "Mensaje", align: "left", value: (l) => l.message },
          ]} />
      </Card>
      <Card title="Errores de extracción o validación pendientes" subtitle="Un registro con errores no se guarda: así no entran datos inconsistentes.">
        <DataTable rows={openErrors} rowKey={(e) => e.id} dense
          columns={[
            { key: "stage", label: "Etapa", align: "left", value: (e) => e.stage },
            { key: "ref", label: "Referencia", align: "left", value: (e) => e.ref },
            { key: "msg", label: "Detalle", align: "left", value: (e) => e.message, render: (e) => <span className="whitespace-normal">{e.message}</span> },
            { key: "n", label: "Reintentos", value: (e) => e.retryCount },
          ]} />
      </Card>
    </div>
  );
}

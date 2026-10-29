import { Link } from "react-router-dom";
import { Card, Origin, PageHeader } from "../components/ui";
import { useSeason } from "../lib/data";
import { standings } from "../lib/stats";
import { StandingsTable } from "./Dashboard";

export default function Teams() {
  const sd = useSeason();
  if (!sd) return null;
  const rows = standings(sd.teamIds, sd.games);
  const without = sd.teamIds.filter((id) => !rows.some((r) => r.teamId === id));
  return (
    <div className="space-y-4">
      <PageHeader title="Equipos" subtitle={`Temporada ${sd.season.code} · ${sd.teamIds.length} equipos`}
        actions={<Link className="btn btn-primary" to="/equipos/comparar">Comparar equipos</Link>} />
      <Card title={<span className="flex items-center gap-2">Récord por equipo <Origin kind="calculado" /></span>}
        subtitle="Calculado con los partidos finalizados almacenados. Hacé clic en un equipo para ver su ficha.">
        <StandingsTable rows={rows} team={(id) => sd.db.teamsById.get(id)!} />
        {without.length > 0 && <p className="mt-2 text-xs text-muted">Sin partidos finalizados: {without.map((id) => sd.db.teamsById.get(id)!.name).join(", ")}.</p>}
      </Card>
    </div>
  );
}

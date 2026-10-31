import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, History, Info } from "lucide-react";
import { Badge, Card, Notice, PageHeader } from "../components/ui";
import { useData } from "../lib/data";
import { fdate, fdatetime } from "../lib/format";

/** Temporadas disponibles en la base, con su cobertura de datos, y selección de la temporada activa. */
export default function Seasons() {
  const { db, seasonId, setSeasonId } = useData();
  if (!db) return null;
  const items = db.ds.seasons.map((s) => {
    const games = db.ds.games.filter((g) => g.seasonId === s.id);
    const played = games.filter((g) => g.status === "final");
    const box = played.filter((g) => g.detailLevel === "box_score").length;
    const dates = played.map((g) => g.date).sort();
    const players = new Set(db.ds.rosters.filter((r) => r.seasonId === s.id).map((r) => r.playerId)).size;
    const teams = new Set(games.flatMap((g) => [g.homeTeamId, g.awayTeamId])).size;
    const hasOfficial = (db.ds.officialStandings ?? []).some((o) => o.seasonId === s.id);
    return { s, games, played, box, dates, players, teams, hasOfficial };
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Temporadas" subtitle="Temporadas almacenadas en LNB Stats y la cobertura de datos de cada una." />
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map(({ s, games, played, box, dates, players, teams, hasOfficial }) => {
          const active = s.id === seasonId;
          return (
            <Card key={s.id} className={active ? "border-accent/50" : ""} icon={History}
              title={<span className="flex items-center gap-2">Temporada {s.code} {active && <Badge tone="accent">Activa</Badge>}</span>}
              subtitle={s.name}
              actions={active ? <span className="flex items-center gap-1 text-xs text-good"><CheckCircle2 size={14} /> Seleccionada</span>
                : <button className="btn btn-primary btn-sm" onClick={() => setSeasonId(s.id)}>Usar esta temporada</button>}>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[["Partidos jugados", played.length], ["Programados", games.length - played.length], ["Equipos", teams], ["Jugadores", players]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-surface-2 px-3 py-2.5"><dt className="text-[11px] text-muted">{l}</dt><dd className="num text-xl font-bold">{v}</dd></div>
                ))}
              </dl>
              <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
                <li className="flex items-center gap-2"><CalendarDays size={14} className="text-muted" />
                  {dates.length ? `Del ${fdate(dates[0])} al ${fdate(dates[dates.length - 1])}` : "Sin partidos jugados"}</li>
                <li className="flex items-center gap-2"><CheckCircle2 size={14} className={box === played.length ? "text-good" : "text-warn"} />
                  {played.length ? `${box} de ${played.length} partidos con planilla completa` : "Sin planillas"}</li>
                <li className="flex items-center gap-2"><Info size={14} className="text-muted" />
                  {hasOfficial ? "Con tabla de posiciones oficial" : "Tabla de posiciones calculada por la app"}</li>
              </ul>
              {active && <div className="mt-4 flex flex-wrap gap-2"><Link to="/" className="btn btn-sm">Ir al inicio</Link><Link to="/partidos" className="btn btn-sm">Partidos</Link></div>}
            </Card>
          );
        })}
      </div>
      <Notice tone="info" title="Temporadas anteriores">
        El sitio oficial de la Liga sólo publica la competencia en curso, por eso el historial de LNB Stats empieza en 2026-27 y se va
        ampliando con la actualización diaria (última: {fdatetime(db.ds.meta.lastSuccessfulSync?.finished_at)}). Las temporadas pasadas se pueden
        incorporar por importación CSV. <Link to="/metodologia" className="link underline">Más información</Link>
      </Notice>
    </div>
  );
}

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { StandingsCard } from "../components/Standings";
import { Card, Notice, PageHeader, PlayerLink, StatTile } from "../components/ui";
import { useSeason } from "../lib/data";
import { playerSummaries } from "../lib/derive";
import { COUNT_LABELS, f1, fdate, fdatetime } from "../lib/format";
import { isCompleted, leaderMinGames, standings, type CountKey } from "../lib/stats";

const LEADER_KEYS: CountKey[] = ["pts", "reb", "ast", "stl", "blk", "eff"];

export default function Dashboard() {
  const sd = useSeason();
  const data = useMemo(() => {
    if (!sd) return null;
    const table = standings(sd.teamIds, sd.games);
    const done = sd.games.filter(isCompleted).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const summaries = playerSummaries(sd);
    const minGames = leaderMinGames(table.map((t) => t.games));
    return { table, done, summaries, minGames };
  }, [sd]);
  if (!sd || !data) return null;
  const { db, games, season } = sd;
  const team = (id: number) => db.teamsById.get(id)!;
  const meta = db.ds.meta;
  const scheduled = games.filter((g) => g.status === "scheduled").length;
  const withBox = games.filter((g) => g.detailLevel === "box_score").length;
  const resultOnly = games.filter((g) => g.detailLevel === "result_only").length;

  return (
    <div className="space-y-5">
      <PageHeader title={`Panel · ${season.name}`}
        subtitle={<>Datos al {fdatetime(meta.lastSuccessfulSync?.finished_at)} · Fuente: {meta.sourceUrl
          ? <a className="link" href={meta.sourceUrl} target="_blank" rel="noreferrer">{meta.sourceName}</a> : meta.sourceName}</>} />

      {db.ds.openErrors.length > 0 && (
        <Notice>Hay {db.ds.openErrors.length} errores de extracción pendientes: algunos partidos pueden faltar. <Link className="link" to="/datos">Ver detalle</Link>.</Notice>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Partidos finalizados" value={data.done.length} sub={`${scheduled} programados en la base`} />
        <StatTile label="Con planilla completa" value={withBox} sub={resultOnly ? `${resultOnly} sólo con resultado` : "todos con estadísticas"} />
        <StatTile label="Equipos" value={sd.teamIds.length} />
        <StatTile label="Jugadores con minutos" value={data.summaries.filter((s) => s.agg.games > 0).length} />
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <StandingsCard sd={sd} className="xl:col-span-3" />
        <Card className="xl:col-span-2" title="Últimos resultados" actions={<Link className="btn text-xs" to="/partidos">Todos los partidos</Link>}>
          <ul className="divide-y divide-line">
            {data.done.slice(0, 8).map((g) => {
              const hw = (g.homeScore as number) > (g.awayScore as number);
              return (
                <li key={g.id} className="py-2">
                  <Link to={`/partidos/${g.id}`} className="grid grid-cols-[1fr_auto] gap-x-3 rounded-md px-1 hover:bg-surface-2">
                    <span className={hw ? "font-semibold" : "text-ink-2"}>{team(g.homeTeamId).name}</span>
                    <span className={`tabular text-right ${hw ? "font-semibold" : "text-ink-2"}`}>{g.homeScore}</span>
                    <span className={!hw ? "font-semibold" : "text-ink-2"}>{team(g.awayTeamId).name}</span>
                    <span className={`tabular text-right ${!hw ? "font-semibold" : "text-ink-2"}`}>{g.awayScore}</span>
                    <span className="col-span-2 text-xs text-muted">{fdate(g.date)}{g.detailLevel !== "box_score" ? " · sin planilla individual" : ""}</span>
                  </Link>
                </li>
              );
            })}
            {!data.done.length && <li className="py-3 text-sm text-ink-2">No hay partidos finalizados en la base.</li>}
          </ul>
        </Card>
      </div>

      <Card title="Líderes estadísticos" subtitle={`Promedio por partido. Mínimo ${data.minGames} PJ (la mitad de los partidos del equipo con más partidos).`}
        actions={<Link className="btn text-xs" to="/jugadores">Ver todos los jugadores</Link>}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LEADER_KEYS.map((k) => {
            const top = data.summaries
              .filter((s) => s.agg.games >= data.minGames && s.agg.stats[k].perGame !== null && s.agg.stats[k].n === s.agg.games)
              .sort((a, b) => (b.agg.stats[k].perGame as number) - (a.agg.stats[k].perGame as number)).slice(0, 5);
            return (
              <div key={k}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{COUNT_LABELS[k].long}</div>
                <ol className="space-y-1 text-sm">
                  {top.map((s, i) => (
                    <li key={s.playerId} className="flex items-baseline gap-2">
                      <span className="w-4 text-xs text-muted">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate"><PlayerLink id={s.playerId} name={s.name} />
                        <span className="ml-1 text-xs text-muted">{s.currentTeamId ? team(s.currentTeamId).name : ""}</span></span>
                      <span className="tabular font-semibold">{f1(s.agg.stats[k].perGame)}</span>
                    </li>
                  ))}
                  {!top.length && <li className="text-ink-2">Sin datos suficientes.</li>}
                </ol>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link to="/comparar" className="card p-4 hover:bg-surface-2"><div className="font-semibold">Comparador de jugadores</div><div className="text-sm text-ink-2">Tablas y gráficos con períodos equivalentes.</div></Link>
        <Link to="/equipos/comparar" className="card p-4 hover:bg-surface-2"><div className="font-semibold">Comparar equipos</div><div className="text-sm text-ink-2">Récord, ataque, defensa y evolución.</div></Link>
        <Link to="/contenido" className="card p-4 hover:bg-surface-2"><div className="font-semibold">Vista Quinteto Inicial</div><div className="text-sm text-ink-2">Indicadores y gráficos listos para guion y video.</div></Link>
      </div>
    </div>
  );
}

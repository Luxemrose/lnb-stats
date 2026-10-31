import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, ArrowUpRight, CalendarDays, Clapperboard, Crown, Flame, Trophy, Users, Shield, Activity } from "lucide-react";
import { ChartCard, LinesChart, useThemeColors } from "../components/charts";
import { GameRow } from "../components/GameRow";
import { StandingsCard } from "../components/Standings";
import { CrestBox } from "../components/Crest";
import { Card, Notice, PageHeader, Segmented, StatTile } from "../components/ui";
import { contextTeam } from "./Players";
import { useSeason } from "../lib/data";
import { playerSummaries, weeklyLeague, type PlayerSummary } from "../lib/derive";
import { f1, fdatetime, pct } from "../lib/format";
import { GLOSSARY } from "../lib/glossary";
import { metricById, metricValue, ranking, type Metric } from "../lib/leaders";
import { isCompleted, leaderMinGames, standings } from "../lib/stats";

const LEADER_IDS = ["pts", "reb", "ast", "fg3_pct", "eff"];

export default function Dashboard() {
  const sd = useSeason();
  const colors = useThemeColors();
  const [gamesTab, setGamesTab] = useState<"recent" | "next">("recent");
  const data = useMemo(() => {
    if (!sd) return null;
    const table = standings(sd.teamIds, sd.games);
    const done = sd.games.filter(isCompleted).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const next = sd.games.filter((g) => g.status === "scheduled").sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
    const summaries = playerSummaries(sd);
    const minGames = leaderMinGames(table.map((t) => t.games));
    const weeks = weeklyLeague(sd);
    const totalPts = done.reduce((a, g) => a + (g.homeScore as number) + (g.awayScore as number), 0);
    return { done, next, summaries, minGames, weeks, ptsPerTeam: done.length ? totalPts / (done.length * 2) : null };
  }, [sd]);
  if (!sd || !data) return null;
  const { db, season } = sd;
  const teamName = (id: number) => db.teamsById.get(id)!.name;
  const meta = db.ds.meta;
  const withMinutes = data.summaries.filter((s) => s.agg.games > 0).length;
  const withBox = data.done.filter((g) => g.detailLevel === "box_score").length;
  const gamesList = gamesTab === "recent" ? data.done.slice(0, 7) : data.next.slice(0, 7);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Liga Nacional de Básquet" title={`Temporada ${season.code}`}
        subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Datos al {fdatetime(meta.lastSuccessfulSync?.finished_at)}</span>
          <span className="text-muted">·</span>
          <span>Fuente: {meta.sourceUrl ? <a className="link underline decoration-line-strong underline-offset-2" href={meta.sourceUrl} target="_blank" rel="noreferrer">sitio oficial de la Liga</a> : meta.sourceName}</span>
        </span>}
        actions={<>
          <Link to="/comparar" className="btn"><ArrowLeftRight size={15} /> Comparar</Link>
          <Link to="/rankings" className="btn"><Trophy size={15} /> Rankings</Link>
          <Link to="/contenido" className="btn btn-primary"><Clapperboard size={15} /> Quinteto Inicial</Link>
        </>} />

      {db.ds.openErrors.length > 0 && (
        <Notice title="Hay errores de actualización pendientes">
          {db.ds.openErrors.length} partido(s) no se pudieron procesar y pueden faltar. <Link className="link underline" to="/datos">Ver detalle</Link>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={CalendarDays} label="Partidos disputados" value={data.done.length}
          sub={`${data.next.length} programados · ${withBox === data.done.length ? "todos con planilla" : `${withBox} con planilla`}`} />
        <StatTile icon={Shield} label="Equipos" value={sd.teamIds.length} sub="participantes en la temporada" />
        <StatTile icon={Users} label="Jugadores registrados" value={new Set(sd.rosters.map((r) => r.playerId)).size} sub={`${withMinutes} con minutos en cancha`} />
        <StatTile icon={Activity} label="Puntos por equipo" value={f1(data.ptsPerTeam)} hint={GLOSSARY.ptsPerTeam} emphasis
          sub={data.ptsPerTeam !== null ? `${f1(data.ptsPerTeam * 2)} por partido (ambos equipos)` : undefined} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" icon={Crown} title="Líderes estadísticos"
          subtitle={`Promedios por partido · mínimo ${data.minGames} PJ`}
          actions={<Link to="/rankings" className="btn btn-sm">Todos los rankings <ArrowUpRight size={14} /></Link>}>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {LEADER_IDS.map((id) => <LeaderCard key={id} metric={metricById(id)} summaries={data.summaries} minGames={data.minGames} teamName={teamName} />)}
            <Link to="/rankings" className="card-hover flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-ink-2">
              <Trophy size={20} className="text-accent-text" />
              Ver más categorías<span className="text-xs text-muted">robos, tapas, % de campo, TS%…</span>
            </Link>
          </div>
        </Card>

        <Card icon={Flame} title="Partidos" actions={
          <Segmented size="sm" ariaLabel="Partidos" value={gamesTab} onChange={setGamesTab}
            options={[{ value: "recent", label: "Resultados" }, { value: "next", label: "Próximos" }]} />}>
          <div className="-mx-2 divide-y divide-line">
            {gamesList.map((g) => <GameRow key={g.id} game={g} teamName={teamName} />)}
            {!gamesList.length && <p className="px-2 py-6 text-center text-sm text-ink-2">{gamesTab === "recent" ? "Todavía no hay partidos finalizados." : "No hay partidos programados en la base."}</p>}
          </div>
          <Link to="/partidos" className="btn btn-sm mt-3 w-full">Ver todos los partidos</Link>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <StandingsCard sd={sd} compact className="xl:col-span-3" />
        <div className="space-y-5 xl:col-span-2">
          <ChartCard title="Puntos por equipo, semana a semana" filename="liga-puntos-por-semana"
            subtitle={`Temporada ${season.code} · promedio de puntos de cada equipo por partido, agrupado por semana`}
            legend={[{ name: "Puntos por equipo", color: colors.series[0] }]}
            csv={{ headers: ["semana_desde", "partidos", "puntos_por_equipo"], rows: data.weeks.map((w) => [w.week, w.games, w.ptsPerTeam]) }}
            note="La Liga no publica el número de fecha de cada partido: se agrupa por semana (de lunes a domingo).">
            <LinesChart data={data.weeks.map((w) => ({ x: w.label, v: w.ptsPerTeam }))} x="x" height={200}
              series={[{ key: "v", name: "Puntos por equipo" }]} colors={[colors.series[0]]} />
          </ChartCard>
          <ChartCard title="Efectividad en triples de la liga" filename="liga-triples-por-semana"
            subtitle={`Temporada ${season.code} · % de triples de todos los equipos, por semana`}
            legend={[{ name: "% de triples", color: colors.series[1] }]}
            csv={{ headers: ["semana_desde", "partidos", "pct_triples"], rows: data.weeks.map((w) => [w.week, w.games, w.fg3Pct]) }}>
            <LinesChart data={data.weeks.map((w) => ({ x: w.label, v: w.fg3Pct === null ? null : w.fg3Pct * 100 }))} x="x" height={200}
              series={[{ key: "v", name: "% de triples" }]} colors={[colors.series[1]]} formatY={(v) => `${v.toFixed(0)}%`} />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

function LeaderCard({ metric, summaries, minGames, teamName }: {
  metric: Metric; summaries: PlayerSummary[]; minGames: number; teamName: (id: number) => string;
}) {
  const top = ranking(summaries, metric, "perGame", minGames).slice(0, 5);
  const fmt = (s: PlayerSummary) => (metric.kind === "pct" ? pct(metricValue(s, metric, "perGame")) : f1(metricValue(s, metric, "perGame")));
  const [first, ...rest] = top;
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface-2/40 p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="eyebrow">{metric.label}</span>
        <Link to={`/rankings?cat=${metric.id}`} className="text-[11px] text-muted hover:text-accent-text" title={metric.attLabel ? `Mínimo ${metric.attLabel}` : undefined}>Ranking</Link>
      </div>
      {first ? (
        <>
          <Link to={`/jugadores/${first.playerId}`} className="group block">
            <CrestBox teamId={contextTeam(first)} size="card" className="-mx-1 rounded-lg">
            <span className="flex items-center gap-3 py-1.5 pl-12 pr-1">
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-sm font-semibold leading-tight group-hover:text-accent-text">{first.name}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">{contextTeam(first) ? teamName(contextTeam(first)!) : ""} · {first.agg.games} PJ</span>
            </span>
            <span className="num shrink-0 text-2xl font-bold text-accent-text">{fmt(first)}</span>
            </span>
            </CrestBox>
          </Link>
          <ol className="mt-3 space-y-1 border-t border-line pt-2.5">
            {rest.map((s, i) => (
              <li key={s.playerId}>
                <CrestBox teamId={contextTeam(s)} className="-mx-1 rounded-md">
                  <span className="flex items-center gap-2 py-0.5 pl-1 pr-1 text-[13px]">
                    <span className="num w-5 text-right text-xs text-muted">{i + 2}</span>
                    <Link to={`/jugadores/${s.playerId}`} className="link min-w-0 flex-1 truncate pl-2">{s.name}</Link>
                    <span className="num font-semibold text-ink-2">{fmt(s)}</span>
                  </span>
                </CrestBox>
              </li>
            ))}
          </ol>
        </>
      ) : <p className="py-4 text-center text-xs text-muted">Sin jugadores que cumplan el mínimo{metric.attLabel ? ` (${metric.attLabel})` : ""}.</p>}
    </div>
  );
}

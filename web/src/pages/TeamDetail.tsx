import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeftRight, CalendarDays, Home, LayoutDashboard, Plane, Scale, Shield, Swords, Target, Trophy, Users } from "lucide-react";
import { ChartCard, LinesChart, useThemeColors } from "../components/charts";
import { GameRow } from "../components/GameRow";
import { PeriodPicker, defaultPeriod, describePeriod, toPeriod } from "../components/pickers";
import { Card, DataTable, EmptyState, Origin, PageHeader, ResultPill, Segmented, StatTile, Tabs, TeamMark, useUrlTab } from "../components/ui";
import { useSeason } from "../lib/data";
import { playerSummaries, teamPeriodData } from "../lib/derive";
import { COUNT_LABELS, PCT_LABELS, f1, fdate, pct, signed } from "../lib/format";
import { ratio, type CountKey } from "../lib/stats";
import { playerNameColumn, statColumns, type View } from "./Players";

const TEAM_KEYS: CountKey[] = ["pts", "reb", "oreb", "dreb", "ast", "stl", "tov", "blk", "pf", "eff"];
const TABS = [
  { id: "resumen", label: "Resumen", icon: LayoutDashboard },
  { id: "ataque-defensa", label: "Ataque y defensa", icon: Swords },
  { id: "resultados", label: "Resultados", icon: CalendarDays },
  { id: "plantel", label: "Plantel", icon: Users },
];

export default function TeamDetail() {
  const { id } = useParams();
  const tid = Number(id);
  const sd = useSeason();
  const colors = useThemeColors();
  const [tab, setTab] = useUrlTab(TABS);
  const [period, setPeriod] = useState(defaultPeriod);
  const [rosterView, setRosterView] = useState<View>("perGame");
  const d = useMemo(() => (sd ? teamPeriodData(sd, tid, toPeriod(period)) : null), [sd, tid, period]);
  const roster = useMemo(() => (sd ? playerSummaries(sd, toPeriod(period)).filter((s) => s.teamIds.includes(tid)) : []), [sd, tid, period]);
  if (!sd || !d) return null;
  const team = sd.db.teamsById.get(tid);
  if (!team) return <EmptyState title="Equipo no encontrado" action={<Link to="/equipos" className="btn btn-primary">Ver equipos</Link>} />;
  const tname = (i: number) => sd.db.teamsById.get(i)!.name;
  const n = d.done.length;
  const periodText = describePeriod(period, sd.season.code);
  const official = (sd.db.ds.officialStandings ?? []).find((o) => o.seasonId === sd.seasonId && o.teamId === tid);
  const last5 = d.done.slice(-5).map((l) => (l.win ? "G" : "P") as "G" | "P");
  let cum = 0;
  const chart = d.done.map((l) => {
    cum += (l.own as number) - (l.opp as number);
    return { x: `${fdate(l.date).slice(0, 5)} ${l.isHome ? "vs" : "@"} ${tname(l.opponentId)}`, pf: l.own, pa: l.opp, cum };
  });
  const played = [...d.lines].filter((l) => l.win !== null).reverse();
  const upcoming = d.lines.filter((l) => l.win === null);

  return (
    <div className="space-y-6">
      <PageHeader back={{ to: "/equipos", label: "Equipos" }} leading={<TeamMark teamId={tid} name={team.name} size={72} />}
        eyebrow={official ? <span className="text-accent-text">{official.position}.º en la tabla oficial · {official.phase}</span> : `Temporada ${sd.season.code}`}
        title={team.name}
        subtitle={<span className="flex flex-wrap items-center gap-3">
          <span className="num font-semibold text-ink">{d.wins}-{d.losses}</span>
          {last5.length > 0 && <span className="flex items-center gap-1">{last5.map((r, i) => <ResultPill key={i} r={r} />)}<span className="ml-1 text-xs text-muted">últimos {last5.length}</span></span>}
        </span>}
        actions={<Link className="btn btn-primary" to={`/equipos/comparar?ids=${tid}`}><ArrowLeftRight size={15} /> Comparar</Link>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile icon={Trophy} label="Récord" value={`${d.wins}-${d.losses}`} sub={`${pct(ratio(d.wins, n))} de victorias`} emphasis />
        <StatTile icon={Target} label="Puntos a favor" value={f1(ratio(d.pf, n))} sub={`por partido · ${d.pf} totales`} />
        <StatTile icon={Shield} label="Puntos en contra" value={f1(ratio(d.pa, n))} sub={`por partido · ${d.pa} totales`} />
        <StatTile icon={Scale} label="Diferencia" value={signed(ratio(d.pf - d.pa, n))} sub={`por partido · ${signed(d.pf - d.pa, 0)} total`} />
        <StatTile icon={Home} label="De local" value={`${d.done.filter((l) => l.isHome && l.win).length}-${d.done.filter((l) => l.isHome && l.win === false).length}`} sub="ganados-perdidos" />
        <StatTile icon={Plane} label="De visitante" value={`${d.done.filter((l) => !l.isHome && l.win).length}-${d.done.filter((l) => !l.isHome && l.win === false).length}`} sub="ganados-perdidos" />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PeriodPicker value={period} onChange={setPeriod} />
          <span className="text-xs text-muted">{periodText} · {n} partidos finalizados</span>
        </div>
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === "resumen" && (n === 0 ? <EmptyState title="Sin partidos finalizados en el período" /> : (
        <div className="grid gap-5 xl:grid-cols-2">
          <ChartCard title={`${team.name}: puntos por partido`} subtitle={`${periodText} · Unidad: puntos`}
            legend={[{ name: "Convertidos", color: colors.series[0] }, { name: "Recibidos", color: colors.series[1] }]}
            filename={`${team.slug}-puntos`} csv={{ headers: ["partido", "convertidos", "recibidos"], rows: chart.map((c) => [c.x, c.pf, c.pa]) }}>
            <LinesChart data={chart} x="x" colors={[colors.series[0], colors.series[1]]} series={[{ key: "pf", name: "Convertidos" }, { key: "pa", name: "Recibidos" }]} />
          </ChartCard>
          <ChartCard title={`${team.name}: diferencia de puntos acumulada`} subtitle={`${periodText} · Unidad: puntos (suma de diferencias)`}
            legend={[{ name: "Diferencia acumulada", color: colors.series[2] }]} filename={`${team.slug}-diferencia`}
            csv={{ headers: ["partido", "diferencia_acumulada"], rows: chart.map((c) => [c.x, c.cum]) }}>
            <LinesChart data={chart} x="x" colors={[colors.series[2]]} series={[{ key: "cum", name: "Diferencia acumulada" }]} />
          </ChartCard>
          <Card className="xl:col-span-2" icon={CalendarDays} title="Últimos resultados" actions={<button className="btn btn-sm" onClick={() => setTab("resultados")}>Ver todos</button>}>
            <div className="-mx-2 grid gap-x-6 divide-y divide-line md:grid-cols-2 md:divide-y-0">
              {played.slice(0, 6).map((l) => <GameRow key={l.game.id} game={l.game} teamName={tname} highlightTeam={tid} />)}
            </div>
          </Card>
        </div>
      ))}

      {tab === "ataque-defensa" && (
        <Card icon={Swords} title={<span className="flex items-center gap-2">Promedios ofensivos y defensivos {d.origin && <Origin kind={d.origin === "oficial" ? "oficial" : "calculado"} />}</span>}
          subtitle={d.origin === "oficial" ? "Totales de equipo publicados por la Liga en cada planilla." : "Sin totales oficiales de equipo: se suman las planillas individuales."}>
          {d.own.games === 0 ? <p className="text-sm text-ink-2">No hay partidos con estadísticas colectivas en el período.</p> : (
            <div className="scrollbar-thin overflow-x-auto">
              <table className="tabular w-full min-w-[480px] text-sm">
                <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 text-left font-semibold">Por partido</th><th className="text-right font-semibold">{team.name}</th><th className="text-right font-semibold">Rivales</th><th className="text-right font-semibold">Dif.</th>
                </tr></thead>
                <tbody>
                  {TEAM_KEYS.map((k) => {
                    const a = d.own.stats[k].perGame, b = d.opp.stats[k].perGame;
                    const diffV = a === null || b === null ? null : a - b;
                    const goodWhenPositive = !["tov", "pf"].includes(k);
                    const good = diffV !== null && (goodWhenPositive ? diffV > 0 : diffV < 0);
                    return (
                      <tr key={k} className="border-b border-line">
                        <td className="py-2">{COUNT_LABELS[k].long}</td><td className="text-right font-semibold">{f1(a)}</td>
                        <td className="text-right text-ink-2">{f1(b)}</td>
                        <td className={`text-right font-semibold ${diffV === null || Math.abs(diffV) < 0.05 ? "text-muted" : good ? "text-good" : "text-bad"}`}>{diffV === null ? "s/d" : signed(diffV)}</td>
                      </tr>
                    );
                  })}
                  {(["fg_pct", "fg2_pct", "fg3_pct", "ft_pct", "efg_pct", "ts_pct"] as const).map((k) => {
                    const a = d.own.pct[k].value, b = d.opp.pct[k].value;
                    const diffV = a === null || b === null ? null : (a - b) * 100;
                    return (
                      <tr key={k} className="border-b border-line last:border-0">
                        <td className="py-2">{PCT_LABELS[k].long}</td><td className="text-right font-semibold">{pct(a)}</td>
                        <td className="text-right text-ink-2">{pct(b)}</td>
                        <td className={`text-right font-semibold ${diffV === null || Math.abs(diffV) < 0.05 ? "text-muted" : diffV > 0 ? "text-good" : "text-bad"}`}>{diffV === null ? "s/d" : `${signed(diffV)} pp`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted">Calculado con {d.own.games} partidos con estadísticas colectivas. Verde = ventaja del equipo (en pérdidas y faltas, menos es mejor).</p>
            </div>
          )}
        </Card>
      )}

      {tab === "resultados" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card icon={CalendarDays} title={`Jugados (${played.length})`}>
            <div className="-mx-2 divide-y divide-line">
              {played.map((l) => <GameRow key={l.game.id} game={l.game} teamName={tname} highlightTeam={tid} showVenue />)}
              {!played.length && <p className="px-2 py-6 text-center text-sm text-muted">Sin partidos jugados en el período.</p>}
            </div>
          </Card>
          <Card icon={CalendarDays} title={`Próximos (${upcoming.length})`}>
            <div className="-mx-2 divide-y divide-line">
              {upcoming.map((l) => <GameRow key={l.game.id} game={l.game} teamName={tname} highlightTeam={tid} showVenue />)}
              {!upcoming.length && <p className="px-2 py-6 text-center text-sm text-muted">No hay partidos programados en la base.</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === "plantel" && (
        <Card icon={Users} title={`Plantel en la temporada (${roster.length})`}
          subtitle="Jugadores que figuran en las planillas de este equipo. La Liga no publica la posición.">
          <DataTable rows={roster} rowKey={(s) => s.playerId} initialSort="pts" dense pageSize={0} csvName={`${team.slug}-plantel.csv`}
            toolbar={<Segmented size="sm" ariaLabel="Tipo de valor" value={rosterView} onChange={setRosterView}
              options={[{ value: "perGame", label: "Por partido" }, { value: "total", label: "Totales" }, { value: "per40", label: "Por 40'" }]} />}
            columns={[
              playerNameColumn(() => team.name, tid),
              { key: "pj", label: "PJ", value: (s) => s.agg.games, highlight: "max" },
              { key: "min", label: "MIN", value: (s) => (rosterView === "total" ? s.agg.minutesTotal : s.agg.minutesPerGame), render: (s) => f1(rosterView === "total" ? s.agg.minutesTotal : s.agg.minutesPerGame) },
              ...statColumns(rosterView, false),
            ]} />
        </Card>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, ArrowLeftRight, BarChart3, Gauge, LineChart as LineIcon, ListOrdered, Target, Timer, Trophy, UserRound } from "lucide-react";
import { ChartCard, LinesChart, useThemeColors } from "../components/charts";
import { PeriodPicker, SearchSelect, defaultPeriod, describePeriod, toPeriod } from "../components/pickers";
import {
  Avatar, Badge, Card, DataTable, EmptyState, Field, Notice, PageHeader, PctBar, Segmented, StatTile, Tabs, useUrlTab, InfoTip,
} from "../components/ui";
import { useData, useSeason, type DatedRow } from "../lib/data";
import { playerRows, playerSummaries } from "../lib/derive";
import { COUNT_LABELS, PCT_LABELS, f0, f1, fdate, mmss, pct, signed } from "../lib/format";
import { GLOSSARY } from "../lib/glossary";
import { metricById, metricValue, ranking } from "../lib/leaders";
import { aggregate, COUNT_KEYS, diff, fga, fgm, leaderMinGames, rollingMean, standings, type Aggregate, type CountKey } from "../lib/stats";

export type ChartKey = CountKey | "minutes";
export const chartValue = (r: DatedRow, k: ChartKey) => (k === "minutes" ? (r.minutes_sec === null ? null : r.minutes_sec / 60) : r[k]);
export const chartLabel = (k: ChartKey) => (k === "minutes" ? "Minutos" : COUNT_LABELS[k].long);

const TABS = [
  { id: "resumen", label: "Resumen", icon: UserRound },
  { id: "estadisticas", label: "Estadísticas", icon: ListOrdered },
  { id: "evolucion", label: "Evolución por partido", icon: LineIcon },
  { id: "comparaciones", label: "Comparaciones", icon: ArrowLeftRight },
];

export default function PlayerDetail() {
  const { id } = useParams();
  const pid = Number(id);
  const sd = useSeason();
  const { db, seasonId, setSeasonId } = useData();
  const [tab, setTab] = useUrlTab(TABS);
  const [period, setPeriod] = useState(defaultPeriod);

  const rows = useMemo(() => (sd ? playerRows(sd, pid, toPeriod(period)) : []), [sd, pid, period]);
  const agg = useMemo(() => aggregate(rows, rows.map((r) => r.date)), [rows]);
  const league = useMemo(() => {
    if (!sd) return null;
    const summaries = playerSummaries(sd, toPeriod(period));
    const minGames = leaderMinGames(standings(sd.teamIds, sd.games).map((t) => t.games));
    return { summaries, minGames };
  }, [sd, period]);
  if (!sd || !league || !db) return null;

  const player = sd.db.playersById.get(pid);
  if (!player) return <EmptyState title="Jugador no encontrado" action={<Link to="/jugadores" className="btn btn-primary">Ver jugadores</Link>}>Puede que el enlace sea de otra base de datos (real o demo).</EmptyState>;
  const rosters = sd.rosters.filter((r) => r.playerId === pid).sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
  const current = rosters[rosters.length - 1];
  const team = (tid: number) => sd.db.teamsById.get(tid)!;
  const periodText = describePeriod(period, sd.season.code);
  const playerSeasons = db.ds.seasons.filter((s) => db.ds.rosters.some((r) => r.playerId === pid && r.seasonId === s.id));
  const dnp = sd.rowsForPlayer(pid).filter((r) => r.dnp).length;

  const rankOf = (metricId: string) => {
    const m = metricById(metricId);
    const list = ranking(league.summaries, m, "perGame", league.minGames);
    const i = list.findIndex((s) => s.playerId === pid);
    return i >= 0 ? { pos: i + 1, of: list.length } : null;
  };
  const tile = (metricId: string, label: string, value: string, sub: string, icon: typeof Activity, hint?: string, emphasis = false) => {
    const r = rankOf(metricId);
    return <StatTile key={metricId} icon={icon} label={label} value={value} sub={sub} hint={hint} emphasis={emphasis}
      rank={r ? `N.º ${r.pos}` : undefined} />;
  };

  return (
    <div className="space-y-6">
      <PageHeader back={{ to: "/jugadores", label: "Jugadores" }}
        leading={<Avatar name={player.name} size={64} tone="accent" />}
        eyebrow={current ? <Link to={`/equipos/${current.teamId}`} className="hover:text-accent-text">{team(current.teamId).name}</Link> : "Sin equipo en la temporada"}
        title={player.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          {current?.jersey && <Badge>#{current.jersey}</Badge>}
          {current?.position ? <Badge>{current.position}</Badge> : <span className="text-xs text-muted" title="La Liga no publica la posición">Posición no informada</span>}
          {rosters.length > 1 && <Badge tone="blue">{rosters.length} equipos en la temporada</Badge>}
          <span className="text-xs text-muted">{agg.games} PJ en el período{dnp ? ` · ${dnp} sin jugar` : ""}</span>
        </span>}
        actions={<>
          <label className="flex items-center gap-2 text-xs text-ink-2">Temporada
            <select className="input" value={seasonId ?? ""} onChange={(e) => setSeasonId(Number(e.target.value))}>
              {(playerSeasons.length ? playerSeasons : db.ds.seasons).map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </select>
          </label>
          <Link className="btn btn-primary" to={`/comparar?ids=${pid}`}><ArrowLeftRight size={15} /> Comparar</Link>
        </>} />

      {player.identity === "name" && (
        <Notice>La fuente no aportó un identificador oficial para este jugador: se lo reconoce por su nombre. Si aparece con distintas grafías puede figurar duplicado.</Notice>
      )}

      {agg.games === 0 ? (
        <>
          <div className="card p-3"><PeriodPicker value={period} onChange={setPeriod} /></div>
          <EmptyState title="Sin partidos disputados en el período elegido">Probá con "Temporada" en el selector de período.</EmptyState>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {tile("pts", "Puntos", f1(agg.stats.pts.perGame), `por partido · ${f0(agg.stats.pts.total)} totales`, Target, undefined, true)}
            {tile("reb", "Rebotes", f1(agg.stats.reb.perGame), `por partido · ${f1(agg.stats.oreb.perGame)} ofensivos`, Activity)}
            {tile("ast", "Asistencias", f1(agg.stats.ast.perGame), `por partido · ${f1(agg.stats.tov.perGame)} pérdidas`, Activity)}
            {tile("min", "Minutos", f1(agg.minutesPerGame), `por partido · ${agg.starts ?? 0} de titular`, Timer, GLOSSARY.min)}
            {tile("fg3_pct", "% de triples", pct(agg.pct.fg3_pct.value), `${agg.pct.fg3_pct.made}/${agg.pct.fg3_pct.att} convertidos`, Gauge, GLOSSARY.fg3)}
            {tile("eff", "Valoración", f1(agg.stats.eff.perGame), "por partido (oficial)", Trophy, GLOSSARY.eff)}
          </div>
          <p className="-mt-3 text-xs text-muted">N.º = puesto en la liga entre jugadores con al menos {league.minGames} PJ en el mismo período.</p>

          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <PeriodPicker value={period} onChange={setPeriod} />
              <span className="text-xs text-muted">{periodText}</span>
            </div>
            <Tabs tabs={TABS} value={tab} onChange={setTab} />
          </div>

          {tab === "resumen" && <SummaryTab rows={rows} agg={agg} team={team} onMore={() => setTab("estadisticas")} />}
          {tab === "estadisticas" && <StatsTab rows={rows} agg={agg} periodText={periodText} name={player.name} team={team} />}
          {tab === "evolucion" && <EvolutionTab rows={rows} name={player.name} periodText={periodText} team={team} />}
          {tab === "comparaciones" && <ComparisonsTab pid={pid} league={league} periodText={periodText} />}
        </>
      )}
    </div>
  );
}

const oppName = (r: DatedRow, team: (id: number) => { name: string }) =>
  team(r.game.homeTeamId === r.teamId ? r.game.awayTeamId : r.game.homeTeamId).name;
const result = (r: DatedRow) => {
  const g = r.game; const home = g.homeTeamId === r.teamId;
  if (g.homeScore === null || g.awayScore === null) return null;
  const own = home ? g.homeScore : g.awayScore, o = home ? g.awayScore : g.homeScore;
  return { win: own > o, text: `${own}-${o}` };
};

// ------------------------------------------------------------- Resumen

function SummaryTab({ rows, agg, team, onMore }: { rows: DatedRow[]; agg: Aggregate; team: (id: number) => { name: string }; onMore: () => void }) {
  const colors = useThemeColors();
  const last = [...rows].slice(-5).reverse();
  const recent = aggregate(rows.slice(-5));
  const keys: CountKey[] = ["pts", "reb", "ast", "eff"];
  const pts = rows.map((r) => r.pts);
  const roll = rollingMean(pts, 3);
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="xl:col-span-2" icon={ListOrdered} title="Últimos partidos" actions={<button className="btn btn-sm" onClick={onMore}>Ver todos</button>}>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wide text-muted">
              <th className="pb-2 text-left font-semibold">Partido</th>
              {["MIN", "PTS", "REB", "AST", "VAL"].map((h) => <th key={h} className="hidden pb-2 text-right font-semibold sm:table-cell">{h}</th>)}
            </tr></thead>
            <tbody className="num">
              {last.map((r) => {
                const res = result(r);
                return (
                  <tr key={r.gameId} className="border-t border-line">
                    <td className="py-2.5">
                      <Link to={`/partidos/${r.gameId}`} className="group flex items-center gap-2.5">
                        {res && <span className={`grid h-6 w-6 place-items-center rounded-md text-[11px] font-bold ${res.win ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{res.win ? "G" : "P"}</span>}
                        <span className="min-w-0">
                          <span className="block truncate font-medium group-hover:text-accent-text">{r.game.homeTeamId === r.teamId ? "vs" : "@"} {oppName(r, team)}</span>
                          <span className="block text-[11px] text-muted">{fdate(r.date)}{res ? ` · ${res.text}` : ""}</span>
                          <span className="mt-1 block text-xs text-ink-2 sm:hidden">
                            <b className="text-ink">{r.pts ?? "s/d"} PTS</b> · {r.reb ?? "s/d"} REB · {r.ast ?? "s/d"} AST · {r.eff ?? "s/d"} VAL · {mmss(r.minutes_sec)} MIN
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="hidden text-right text-ink-2 sm:table-cell">{mmss(r.minutes_sec)}</td>
                    <td className="hidden text-right font-semibold sm:table-cell">{r.pts ?? "s/d"}</td>
                    <td className="hidden text-right sm:table-cell">{r.reb ?? "s/d"}</td>
                    <td className="hidden text-right sm:table-cell">{r.ast ?? "s/d"}</td>
                    <td className="hidden text-right sm:table-cell">{r.eff ?? "s/d"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card icon={Target} title="Tiro" subtitle="Convertidos / intentados en el período">
        <div className="space-y-4">
          <PctBar label="Tiros de campo" value={agg.pct.fg_pct.value} made={agg.pct.fg_pct.made} att={agg.pct.fg_pct.att} hint={GLOSSARY.fg} />
          <PctBar label="Dobles" value={agg.pct.fg2_pct.value} made={agg.pct.fg2_pct.made} att={agg.pct.fg2_pct.att} />
          <PctBar label="Triples" value={agg.pct.fg3_pct.value} made={agg.pct.fg3_pct.made} att={agg.pct.fg3_pct.att} hint={GLOSSARY.fg3} />
          <PctBar label="Libres" value={agg.pct.ft_pct.value} made={agg.pct.ft_pct.made} att={agg.pct.ft_pct.att} hint={GLOSSARY.ft} />
          <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
            <div><div className="flex items-center gap-1 text-xs text-ink-2">eFG% <InfoTip text={GLOSSARY.efg} /></div><div className="num text-lg font-bold">{pct(agg.pct.efg_pct.value)}</div></div>
            <div><div className="flex items-center gap-1 text-xs text-ink-2">TS% <InfoTip text={GLOSSARY.ts} /></div><div className="num text-lg font-bold">{pct(agg.pct.ts_pct.value)}</div></div>
          </div>
        </div>
      </Card>

      <ChartCard className="xl:col-span-2" title="Puntos por partido" filename="puntos-por-partido"
        subtitle="Cada partido del período · línea punteada: media móvil de 3 partidos"
        legend={[{ name: "Puntos", color: colors.series[0] }, { name: "Media móvil (3)", color: colors.series[1] }]}
        csv={{ headers: ["fecha", "rival", "puntos", "media_movil_3"], rows: rows.map((r, i) => [r.date, oppName(r, team), r.pts, roll[i]]) }}>
        <LinesChart height={230} data={rows.map((r, i) => ({ x: `${fdate(r.date).slice(0, 5)}`, v: r.pts, m: roll[i] }))} x="x"
          series={[{ key: "v", name: "Puntos" }, { key: "m", name: "Media móvil (3)" }]} colors={[colors.series[0], colors.series[1]]} dashedKeys={["m"]} />
      </ChartCard>

      <Card icon={Activity} title="Forma reciente" subtitle={`Últimos ${Math.min(5, rows.length)} PJ frente al período completo (${agg.games} PJ)`}>
        <ul className="space-y-3">
          {keys.map((k) => {
            const d = diff(agg.stats[k].perGame, recent.stats[k].perGame);
            const up = (d.abs ?? 0) > 0.05, down = (d.abs ?? 0) < -0.05;
            return (
              <li key={k} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-2">{COUNT_LABELS[k].long}</span>
                <span className="num flex items-baseline gap-2">
                  <span className="text-muted">{f1(agg.stats[k].perGame)}</span><span className="text-muted">→</span>
                  <span className="font-semibold">{f1(recent.stats[k].perGame)}</span>
                  <span className={`w-12 text-right text-xs font-semibold ${up ? "text-good" : down ? "text-bad" : "text-muted"}`}>{signed(d.abs)}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {rows.length < 5 && <p className="mt-3 text-xs text-muted">Pocos partidos: la comparación es poco representativa.</p>}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------- Estadísticas

function StatsTab({ rows, agg, periodText, name, team }: { rows: DatedRow[]; agg: Aggregate; periodText: string; name: string; team: (id: number) => { name: string } }) {
  return (
    <div className="space-y-5">
      <Card icon={BarChart3} title="Promedios, totales y por 40 minutos" subtitle={periodText}>
        <SummaryTable agg={agg} />
      </Card>
      <Card icon={ListOrdered} title="Partido a partido" subtitle="Valores tal como figuran en la planilla oficial. s/d = sin dato en la fuente.">
        <DataTable rows={[...rows].reverse()} rowKey={(r) => r.gameId} dense csvName={`${name}-partidos.csv`.replace(/[^\w.-]+/g, "_")} maxHeight={560}
          columns={[
            { key: "date", label: "Fecha", align: "left", sticky: true, value: (r) => r.date, render: (r) => <Link className="link font-medium" to={`/partidos/${r.gameId}`}>{fdate(r.date)}</Link> },
            { key: "opp", label: "Rival", align: "left", value: (r) => `${r.game.homeTeamId === r.teamId ? "vs" : "@"} ${oppName(r, team)}` },
            { key: "res", label: "Res.", align: "left", value: (r) => { const x = result(r); return x ? `${x.win ? "G" : "P"} ${x.text}` : null; },
              render: (r) => { const x = result(r); return x ? <span className={x.win ? "text-good" : "text-bad"}>{x.win ? "G" : "P"} <span className="text-ink-2">{x.text}</span></span> : "—"; } },
            { key: "tit", label: "Tit.", title: "Titular", value: (r) => (r.starter === null ? null : r.starter ? "Sí" : "No") },
            { key: "min", label: "MIN", value: (r) => r.minutes_sec, render: (r) => mmss(r.minutes_sec), highlight: "max" },
            { key: "pts", label: "PTS", value: (r) => r.pts, highlight: "max" },
            { key: "t2", label: "T2", title: "Dobles C/I", value: (r) => r.fg2m, render: (r) => (r.fg2m === null ? "s/d" : `${r.fg2m}/${r.fg2a}`) },
            { key: "t3", label: "T3", title: "Triples C/I", value: (r) => r.fg3m, render: (r) => (r.fg3m === null ? "s/d" : `${r.fg3m}/${r.fg3a}`) },
            { key: "tl", label: "TL", title: "Libres C/I", value: (r) => r.ftm, render: (r) => (r.ftm === null ? "s/d" : `${r.ftm}/${r.fta}`) },
            { key: "tc", label: "TC", title: "Tiros de campo C/I", value: (r) => fgm(r), render: (r) => (fgm(r) === null ? "s/d" : `${fgm(r)}/${fga(r)}`) },
            ...(["oreb", "dreb", "reb", "ast", "stl", "tov", "blk", "pf", "pfd", "plus_minus", "eff"] as CountKey[]).map((k) => ({
              key: k, label: COUNT_LABELS[k].short, title: COUNT_LABELS[k].long, value: (r: DatedRow) => r[k],
              highlight: (["tov", "pf", "plus_minus"].includes(k) ? undefined : "max") as "max" | undefined,
            })),
          ]} />
      </Card>
    </div>
  );
}

export function SummaryTable({ agg }: { agg: Aggregate }) {
  const keys = COUNT_KEYS.filter((k) => !["fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta"].includes(k));
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="tabular w-full min-w-[520px] text-sm">
        <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
          <th className="py-2 text-left font-semibold">Estadística</th><th className="text-right font-semibold">Promedio</th><th className="text-right font-semibold">Total</th>
          <th className="text-right font-semibold" title={GLOSSARY.per40}>Por 40'</th><th className="text-right font-semibold" title="Partidos con el dato">PJ con dato</th>
        </tr></thead>
        <tbody>
          <tr className="border-b border-line"><td className="py-2">Minutos</td><td className="text-right font-semibold">{f1(agg.minutesPerGame)}</td>
            <td className="text-right">{f0(agg.minutesTotal)}</td><td className="text-right text-muted">—</td><td className="text-right text-ink-2">{agg.gamesWithMinutes} / {agg.games}</td></tr>
          {keys.map((k) => {
            const s = agg.stats[k];
            return (
              <tr key={k} className="border-b border-line last:border-0">
                <td className="py-2">{COUNT_LABELS[k].long}</td>
                <td className="text-right font-semibold">{f1(s.perGame)}</td><td className="text-right">{f0(s.total)}</td>
                <td className="text-right">{f1(s.per40)}</td>
                <td className={`text-right ${s.n < agg.games ? "font-semibold text-warn" : "text-ink-2"}`}>{s.n} / {agg.games}</td>
              </tr>
            );
          })}
          {(["fg_pct", "fg2_pct", "fg3_pct", "ft_pct", "efg_pct", "ts_pct"] as const).map((k) => (
            <tr key={k} className="border-b border-line last:border-0">
              <td className="py-2">{PCT_LABELS[k].long}</td>
              <td className="text-right font-semibold">{pct(agg.pct[k].value)}</td>
              <td className="text-right text-ink-2">{["efg_pct", "ts_pct"].includes(k) ? "—" : `${agg.pct[k].made}/${agg.pct[k].att}`}</td>
              <td className="text-right text-muted">—</td><td className="text-right text-ink-2">{agg.pct[k].n} / {agg.games}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------- Evolución

function EvolutionTab({ rows, name, periodText, team }: { rows: DatedRow[]; name: string; periodText: string; team: (id: number) => { name: string } }) {
  const colors = useThemeColors();
  const [chartKey, setChartKey] = useState<ChartKey>("pts");
  const [win, setWin] = useState("3");
  const [split, setSplit] = useState("");
  const w = Number(win);
  const values = rows.map((r) => chartValue(r, chartKey));
  const rolling = w > 1 ? rollingMean(values, w) : [];
  const chartData = rows.map((r, i) => ({ x: `${fdate(r.date).slice(0, 5)} ${oppName(r, team)}`, value: values[i], rolling: w > 1 ? rolling[i] : null, date: r.date }));
  const splitRef = split ? chartData.find((d) => d.date >= split)?.x : undefined;
  const before = split ? aggregate(rows.filter((r) => r.date < split)) : null;
  const after = split ? aggregate(rows.filter((r) => r.date >= split)) : null;
  return (
    <div className="space-y-5">
      <ChartCard title={`${name}: ${chartLabel(chartKey).toLowerCase()} por partido`} filename={`${name}-${chartKey}`.replace(/[^\w-]+/g, "_")}
        subtitle={`${periodText} · Unidad: ${chartLabel(chartKey).toLowerCase()} por partido${w > 1 ? ` · punteada: media móvil de ${w}` : ""}`}
        legend={[{ name: chartLabel(chartKey), color: colors.series[0] }, ...(w > 1 ? [{ name: `Media móvil (${w})`, color: colors.series[1] }] : [])]}
        csv={{ headers: ["fecha", "rival", chartLabel(chartKey), `media_movil_${w}`], rows: rows.map((r, i) => [r.date, oppName(r, team), values[i], w > 1 ? rolling[i] : null]) }}
        note={values.some((v) => v === null) ? "Hay partidos sin este dato: aparecen como huecos y la media móvil no se calcula en esas ventanas." : undefined}
        controls={<>
          <Field label="Estadística">
            <select className="input" value={chartKey} onChange={(e) => setChartKey(e.target.value as ChartKey)}>
              <option value="minutes">Minutos</option>
              {COUNT_KEYS.map((k) => <option key={k} value={k}>{COUNT_LABELS[k].long}</option>)}
            </select>
          </Field>
          <Field label="Media móvil">
            <Segmented size="sm" ariaLabel="Media móvil" value={win} onChange={setWin}
              options={[{ value: "1", label: "No" }, { value: "3", label: "3 PJ" }, { value: "5", label: "5 PJ" }, { value: "10", label: "10 PJ" }]} />
          </Field>
          <Field label="Corte antes/después" hint="Elegí una fecha para comparar el rendimiento antes y después (por ejemplo, un cambio de entrenador o una lesión).">
            <input className="input" type="date" value={split} onChange={(e) => setSplit(e.target.value)} />
          </Field>
        </>}>
        <LinesChart data={chartData} x="x" height={320} colors={[colors.series[0], colors.series[1]]} dashedKeys={["rolling"]}
          series={[{ key: "value", name: chartLabel(chartKey) }, ...(w > 1 ? [{ key: "rolling", name: `Media móvil (${w})` }] : [])]}
          refX={splitRef} refLabel={split ? `desde ${fdate(split)}` : undefined} />
      </ChartCard>
      {before && after ? <BeforeAfter before={before} after={after} split={split} />
        : <p className="text-sm text-muted">Tip: elegí una fecha en "Corte antes/después" para comparar los dos tramos.</p>}
    </div>
  );
}

export function BeforeAfter({ before, after, split }: { before: Aggregate; after: Aggregate; split: string }) {
  const keys: CountKey[] = ["pts", "reb", "ast", "stl", "blk", "tov", "eff"];
  const row = (label: string, a: number | null, b: number | null, isPct = false) => {
    const d = diff(a, b, isPct);
    const good = (d.abs ?? 0) > 0;
    return (
      <tr key={label} className="border-b border-line last:border-0">
        <td className="py-2">{label}</td>
        <td className="text-right">{isPct ? pct(a) : f1(a)}</td>
        <td className="text-right font-semibold">{isPct ? pct(b) : f1(b)}</td>
        <td className={`text-right font-semibold ${d.abs === null || Math.abs(d.abs) < 0.05 ? "text-muted" : good ? "text-good" : "text-bad"}`}>
          {d.abs === null ? "s/d" : `${signed(d.abs)}${isPct ? " pp" : ""}`}
        </td>
        <td className="text-right text-ink-2">{d.rel === null ? "—" : `${signed(d.rel)}%`}</td>
      </tr>
    );
  };
  return (
    <Card title={`Antes y después del ${fdate(split)}`} subtitle="Promedios por partido. La diferencia % sólo se muestra cuando es interpretable. pp = puntos porcentuales.">
      {(before.games < 3 || after.games < 3) && <div className="mb-3"><Notice>Uno de los tramos tiene menos de 3 partidos: la comparación es poco representativa.</Notice></div>}
      <div className="scrollbar-thin overflow-x-auto">
        <table className="tabular w-full min-w-[480px] text-sm">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
            <th className="py-2 text-left font-semibold">Estadística</th><th className="text-right font-semibold">Antes ({before.games} PJ)</th>
            <th className="text-right font-semibold">Después ({after.games} PJ)</th><th className="text-right font-semibold">Dif.</th><th className="text-right font-semibold">Dif. %</th>
          </tr></thead>
          <tbody>
            {row("Minutos", before.minutesPerGame, after.minutesPerGame)}
            {keys.map((k) => row(COUNT_LABELS[k].long, before.stats[k].perGame, after.stats[k].perGame))}
            {(["fg_pct", "fg3_pct", "ft_pct", "ts_pct"] as const).map((k) => row(PCT_LABELS[k].long, before.pct[k].value, after.pct[k].value, true))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------- Comparaciones

const VS_LEAGUE = ["pts", "reb", "ast", "stl", "blk", "eff", "min", "fg3_pct", "ts_pct", "ft_pct"];

function ComparisonsTab({ pid, league, periodText }: {
  pid: number; league: { summaries: ReturnType<typeof playerSummaries>; minGames: number }; periodText: string;
}) {
  const navigate = useNavigate();
  const me = league.summaries.find((s) => s.playerId === pid);
  const options = league.summaries.filter((s) => s.agg.games > 0 && s.playerId !== pid).map((s) => ({ id: s.playerId, label: s.name }));
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="xl:col-span-2" icon={Trophy} title="Frente al resto de la liga"
        subtitle={`${periodText} · jugadores con al menos ${league.minGames} PJ (y el mínimo de intentos en los porcentajes)`}>
        <div className="space-y-3.5">
          {VS_LEAGUE.map((id) => {
            const m = metricById(id);
            const list = ranking(league.summaries, m, "perGame", league.minGames);
            const i = list.findIndex((s) => s.playerId === pid);
            const vals = list.map((s) => metricValue(s, m, "perGame") as number);
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            const mine = me ? metricValue(me, m, "perGame") : null;
            const pctile = i >= 0 && list.length > 1 ? (list.length - 1 - i) / (list.length - 1) : null;
            const fmt = (v: number | null) => (m.kind === "pct" ? pct(v) : f1(v));
            return (
              <div key={id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                <span className="flex items-center gap-1 text-sm text-ink-2">{m.label}{m.hint && <InfoTip text={m.hint} />}</span>
                <span className="num text-right text-sm sm:order-3">
                  <span className="font-semibold">{fmt(mine)}</span>
                  <span className="ml-2 text-xs text-muted">liga {fmt(avg)}</span>
                </span>
                <div className="col-span-2 sm:order-2 sm:col-span-1">
                  {pctile !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, pctile * 100)}%` }} />
                      </div>
                      <span className="num w-20 text-right text-xs text-ink-2">N.º {i + 1} de {list.length}</span>
                    </div>
                  ) : <span className="text-xs text-muted">No califica{m.attLabel ? ` (mín. ${m.attLabel})` : ` (mín. ${league.minGames} PJ)`}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-muted">La barra indica qué parte de la liga queda por debajo: llena = el mejor de la categoría.</p>
      </Card>
      <Card icon={ArrowLeftRight} title="Comparar con otro jugador" subtitle="Abre el comparador con ambos jugadores y el mismo período disponible.">
        <SearchSelect options={options} placeholder="Buscar jugador…" onPick={(other) => navigate(`/comparar?ids=${pid},${other}`)} />
        <div className="mt-4 space-y-2">
          <div className="eyebrow">Sugeridos: mismo rango de puntos</div>
          {me && league.summaries
            .filter((s) => s.playerId !== pid && s.agg.games >= league.minGames && s.agg.stats.pts.perGame !== null)
            .sort((a, b) => Math.abs((a.agg.stats.pts.perGame as number) - (me.agg.stats.pts.perGame ?? 0)) - Math.abs((b.agg.stats.pts.perGame as number) - (me.agg.stats.pts.perGame ?? 0)))
            .slice(0, 4).map((s) => (
              <Link key={s.playerId} to={`/comparar?ids=${pid},${s.playerId}`} className="card-hover flex items-center gap-3 rounded-xl border border-line p-2.5">
                <Avatar name={s.name} size={30} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                <span className="num text-xs text-muted">{f1(s.agg.stats.pts.perGame)} PTS</span>
              </Link>
            ))}
        </div>
      </Card>
    </div>
  );
}

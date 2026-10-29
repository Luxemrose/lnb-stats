import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChartCard, LinesChart, useThemeColors } from "../components/charts";
import { PeriodPicker, defaultPeriod, describePeriod, toPeriod } from "../components/pickers";
import { Card, DataTable, EmptyState, Field, Notice, PageHeader, StatTile, TeamLink } from "../components/ui";
import { useSeason, type DatedRow } from "../lib/data";
import { playerRows } from "../lib/derive";
import { COUNT_LABELS, MAIN_KEYS, PCT_LABELS, f0, f1, fdate, mmss, pct, signed } from "../lib/format";
import { aggregate, COUNT_KEYS, diff, fga, fgm, PCT_KEYS, rollingMean, type Aggregate, type CountKey } from "../lib/stats";

export type ChartKey = CountKey | "minutes";
export const chartValue = (r: DatedRow, k: ChartKey) => (k === "minutes" ? (r.minutes_sec === null ? null : r.minutes_sec / 60) : r[k]);
export const chartLabel = (k: ChartKey) => (k === "minutes" ? "Minutos" : COUNT_LABELS[k].long);

export default function PlayerDetail() {
  const { id } = useParams();
  const sd = useSeason();
  const pid = Number(id);
  const colors = useThemeColors();
  const [period, setPeriod] = useState(defaultPeriod);
  const [chartKey, setChartKey] = useState<ChartKey>("pts");
  const [win, setWin] = useState(3);
  const [split, setSplit] = useState("");

  const rows = useMemo(() => (sd ? playerRows(sd, pid, toPeriod(period)) : []), [sd, pid, period]);
  const agg = useMemo(() => aggregate(rows, rows.map((r) => r.date)), [rows]);
  if (!sd) return null;
  const player = sd.db.playersById.get(pid);
  if (!player) return <EmptyState title="Jugador no encontrado" />;
  const rosters = sd.rosters.filter((r) => r.playerId === pid).sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
  const allRows = sd.rowsForPlayer(pid);
  const dnp = allRows.filter((r) => r.dnp).length;
  const team = (tid: number) => sd.db.teamsById.get(tid)!;
  const opp = (r: DatedRow) => team(r.game.homeTeamId === r.teamId ? r.game.awayTeamId : r.game.homeTeamId).name;
  const periodText = describePeriod(period, sd.season.code);

  const values = rows.map((r) => chartValue(r, chartKey));
  const rolling = win > 1 ? rollingMean(values, win) : [];
  const chartData = rows.map((r, i) => ({
    x: `${fdate(r.date).slice(0, 5)} ${opp(r)}`, value: values[i], rolling: win > 1 ? rolling[i] : null, date: r.date,
  }));
  const splitRef = split ? chartData.find((d) => d.date >= split)?.x : undefined;
  const before = split ? aggregate(rows.filter((r) => r.date < split)) : null;
  const after = split ? aggregate(rows.filter((r) => r.date >= split)) : null;

  return (
    <div className="space-y-5">
      <PageHeader title={player.name}
        subtitle={<span className="flex flex-wrap gap-x-3">
          {rosters.map((r) => <span key={r.teamId}><TeamLink id={r.teamId} name={team(r.teamId).name} />{r.position ? ` · ${r.position}` : ""}{r.jersey ? ` · #${r.jersey}` : ""}</span>)}
          {!rosters.some((r) => r.position) && <span>Posición: s/d</span>}
          <span>{agg.games} PJ en el período{dnp ? ` · ${dnp} sin jugar en la temporada` : ""}</span>
        </span>}
        actions={<Link className="btn" to={`/comparar?ids=${pid}`}>Comparar</Link>} />

      {player.identity === "name" && (
        <Notice>La fuente no aportó un identificador oficial para este jugador: se lo reconoce por su nombre. Si aparece con distintas grafías puede figurar duplicado.</Notice>
      )}
      <div className="card p-3"><PeriodPicker value={period} onChange={setPeriod} /></div>

      {agg.games === 0 ? <EmptyState title="Sin partidos disputados en el período elegido" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Minutos" value={f1(agg.minutesPerGame)} sub="por partido" />
            {MAIN_KEYS.slice(0, 5).map((k) => <StatTile key={k} label={COUNT_LABELS[k].long} value={f1(agg.stats[k].perGame)}
              sub={agg.stats[k].n < agg.games ? `por partido · ${agg.stats[k].n} de ${agg.games} PJ con dato` : "por partido"} />)}
          </div>
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
            {PCT_KEYS.map((k) => <StatTile key={k} label={PCT_LABELS[k].short} value={pct(agg.pct[k].value)}
              hint={PCT_LABELS[k].long}
              sub={["fg_pct", "fg2_pct", "fg3_pct", "ft_pct"].includes(k) ? `${f0(agg.pct[k].made)}/${f0(agg.pct[k].att)}` : PCT_LABELS[k].long} />)}
          </div>

          <ChartCard title={`${player.name}: ${chartLabel(chartKey).toLowerCase()} por partido`}
            subtitle={`${periodText} · Unidad: ${chartKey === "minutes" ? "minutos" : chartLabel(chartKey).toLowerCase()} por partido${win > 1 ? ` · línea punteada: media móvil de ${win} partidos` : ""}`}
            legend={[{ name: chartLabel(chartKey), color: colors.series[0] }, ...(win > 1 ? [{ name: `Media móvil (${win})`, color: colors.series[1] }] : [])]}
            filename={`${player.name}-${chartKey}`.replace(/[^\w-]+/g, "_")}
            csv={{ headers: ["fecha", "rival", chartLabel(chartKey), `media_movil_${win}`], rows: rows.map((r, i) => [r.date, opp(r), values[i], win > 1 ? rolling[i] : null]) }}
            note={values.some((v) => v === null) ? "Hay partidos sin este dato: aparecen como huecos y la media móvil no se calcula en esas ventanas." : undefined}>
            <div className="mb-2 flex flex-wrap gap-3">
              <Field label="Estadística">
                <select className="input" value={chartKey} onChange={(e) => setChartKey(e.target.value as ChartKey)}>
                  <option value="minutes">Minutos</option>
                  {COUNT_KEYS.map((k) => <option key={k} value={k}>{COUNT_LABELS[k].long}</option>)}
                </select>
              </Field>
              <Field label="Media móvil">
                <select className="input" value={win} onChange={(e) => setWin(Number(e.target.value))}>
                  <option value={1}>Sin media móvil</option>
                  {[3, 5, 10].map((n) => <option key={n} value={n}>{n} partidos</option>)}
                </select>
              </Field>
              <Field label="Corte antes/después">
                <input className="input" type="date" value={split} onChange={(e) => setSplit(e.target.value)} />
              </Field>
            </div>
            <LinesChart data={chartData} x="x" colors={[colors.series[0], colors.series[1]]} dashedKeys={["rolling"]}
              series={[{ key: "value", name: chartLabel(chartKey) }, ...(win > 1 ? [{ key: "rolling", name: `Media móvil (${win})` }] : [])]}
              refX={splitRef} refLabel={split ? `desde ${fdate(split)}` : undefined} />
          </ChartCard>

          {before && after && <BeforeAfter before={before} after={after} split={split} />}

          <Card title="Resumen del período" subtitle={periodText}>
            <SummaryTable agg={agg} />
          </Card>

          <Card title="Partido a partido" subtitle="Valores tal como figuran en la planilla. s/d = sin dato en la fuente.">
            <DataTable rows={[...rows].reverse()} rowKey={(r) => r.gameId} dense csvName={`${player.name}-partidos.csv`.replace(/[^\w.-]+/g, "_")}
              columns={[
                { key: "date", label: "Fecha", align: "left", value: (r) => r.date, render: (r) => <Link className="link" to={`/partidos/${r.gameId}`}>{fdate(r.date)}</Link> },
                { key: "opp", label: "Rival", align: "left", value: (r) => `${r.game.homeTeamId === r.teamId ? "vs" : "@"} ${opp(r)}` },
                { key: "res", label: "Res.", align: "left", value: (r) => {
                  const g = r.game; const home = g.homeTeamId === r.teamId;
                  if (g.homeScore === null || g.awayScore === null) return null;
                  const own = home ? g.homeScore : g.awayScore, o = home ? g.awayScore : g.homeScore;
                  return `${own > o ? "G" : "P"} ${own}-${o}`;
                } },
                { key: "tit", label: "Tit.", title: "Titular", value: (r) => (r.starter === null ? null : r.starter ? "Sí" : "No") },
                { key: "min", label: "MIN", value: (r) => r.minutes_sec, render: (r) => mmss(r.minutes_sec) },
                { key: "pts", label: "PTS", value: (r) => r.pts },
                { key: "t2", label: "T2", value: (r) => r.fg2m, render: (r) => (r.fg2m === null ? "s/d" : `${r.fg2m}/${r.fg2a}`) },
                { key: "t3", label: "T3", value: (r) => r.fg3m, render: (r) => (r.fg3m === null ? "s/d" : `${r.fg3m}/${r.fg3a}`) },
                { key: "tl", label: "TL", value: (r) => r.ftm, render: (r) => (r.ftm === null ? "s/d" : `${r.ftm}/${r.fta}`) },
                { key: "tc", label: "TC", title: "Tiros de campo", value: (r) => fgm(r), render: (r) => (fgm(r) === null ? "s/d" : `${fgm(r)}/${fga(r)}`) },
                ...(["oreb", "dreb", "reb", "ast", "stl", "tov", "blk", "pf", "pfd", "plus_minus", "eff"] as CountKey[]).map((k) => ({
                  key: k, label: COUNT_LABELS[k].short, title: COUNT_LABELS[k].long, value: (r: DatedRow) => r[k],
                })),
              ]} />
          </Card>
        </>
      )}
    </div>
  );
}

export function SummaryTable({ agg }: { agg: Aggregate }) {
  const rows = COUNT_KEYS.filter((k) => !["fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta"].includes(k));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular">
        <thead><tr className="border-b border-line text-xs text-ink-2">
          <th className="py-1.5 text-left">Estadística</th><th className="text-right">Promedio</th><th className="text-right">Total</th>
          <th className="text-right" title="Por 40 minutos jugados">Por 40'</th><th className="text-right" title="Partidos con el dato">PJ con dato</th>
        </tr></thead>
        <tbody>
          <tr className="border-b border-line"><td className="py-1">Minutos</td><td className="text-right">{f1(agg.minutesPerGame)}</td>
            <td className="text-right">{f0(agg.minutesTotal)}</td><td className="text-right">—</td><td className="text-right">{agg.gamesWithMinutes} / {agg.games}</td></tr>
          {rows.map((k) => {
            const s = agg.stats[k];
            return (
              <tr key={k} className="border-b border-line last:border-0">
                <td className="py-1">{COUNT_LABELS[k].long}</td>
                <td className="text-right">{f1(s.perGame)}</td><td className="text-right">{f0(s.total)}</td>
                <td className="text-right">{f1(s.per40)}</td>
                <td className={`text-right ${s.n < agg.games ? "font-semibold text-warn-ink" : ""}`}>{s.n} / {agg.games}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BeforeAfter({ before, after, split }: { before: Aggregate; after: Aggregate; split: string }) {
  const keys: CountKey[] = ["pts", "reb", "ast", "stl", "blk", "tov", "eff"];
  return (
    <Card title={`Antes y después del ${fdate(split)}`} subtitle="Promedios por partido. La diferencia relativa (%) sólo se muestra cuando es interpretable.">
      {(before.games < 3 || after.games < 3) && <div className="mb-2"><Notice>Uno de los tramos tiene menos de 3 partidos: la comparación es poco representativa.</Notice></div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular">
          <thead><tr className="border-b border-line text-xs text-ink-2">
            <th className="py-1.5 text-left">Estadística</th><th className="text-right">Antes ({before.games} PJ)</th>
            <th className="text-right">Después ({after.games} PJ)</th><th className="text-right">Dif.</th><th className="text-right">Dif. %</th>
          </tr></thead>
          <tbody>
            <tr className="border-b border-line"><td className="py-1">Minutos</td><td className="text-right">{f1(before.minutesPerGame)}</td>
              <td className="text-right">{f1(after.minutesPerGame)}</td><td className="text-right">{signed(diff(before.minutesPerGame, after.minutesPerGame).abs)}</td>
              <td className="text-right">{signed(diff(before.minutesPerGame, after.minutesPerGame).rel)}{diff(before.minutesPerGame, after.minutesPerGame).rel !== null ? "%" : ""}</td></tr>
            {keys.map((k) => {
              const d = diff(before.stats[k].perGame, after.stats[k].perGame);
              return (
                <tr key={k} className="border-b border-line">
                  <td className="py-1">{COUNT_LABELS[k].long}</td><td className="text-right">{f1(before.stats[k].perGame)}</td>
                  <td className="text-right">{f1(after.stats[k].perGame)}</td><td className="text-right">{signed(d.abs)}</td>
                  <td className="text-right">{d.rel === null ? "—" : `${signed(d.rel)}%`}</td>
                </tr>
              );
            })}
            {(["fg_pct", "fg3_pct", "ft_pct", "ts_pct"] as const).map((k) => {
              const d = diff(before.pct[k].value, after.pct[k].value, true);
              return (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="py-1">{PCT_LABELS[k].long}</td><td className="text-right">{pct(before.pct[k].value)}</td>
                  <td className="text-right">{pct(after.pct[k].value)}</td><td className="text-right">{d.abs === null ? "s/d" : `${signed(d.abs)} pp`}</td>
                  <td className="text-right">—</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">pp = puntos porcentuales (diferencia entre dos porcentajes).</p>
    </Card>
  );
}

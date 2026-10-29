import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChartCard, LinesChart, useThemeColors } from "../components/charts";
import { PeriodPicker, defaultPeriod, describePeriod, toPeriod } from "../components/pickers";
import { Card, DataTable, EmptyState, Origin, PageHeader, PlayerLink, StatTile } from "../components/ui";
import { useSeason, type SeasonData } from "../lib/data";
import { playerSummaries, teamAggregate, teamGames, type TeamGameLine } from "../lib/derive";
import { COUNT_LABELS, PCT_LABELS, f1, fdate, pct, signed } from "../lib/format";
import { filterPeriod, ratio, type Aggregate, type CountKey, type Period } from "../lib/stats";
import { statColumns } from "./Players";

export interface TeamPeriodData {
  lines: TeamGameLine[]; done: TeamGameLine[]; own: Aggregate; opp: Aggregate;
  wins: number; losses: number; pf: number; pa: number; origin: "oficial" | "calculado" | "mixto" | null;
}

export function teamPeriodData(sd: SeasonData, teamId: number, period: Period): TeamPeriodData {
  const all = teamGames(sd, teamId);
  const done = filterPeriod(all.filter((l) => l.win !== null), period);
  const ids = new Set(done.map((l) => l.game.id));
  const lines = all.filter((l) => l.win === null || ids.has(l.game.id));
  const oppLines = done.map((l) => teamGames(sd, l.opponentId).find((o) => o.game.id === l.game.id)!).filter(Boolean);
  const origins = new Set(done.filter((l) => l.stats).map((l) => l.statsOrigin));
  return {
    lines, done, own: teamAggregate(done), opp: teamAggregate(oppLines),
    wins: done.filter((l) => l.win).length, losses: done.filter((l) => l.win === false).length,
    pf: done.reduce((a, l) => a + (l.own ?? 0), 0), pa: done.reduce((a, l) => a + (l.opp ?? 0), 0),
    origin: origins.size === 0 ? null : origins.size > 1 ? "mixto" : ([...origins][0] as "oficial" | "calculado"),
  };
}

const TEAM_KEYS: CountKey[] = ["pts", "reb", "oreb", "dreb", "ast", "stl", "tov", "blk", "pf", "eff"];

export default function TeamDetail() {
  const { id } = useParams();
  const tid = Number(id);
  const sd = useSeason();
  const colors = useThemeColors();
  const [period, setPeriod] = useState(defaultPeriod);
  const d = useMemo(() => (sd ? teamPeriodData(sd, tid, toPeriod(period)) : null), [sd, tid, period]);
  const roster = useMemo(() => (sd ? playerSummaries(sd, toPeriod(period)).filter((s) => s.teamIds.includes(tid)) : []), [sd, tid, period]);
  if (!sd || !d) return null;
  const team = sd.db.teamsById.get(tid);
  if (!team) return <EmptyState title="Equipo no encontrado" />;
  const tname = (i: number) => sd.db.teamsById.get(i)!.name;
  const n = d.done.length;
  const periodText = describePeriod(period, sd.season.code);
  let cum = 0;
  const chart = d.done.map((l) => {
    cum += (l.own as number) - (l.opp as number);
    return { x: `${fdate(l.date).slice(0, 5)} ${l.isHome ? "vs" : "@"} ${tname(l.opponentId)}`, pf: l.own, pa: l.opp, cum };
  });

  return (
    <div className="space-y-5">
      <PageHeader title={team.name} subtitle={`${periodText} · ${n} partidos finalizados`}
        actions={<Link className="btn" to={`/equipos/comparar?ids=${tid}`}>Comparar con otro equipo</Link>} />
      <div className="card p-3"><PeriodPicker value={period} onChange={setPeriod} /></div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Récord" value={`${d.wins}-${d.losses}`} sub={`${pct(ratio(d.wins, n))} de victorias`} />
        <StatTile label="Puntos a favor" value={f1(ratio(d.pf, n))} sub={`por partido · ${d.pf} totales`} />
        <StatTile label="Puntos en contra" value={f1(ratio(d.pa, n))} sub={`por partido · ${d.pa} totales`} />
        <StatTile label="Diferencia" value={signed(ratio(d.pf - d.pa, n))} sub={`por partido · ${signed(d.pf - d.pa, 0)} total`} />
        <StatTile label="Local" value={`${d.done.filter((l) => l.isHome && l.win).length}-${d.done.filter((l) => l.isHome && l.win === false).length}`} />
        <StatTile label="Visitante" value={`${d.done.filter((l) => !l.isHome && l.win).length}-${d.done.filter((l) => !l.isHome && l.win === false).length}`} />
      </div>

      {n > 0 && (
        <div className="grid gap-5 xl:grid-cols-2">
          <ChartCard title={`${team.name}: puntos por partido`} subtitle={`${periodText} · Unidad: puntos`}
            legend={[{ name: "Convertidos", color: colors.series[0] }, { name: "Recibidos", color: colors.series[1] }]}
            filename={`${team.slug}-puntos`} csv={{ headers: ["partido", "convertidos", "recibidos"], rows: chart.map((c) => [c.x, c.pf, c.pa]) }}>
            <LinesChart data={chart} x="x" colors={[colors.series[0], colors.series[1]]}
              series={[{ key: "pf", name: "Convertidos" }, { key: "pa", name: "Recibidos" }]} />
          </ChartCard>
          <ChartCard title={`${team.name}: diferencia de puntos acumulada`} subtitle={`${periodText} · Unidad: puntos (suma de diferencias)`}
            legend={[{ name: "Diferencia acumulada", color: colors.series[2] }]} filename={`${team.slug}-diferencia`}
            csv={{ headers: ["partido", "diferencia_acumulada"], rows: chart.map((c) => [c.x, c.cum]) }}>
            <LinesChart data={chart} x="x" colors={[colors.series[2]]} series={[{ key: "cum", name: "Diferencia acumulada" }]} />
          </ChartCard>
        </div>
      )}

      <Card title={<span className="flex items-center gap-2">Promedios ofensivos y defensivos {d.origin && <Origin kind={d.origin === "oficial" ? "oficial" : "calculado"} />}</span>}
        subtitle={d.origin === "oficial" ? "Totales de equipo publicados por la fuente." : "Sin totales oficiales de equipo: se suman las planillas individuales (si falta un dato de algún jugador, el total queda sin dato)."}>
        {d.own.games === 0 ? <p className="text-sm text-ink-2">No hay partidos con estadísticas colectivas en el período.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead><tr className="border-b border-line text-xs text-ink-2">
                <th className="py-1.5 text-left">Por partido</th><th className="text-right">{team.name}</th><th className="text-right">Rivales</th><th className="text-right">Dif.</th>
              </tr></thead>
              <tbody>
                {TEAM_KEYS.map((k) => (
                  <tr key={k} className="border-b border-line">
                    <td className="py-1">{COUNT_LABELS[k].long}</td><td className="text-right">{f1(d.own.stats[k].perGame)}</td>
                    <td className="text-right">{f1(d.opp.stats[k].perGame)}</td>
                    <td className="text-right">{d.own.stats[k].perGame === null || d.opp.stats[k].perGame === null ? "s/d" : signed((d.own.stats[k].perGame as number) - (d.opp.stats[k].perGame as number))}</td>
                  </tr>
                ))}
                {(["fg_pct", "fg2_pct", "fg3_pct", "ft_pct", "efg_pct", "ts_pct"] as const).map((k) => (
                  <tr key={k} className="border-b border-line last:border-0">
                    <td className="py-1">{PCT_LABELS[k].long}</td><td className="text-right">{pct(d.own.pct[k].value)}</td>
                    <td className="text-right">{pct(d.opp.pct[k].value)}</td>
                    <td className="text-right">{d.own.pct[k].value === null || d.opp.pct[k].value === null ? "s/d" : `${signed(((d.own.pct[k].value as number) - (d.opp.pct[k].value as number)) * 100)} pp`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Calculado con {d.own.games} partidos con estadísticas colectivas.</p>
          </div>
        )}
      </Card>

      <Card title="Resultados">
        <DataTable rows={[...d.lines].reverse()} rowKey={(l) => l.game.id} dense csvName={`${team.slug}-resultados.csv`}
          columns={[
            { key: "date", label: "Fecha", align: "left", value: (l) => l.date, render: (l) => <Link className="link" to={`/partidos/${l.game.id}`}>{fdate(l.date)}</Link> },
            { key: "lv", label: "L/V", align: "left", value: (l) => (l.isHome ? "Local" : "Visitante") },
            { key: "opp", label: "Rival", align: "left", value: (l) => tname(l.opponentId), render: (l) => <Link className="link" to={`/equipos/${l.opponentId}`}>{tname(l.opponentId)}</Link> },
            { key: "res", label: "Resultado", align: "left", value: (l) => (l.win === null ? "Pendiente" : `${l.win ? "G" : "P"} ${l.own}-${l.opp}`) },
            { key: "dif", label: "Dif.", value: (l) => (l.win === null ? null : (l.own as number) - (l.opp as number)), render: (l) => (l.win === null ? "—" : signed((l.own as number) - (l.opp as number), 0)) },
            { key: "det", label: "Detalle", align: "left", value: (l) => (l.game.detailLevel === "box_score" ? "Planilla" : l.game.detailLevel === "result_only" ? "Sólo resultado" : "Programado") },
          ]} />
      </Card>

      <Card title="Plantel en la temporada" subtitle="Jugadores que figuran en planillas o en el plantel publicado para este equipo. Promedios por partido en el período.">
        <DataTable rows={roster} rowKey={(s) => s.playerId} initialSort="pts" dense csvName={`${team.slug}-plantel.csv`}
          columns={[
            { key: "name", label: "Jugador", align: "left", sticky: true, value: (s) => s.name, render: (s) => <PlayerLink id={s.playerId} name={s.name} /> },
            { key: "pos", label: "Pos.", align: "left", value: (s) => s.position },
            { key: "pj", label: "PJ", value: (s) => s.agg.games },
            { key: "min", label: "MIN", value: (s) => s.agg.minutesPerGame, render: (s) => f1(s.agg.minutesPerGame) },
            ...statColumns("perGame"),
          ]} />
      </Card>
    </div>
  );
}

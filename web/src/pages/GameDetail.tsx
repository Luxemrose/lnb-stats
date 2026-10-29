import { Link, useParams } from "react-router-dom";
import { Card, DataTable, EmptyState, Notice, Origin, PageHeader, PlayerLink } from "../components/ui";
import { useSeason } from "../lib/data";
import { teamGames } from "../lib/derive";
import { COUNT_LABELS, fdate, fdatetime, mmss, pct } from "../lib/format";
import { fga, fgm, ratio, type CountKey } from "../lib/stats";
import type { PlayerGameRow, StatLine } from "../lib/types";

const KEYS: CountKey[] = ["oreb", "dreb", "reb", "ast", "stl", "tov", "blk", "blka", "pf", "pfd", "plus_minus", "eff"];
const pair = (m: number | null, a: number | null) => (m === null || a === null ? "s/d" : `${m}/${a}`);

export default function GameDetail() {
  const { id } = useParams();
  const sd = useSeason();
  if (!sd) return null;
  const g = sd.db.gamesById.get(Number(id));
  if (!g) return <EmptyState title="Partido no encontrado" />;
  const tname = (i: number) => sd.db.teamsById.get(i)!.name;
  const rows = sd.db.rowsByGame.get(g.id) ?? [];
  const hasScore = g.homeScore !== null && g.awayScore !== null;

  return (
    <div className="space-y-5">
      <PageHeader title={`${tname(g.homeTeamId)} vs ${tname(g.awayTeamId)}`}
        subtitle={<>{fdate(g.date)}{g.time ? ` · ${g.time}` : ""}{g.phase ? ` · ${g.phase}` : ""}{g.round ? ` · Fecha ${g.round}` : ""}{g.venue ? ` · ${g.venue}` : ""}</>} />
      <div className="card grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-5 text-center">
        <Link to={`/equipos/${g.homeTeamId}`} className="text-lg font-semibold hover:underline">{tname(g.homeTeamId)}<div className="text-xs font-normal text-muted">Local</div></Link>
        <div className="tabular text-4xl font-bold">{hasScore ? `${g.homeScore} - ${g.awayScore}` : "—"}</div>
        <Link to={`/equipos/${g.awayTeamId}`} className="text-lg font-semibold hover:underline">{tname(g.awayTeamId)}<div className="text-xs font-normal text-muted">Visitante</div></Link>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>Origen: {g.source}</span>
        {g.sourceUrl && <a className="link" href={g.sourceUrl} target="_blank" rel="noreferrer">Ver en la fuente oficial</a>}
        <span>Actualizado: {fdatetime(g.updatedAt)}{g.revision > 1 ? ` · revisión ${g.revision} (la fuente modificó datos)` : ""}</span>
      </div>
      {g.detailLevel !== "box_score" && (
        <Notice>{g.detailLevel === "result_only" ? "Para este partido sólo hay resultado: la fuente no aportó planilla individual." : "Partido sin resultado cargado."}</Notice>
      )}
      {[g.homeTeamId, g.awayTeamId].map((tid) => <BoxScore key={tid} teamId={tid} rows={rows.filter((r) => r.teamId === tid)} gameId={g.id} />)}
    </div>
  );

  function BoxScore({ teamId, rows, gameId }: { teamId: number; rows: PlayerGameRow[]; gameId: number }) {
    if (!rows.length || !sd) return null;
    const line = teamGames(sd, teamId).find((l) => l.game.id === gameId);
    const totals = line?.stats as StatLine | null;
    const ordered = [...rows].sort((a, b) => (b.starter ?? 0) - (a.starter ?? 0) || (b.minutes_sec ?? -1) - (a.minutes_sec ?? -1));
    return (
      <Card title={tname(teamId)} actions={line?.statsOrigin && <Origin kind={line.statsOrigin} />}
        subtitle={line?.statsOrigin === "calculado" ? "Totales = suma de las planillas individuales" : undefined}>
        <DataTable rows={ordered} rowKey={(r) => r.playerId} dense csvName={`planilla-${g!.date}-${tname(teamId)}.csv`.replace(/[^\w.-]+/g, "_")}
          columns={[
            { key: "name", label: "Jugador", align: "left", sticky: true, value: (r) => sd!.db.playersById.get(r.playerId)!.name,
              render: (r) => <span>{r.starter ? <span title="Titular" className="mr-1 text-muted">•</span> : null}<PlayerLink id={r.playerId} name={sd!.db.playersById.get(r.playerId)!.name} />{r.dnp ? <span className="ml-1 text-xs text-muted">(no jugó)</span> : null}</span> },
            { key: "min", label: "MIN", value: (r) => r.minutes_sec, render: (r) => mmss(r.minutes_sec) },
            { key: "pts", label: "PTS", value: (r) => r.pts },
            { key: "t2", label: "T2", value: (r) => r.fg2m, render: (r) => pair(r.fg2m, r.fg2a) },
            { key: "t3", label: "T3", value: (r) => r.fg3m, render: (r) => pair(r.fg3m, r.fg3a) },
            { key: "tl", label: "TL", value: (r) => r.ftm, render: (r) => pair(r.ftm, r.fta) },
            ...KEYS.map((k) => ({ key: k, label: COUNT_LABELS[k].short, title: COUNT_LABELS[k].long, value: (r: PlayerGameRow) => r[k] })),
          ]} />
        {totals && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm tabular sm:grid-cols-4 lg:grid-cols-8">
            <Tot label="Puntos" v={totals.pts} />
            <Tot label="TC" v={`${pair(fgm(totals), fga(totals))} · ${pct(fgm(totals) === null ? null : ratio(fgm(totals)!, fga(totals)!))}`} />
            <Tot label="T3" v={`${pair(totals.fg3m, totals.fg3a)} · ${pct(totals.fg3m === null ? null : ratio(totals.fg3m, totals.fg3a!))}`} />
            <Tot label="TL" v={`${pair(totals.ftm, totals.fta)} · ${pct(totals.ftm === null ? null : ratio(totals.ftm, totals.fta!))}`} />
            <Tot label="Rebotes" v={totals.reb} />
            <Tot label="Asistencias" v={totals.ast} />
            <Tot label="Pérdidas" v={totals.tov} />
            <Tot label="Robos" v={totals.stl} />
          </div>
        )}
      </Card>
    );
  }
}

function Tot({ label, v }: { label: string; v: number | string | null }) {
  return <div className="rounded-md bg-surface-2 px-2 py-1.5"><div className="text-[11px] text-muted">{label}</div><div className="font-semibold">{v ?? "s/d"}</div></div>;
}

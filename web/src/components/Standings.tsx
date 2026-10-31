import { Link } from "react-router-dom";
import { CheckCircle2, ListOrdered } from "lucide-react";
import { Card, DataTable, Notice, Origin, ResultPill, TeamMark, type Column } from "./ui";
import type { SeasonData } from "../lib/data";
import { f0, fdatetime, pct, signed } from "../lib/format";
import { ratio, standings, type TeamRecord } from "../lib/stats";

interface Row {
  teamId: number; pos: number; pj: number; pg: number; pp: number; pf: number; pc: number; pts: number | null;
  last5: ("G" | "P")[]; streak: string; homeW: number; homeL: number; awayW: number; awayL: number;
}

function teamCell(sd: SeasonData, id: number, compact: boolean) {
  const t = sd.db.teamsById.get(id)!;
  return (
    <Link to={`/equipos/${id}`} className="link flex items-center gap-2.5 font-medium">
      <TeamMark name={t.name} size={compact ? 24 : 28} />
      <span className="truncate">{t.name}</span>
    </Link>
  );
}

/** Tabla de posiciones: la oficial si la Liga la publica (y se cruza con los partidos guardados); si no, la calculada. */
export function StandingsCard({ sd, className = "", compact = false }: { sd: SeasonData; className?: string; compact?: boolean }) {
  const calc = standings(sd.teamIds, sd.games);
  const byTeam = new Map(calc.map((r) => [r.teamId, r]));
  const official = (sd.db.ds.officialStandings ?? []).filter((s) => s.seasonId === sd.seasonId);
  const phases = [...new Set(official.map((o) => o.phase))];
  const extra = (id: number) => {
    const c = byTeam.get(id);
    return { last5: c?.last5 ?? [], streak: c?.streak ?? "-", homeW: c?.homeW ?? 0, homeL: c?.homeL ?? 0, awayW: c?.awayW ?? 0, awayL: c?.awayL ?? 0 };
  };
  const rows: Row[] = official.length
    ? official.filter((o) => o.phase === phases[0]).map((o) => ({ teamId: o.teamId, pos: o.position, pj: o.pj, pg: o.pg, pp: o.pp, pf: o.pf, pc: o.pc, pts: o.pts, ...extra(o.teamId) }))
    : calc.map((r, i) => ({ teamId: r.teamId, pos: i + 1, pj: r.games, pg: r.wins, pp: r.losses, pf: r.pf, pc: r.pa, pts: null, ...extra(r.teamId) }));
  const diffs = official.filter((o) => {
    const c = byTeam.get(o.teamId);
    return !c || c.games !== o.pj || c.wins !== o.pg || c.losses !== o.pp || c.pf !== o.pf || c.pa !== o.pc;
  });

  const cols: Column<Row>[] = [
    { key: "pos", label: "#", value: (r) => r.pos, render: (r) => <span className="font-semibold text-ink-2">{r.pos}</span>, width: "36px" },
    { key: "team", label: "Equipo", align: "left", sticky: true, value: (r) => sd.db.teamsById.get(r.teamId)!.name, render: (r) => teamCell(sd, r.teamId, compact) },
    { key: "pj", label: "PJ", title: "Partidos jugados", value: (r) => r.pj },
    { key: "pg", label: "G", title: "Ganados", value: (r) => r.pg },
    { key: "pp", label: "P", title: "Perdidos", value: (r) => r.pp },
    { key: "pct", label: "%V", title: "Porcentaje de victorias (G ÷ PJ)", value: (r) => ratio(r.pg, r.pj), render: (r) => pct(ratio(r.pg, r.pj)) },
    ...(compact ? [] : [
      { key: "pf", label: "PF", title: "Puntos a favor", value: (r: Row) => r.pf, render: (r: Row) => f0(r.pf) },
      { key: "pc", label: "PC", title: "Puntos en contra", value: (r: Row) => r.pc, render: (r: Row) => f0(r.pc) },
    ]),
    { key: "dif", label: "DIF", title: "Diferencia de puntos", value: (r) => r.pf - r.pc,
      render: (r) => <span className={r.pf - r.pc > 0 ? "text-good" : r.pf - r.pc < 0 ? "text-bad" : ""}>{signed(r.pf - r.pc, 0)}</span> },
    ...(official.length ? [{ key: "pts", label: "PTS", title: "Puntos en la tabla (2 por victoria, 1 por derrota)", value: (r: Row) => r.pts,
      render: (r: Row) => <span className="font-bold">{r.pts}</span> }] : []),
    ...(compact ? [] : [{ key: "last5", label: "Últimos 5", align: "left" as const, csv: false, value: (r: Row) => r.last5.join(""),
      render: (r: Row) => <span className="flex gap-1">{r.last5.length ? r.last5.map((x, i) => <ResultPill key={i} r={x} />) : <span className="text-muted">—</span>}</span> }]),
  ];

  return (
    <Card className={className} icon={ListOrdered}
      title={<span className="flex flex-wrap items-center gap-2">Tabla de posiciones {official.length ? <Origin kind="oficial" /> : <Origin kind="calculado" />}</span>}
      subtitle={official.length
        ? `${phases[0]} · publicada por la Liga · capturada el ${fdatetime(official[0].capturedAt)}`
        : "Calculada con los resultados almacenados (orden: % de victorias y diferencia; sin desempates oficiales)."}
      actions={compact ? <Link to="/equipos" className="btn btn-sm">Ver completa</Link> : undefined}>
      <DataTable rows={rows} columns={cols} rowKey={(r) => r.teamId} dense pageSize={0} csvName={compact ? undefined : "tabla-posiciones.csv"} />
      {official.length > 0 && (diffs.length === 0
        ? <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><CheckCircle2 size={13} className="text-good" />
            Verificada: coincide con los {sd.games.filter((g) => g.status === "final").length} partidos finalizados almacenados.</p>
        : <div className="mt-3"><Notice>La tabla oficial no coincide con los partidos almacenados para: {diffs.map((d) => sd.db.teamsById.get(d.teamId)!.name).join(", ")}. Puede faltar algún partido o la Liga actualizó la tabla antes que el fixture.</Notice></div>)}
    </Card>
  );
}

/** Récord calculado con local/visitante y racha (complementa la tabla oficial). */
export function CalculatedTable({ rows, team }: { rows: TeamRecord[]; team: (id: number) => { name: string } }) {
  return (
    <DataTable rows={rows} rowKey={(r) => r.teamId} dense pageSize={0} csvName="record-equipos.csv" initialSort="pct"
      columns={[
        { key: "team", label: "Equipo", align: "left", sticky: true, value: (r) => team(r.teamId).name,
          render: (r) => <Link className="link flex items-center gap-2.5 font-medium" to={`/equipos/${r.teamId}`}><TeamMark name={team(r.teamId).name} size={26} />{team(r.teamId).name}</Link> },
        { key: "pj", label: "PJ", title: "Partidos jugados", value: (r) => r.games },
        { key: "pct", label: "%V", title: "Porcentaje de victorias", value: (r) => r.winPct, render: (r) => pct(r.winPct), highlight: "max" },
        { key: "local", label: "Local", title: "Ganados-perdidos de local", value: (r) => r.homeW - r.homeL, render: (r) => `${r.homeW}-${r.homeL}` },
        { key: "visit", label: "Visitante", title: "Ganados-perdidos de visitante", value: (r) => r.awayW - r.awayL, render: (r) => `${r.awayW}-${r.awayL}` },
        { key: "pfpg", label: "PF/PJ", title: "Puntos a favor por partido", value: (r) => r.pfPerGame, render: (r) => (r.pfPerGame ?? 0).toFixed(1).replace(".", ","), highlight: "max" },
        { key: "pcpg", label: "PC/PJ", title: "Puntos en contra por partido", value: (r) => r.paPerGame, render: (r) => (r.paPerGame ?? 0).toFixed(1).replace(".", ","), highlight: "min" },
        { key: "dif", label: "DIF", title: "Diferencia de puntos total", value: (r) => r.diff, render: (r) => signed(r.diff, 0) },
        { key: "racha", label: "Racha", value: (r) => r.streak, align: "left" },
      ]} />
  );
}

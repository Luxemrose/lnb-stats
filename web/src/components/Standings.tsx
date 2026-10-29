import { Card, DataTable, Notice, Origin, TeamLink } from "./ui";
import type { SeasonData } from "../lib/data";
import { f0, fdatetime, pct, signed } from "../lib/format";
import { ratio, standings, type TeamRecord } from "../lib/stats";
import type { OfficialStanding } from "../lib/types";

/** Tabla de posiciones: la oficial si la fuente la publica; si no, la calculada. Siempre se cruzan. */
export function StandingsCard({ sd, className = "" }: { sd: SeasonData; className?: string }) {
  const team = (id: number) => sd.db.teamsById.get(id)!;
  const calc = standings(sd.teamIds, sd.games);
  const official = (sd.db.ds.officialStandings ?? []).filter((s) => s.seasonId === sd.seasonId);
  const phases = [...new Set(official.map((o) => o.phase))];

  if (!official.length) {
    return (
      <Card className={className} title={<span className="flex items-center gap-2">Tabla de posiciones <Origin kind="calculado" /></span>}
        subtitle="La fuente no publicó tabla para esta temporada: se calcula con los resultados almacenados (% de victorias y diferencia; sin desempates oficiales).">
        <CalculatedTable rows={calc} team={team} />
      </Card>
    );
  }
  // Cruce: lo publicado por la Liga contra lo que suman los partidos guardados.
  const byTeam = new Map(calc.map((r) => [r.teamId, r]));
  const diffs = official.filter((o) => {
    const c = byTeam.get(o.teamId);
    return !c || c.games !== o.pj || c.wins !== o.pg || c.losses !== o.pp || c.pf !== o.pf || c.pa !== o.pc;
  });
  return (
    <Card className={className} title={<span className="flex items-center gap-2">Tabla de posiciones <Origin kind="oficial" /></span>}
      subtitle={`Publicada por la Liga${phases.length === 1 ? ` · ${phases[0]}` : ""} · capturada el ${fdatetime(official[0].capturedAt)}`}>
      {phases.map((ph) => (
        <div key={ph} className="mb-3">
          {phases.length > 1 && <div className="mb-1 text-xs font-semibold text-ink-2">{ph}</div>}
          <OfficialTable rows={official.filter((o) => o.phase === ph)} team={team} />
        </div>
      ))}
      {diffs.length === 0
        ? <p className="text-xs text-muted">✓ Coincide con los {sd.games.filter((g) => g.status === "final").length} partidos finalizados almacenados (PJ, PG, PP, PF y PC de cada equipo).</p>
        : <Notice>La tabla oficial no coincide con los partidos almacenados para: {diffs.map((d) => team(d.teamId).name).join(", ")}. Puede faltar algún partido o la Liga actualizó la tabla antes que el fixture.</Notice>}
    </Card>
  );
}

function OfficialTable({ rows, team }: { rows: OfficialStanding[]; team: (id: number) => { name: string } }) {
  return (
    <DataTable rows={rows} rowKey={(r) => r.teamId} dense csvName="tabla-posiciones-oficial.csv"
      columns={[
        { key: "pos", label: "#", value: (r) => r.position },
        { key: "team", label: "Equipo", align: "left", value: (r) => team(r.teamId).name, render: (r) => <TeamLink id={r.teamId} name={team(r.teamId).name} /> },
        { key: "pj", label: "PJ", title: "Partidos jugados", value: (r) => r.pj },
        { key: "pg", label: "PG", title: "Partidos ganados", value: (r) => r.pg },
        { key: "pp", label: "PP", title: "Partidos perdidos", value: (r) => r.pp },
        { key: "pct", label: "%V", title: "Porcentaje de victorias (PG ÷ PJ)", value: (r) => ratio(r.pg, r.pj), render: (r) => pct(ratio(r.pg, r.pj)) },
        { key: "pf", label: "PF", title: "Puntos a favor", value: (r) => r.pf, render: (r) => f0(r.pf) },
        { key: "pc", label: "PC", title: "Puntos en contra", value: (r) => r.pc, render: (r) => f0(r.pc) },
        { key: "dif", label: "DIF", title: "Diferencia de puntos", value: (r) => r.pf - r.pc, render: (r) => signed(r.pf - r.pc, 0) },
        { key: "pts", label: "PTS", title: "Puntos en la tabla (2 por victoria, 1 por derrota)", value: (r) => r.pts },
      ]} />
  );
}

export function CalculatedTable({ rows, team }: { rows: TeamRecord[]; team: (id: number) => { name: string } }) {
  return (
    <DataTable rows={rows.map((r, i) => ({ ...r, pos: i + 1 }))} rowKey={(r) => r.teamId} dense csvName="tabla-posiciones-calculada.csv"
      columns={[
        { key: "pos", label: "#", value: (r) => r.pos },
        { key: "team", label: "Equipo", align: "left", value: (r) => team(r.teamId).name, render: (r) => <TeamLink id={r.teamId} name={team(r.teamId).name} /> },
        { key: "pj", label: "PJ", title: "Partidos jugados", value: (r) => r.games },
        { key: "g", label: "G", title: "Ganados", value: (r) => r.wins },
        { key: "p", label: "P", title: "Perdidos", value: (r) => r.losses },
        { key: "pct", label: "%V", title: "Porcentaje de victorias", value: (r) => r.winPct, render: (r) => pct(r.winPct) },
        { key: "pf", label: "PF", title: "Puntos a favor", value: (r) => r.pf, render: (r) => f0(r.pf) },
        { key: "pc", label: "PC", title: "Puntos en contra", value: (r) => r.pa, render: (r) => f0(r.pa) },
        { key: "dif", label: "DIF", title: "Diferencia de puntos", value: (r) => r.diff, render: (r) => signed(r.diff, 0) },
        { key: "racha", label: "Racha", value: (r) => r.streak },
      ]} />
  );
}

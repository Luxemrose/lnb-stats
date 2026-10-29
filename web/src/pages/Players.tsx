import { useMemo, useState } from "react";
import { DataTable, Field, PageHeader, PlayerLink, TeamLink, type Column } from "../components/ui";
import { PeriodPicker, defaultPeriod, describePeriod, toPeriod } from "../components/pickers";
import { useSeason } from "../lib/data";
import { playerSummaries, type PlayerSummary } from "../lib/derive";
import { COUNT_LABELS, PCT_LABELS, f0, f1, pct } from "../lib/format";
import type { CountKey, PctKey } from "../lib/stats";

type View = "perGame" | "total" | "per40";
const KEYS: CountKey[] = ["pts", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf", "pfd", "plus_minus", "eff"];
const PCTS: PctKey[] = ["fg_pct", "fg3_pct", "ft_pct", "ts_pct"];

export function statColumns(view: View): Column<PlayerSummary>[] {
  return [
    ...KEYS.map((k): Column<PlayerSummary> => ({
      key: k, label: COUNT_LABELS[k].short, title: COUNT_LABELS[k].long,
      value: (s) => s.agg.stats[k][view],
      render: (s) => {
        const a = s.agg.stats[k];
        const v = a[view];
        const partial = a.n > 0 && a.n < s.agg.games;
        return <span title={partial ? `Dato disponible en ${a.n} de ${s.agg.games} PJ` : undefined}>
          {view === "total" ? f0(v) : f1(v)}{partial ? <sup className="text-warn-ink">*</sup> : null}</span>;
      },
    })),
    ...PCTS.map((k): Column<PlayerSummary> => ({
      key: k, label: PCT_LABELS[k].short, title: `${PCT_LABELS[k].long} (convertidos/intentados acumulados)`,
      value: (s) => s.agg.pct[k].value,
      render: (s) => <span title={`${f1(s.agg.pct[k].made)}/${f1(s.agg.pct[k].att)}`}>{pct(s.agg.pct[k].value)}</span>,
    })),
  ];
}

export default function Players() {
  const sd = useSeason();
  const [q, setQ] = useState("");
  const [team, setTeam] = useState<number | "">("");
  const [pos, setPos] = useState("");
  const [view, setView] = useState<View>("perGame");
  const [minGames, setMinGames] = useState(1);
  const [period, setPeriod] = useState(defaultPeriod);
  const all = useMemo(() => (sd ? playerSummaries(sd, toPeriod(period)) : []), [sd, period]);
  if (!sd) return null;
  const positions = [...new Set(sd.rosters.map((r) => r.position).filter((p): p is string => !!p))].sort();
  const teams = sd.teamIds.map((id) => sd.db.teamsById.get(id)!).sort((a, b) => a.name.localeCompare(b.name));
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const rows = all.filter((s) => s.agg.games >= minGames && (!q || norm(s.name).includes(norm(q))) &&
    (team === "" || s.teamIds.includes(team)) && (!pos || s.position === pos));
  const tname = (id: number | null) => (id ? sd.db.teamsById.get(id)!.name : "s/d");

  const columns: Column<PlayerSummary>[] = [
    { key: "name", label: "Jugador", align: "left", sticky: true, value: (s) => s.name, render: (s) => <PlayerLink id={s.playerId} name={s.name} /> },
    { key: "team", label: "Equipo", align: "left", value: (s) => tname(s.currentTeamId),
      render: (s) => (s.currentTeamId ? <TeamLink id={s.currentTeamId} name={tname(s.currentTeamId)} /> : "s/d") },
    { key: "pos", label: "Pos.", align: "left", value: (s) => s.position },
    { key: "pj", label: "PJ", title: "Partidos disputados en el período", value: (s) => s.agg.games },
    { key: "min", label: "MIN", title: view === "total" ? "Minutos totales" : "Minutos por partido",
      value: (s) => (view === "total" ? s.agg.minutesTotal : s.agg.minutesPerGame), render: (s) => f1(view === "total" ? s.agg.minutesTotal : s.agg.minutesPerGame) },
    ...statColumns(view),
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Jugadores" subtitle={`${describePeriod(period, sd.season.code)} · ${rows.length} jugadores`} />
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <Field label="Buscar"><input className="input" placeholder="Nombre…" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field label="Equipo">
          <select className="input" value={team} onChange={(e) => setTeam(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Todos</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Posición">
          <select className="input" value={pos} onChange={(e) => setPos(e.target.value)} disabled={!positions.length}>
            <option value="">{positions.length ? "Todas" : "No disponible en la fuente"}</option>
            {positions.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Valores">
          <select className="input" value={view} onChange={(e) => setView(e.target.value as View)}>
            <option value="perGame">Promedio por partido</option>
            <option value="total">Totales acumulados</option>
            <option value="per40">Por 40 minutos</option>
          </select>
        </Field>
        <Field label="Mínimo PJ"><input className="input w-20" type="number" min={0} value={minGames} onChange={(e) => setMinGames(Number(e.target.value) || 0)} /></Field>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      <p className="text-xs text-muted">
        <sup>*</sup> El dato falta en algunos partidos: el promedio se calcula sólo con los partidos que lo tienen (pasá el mouse para ver cuántos).
        Los porcentajes se calculan con convertidos/intentados acumulados, no como promedio de porcentajes.
      </p>
      <DataTable rows={rows} columns={columns} rowKey={(s) => s.playerId} initialSort="pts" csvName={`jugadores-${sd.season.code}-${view}.csv`} maxRows={100} />
    </div>
  );
}

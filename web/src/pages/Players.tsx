import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, Search, Users } from "lucide-react";
import { PeriodPicker, defaultPeriod, describePeriod, toPeriod } from "../components/pickers";
import { CrestCell } from "../components/Crest";
import { DataTable, Field, FilterBar, PageHeader, Segmented, type Column } from "../components/ui";
import { useSeason } from "../lib/data";
import { contextTeam, playerSummaries, type PlayerSummary } from "../lib/derive";
import { COUNT_LABELS, PCT_LABELS, f0, f1, pct } from "../lib/format";
import { GLOSSARY } from "../lib/glossary";
import type { CountKey, PctKey } from "../lib/stats";

export type View = "perGame" | "total" | "per40";
const MAIN_KEYS: CountKey[] = ["pts", "reb", "ast", "stl", "blk", "tov", "eff"];
const ALL_KEYS: CountKey[] = ["pts", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf", "pfd", "plus_minus", "eff"];
const MAIN_PCTS: PctKey[] = ["fg3_pct", "ts_pct"];
const ALL_PCTS: PctKey[] = ["fg_pct", "fg2_pct", "fg3_pct", "ft_pct", "efg_pct", "ts_pct"];
const NO_HIGHLIGHT = new Set<CountKey>(["tov", "pf", "plus_minus"]);

/** Columnas estadísticas compartidas (lista de jugadores y plantel de equipo). */
export function statColumns(view: View, full = true): Column<PlayerSummary>[] {
  const keys = full ? ALL_KEYS : MAIN_KEYS;
  const pcts = full ? ALL_PCTS : MAIN_PCTS;
  return [
    ...keys.map((k): Column<PlayerSummary> => ({
      key: k, label: COUNT_LABELS[k].short, title: COUNT_LABELS[k].long,
      value: (s) => s.agg.stats[k][view],
      highlight: NO_HIGHLIGHT.has(k) ? undefined : "max",
      render: (s) => {
        const a = s.agg.stats[k];
        const v = a[view];
        const partial = a.n > 0 && a.n < s.agg.games;
        return <span title={partial ? `Dato disponible en ${a.n} de ${s.agg.games} PJ` : undefined}>
          {view === "total" ? f0(v) : f1(v)}{partial ? <sup className="text-warn">*</sup> : null}</span>;
      },
    })),
    ...pcts.map((k): Column<PlayerSummary> => ({
      key: k, label: PCT_LABELS[k].short, title: `${PCT_LABELS[k].long} (convertidos/intentados acumulados)`,
      value: (s) => s.agg.pct[k].value,
      render: (s) => <span title={`${f1(s.agg.pct[k].made)}/${f1(s.agg.pct[k].att)}`}>{pct(s.agg.pct[k].value)}</span>,
    })),
  ];
}

export { contextTeam };

/** Columna "Jugador" con el escudo de su equipo de fondo. `fixedTeam` fuerza el equipo (p. ej. en el plantel de un equipo). */
export function playerNameColumn(teamName: (id: number | null) => string, fixedTeam?: number): Column<PlayerSummary> {
  return {
    key: "name", label: "Jugador", align: "left", sticky: true, value: (s) => s.name,
    render: (s) => {
      const tid = fixedTeam ?? contextTeam(s);
      return (
        <CrestCell teamId={tid}>
          <Link to={`/jugadores/${s.playerId}`} className="group block min-w-[170px] pl-7">
            <span className="block truncate font-medium group-hover:text-accent-text">{s.name}</span>
            <span className="block truncate text-[11px] text-muted">{teamName(tid)}{s.jersey ? ` · #${s.jersey}` : ""}</span>
          </Link>
        </CrestCell>
      );
    },
  };
}

export default function Players() {
  const sd = useSeason();
  const [q, setQ] = useState("");
  const [team, setTeam] = useState<number | "">("");
  const [pos, setPos] = useState("");
  const [view, setView] = useState<View>("perGame");
  const [cols, setCols] = useState<"main" | "all">("main");
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
    playerNameColumn(tname),
    { key: "pj", label: "PJ", title: GLOSSARY.pj, value: (s) => s.agg.games, highlight: "max" },
    { key: "min", label: "MIN", title: view === "total" ? "Minutos totales" : "Minutos por partido",
      value: (s) => (view === "total" ? s.agg.minutesTotal : s.agg.minutesPerGame), render: (s) => f1(view === "total" ? s.agg.minutesTotal : s.agg.minutesPerGame) },
    ...statColumns(view, cols === "all"),
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Jugadores" subtitle={`${describePeriod(period, sd.season.code)} · ${rows.length} jugadores`}
        actions={<Link className="btn" to="/comparar"><ArrowLeftRight size={15} /> Comparar jugadores</Link>} />
      <FilterBar>
        <Field label="Buscar">
          <span className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input w-56 pl-9" placeholder="Nombre o apellido…" value={q} onChange={(e) => setQ(e.target.value)} />
          </span>
        </Field>
        <Field label="Equipo">
          <select className="input w-48" value={team} onChange={(e) => setTeam(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Todos los equipos</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Posición" hint={positions.length ? undefined : "La Liga no publica la posición de los jugadores en planillas, planteles ni fichas."}>
          <select className="input w-40" value={pos} onChange={(e) => setPos(e.target.value)} disabled={!positions.length}>
            <option value="">{positions.length ? "Todas" : "No disponible"}</option>
            {positions.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Mínimo de PJ">
          <select className="input w-24" value={minGames} onChange={(e) => setMinGames(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 8, 10].map((n) => <option key={n} value={n}>{n}+</option>)}
          </select>
        </Field>
        <PeriodPicker value={period} onChange={setPeriod} />
      </FilterBar>

      <section className="card p-4 sm:p-5">
        <DataTable rows={rows} columns={columns} rowKey={(s) => s.playerId} initialSort="pts" csvName={`jugadores-${sd.season.code}-${view}.csv`}
          maxHeight={720} emptyText="Ningún jugador cumple estos filtros. Probá bajar el mínimo de partidos o quitar el equipo."
          toolbar={<>
            <Segmented ariaLabel="Tipo de valor" value={view} onChange={setView} size="sm"
              options={[{ value: "perGame", label: "Por partido" }, { value: "total", label: "Totales" }, { value: "per40", label: "Por 40'" }]} />
            <Segmented ariaLabel="Columnas" value={cols} onChange={setCols} size="sm"
              options={[{ value: "main", label: "Principales" }, { value: "all", label: "Todas" }]} />
          </>} />
        <p className="mt-3 text-xs leading-relaxed text-muted">
          <Users size={12} className="mr-1 inline" />
          En naranja, el mejor valor de cada columna entre los jugadores filtrados. <sup className="text-warn">*</sup> = el dato falta en algunos partidos (el promedio usa sólo los que lo tienen).
          Los porcentajes se calculan con convertidos/intentados acumulados.
        </p>
      </section>
    </div>
  );
}

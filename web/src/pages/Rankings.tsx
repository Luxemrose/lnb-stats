import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Crown, Search, Shield, Trophy, Users } from "lucide-react";
import { CrestBox, CrestCell } from "../components/Crest";
import { Card, DataTable, Field, FilterBar, InfoTip, PageHeader, Segmented, Tabs, useUrlTab, type Column } from "../components/ui";
import { useSeason } from "../lib/data";
import { playerSummaries, teamPeriodData, type PlayerSummary } from "../lib/derive";
import { f0, f1, pct, signed } from "../lib/format";
import { GLOSSARY } from "../lib/glossary";
import { METRICS, metricById, metricValue, ranking, type View } from "../lib/leaders";
import { leaderMinGames, ratio, standings } from "../lib/stats";
import { contextTeam, playerNameColumn } from "./Players";

const TABS = [{ id: "jugadores", label: "Jugadores", icon: Users }, { id: "equipos", label: "Equipos", icon: Shield }];
const GROUPS = ["Anotación", "Tiro", "Rebotes", "Juego", "Defensa", "Global"] as const;

export default function Rankings() {
  const sd = useSeason();
  const [tab, setTab] = useUrlTab(TABS);
  if (!sd) return null;
  return (
    <div className="space-y-5">
      <PageHeader title="Estadísticas y rankings" subtitle={`Temporada ${sd.season.code} · líderes por categoría con el mínimo de partidos visible`} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "jugadores" ? <PlayerRankings /> : <TeamRankings />}
    </div>
  );
}

function PlayerRankings() {
  const sd = useSeason()!;
  const [params, setParams] = useSearchParams();
  const metric = metricById(params.get("cat") ?? "pts");
  const setCat = (id: string) => { const n = new URLSearchParams(params); n.set("cat", id); setParams(n, { replace: true }); };
  const defaultMin = useMemo(() => leaderMinGames(standings(sd.teamIds, sd.games).map((t) => t.games)), [sd]);
  const [minGames, setMinGames] = useState<number | null>(null);
  const [view, setView] = useState<View>("perGame");
  const [team, setTeam] = useState<number | "">("");
  const [q, setQ] = useState("");
  const summaries = useMemo(() => playerSummaries(sd), [sd]);
  const minG = minGames ?? defaultMin;
  const effView: View = metric.kind === "pct" ? "perGame" : metric.kind === "minutes" && view === "per40" ? "perGame" : view;
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const list = ranking(summaries, metric, effView, minG);
  const rows = list.map((s, i) => ({ s, pos: i + 1 })).filter(({ s }) => (team === "" || s.teamIds.includes(team)) && (!q || norm(s.name).includes(norm(q))));
  const tname = (id: number | null) => (id ? sd.db.teamsById.get(id)!.name : "");
  const fmt = (s: PlayerSummary) => {
    const v = metricValue(s, metric, effView);
    return metric.kind === "pct" ? pct(v) : effView === "total" ? f0(v) : f1(v);
  };
  const teams = sd.teamIds.map((id) => sd.db.teamsById.get(id)!).sort((a, b) => a.name.localeCompare(b.name));
  type R = (typeof rows)[number];
  const name = playerNameColumn(tname);
  const columns: Column<R>[] = [
    { key: "pos", label: "#", value: (r) => r.pos, render: (r) => <span className="font-semibold text-ink-2">{r.pos}</span>, width: "44px" },
    { ...name, value: (r) => r.s.name, render: (r) => name.render!(r.s) } as Column<R>,
    { key: "pj", label: "PJ", title: GLOSSARY.pj, value: (r) => r.s.agg.games },
    { key: "min", label: "MIN", title: "Minutos por partido", value: (r) => r.s.agg.minutesPerGame, render: (r) => f1(r.s.agg.minutesPerGame) },
    ...(metric.kind === "pct" ? [{ key: "ci", label: "C/I", title: "Convertidos / intentados", value: (r: R) => r.s.agg.pct[metric.pct!].att,
      render: (r: R) => ["ts_pct", "efg_pct"].includes(metric.pct!) ? `${r.s.agg.pct.fg_pct.made}/${r.s.agg.pct.fg_pct.att} TC` : `${r.s.agg.pct[metric.pct!].made}/${r.s.agg.pct[metric.pct!].att}` }] : []),
    ...(metric.kind === "count" && effView !== "total" ? [{ key: "tot", label: "Total", value: (r: R) => r.s.agg.stats[metric.key!].total, render: (r: R) => f0(r.s.agg.stats[metric.key!].total) }] : []),
    { key: "val", label: metric.short, title: metric.label, value: (r) => metricValue(r.s, metric, effView),
      render: (r) => <span className="text-base font-bold text-accent-text">{fmt(r.s)}</span> },
  ];
  const podium = list.slice(0, 3);

  return (
    <div className="space-y-5">
      <div className="card space-y-3 p-4">
        {GROUPS.map((g) => (
          <div key={g} className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow w-24 shrink-0">{g}</span>
            {METRICS.filter((m) => m.group === g).map((m) => (
              <button key={m.id} className="chip" aria-pressed={m.id === metric.id} onClick={() => setCat(m.id)} title={m.label}>{m.label}</button>
            ))}
          </div>
        ))}
      </div>

      <FilterBar>
        <Field label="Valores" hint={metric.kind === "pct" ? "Los porcentajes se calculan con convertidos/intentados acumulados." : undefined}>
          <Segmented ariaLabel="Valores" value={effView} onChange={setView}
            options={metric.kind === "pct" ? [{ value: "perGame", label: "Porcentaje" }] : [{ value: "perGame", label: "Por partido" }, { value: "total", label: "Totales" }, ...(metric.kind === "count" ? [{ value: "per40" as View, label: "Por 40'" }] : [])]} />
        </Field>
        <Field label="Mínimo de PJ" hint={GLOSSARY.leaders}>
          <select className="input w-36" value={minG} onChange={(e) => setMinGames(Number(e.target.value))}>
            {[...new Set([1, 2, 3, defaultMin, 5, 8, 10, 15])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}+{n === defaultMin ? " (sug.)" : ""}</option>)}
          </select>
        </Field>
        <Field label="Equipo">
          <select className="input w-48" value={team} onChange={(e) => setTeam(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Todos</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Buscar">
          <span className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input w-48 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jugador…" /></span>
        </Field>
      </FilterBar>

      {podium.length > 0 && team === "" && !q && (
        <div className="grid gap-3 sm:grid-cols-3">
          {podium.map((s, i) => (
            <Link key={s.playerId} to={`/jugadores/${s.playerId}`} className={`card card-hover relative overflow-hidden ${i === 0 ? "border-accent/40" : ""}`}>
              {i === 0 && <span aria-hidden className="absolute inset-x-0 top-0 z-[2] h-0.5 bg-accent" />}
              <CrestBox teamId={contextTeam(s)} size="card" className="rounded-[13px]">
                <div className="flex items-center gap-3.5 p-4 pl-14">
                  <span className={`num grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${i === 0 ? "bg-accent text-accent-ink" : "bg-surface-3 text-ink-2"}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.name}</span>
                    <span className="block truncate text-xs text-muted">{tname(contextTeam(s))} · {s.agg.games} PJ</span>
                  </span>
                  <span className={`num text-2xl font-bold ${i === 0 ? "text-accent-text" : ""}`}>{fmt(s)}</span>
                </div>
              </CrestBox>
            </Link>
          ))}
        </div>
      )}

      <Card icon={Trophy} title={<span className="flex items-center gap-1.5">{metric.label}{metric.hint && <InfoTip text={metric.hint} />}</span>}
        subtitle={`${list.length} jugadores califican · mínimo ${minG} PJ${metric.attLabel ? ` y ${metric.attLabel}` : ""}${metric.kind === "count" ? " · el dato debe estar en todos sus partidos" : ""}`}>
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.s.playerId} dense csvName={`ranking-${metric.id}-${sd.season.code}.csv`} maxHeight={680}
          emptyText="Nadie cumple el mínimo con estos filtros. Probá bajar el mínimo de partidos." />
      </Card>
    </div>
  );
}

const TEAM_CATS: { id: string; label: string; better: "max" | "min"; fmt: "num" | "pct" | "signed" }[] = [
  { id: "winpct", label: "% de victorias", better: "max", fmt: "pct" },
  { id: "pf", label: "Puntos a favor", better: "max", fmt: "num" },
  { id: "pa", label: "Puntos en contra", better: "min", fmt: "num" },
  { id: "dif", label: "Diferencia", better: "max", fmt: "signed" },
  { id: "reb", label: "Rebotes", better: "max", fmt: "num" },
  { id: "ast", label: "Asistencias", better: "max", fmt: "num" },
  { id: "stl", label: "Robos", better: "max", fmt: "num" },
  { id: "tov", label: "Pérdidas", better: "min", fmt: "num" },
  { id: "blk", label: "Tapas", better: "max", fmt: "num" },
  { id: "fg_pct", label: "% de campo", better: "max", fmt: "pct" },
  { id: "fg3_pct", label: "% de triples", better: "max", fmt: "pct" },
  { id: "ft_pct", label: "% de libres", better: "max", fmt: "pct" },
  { id: "ts_pct", label: "% tiro verdadero", better: "max", fmt: "pct" },
];

function TeamRankings() {
  const sd = useSeason()!;
  const [cat, setCat] = useState(TEAM_CATS[1].id);
  const c = TEAM_CATS.find((x) => x.id === cat)!;
  const data = useMemo(() => sd.teamIds.map((id) => ({ id, d: teamPeriodData(sd, id, {}) })), [sd]);
  const value = (d: (typeof data)[number]["d"]): number | null => {
    const n = d.done.length;
    switch (cat) {
      case "winpct": return ratio(d.wins, n);
      case "pf": return ratio(d.pf, n);
      case "pa": return ratio(d.pa, n);
      case "dif": return ratio(d.pf - d.pa, n);
      case "fg_pct": case "fg3_pct": case "ft_pct": case "ts_pct": return d.own.pct[cat].value;
      default: return d.own.stats[cat as "reb"].perGame;
    }
  };
  const rows = data.filter((x) => x.d.done.length > 0 && value(x.d) !== null)
    .sort((a, b) => (c.better === "max" ? (value(b.d) as number) - (value(a.d) as number) : (value(a.d) as number) - (value(b.d) as number)))
    .map((x, i) => ({ ...x, pos: i + 1 }));
  const fmt = (v: number | null) => (c.fmt === "pct" ? pct(v) : c.fmt === "signed" ? signed(v) : f1(v));
  type R = (typeof rows)[number];
  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap gap-1.5 p-4">
        {TEAM_CATS.map((x) => <button key={x.id} className="chip" aria-pressed={x.id === cat} onClick={() => setCat(x.id)}>{x.label}</button>)}
      </div>
      <Card icon={Crown} title={`${c.label}${c.fmt === "pct" ? "" : " por partido"}`}
        subtitle={`Temporada ${sd.season.code} completa · ${c.better === "min" ? "menos es mejor: el primero es el que menos" : "de mayor a menor"} · calculado con los partidos finalizados`}>
        <DataTable rows={rows} rowKey={(r) => r.id} dense pageSize={0} csvName={`ranking-equipos-${cat}.csv`}
          columns={[
            { key: "pos", label: "#", value: (r: R) => r.pos, render: (r: R) => <span className="font-semibold text-ink-2">{r.pos}</span>, width: "44px" },
            { key: "team", label: "Equipo", align: "left", sticky: true, value: (r: R) => sd.db.teamsById.get(r.id)!.name,
              render: (r: R) => <CrestCell teamId={r.id}><Link className="link block pl-8 font-semibold" to={`/equipos/${r.id}`}>{sd.db.teamsById.get(r.id)!.name}</Link></CrestCell> },
            { key: "pj", label: "PJ", value: (r: R) => r.d.done.length },
            { key: "rec", label: "G-P", value: (r: R) => r.d.wins, render: (r: R) => `${r.d.wins}-${r.d.losses}` },
            { key: "val", label: c.label, value: (r: R) => value(r.d), render: (r: R) => <span className={`text-base font-bold ${r.pos === 1 ? "text-accent-text" : ""}`}>{fmt(value(r.d))}</span> },
          ]} />
      </Card>
    </div>
  );
}

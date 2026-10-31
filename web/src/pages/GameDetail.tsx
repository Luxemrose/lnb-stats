import { Link, useParams } from "react-router-dom";
import { CalendarDays, Clock, ExternalLink, LayoutDashboard, MapPin, Medal, Swords, Users } from "lucide-react";
import { HeadToHead, type CmpEntity, type CmpRow } from "../components/compare";
import { useThemeColors } from "../components/charts";
import { CrestBox, CrestCell } from "../components/Crest";
import { Badge, Card, DataTable, EmptyState, Notice, Origin, PageHeader, PlayerLink, Tabs, TeamMark, useUrlTab } from "../components/ui";
import { useSeason } from "../lib/data";
import { teamGames } from "../lib/derive";
import { COUNT_LABELS, f0, fdate, fdatetime, mmss, pct } from "../lib/format";
import { fga, fgm, ratio, type CountKey } from "../lib/stats";
import type { Game, PlayerGameRow, StatLine } from "../lib/types";

const KEYS: CountKey[] = ["oreb", "dreb", "reb", "ast", "stl", "tov", "blk", "blka", "pf", "pfd", "plus_minus", "eff"];
const pair = (m: number | null, a: number | null) => (m === null || a === null ? "s/d" : `${m}/${a}`);
const STATUS: Record<Game["status"], { label: string; tone: "neutral" | "accent" | "good" | "blue" }> = {
  final: { label: "Final", tone: "neutral" }, scheduled: { label: "Programado", tone: "blue" },
  live: { label: "En juego", tone: "accent" }, unknown: { label: "Sin confirmar", tone: "accent" },
};

export default function GameDetail() {
  const { id } = useParams();
  const sd = useSeason();
  const colors = useThemeColors();
  const g = sd?.db.gamesById.get(Number(id));
  const tabs = [
    { id: "resumen", label: "Resumen", icon: LayoutDashboard },
    { id: "local", label: g && sd ? sd.db.teamsById.get(g.homeTeamId)!.name : "Local", icon: Users },
    { id: "visitante", label: g && sd ? sd.db.teamsById.get(g.awayTeamId)!.name : "Visitante", icon: Users },
  ];
  const [tab, setTab] = useUrlTab(tabs);
  if (!sd) return null;
  if (!g) return <EmptyState title="Partido no encontrado" action={<Link to="/partidos" className="btn btn-primary">Ver partidos</Link>} />;
  const tname = (i: number) => sd.db.teamsById.get(i)!.name;
  const rows = sd.db.rowsByGame.get(g.id) ?? [];
  const hasScore = g.homeScore !== null && g.awayScore !== null;
  const homeWin = hasScore && (g.homeScore as number) > (g.awayScore as number);
  const line = (tid: number) => teamGames(sd, tid).find((l) => l.game.id === g.id);
  const hl = line(g.homeTeamId), al = line(g.awayTeamId);
  const st = STATUS[g.status];

  const entities: CmpEntity[] = [
    { id: g.homeTeamId, name: tname(g.homeTeamId), color: colors.series[0], games: 1, kind: "team", crestTeamId: g.homeTeamId },
    { id: g.awayTeamId, name: tname(g.awayTeamId), color: colors.series[1], games: 1, kind: "team", crestTeamId: g.awayTeamId },
  ];
  const ts = (l: typeof hl) => l?.stats as StatLine | null | undefined;
  const pctOf = (m: number | null | undefined, a: number | null | undefined) => (m == null || a == null ? null : ratio(m, a));
  const teamRows: CmpRow[] = hl?.stats && al?.stats ? [
    { id: "fg", label: "% de campo", values: [pctOf(fgm(ts(hl)!), fga(ts(hl)!)), pctOf(fgm(ts(al)!), fga(ts(al)!))], format: pct, better: "max", isPct: true },
    { id: "fg3", label: "% de triples", values: [pctOf(ts(hl)!.fg3m, ts(hl)!.fg3a), pctOf(ts(al)!.fg3m, ts(al)!.fg3a)], format: pct, better: "max", isPct: true },
    { id: "ft", label: "% de libres", values: [pctOf(ts(hl)!.ftm, ts(hl)!.fta), pctOf(ts(al)!.ftm, ts(al)!.fta)], format: pct, better: "max", isPct: true },
    ...(["reb", "oreb", "ast", "stl", "tov", "blk", "pf"] as CountKey[]).map((k): CmpRow => ({
      id: k, label: COUNT_LABELS[k].long, values: [ts(hl)![k], ts(al)![k]], format: f0, better: ["tov", "pf"].includes(k) ? "min" : "max",
    })),
  ] : [];

  return (
    <div className="space-y-6">
      <PageHeader back={{ to: "/partidos", label: "Partidos" }} title={`${tname(g.homeTeamId)} vs ${tname(g.awayTeamId)}`}
        subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1"><CalendarDays size={13} />{fdate(g.date)}</span>
          {g.time && <span className="inline-flex items-center gap-1"><Clock size={13} />{g.time}</span>}
          {g.venue && <span className="inline-flex items-center gap-1"><MapPin size={13} />{g.venue}</span>}
          {g.phase && <span>{g.phase}</span>}
        </span>}
        actions={g.sourceUrl ? <a className="btn" href={g.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Ver en la Liga</a> : undefined} />

      <section className="card relative overflow-hidden p-5 sm:p-7">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-accent" />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <Link to={`/equipos/${g.homeTeamId}`} className="group flex flex-col items-center gap-2 text-center">
            <TeamMark teamId={g.homeTeamId} name={tname(g.homeTeamId)} size={64} />
            <span className={`text-sm font-semibold group-hover:text-accent-text sm:text-base ${hasScore && !homeWin ? "text-ink-2" : ""}`}>{tname(g.homeTeamId)}</span>
            <span className="text-[11px] uppercase tracking-wide text-muted">Local</span>
          </Link>
          <div className="text-center">
            <div className="num text-4xl font-extrabold tracking-tight sm:text-6xl">
              {hasScore ? <><span className={homeWin ? "" : "text-ink-2"}>{g.homeScore}</span><span className="mx-2 text-muted sm:mx-3">-</span><span className={!homeWin ? "" : "text-ink-2"}>{g.awayScore}</span></> : <span className="text-muted">vs</span>}
            </div>
            <div className="mt-2"><Badge tone={st.tone}>{st.label}</Badge></div>
          </div>
          <Link to={`/equipos/${g.awayTeamId}`} className="group flex flex-col items-center gap-2 text-center">
            <TeamMark teamId={g.awayTeamId} name={tname(g.awayTeamId)} size={64} />
            <span className={`text-sm font-semibold group-hover:text-accent-text sm:text-base ${hasScore && homeWin ? "text-ink-2" : ""}`}>{tname(g.awayTeamId)}</span>
            <span className="text-[11px] uppercase tracking-wide text-muted">Visitante</span>
          </Link>
        </div>
      </section>

      {g.detailLevel !== "box_score" ? (
        <Notice tone="info">{g.detailLevel === "result_only" ? "Para este partido sólo hay resultado: la Liga no publicó planilla individual." : "El partido todavía no se jugó: las estadísticas aparecen después de la actualización diaria siguiente."}</Notice>
      ) : (
        <>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          {tab === "resumen" && (
            <div className="grid gap-5 xl:grid-cols-5">
              <Card className="xl:col-span-3" icon={Swords} title="Estadísticas de equipo"
                actions={hl?.statsOrigin ? <Origin kind={hl.statsOrigin} /> : undefined}
                subtitle="El valor más favorable de cada fila, resaltado (en pérdidas y faltas, menos es mejor).">
                {teamRows.length ? <HeadToHead a={entities[0]} b={entities[1]} rows={teamRows} /> : <p className="text-sm text-muted">Sin totales de equipo.</p>}
              </Card>
              <Card className="xl:col-span-2" icon={Medal} title="Destacados del partido">
                <GameLeaders rows={rows} name={(pid) => sd.db.playersById.get(pid)!.name} teamName={tname} />
              </Card>
            </div>
          )}
          {tab === "local" && <BoxScore rows={rows.filter((r) => r.teamId === g.homeTeamId)} teamId={g.homeTeamId} gameDate={g.date} sd={sd} totals={ts(hl) ?? null} origin={hl?.statsOrigin ?? null} />}
          {tab === "visitante" && <BoxScore rows={rows.filter((r) => r.teamId === g.awayTeamId)} teamId={g.awayTeamId} gameDate={g.date} sd={sd} totals={ts(al) ?? null} origin={al?.statsOrigin ?? null} />}
        </>
      )}
      <p className="text-xs text-muted">Origen: {g.source} · actualizado {fdatetime(g.updatedAt)}{g.revision > 1 ? ` · revisión ${g.revision} (la Liga corrigió datos de la planilla)` : ""}</p>
    </div>
  );
}

function GameLeaders({ rows, name, teamName }: { rows: PlayerGameRow[]; name: (id: number) => string; teamName: (id: number) => string }) {
  const cats: { key: CountKey; label: string }[] = [{ key: "pts", label: "Puntos" }, { key: "reb", label: "Rebotes" }, { key: "ast", label: "Asistencias" }, { key: "eff", label: "Valoración" }];
  return (
    <div className="space-y-4">
      {cats.map((c) => {
        const top = [...rows].filter((r) => !r.dnp && r[c.key] !== null).sort((a, b) => (b[c.key] as number) - (a[c.key] as number))[0];
        if (!top) return null;
        return (
          <Link key={c.key} to={`/jugadores/${top.playerId}`} className="group block">
            <CrestBox teamId={top.teamId} className="rounded-xl">
            <span className="flex items-center gap-3 py-1 pl-11">
            <span className="min-w-0 flex-1">
              <span className="eyebrow block">{c.label}</span>
              <span className="block truncate text-sm font-semibold group-hover:text-accent-text">{name(top.playerId)}</span>
              <span className="block truncate text-xs text-muted">{teamName(top.teamId)}</span>
            </span>
            <span className="num text-2xl font-bold">{top[c.key]}</span>
            </span>
            </CrestBox>
          </Link>
        );
      })}
    </div>
  );
}

function BoxScore({ rows, teamId, gameDate, sd, totals, origin }: {
  rows: PlayerGameRow[]; teamId: number; gameDate: string; sd: NonNullable<ReturnType<typeof useSeason>>;
  totals: StatLine | null; origin: "oficial" | "calculado" | null;
}) {
  const tname = sd.db.teamsById.get(teamId)!.name;
  const ordered = [...rows].sort((a, b) => (b.starter ?? 0) - (a.starter ?? 0) || (b.minutes_sec ?? -1) - (a.minutes_sec ?? -1));
  return (
    <Card title={tname} icon={Users} actions={origin && <Origin kind={origin} />}
      subtitle={`Planilla oficial · • = titular · ${origin === "calculado" ? "totales = suma de las planillas individuales" : "totales publicados por la Liga"}`}>
      <DataTable rows={ordered} rowKey={(r) => r.playerId} dense pageSize={0} csvName={`planilla-${gameDate}-${tname}.csv`.replace(/[^\w.-]+/g, "_")}
        columns={[
          { key: "name", label: "Jugador", align: "left", sticky: true, value: (r) => sd.db.playersById.get(r.playerId)!.name,
            render: (r) => <CrestCell teamId={r.teamId}><span className="flex items-center gap-1.5 pl-6">{r.starter ? <span title="Titular" className="h-1.5 w-1.5 rounded-full bg-accent" /> : <span className="w-1.5" />}
              <PlayerLink id={r.playerId} name={sd.db.playersById.get(r.playerId)!.name} />{r.dnp ? <span className="text-xs text-muted">(no jugó)</span> : null}</span></CrestCell> },
          { key: "min", label: "MIN", value: (r) => r.minutes_sec, render: (r) => mmss(r.minutes_sec) },
          { key: "pts", label: "PTS", value: (r) => r.pts, highlight: "max" },
          { key: "t2", label: "T2", title: "Dobles C/I", value: (r) => r.fg2m, render: (r) => pair(r.fg2m, r.fg2a) },
          { key: "t3", label: "T3", title: "Triples C/I", value: (r) => r.fg3m, render: (r) => pair(r.fg3m, r.fg3a) },
          { key: "tl", label: "TL", title: "Libres C/I", value: (r) => r.ftm, render: (r) => pair(r.ftm, r.fta) },
          ...KEYS.map((k) => ({ key: k, label: COUNT_LABELS[k].short, title: COUNT_LABELS[k].long, value: (r: PlayerGameRow) => r[k],
            highlight: (["tov", "pf", "blka", "plus_minus"].includes(k) ? undefined : "max") as "max" | undefined })),
        ]} />
      {totals && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-8">
          {[
            ["Puntos", String(totals.pts ?? "s/d")],
            ["Campo", `${pair(fgm(totals), fga(totals))} · ${pct(fgm(totals) === null ? null : ratio(fgm(totals)!, fga(totals)!))}`],
            ["Triples", `${pair(totals.fg3m, totals.fg3a)} · ${pct(totals.fg3m === null ? null : ratio(totals.fg3m, totals.fg3a!))}`],
            ["Libres", `${pair(totals.ftm, totals.fta)} · ${pct(totals.ftm === null ? null : ratio(totals.ftm, totals.fta!))}`],
            ["Rebotes", String(totals.reb ?? "s/d")], ["Asistencias", String(totals.ast ?? "s/d")],
            ["Pérdidas", String(totals.tov ?? "s/d")], ["Robos", String(totals.stl ?? "s/d")],
          ].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-surface-2 px-3 py-2"><div className="text-[11px] text-muted">{l}</div><div className="num font-semibold">{v}</div></div>
          ))}
        </div>
      )}
    </Card>
  );
}

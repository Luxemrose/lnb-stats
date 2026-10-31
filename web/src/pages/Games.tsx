import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, List, Table2, X } from "lucide-react";
import { CrestCell } from "../components/Crest";
import { GameRow } from "../components/GameRow";
import { Card, DataTable, Field, FilterBar, PageHeader, Segmented, EmptyState } from "../components/ui";
import { useSeason } from "../lib/data";
import { fdate } from "../lib/format";
import type { Game } from "../lib/types";

const STATUS: Record<Game["status"], string> = { final: "Finalizado", scheduled: "Programado", live: "En juego", unknown: "Sin confirmar" };
const DETAIL: Record<Game["detailLevel"], string> = { box_score: "Planilla completa", result_only: "Sólo resultado", scheduled: "Sin datos" };

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const s = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Games() {
  const sd = useSeason();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [home, setHome] = useState<number | "">("");
  const [away, setAway] = useState<number | "">("");
  const [state, setState] = useState<"all" | "played" | "next">("all");
  const [mode, setMode] = useState<"list" | "table">("list");
  const [limit, setLimit] = useState(40);
  const filtered = useMemo(() => {
    if (!sd) return [];
    return sd.games.filter((g) => (!from || g.date >= from) && (!to || g.date <= to) &&
      (home === "" || g.homeTeamId === home) && (away === "" || g.awayTeamId === away) &&
      (state === "all" || (state === "played" ? g.homeScore !== null : g.homeScore === null)));
  }, [sd, from, to, home, away, state]);
  if (!sd) return null;
  const tname = (id: number) => sd.db.teamsById.get(id)!.name;
  const teams = sd.teamIds.map((id) => sd.db.teamsById.get(id)!).sort((a, b) => a.name.localeCompare(b.name));
  const any = from || to || home !== "" || away !== "";
  // Lista: próximos en orden cronológico, jugados del más reciente al más viejo.
  const listGames = [...filtered].sort((a, b) => state === "next" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date) || b.id - a.id);
  const shown = listGames.slice(0, limit);
  const byDay = new Map<string, Game[]>();
  for (const g of shown) byDay.set(g.date, [...(byDay.get(g.date) ?? []), g]);
  const sel = (v: number | "", set: (v: number | "") => void) => (
    <select className="input w-48" value={v} onChange={(e) => set(e.target.value ? Number(e.target.value) : "")}>
      <option value="">Todos</option>
      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Partidos" subtitle={`Temporada ${sd.season.code} · ${filtered.length} partidos`}
        actions={<Segmented ariaLabel="Vista" value={mode} onChange={setMode}
          options={[{ value: "list", label: "Lista", icon: List }, { value: "table", label: "Tabla", icon: Table2 }]} />} />
      <FilterBar>
        <Field label="Estado">
          <Segmented ariaLabel="Estado" value={state} onChange={(v) => { setState(v); setLimit(40); }}
            options={[{ value: "all", label: "Todos" }, { value: "played", label: "Jugados" }, { value: "next", label: "Próximos" }]} />
        </Field>
        <Field label="Desde"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Local">{sel(home, setHome)}</Field>
        <Field label="Visitante">{sel(away, setAway)}</Field>
        {any && <button className="btn btn-ghost" onClick={() => { setFrom(""); setTo(""); setHome(""); setAway(""); }}><X size={14} /> Limpiar</button>}
      </FilterBar>

      {!filtered.length ? (
        <EmptyState icon={CalendarDays} title="No hay partidos con estos filtros"
          action={any ? <button className="btn" onClick={() => { setFrom(""); setTo(""); setHome(""); setAway(""); }}>Quitar filtros</button> : undefined}>
          Probá ampliar el rango de fechas o elegir "Todos".
        </EmptyState>
      ) : mode === "list" ? (
        <div className="space-y-4">
          {[...byDay.entries()].map(([day, gs]) => (
            <Card key={day} padded={false}>
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <span className="text-sm font-semibold">{dayLabel(day)}</span>
                <span className="text-xs text-muted">{gs.length} {gs.length === 1 ? "partido" : "partidos"}</span>
              </div>
              <div className="grid divide-y divide-line px-2 py-1 md:grid-cols-2 md:gap-x-4 md:divide-y-0">
                {gs.map((g) => <GameRow key={g.id} game={g} teamName={tname} showVenue />)}
              </div>
            </Card>
          ))}
          {listGames.length > limit && <button className="btn w-full" onClick={() => setLimit(limit + 40)}>Mostrar más ({listGames.length - limit} restantes)</button>}
        </div>
      ) : (
        <section className="card p-4 sm:p-5">
          <DataTable rows={filtered} rowKey={(g) => g.id} initialSort="date" csvName={`partidos-${sd.season.code}.csv`}
            columns={[
              { key: "date", label: "Fecha", align: "left", value: (g) => g.date, render: (g) => <Link className="link font-medium" to={`/partidos/${g.id}`}>{fdate(g.date)}</Link> },
              { key: "time", label: "Hora", align: "left", value: (g) => g.time },
              { key: "home", label: "Local", align: "left", value: (g) => tname(g.homeTeamId), render: (g) => <CrestCell teamId={g.homeTeamId}><Link className="link block pl-7" to={`/equipos/${g.homeTeamId}`}>{tname(g.homeTeamId)}</Link></CrestCell> },
              { key: "score", label: "Resultado", align: "left", value: (g) => (g.homeScore === null ? null : `${g.homeScore} - ${g.awayScore}`),
                render: (g) => (g.homeScore === null ? <span className="text-muted">—</span> : <Link className="link font-bold" to={`/partidos/${g.id}`}>{g.homeScore} - {g.awayScore}</Link>) },
              { key: "away", label: "Visitante", align: "left", value: (g) => tname(g.awayTeamId), render: (g) => <CrestCell teamId={g.awayTeamId}><Link className="link block pl-7" to={`/equipos/${g.awayTeamId}`}>{tname(g.awayTeamId)}</Link></CrestCell> },
              { key: "venue", label: "Estadio", align: "left", value: (g) => g.venue },
              { key: "status", label: "Estado", align: "left", value: (g) => STATUS[g.status] },
              { key: "detail", label: "Datos", align: "left", value: (g) => DETAIL[g.detailLevel] },
            ]} />
        </section>
      )}
    </div>
  );
}

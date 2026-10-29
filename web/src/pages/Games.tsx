import { useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, Field, PageHeader } from "../components/ui";
import { useSeason } from "../lib/data";
import { fdate } from "../lib/format";
import type { Game } from "../lib/types";

const STATUS: Record<Game["status"], string> = { final: "Finalizado", scheduled: "Programado", live: "En juego", unknown: "Sin confirmar" };
const DETAIL: Record<Game["detailLevel"], string> = { box_score: "Planilla completa", result_only: "Sólo resultado", scheduled: "Sin datos" };

export default function Games() {
  const sd = useSeason();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [home, setHome] = useState<number | "">("");
  const [away, setAway] = useState<number | "">("");
  if (!sd) return null;
  const tname = (id: number) => sd.db.teamsById.get(id)!.name;
  const teams = sd.teamIds.map((id) => sd.db.teamsById.get(id)!).sort((a, b) => a.name.localeCompare(b.name));
  const rows = sd.games.filter((g) => (!from || g.date >= from) && (!to || g.date <= to) &&
    (home === "" || g.homeTeamId === home) && (away === "" || g.awayTeamId === away));
  const sel = (v: number | "", set: (v: number | "") => void) => (
    <select className="input" value={v} onChange={(e) => set(e.target.value ? Number(e.target.value) : "")}>
      <option value="">Todos</option>
      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
  return (
    <div className="space-y-4">
      <PageHeader title="Partidos" subtitle={`Temporada ${sd.season.code} · ${rows.length} partidos`} />
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <Field label="Desde"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Local">{sel(home, setHome)}</Field>
        <Field label="Visitante">{sel(away, setAway)}</Field>
        {(from || to || home !== "" || away !== "") && <button className="btn" onClick={() => { setFrom(""); setTo(""); setHome(""); setAway(""); }}>Limpiar</button>}
      </div>
      <DataTable rows={rows} rowKey={(g) => g.id} initialSort="date" csvName={`partidos-${sd.season.code}.csv`} maxRows={100}
        columns={[
          { key: "date", label: "Fecha", align: "left", value: (g) => g.date, render: (g) => <Link className="link" to={`/partidos/${g.id}`}>{fdate(g.date)}</Link> },
          { key: "round", label: "Fecha n.º", align: "left", value: (g) => g.round },
          { key: "home", label: "Local", align: "left", value: (g) => tname(g.homeTeamId), render: (g) => <Link className="link" to={`/equipos/${g.homeTeamId}`}>{tname(g.homeTeamId)}</Link> },
          { key: "score", label: "Resultado", align: "left", value: (g) => (g.homeScore === null ? null : `${g.homeScore} - ${g.awayScore}`),
            render: (g) => (g.homeScore === null ? <span className="text-muted">—</span> : <Link className="link font-semibold" to={`/partidos/${g.id}`}>{g.homeScore} - {g.awayScore}</Link>) },
          { key: "away", label: "Visitante", align: "left", value: (g) => tname(g.awayTeamId), render: (g) => <Link className="link" to={`/equipos/${g.awayTeamId}`}>{tname(g.awayTeamId)}</Link> },
          { key: "status", label: "Estado", align: "left", value: (g) => STATUS[g.status] },
          { key: "detail", label: "Datos", align: "left", value: (g) => DETAIL[g.detailLevel] },
        ]} />
    </div>
  );
}

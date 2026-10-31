import { useMemo, useState } from "react";
import { BarsChart, ChartCard, LinesChart, useThemeColors } from "../components/charts";
import { MultiPicker, PeriodPicker, defaultPeriod, describePeriod, toPeriod } from "../components/pickers";
import { Clapperboard, Copy, Check, Download, FileText, Sparkles } from "lucide-react";
import { Avatar, Card, EmptyState, Field, FilterBar, Notice, PageHeader, Segmented, TeamMark } from "../components/ui";
import { useSeason } from "../lib/data";
import { playerRows, playerSummaries, teamPeriodData } from "../lib/derive";
import { COUNT_LABELS, downloadText, f1, fdate, fdatetime, toCsv } from "../lib/format";
import { aggregate, diff, rollingMean, type CountKey } from "../lib/stats";

const KEYS: CountKey[] = ["pts", "reb", "ast", "stl", "blk", "tov", "eff"];

interface Subject {
  id: number; name: string; color: string; games: number; value: number | null;
  before: { games: number; value: number | null } | null; after: { games: number; value: number | null } | null;
  series: { label: string; date: string; value: number | null }[];
}

/**
 * Vista para preparar contenido del canal: selección, indicadores destacados,
 * gráficos exportables, comparación entre períodos y un resumen numérico.
 * El resumen se arma con plantillas fijas a partir de los números (sin IA).
 */
export default function Content() {
  const sd = useSeason();
  const colors = useThemeColors();
  const [kind, setKind] = useState<"players" | "teams">("players");
  const [ids, setIds] = useState<number[]>([]);
  const [key, setKey] = useState<CountKey>("pts");
  const [period, setPeriod] = useState(defaultPeriod);
  const [split, setSplit] = useState("");
  const [win, setWin] = useState(3);
  const [copied, setCopied] = useState(false);

  const playerOptions = useMemo(() => (sd ? playerSummaries(sd).filter((s) => s.agg.games > 0)
    .map((s) => ({ id: s.playerId, label: s.name, sub: s.currentTeamId ? sd.db.teamsById.get(s.currentTeamId)?.name : undefined })) : []), [sd]);
  if (!sd) return null;
  const teamOptions = sd.teamIds.map((id) => ({ id, label: sd.db.teamsById.get(id)!.name }));
  const meta = sd.db.ds.meta;
  const periodText = describePeriod(period, sd.season.code);
  const label = COUNT_LABELS[key].long;
  const tname = (id: number) => sd.db.teamsById.get(id)!.name;

  const subjects: Subject[] = ids.map((id, i) => {
    if (kind === "players") {
      const rows = playerRows(sd, id, toPeriod(period));
      const a = aggregate(rows);
      const b = split ? aggregate(rows.filter((r) => r.date < split)) : null;
      const af = split ? aggregate(rows.filter((r) => r.date >= split)) : null;
      return {
        id, name: sd.db.playersById.get(id)?.name ?? String(id), color: colors.series[i], games: a.games, value: a.stats[key].perGame,
        before: b && { games: b.games, value: b.stats[key].perGame }, after: af && { games: af.games, value: af.stats[key].perGame },
        series: rows.map((r) => ({ date: r.date, label: fdate(r.date).slice(0, 5), value: r[key] })),
      };
    }
    const d = teamPeriodData(sd, id, toPeriod(period));
    const lines = d.done.filter((l) => l.stats);
    const avg = (ls: typeof lines) => {
      const v = ls.map((l) => l.stats![key]).filter((x): x is number => x !== null);
      return { games: ls.length, value: v.length === ls.length && v.length ? v.reduce((p, c) => p + c, 0) / v.length : null };
    };
    return {
      id, name: tname(id), color: colors.series[i], games: lines.length, value: avg(lines).value,
      before: split ? avg(lines.filter((l) => l.date < split)) : null, after: split ? avg(lines.filter((l) => l.date >= split)) : null,
      series: lines.map((l) => ({ date: l.date, label: fdate(l.date).slice(0, 5), value: l.stats![key] })),
    };
  });

  const summary = subjects.map((s) => {
    let t = `${s.name}: ${f1(s.value)} ${label.toLowerCase()} por partido en ${s.games} PJ (${periodText.toLowerCase()}).`;
    if (s.before && s.after && s.before.games && s.after.games) {
      const d = diff(s.before.value, s.after.value);
      t += ` Antes del ${fdate(split)}: ${f1(s.before.value)} (${s.before.games} PJ); desde esa fecha: ${f1(s.after.value)} (${s.after.games} PJ)`;
      t += d.abs === null ? "." : `, una diferencia de ${d.abs >= 0 ? "+" : ""}${f1(d.abs)}${d.rel !== null ? ` (${d.rel >= 0 ? "+" : ""}${f1(d.rel)}%)` : ""}.`;
    }
    return t;
  });
  const source = meta.mode === "demo" ? "DATOS FICTICIOS DE DEMOSTRACIÓN" : `Fuente: ${meta.sourceName}`;
  const stamp = `Datos al ${fdatetime(meta.lastSuccessfulSync?.finished_at)}`;

  const maxN = Math.max(0, ...subjects.map((s) => s.series.length));
  const lineData = Array.from({ length: maxN }, (_, i) => ({
    n: `P${i + 1}`, ...Object.fromEntries(subjects.map((s) => {
      const vals = win > 1 ? rollingMean(s.series.map((x) => x.value), win) : s.series.map((x) => x.value);
      return [`s${s.id}`, vals[i] ?? null];
    })),
  }));
  const barData = split
    ? [{ cat: `Antes del ${fdate(split)}`, ...Object.fromEntries(subjects.map((s) => [`s${s.id}`, s.before?.value ?? null])) },
      { cat: `Desde el ${fdate(split)}`, ...Object.fromEntries(subjects.map((s) => [`s${s.id}`, s.after?.value ?? null])) }]
    : [{ cat: label, ...Object.fromEntries(subjects.map((s) => [`s${s.id}`, s.value])) }];
  const series = subjects.map((s) => ({ key: `s${s.id}`, name: s.name }));
  const legend = subjects.map((s) => ({ name: s.name, color: s.color }));

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Herramienta de contenido" title="Quinteto Inicial"
        subtitle="Elegí jugadores o equipos, un indicador y un corte de fechas: obtenés tarjetas, gráficos exportables y un resumen listo para el guion."
        leading={<span className="hidden h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-text sm:grid"><Clapperboard size={26} /></span>} />
      {meta.mode === "demo" && <Notice>Estás en modo demostración: todo lo que se exporte desde acá es ficticio.</Notice>}
      <FilterBar>
        <Field label="Analizar">
          <Segmented ariaLabel="Analizar" value={kind} onChange={(v) => { setKind(v); setIds([]); }}
            options={[{ value: "players", label: "Jugadores" }, { value: "teams", label: "Equipos" }]} />
        </Field>
        <Field label="Indicador (por partido)">
          <select className="input w-48" value={key} onChange={(e) => setKey(e.target.value as CountKey)}>
            {KEYS.map((k) => <option key={k} value={k}>{COUNT_LABELS[k].long}</option>)}
          </select>
        </Field>
        <Field label="Comparar antes/después del" hint="Opcional: divide el período en dos tramos para comparar (por ejemplo, antes y después de una lesión o de un cambio de entrenador).">
          <input className="input" type="date" value={split} onChange={(e) => setSplit(e.target.value)} />
        </Field>
        <Field label="Media móvil">
          <Segmented ariaLabel="Media móvil" value={String(win)} onChange={(v) => setWin(Number(v))}
            options={[{ value: "1", label: "No" }, { value: "3", label: "3 PJ" }, { value: "5", label: "5 PJ" }]} />
        </Field>
        <PeriodPicker value={period} onChange={setPeriod} />
      </FilterBar>
      <div className="card p-4">
        <div className="mb-2 text-xs font-medium text-ink-2">{kind === "players" ? "Jugadores" : "Equipos"} (hasta 4)</div>
        <MultiPicker options={kind === "players" ? playerOptions : teamOptions} value={ids} onChange={setIds} colors={colors.series}
          placeholder={kind === "players" ? "Agregar jugador…" : "Agregar equipo…"} />
      </div>

      {!subjects.length ? <EmptyState icon={Sparkles} title="Elegí uno o más jugadores o equipos">Usá el buscador de arriba. Las tarjetas, los gráficos y el resumen aparecen al instante.</EmptyState> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {subjects.map((s) => (
              <div key={s.id} className="card relative overflow-hidden p-4">
                <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: s.color }} />
                <div className="flex items-center gap-2.5">
                  {kind === "players" ? <Avatar name={s.name} size={32} tone={s.color} /> : <TeamMark name={s.name} size={32} />}
                  <div className="min-w-0 truncate text-sm font-semibold">{s.name}</div>
                </div>
                <div className="num mt-3 text-4xl font-extrabold tracking-tight">{f1(s.value)}</div>
                <div className="text-xs text-ink-2">{label.toLowerCase()} por partido · {s.games} PJ</div>
                {s.before && s.after && (
                  <div className="num mt-3 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-ink-2">Antes {f1(s.before.value)} ({s.before.games} PJ) → después <span className="font-semibold text-ink">{f1(s.after.value)}</span> ({s.after.games} PJ)</div>
                )}
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard title={split ? `${label} por partido: antes y después del ${fdate(split)}` : `${label} por partido`}
              subtitle={`${periodText} · Unidad: ${label.toLowerCase()} por partido`} legend={legend} filename={`qi-${key}-barras`}
              csv={{ headers: ["tramo", ...subjects.map((s) => s.name)], rows: barData.map((b) => [b.cat, ...subjects.map((s) => (b as Record<string, number | string | null>)[`s${s.id}`])]) }}>
              <BarsChart data={barData} x="cat" series={series} colors={subjects.map((s) => s.color)} />
            </ChartCard>
            <ChartCard title={`Evolución de ${label.toLowerCase()}`} subtitle={`${periodText} · Eje X: n.º de partido${win > 1 ? ` · media móvil de ${win}` : ""}`}
              legend={legend} filename={`qi-${key}-evolucion`}
              csv={{ headers: ["partido", ...subjects.map((s) => s.name)], rows: lineData.map((d) => [d.n, ...subjects.map((s) => (d as Record<string, number | string | null>)[`s${s.id}`])]) }}>
              <LinesChart data={lineData} x="n" series={series} colors={subjects.map((s) => s.color)} />
            </ChartCard>
          </div>

          <Card icon={FileText} title="Resumen de datos" subtitle="Texto armado automáticamente con los números de arriba (sin interpretación). Revisalo antes de usarlo."
            actions={<>
              <button className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText([...summary, "", source, stamp].join("\n")).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}>
                {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}</button>
              <button className="btn btn-sm" onClick={() => downloadText(`quinteto-inicial-${key}.csv`, toCsv(
                ["nombre", "indicador", "periodo", "pj", "valor_por_partido", "corte", "pj_antes", "valor_antes", "pj_despues", "valor_despues", "fuente", "actualizacion"],
                subjects.map((s) => [s.name, label, periodText, s.games, s.value, split || null, s.before?.games ?? null, s.before?.value ?? null, s.after?.games ?? null, s.after?.value ?? null, source, stamp])))}><Download size={14} /> CSV</button>
            </>}>
            <ul className="space-y-2 text-sm leading-relaxed">{summary.map((t, i) => <li key={i} className="rounded-lg bg-surface-2 px-3 py-2">{t}</li>)}</ul>
            <div className="mt-3 text-xs text-muted">{source} · {stamp}</div>
          </Card>
        </>
      )}
    </div>
  );
}

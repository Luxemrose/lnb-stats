import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeftRight, BarChart3, LineChart as LineIcon, Swords, Table2 } from "lucide-react";
import { BarsChart, ChartCard, LinesChart, useThemeColors } from "../components/charts";
import { CompareModeSwitch, CompareSlots, ComparisonTable, HeadToHead, type CmpEntity, type CmpRow } from "../components/compare";
import { PeriodPicker, defaultPeriod, describePeriod, toPeriod } from "../components/pickers";
import { Card, EmptyState, Field, FilterBar, Notice, PageHeader, Segmented } from "../components/ui";
import { useSeason } from "../lib/data";
import { playerRows, playerSummaries, type PlayerSummary } from "../lib/derive";
import { COUNT_LABELS, f1, pct } from "../lib/format";
import { METRICS, metricValue, type Metric, type View } from "../lib/leaders";
import { COUNT_KEYS, rollingMean } from "../lib/stats";
import { chartLabel, chartValue, type ChartKey } from "./PlayerDetail";

const DEFAULT_STATS = ["pts", "reb", "ast", "stl", "blk", "tov", "eff", "min", "fg_pct", "fg3_pct", "ft_pct", "ts_pct"];
const LOWER_BETTER = new Set(["tov", "pf"]);
const GROUPS = ["Anotación", "Tiro", "Rebotes", "Juego", "Defensa", "Global"] as const;

export function betterOf(m: Metric): "max" | "min" | null {
  if (m.id === "min") return null;
  return LOWER_BETTER.has(m.id) ? "min" : "max";
}

export default function Compare() {
  const sd = useSeason();
  const colors = useThemeColors();
  const [params, setParams] = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").map(Number).filter((n) => n > 0);
  const setIds = (next: number[]) => setParams(next.length ? { ids: next.join(",") } : {});
  const [period, setPeriod] = useState(defaultPeriod);
  const [view, setView] = useState<View>("perGame");
  const [stats, setStats] = useState<string[]>(DEFAULT_STATS);
  const [lineKey, setLineKey] = useState<ChartKey>("pts");
  const [win, setWin] = useState("1");

  const summaries = useMemo(() => (sd ? playerSummaries(sd, toPeriod(period)) : []), [sd, period]);
  const options = useMemo(() => (sd ? playerSummaries(sd).filter((s) => s.agg.games > 0).map((s) => ({
    id: s.playerId, label: s.name, sub: s.currentTeamId ? sd.db.teamsById.get(s.currentTeamId)?.name : undefined,
  })) : []), [sd]);
  if (!sd) return null;

  const periodText = describePeriod(period, sd.season.code);
  const tname = (id: number | null) => (id ? sd.db.teamsById.get(id)!.name : "");
  const chosen = ids.map((id) => summaries.find((s) => s.playerId === id)).filter((s): s is PlayerSummary => !!s);
  const entities: CmpEntity[] = chosen.map((s, i) => ({
    id: s.playerId, name: s.name, color: colors.series[i], sub: tname(s.currentTeamId), games: s.agg.games,
    minutesPerGame: s.agg.minutesPerGame, kind: "player",
  }));
  const metrics = METRICS.filter((m) => stats.includes(m.id));
  const valueOf = (s: PlayerSummary, m: Metric) => (m.kind === "minutes" ? (view === "total" ? s.agg.minutesTotal : s.agg.minutesPerGame) : metricValue(s, m, view));
  const rows: CmpRow[] = metrics.map((m) => ({
    id: m.id, label: m.kind === "minutes" ? (view === "total" ? "Minutos totales" : "Minutos por partido") : m.label, hint: m.hint,
    values: chosen.map((s) => valueOf(s, m)),
    format: (v) => (m.kind === "pct" ? pct(v) : f1(v)),
    better: betterOf(m), isPct: m.kind === "pct",
    partial: chosen.map((s) => (m.kind === "count" ? s.agg.stats[m.key!].n < s.agg.games : false)),
  }));
  const games = chosen.map((s) => s.agg.games);
  const unequal = chosen.length > 1 && Math.max(...games) !== Math.min(...games);
  const highlight = view !== "total" || !unequal;
  const smallMinutes = view === "per40" && chosen.some((s) => (s.agg.minutesTotal ?? 0) < 60);
  const viewLabel = view === "perGame" ? "por partido" : view === "per40" ? "por 40 minutos" : "totales";

  const countMetrics = metrics.filter((m) => m.kind === "count");
  const pctMetrics = metrics.filter((m) => m.kind === "pct");
  const series = chosen.map((s) => ({ key: `p${s.playerId}`, name: s.name }));
  const legend = entities.map((e) => ({ name: e.name, color: e.color }));
  const barData = countMetrics.map((m) => ({ cat: m.short, ...Object.fromEntries(chosen.map((s) => [`p${s.playerId}`, metricValue(s, m, view)])) }));
  const pctData = pctMetrics.map((m) => ({ cat: m.short, ...Object.fromEntries(chosen.map((s) => [`p${s.playerId}`, (() => { const v = metricValue(s, m, view); return v === null ? null : v * 100; })()])) }));

  const w = Number(win);
  const rowsByPlayer = chosen.map((s) => playerRows(sd, s.playerId, toPeriod(period)));
  const lineSeries = rowsByPlayer.map((rs) => { const v = rs.map((r) => chartValue(r, lineKey)); return w > 1 ? rollingMean(v, w) : v; });
  const maxLen = Math.max(0, ...rowsByPlayer.map((r) => r.length));
  const lineData = Array.from({ length: maxLen }, (_, i) => ({ n: `P${i + 1}`, ...Object.fromEntries(chosen.map((s, j) => [`p${s.playerId}`, lineSeries[j][i] ?? null])) }));

  return (
    <div className="space-y-5">
      <PageHeader title="Comparador" subtitle="Elegí hasta 4 jugadores: todos se miden en el mismo período." actions={<CompareModeSwitch mode="players" />} />

      <CompareSlots entities={entities} options={options} placeholder="Buscar jugador…"
        onAdd={(id) => setIds([...ids, id])} onRemove={(id) => setIds(ids.filter((x) => x !== id))} />

      {chosen.length < 2 ? (
        <EmptyState icon={ArrowLeftRight} title={chosen.length ? "Agregá un segundo jugador" : "Elegí dos o más jugadores"}>
          Buscalos por nombre en la tarjeta punteada. También podés llegar desde la ficha de un jugador con el botón "Comparar".
        </EmptyState>
      ) : (
        <>
          <FilterBar>
            <PeriodPicker value={period} onChange={setPeriod} />
            <Field label="Valores">
              <Segmented ariaLabel="Valores" value={view} onChange={setView}
                options={[{ value: "perGame", label: "Por partido" }, { value: "per40", label: "Por 40'" }, { value: "total", label: "Totales" }]} />
            </Field>
          </FilterBar>

          <div className="card p-4">
            <div className="mb-2 text-xs font-medium text-ink-2">Estadísticas a comparar</div>
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              {GROUPS.map((g) => (
                <div key={g} className="flex flex-wrap items-center gap-1.5">
                  <span className="eyebrow mr-1">{g}</span>
                  {METRICS.filter((m) => m.group === g).map((m) => (
                    <button key={m.id} className="chip" aria-pressed={stats.includes(m.id)}
                      onClick={() => setStats(stats.includes(m.id) ? stats.filter((x) => x !== m.id) : [...stats, m.id])}>{m.short}</button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {unequal && <Notice title="Distinta cantidad de partidos">{chosen.map((s) => `${s.name}: ${s.agg.games} PJ`).join(" · ")}. {view === "total" ? "En totales no se destaca un ganador porque no es comparable. " : ""}Para un período equivalente, usá "Últimos N".</Notice>}
          {smallMinutes && <Notice>Algún jugador tiene menos de 60 minutos en el período: los valores por 40' se basan en una muestra muy chica.</Notice>}

          <div className="grid gap-5 xl:grid-cols-5">
            <Card className="xl:col-span-3" icon={Table2} title={`Comparación numérica (${viewLabel})`}
              subtitle={`${periodText}. Corona = mejor valor${highlight ? "" : " (desactivado en totales con distinta cantidad de PJ)"}. Debajo, diferencia con ${chosen[0].name}.`}>
              {rows.length ? <ComparisonTable entities={entities} rows={rows} highlight={highlight} /> : <p className="text-sm text-muted">Elegí al menos una estadística.</p>}
              <p className="mt-2 text-xs text-muted"><sup className="text-warn">*</sup> dato faltante en algunos partidos. Pérdidas y faltas: el mejor es el valor más bajo.</p>
            </Card>
            <Card className="xl:col-span-2" icon={Swords} title={chosen.length === 2 ? "Cara a cara" : "Cara a cara (elegí 2)"}
              subtitle={chosen.length === 2 ? `${viewLabel} · la barra muestra la proporción de cada uno` : "Con exactamente dos jugadores se muestra la comparación enfrentada."}>
              {chosen.length === 2
                ? <HeadToHead a={entities[0]} b={entities[1]} rows={rows.filter((r) => r.values.every((v) => v !== null && v >= 0))} />
                : <p className="text-sm text-muted">Quitá jugadores hasta dejar dos para ver el cara a cara.</p>}
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {countMetrics.length > 0 && (
              <ChartCard title={`Comparación ${viewLabel}`} subtitle={`${periodText} · PJ: ${chosen.map((s) => `${s.name} ${s.agg.games}`).join(", ")}`}
                legend={legend} filename="comparacion-jugadores"
                csv={{ headers: ["categoria", ...chosen.map((s) => s.name)], rows: countMetrics.map((m) => [m.label, ...chosen.map((s) => metricValue(s, m, view))]) }}>
                <BarsChart data={barData} x="cat" colors={entities.map((e) => e.color)} series={series} />
              </ChartCard>
            )}
            {pctMetrics.length > 0 && (
              <ChartCard title="Porcentajes de tiro" subtitle={`${periodText} · convertidos/intentados acumulados`} legend={legend} filename="comparacion-porcentajes"
                csv={{ headers: ["categoria", ...chosen.map((s) => s.name)], rows: pctMetrics.map((m) => [m.label, ...chosen.map((s) => metricValue(s, m, view))]) }}>
                <BarsChart data={pctData} x="cat" colors={entities.map((e) => e.color)} series={series} formatY={(v) => `${v.toFixed(0)}%`} />
              </ChartCard>
            )}
          </div>

          <ChartCard title={`Evolución: ${chartLabel(lineKey).toLowerCase()} por partido`} filename={`evolucion-${lineKey}`}
            subtitle={`${periodText} · eje X: n.º de partido de cada jugador dentro del período${w > 1 ? ` · media móvil de ${w}` : ""}`}
            legend={legend}
            csv={{ headers: ["partido", ...chosen.map((s) => s.name)], rows: lineData.map((d) => [d.n, ...chosen.map((s) => (d as Record<string, number | string | null>)[`p${s.playerId}`])]) }}
            controls={<>
              <Field label="Estadística">
                <select className="input" value={lineKey} onChange={(e) => setLineKey(e.target.value as ChartKey)}>
                  <option value="minutes">Minutos</option>
                  {COUNT_KEYS.map((k) => <option key={k} value={k}>{COUNT_LABELS[k].long}</option>)}
                </select>
              </Field>
              <Field label="Suavizado">
                <Segmented size="sm" ariaLabel="Suavizado" value={win} onChange={setWin}
                  options={[{ value: "1", label: "Cada partido" }, { value: "3", label: "Media 3" }, { value: "5", label: "Media 5" }]} />
              </Field>
            </>}>
            <LinesChart data={lineData} x="n" height={300} colors={entities.map((e) => e.color)} series={series} />
          </ChartCard>
          <p className="flex items-center gap-1.5 text-xs text-muted"><BarChart3 size={12} /><LineIcon size={12} /> Gráficos exportables en PNG (con título, período y fuente) y CSV.</p>
        </>
      )}
    </div>
  );
}

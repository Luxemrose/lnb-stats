import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarsChart, ChartCard, LinesChart, useThemeColors } from "../components/charts";
import { MultiPicker, PeriodPicker, defaultPeriod, describePeriod, toPeriod } from "../components/pickers";
import { Card, EmptyState, Field, Notice, PageHeader, PlayerLink } from "../components/ui";
import { useSeason } from "../lib/data";
import { playerRows, playerSummaries } from "../lib/derive";
import { COUNT_LABELS, PCT_LABELS, f1, pct, signed } from "../lib/format";
import { aggregate, COUNT_KEYS, diff, rollingMean, type Aggregate, type CountKey, type PctKey } from "../lib/stats";
import { chartLabel, chartValue, type ChartKey } from "./PlayerDetail";

type View = "perGame" | "per40" | "total";
const TABLE_KEYS: CountKey[] = ["pts", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf", "pfd", "plus_minus", "eff"];
const TABLE_PCTS: PctKey[] = ["fg_pct", "fg2_pct", "fg3_pct", "ft_pct", "efg_pct", "ts_pct"];

export default function Compare() {
  const sd = useSeason();
  const colors = useThemeColors();
  const [params, setParams] = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").map(Number).filter((n) => n > 0);
  const setIds = (next: number[]) => setParams(next.length ? { ids: next.join(",") } : {});
  const [period, setPeriod] = useState(defaultPeriod);
  const [view, setView] = useState<View>("perGame");
  const [barKeys, setBarKeys] = useState<CountKey[]>(["pts", "reb", "ast"]);
  const [lineKey, setLineKey] = useState<ChartKey>("pts");
  const [win, setWin] = useState(1);

  const options = useMemo(() => (sd ? playerSummaries(sd).filter((s) => s.agg.games > 0).map((s) => ({
    id: s.playerId, label: s.name, sub: s.currentTeamId ? sd.db.teamsById.get(s.currentTeamId)?.name : undefined,
  })) : []), [sd]);
  if (!sd) return null;

  const selected = ids.filter((id) => sd.db.playersById.has(id)).map((id, i) => {
    const rows = playerRows(sd, id, toPeriod(period));
    return { id, name: sd.db.playersById.get(id)!.name, rows, agg: aggregate(rows, rows.map((r) => r.date)) as Aggregate, color: colors.series[i] };
  });
  const periodText = describePeriod(period, sd.season.code);
  const gamesCounts = selected.map((s) => s.agg.games);
  const unequal = selected.length > 1 && Math.max(...gamesCounts) !== Math.min(...gamesCounts);
  const viewLabel = view === "perGame" ? "por partido" : view === "per40" ? "por 40 minutos" : "totales";
  const val = (a: Aggregate, k: CountKey) => a.stats[k][view];

  const barData = barKeys.map((k) => ({ cat: COUNT_LABELS[k].short, ...Object.fromEntries(selected.map((s) => [`p${s.id}`, val(s.agg, k)])) }));
  const maxLen = Math.max(0, ...selected.map((s) => s.rows.length));
  const lineSeries = selected.map((s) => {
    const v = s.rows.map((r) => chartValue(r, lineKey));
    return win > 1 ? rollingMean(v, win) : v;
  });
  const lineData = Array.from({ length: maxLen }, (_, i) => ({
    n: `P${i + 1}`, ...Object.fromEntries(selected.map((s, j) => [`p${s.id}`, lineSeries[j][i] ?? null])),
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="Comparador de jugadores" subtitle={periodText} />
      <div className="card space-y-3 p-3">
        <MultiPicker options={options} value={ids} onChange={setIds} placeholder="Buscar jugador para agregar…" colors={colors.series} />
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker value={period} onChange={setPeriod} />
          <Field label="Valores">
            <select className="input" value={view} onChange={(e) => setView(e.target.value as View)}>
              <option value="perGame">Por partido</option>
              <option value="per40">Por 40 minutos</option>
              <option value="total">Totales</option>
            </select>
          </Field>
        </div>
      </div>

      {selected.length < 2 ? <EmptyState title="Elegí al menos dos jugadores">Usá el buscador para agregar hasta cuatro jugadores. El período elegido se aplica a todos por igual.</EmptyState> : (
        <>
          {unequal && <Notice>Los jugadores tienen distinta cantidad de partidos en el período ({selected.map((s) => `${s.name}: ${s.agg.games}`).join(" · ")}). Para una comparación equivalente probá "Últimos N partidos".</Notice>}
          <Card title={`Comparación numérica (${viewLabel})`} subtitle={`${periodText}. Diferencias respecto de ${selected[0].name}.`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-2">
                    <th className="py-1.5 text-left">Estadística</th>
                    {selected.map((s, i) => (
                      <th key={s.id} className={`px-2 ${i === 0 ? "text-right" : "text-center"}`} colSpan={i === 0 ? 1 : 2}>
                        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                          <PlayerLink id={s.id} name={s.name} /></span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-line font-semibold"><td className="py-1">Partidos (PJ)</td>
                    {selected.map((s, i) => <Cells key={s.id} first={i === 0} value={String(s.agg.games)} />)}</tr>
                  <tr className="border-b border-line"><td className="py-1">Minutos {view === "total" ? "totales" : "por partido"}</td>
                    {selected.map((s, i) => {
                      const v = view === "total" ? s.agg.minutesTotal : s.agg.minutesPerGame;
                      const base = view === "total" ? selected[0].agg.minutesTotal : selected[0].agg.minutesPerGame;
                      const d = diff(base, v);
                      return <Cells key={s.id} first={i === 0} value={f1(v)} d={d.abs} rel={d.rel} />;
                    })}</tr>
                  {TABLE_KEYS.map((k) => (
                    <tr key={k} className="border-b border-line">
                      <td className="py-1">{COUNT_LABELS[k].long}</td>
                      {selected.map((s, i) => {
                        const d = diff(val(selected[0].agg, k), val(s.agg, k));
                        const partial = s.agg.stats[k].n < s.agg.games;
                        return <Cells key={s.id} first={i === 0} value={`${f1(val(s.agg, k))}${partial ? "*" : ""}`} d={d.abs} rel={k === "plus_minus" ? null : d.rel} />;
                      })}
                    </tr>
                  ))}
                  {TABLE_PCTS.map((k) => (
                    <tr key={k} className="border-b border-line last:border-0">
                      <td className="py-1">{PCT_LABELS[k].long}</td>
                      {selected.map((s, i) => {
                        const d = diff(selected[0].agg.pct[k].value, s.agg.pct[k].value, true);
                        return <Cells key={s.id} first={i === 0} value={pct(s.agg.pct[k].value)} d={d.abs} unit=" pp" />;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">* dato faltante en algunos partidos. "pp" = puntos porcentuales. La diferencia % no se muestra para porcentajes ni +/-, ni cuando la base es 0.</p>
          </Card>

          <ChartCard title={`Comparación ${viewLabel}`} subtitle={`${periodText} · PJ: ${selected.map((s) => `${s.name} ${s.agg.games}`).join(", ")}`}
            legend={selected.map((s) => ({ name: s.name, color: s.color }))} filename="comparacion-jugadores"
            csv={{ headers: ["categoria", ...selected.map((s) => s.name)], rows: barKeys.map((k) => [COUNT_LABELS[k].long, ...selected.map((s) => val(s.agg, k))]) }}>
            <div className="mb-2 flex flex-wrap gap-2">
              {COUNT_KEYS.filter((k) => !["fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta"].includes(k)).map((k) => (
                <label key={k} className="flex items-center gap-1 text-xs text-ink-2">
                  <input type="checkbox" checked={barKeys.includes(k)} onChange={(e) => setBarKeys(e.target.checked ? [...barKeys, k] : barKeys.filter((x) => x !== k))} />
                  {COUNT_LABELS[k].short}
                </label>
              ))}
            </div>
            <BarsChart data={barData} x="cat" colors={selected.map((s) => s.color)} series={selected.map((s) => ({ key: `p${s.id}`, name: s.name }))} />
          </ChartCard>

          <ChartCard title={`Evolución: ${chartLabel(lineKey).toLowerCase()} por partido`}
            subtitle={`${periodText} · Eje X: n.º de partido disputado por cada jugador dentro del período${win > 1 ? ` · media móvil de ${win}` : ""}`}
            legend={selected.map((s) => ({ name: s.name, color: s.color }))} filename={`evolucion-${lineKey}`}
            csv={{ headers: ["partido", ...selected.map((s) => s.name)], rows: lineData.map((d) => [d.n, ...selected.map((s) => (d as Record<string, number | string | null>)[`p${s.id}`])]) }}>
            <div className="mb-2 flex flex-wrap gap-3">
              <Field label="Estadística">
                <select className="input" value={lineKey} onChange={(e) => setLineKey(e.target.value as ChartKey)}>
                  <option value="minutes">Minutos</option>
                  {COUNT_KEYS.map((k) => <option key={k} value={k}>{COUNT_LABELS[k].long}</option>)}
                </select>
              </Field>
              <Field label="Suavizado">
                <select className="input" value={win} onChange={(e) => setWin(Number(e.target.value))}>
                  <option value={1}>Valor de cada partido</option>
                  {[3, 5].map((n) => <option key={n} value={n}>Media móvil {n}</option>)}
                </select>
              </Field>
            </div>
            <LinesChart data={lineData} x="n" colors={selected.map((s) => s.color)} series={selected.map((s) => ({ key: `p${s.id}`, name: s.name }))} />
          </ChartCard>
        </>
      )}
    </div>
  );
}

function Cells({ first, value, d, rel, unit = "" }: { first: boolean; value: string; d?: number | null; rel?: number | null; unit?: string }) {
  if (first) return <td className="px-2 text-right font-medium">{value}</td>;
  return (
    <>
      <td className="px-2 text-right font-medium">{value}</td>
      <td className="pr-2 text-right text-xs text-ink-2">
        {d === undefined || d === null ? "" : `${signed(d)}${unit}`}{rel !== undefined && rel !== null ? ` (${signed(rel)}%)` : ""}
      </td>
    </>
  );
}

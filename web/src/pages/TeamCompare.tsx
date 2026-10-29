import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarsChart, ChartCard, LinesChart, useThemeColors } from "../components/charts";
import { MultiPicker, PeriodPicker, defaultPeriod, describePeriod, toPeriod } from "../components/pickers";
import { Card, EmptyState, Notice, PageHeader, TeamLink } from "../components/ui";
import { useSeason } from "../lib/data";
import { COUNT_LABELS, PCT_LABELS, f1, pct, signed } from "../lib/format";
import { ratio, type CountKey } from "../lib/stats";
import { teamPeriodData } from "./TeamDetail";

const KEYS: CountKey[] = ["pts", "reb", "ast", "stl", "tov", "blk", "eff"];

export default function TeamCompare() {
  const sd = useSeason();
  const colors = useThemeColors();
  const [params, setParams] = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").map(Number).filter((n) => n > 0);
  const [period, setPeriod] = useState(defaultPeriod);
  const options = useMemo(() => (sd ? sd.teamIds.map((id) => ({ id, label: sd.db.teamsById.get(id)!.name })) : []), [sd]);
  if (!sd) return null;
  const periodText = describePeriod(period, sd.season.code);
  const sel = ids.filter((id) => sd.teamIds.includes(id)).map((id, i) => ({
    id, name: sd.db.teamsById.get(id)!.name, color: colors.series[i], d: teamPeriodData(sd, id, toPeriod(period)),
  }));
  const rows: { label: string; get: (s: (typeof sel)[number]) => number | null; fmt: (v: number | null) => string; pp?: boolean }[] = [
    { label: "Partidos (PJ)", get: (s) => s.d.done.length, fmt: (v) => String(v ?? "s/d") },
    { label: "% de victorias", get: (s) => ratio(s.d.wins, s.d.done.length), fmt: pct, pp: true },
    { label: "Puntos a favor por partido", get: (s) => ratio(s.d.pf, s.d.done.length), fmt: f1 },
    { label: "Puntos en contra por partido", get: (s) => ratio(s.d.pa, s.d.done.length), fmt: f1 },
    { label: "Diferencia por partido", get: (s) => ratio(s.d.pf - s.d.pa, s.d.done.length), fmt: (v) => signed(v) },
    ...KEYS.filter((k) => k !== "pts").map((k) => ({ label: `${COUNT_LABELS[k].long} por partido`, get: (s: (typeof sel)[number]) => s.d.own.stats[k].perGame, fmt: f1 })),
    ...(["fg_pct", "fg3_pct", "ft_pct", "ts_pct"] as const).map((k) => ({ label: PCT_LABELS[k].long, get: (s: (typeof sel)[number]) => s.d.own.pct[k].value, fmt: pct, pp: true })),
  ];
  const maxN = Math.max(0, ...sel.map((s) => s.d.done.length));
  const winsData = Array.from({ length: maxN }, (_, i) => ({
    n: `P${i + 1}`, ...Object.fromEntries(sel.map((s) => [`t${s.id}`, i < s.d.done.length ? s.d.done.slice(0, i + 1).filter((l) => l.win).length : null])),
  }));
  const barData = [
    { cat: "PF", ...Object.fromEntries(sel.map((s) => [`t${s.id}`, ratio(s.d.pf, s.d.done.length)])) },
    { cat: "PC", ...Object.fromEntries(sel.map((s) => [`t${s.id}`, ratio(s.d.pa, s.d.done.length)])) },
  ];
  const series = sel.map((s) => ({ key: `t${s.id}`, name: s.name }));
  const legend = sel.map((s) => ({ name: s.name, color: s.color }));

  return (
    <div className="space-y-5">
      <PageHeader title="Comparar equipos" subtitle={periodText} />
      <div className="card space-y-3 p-3">
        <MultiPicker options={options} value={ids} onChange={(n) => setParams(n.length ? { ids: n.join(",") } : {})} placeholder="Buscar equipo para agregar…" colors={colors.series} />
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {sel.length < 2 ? <EmptyState title="Elegí al menos dos equipos" /> : (
        <>
          {new Set(sel.map((s) => s.d.done.length)).size > 1 && <Notice>Los equipos tienen distinta cantidad de partidos en el período. Los promedios son comparables; los totales, no.</Notice>}
          <Card title="Comparación" subtitle={`${periodText}. Indicadores calculados por LNB Stats; diferencias respecto de ${sel[0].name}.`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular">
                <thead><tr className="border-b border-line text-xs text-ink-2"><th className="py-1.5 text-left">Indicador</th>
                  {sel.map((s) => <th key={s.id} className="px-2 text-right"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /><TeamLink id={s.id} name={s.name} /></span></th>)}
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-b border-line last:border-0">
                      <td className="py-1">{r.label}</td>
                      {sel.map((s, i) => {
                        const v = r.get(s), base = r.get(sel[0]);
                        const dd = i > 0 && v !== null && base !== null ? (r.pp ? `${signed((v - base) * 100)} pp` : signed(v - base)) : "";
                        return <td key={s.id} className="px-2 text-right"><span className="font-medium">{r.fmt(v)}</span>{dd && <span className="ml-1 text-xs text-ink-2">{dd}</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard title="Puntos a favor y en contra por partido" subtitle={`${periodText} · Unidad: puntos por partido`} legend={legend} filename="equipos-pf-pc"
              csv={{ headers: ["indicador", ...sel.map((s) => s.name)], rows: barData.map((b) => [b.cat, ...sel.map((s) => (b as Record<string, number | string | null>)[`t${s.id}`])]) }}>
              <BarsChart data={barData} x="cat" series={series} colors={sel.map((s) => s.color)} />
            </ChartCard>
            <ChartCard title="Victorias acumuladas" subtitle={`${periodText} · Eje X: n.º de partido de cada equipo en el período`} legend={legend} filename="equipos-victorias"
              csv={{ headers: ["partido", ...sel.map((s) => s.name)], rows: winsData.map((w) => [w.n, ...sel.map((s) => (w as Record<string, number | string | null>)[`t${s.id}`])]) }}>
              <LinesChart data={winsData} x="n" series={series} colors={sel.map((s) => s.color)} unit="victorias" />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

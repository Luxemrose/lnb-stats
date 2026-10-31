import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Shield, Swords, Table2 } from "lucide-react";
import { BarsChart, ChartCard, LinesChart, useThemeColors } from "../components/charts";
import { CompareModeSwitch, CompareSlots, ComparisonTable, HeadToHead, type CmpEntity, type CmpRow } from "../components/compare";
import { PeriodPicker, defaultPeriod, describePeriod, toPeriod } from "../components/pickers";
import { Card, EmptyState, FilterBar, Notice, PageHeader } from "../components/ui";
import { useSeason } from "../lib/data";
import { teamPeriodData, type TeamPeriodData } from "../lib/derive";
import { COUNT_LABELS, PCT_LABELS, f1, pct, signed } from "../lib/format";
import { GLOSSARY } from "../lib/glossary";
import { ratio, type CountKey, type PctKey } from "../lib/stats";

type Sel = { id: number; name: string; color: string; d: TeamPeriodData };

const COUNT_ROWS: { key: CountKey; better: "max" | "min" }[] = [
  { key: "reb", better: "max" }, { key: "oreb", better: "max" }, { key: "ast", better: "max" }, { key: "stl", better: "max" },
  { key: "tov", better: "min" }, { key: "blk", better: "max" }, { key: "eff", better: "max" },
];
const PCT_ROWS: PctKey[] = ["fg_pct", "fg3_pct", "ft_pct", "ts_pct"];

export default function TeamCompare() {
  const sd = useSeason();
  const colors = useThemeColors();
  const [params, setParams] = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").map(Number).filter((n) => n > 0);
  const setIds = (n: number[]) => setParams(n.length ? { ids: n.join(",") } : {});
  const [period, setPeriod] = useState(defaultPeriod);
  const options = useMemo(() => (sd ? sd.teamIds.map((id) => ({ id, label: sd.db.teamsById.get(id)!.name })) : []), [sd]);
  if (!sd) return null;
  const periodText = describePeriod(period, sd.season.code);
  const sel: Sel[] = ids.filter((id) => sd.teamIds.includes(id)).map((id, i) => ({
    id, name: sd.db.teamsById.get(id)!.name, color: colors.series[i], d: teamPeriodData(sd, id, toPeriod(period)),
  }));
  const entities: CmpEntity[] = sel.map((s) => ({
    id: s.id, name: s.name, color: s.color, kind: "team", games: s.d.done.length, sub: `${s.d.wins}-${s.d.losses} en el período`,
    meta: `${signed(ratio(s.d.pf - s.d.pa, s.d.done.length))} DIF/PJ`,
  }));
  const per = (s: Sel, v: number) => ratio(v, s.d.done.length);
  const rows: CmpRow[] = [
    { id: "pj", label: "Partidos (PJ)", values: sel.map((s) => s.d.done.length), format: (v) => String(v ?? "s/d"), better: null },
    { id: "winpct", label: "% de victorias", values: sel.map((s) => per(s, s.d.wins)), format: pct, better: "max", isPct: true },
    { id: "pf", label: "Puntos a favor por partido", values: sel.map((s) => per(s, s.d.pf)), format: f1, better: "max" },
    { id: "pa", label: "Puntos en contra por partido", values: sel.map((s) => per(s, s.d.pa)), format: f1, better: "min" },
    { id: "dif", label: "Diferencia por partido", values: sel.map((s) => per(s, s.d.pf - s.d.pa)), format: (v) => signed(v), better: "max" },
    ...COUNT_ROWS.map(({ key, better }): CmpRow => ({ id: key, label: `${COUNT_LABELS[key].long} por partido`, values: sel.map((s) => s.d.own.stats[key].perGame), format: f1, better,
      hint: key === "eff" ? GLOSSARY.eff : undefined })),
    ...PCT_ROWS.map((k): CmpRow => ({ id: k, label: PCT_LABELS[k].long, values: sel.map((s) => s.d.own.pct[k].value), format: pct, better: "max", isPct: true,
      hint: k === "ts_pct" ? GLOSSARY.ts : undefined })),
  ];
  const legend = sel.map((s) => ({ name: s.name, color: s.color }));
  const series = sel.map((s) => ({ key: `t${s.id}`, name: s.name }));
  const maxN = Math.max(0, ...sel.map((s) => s.d.done.length));
  const winsData = Array.from({ length: maxN }, (_, i) => ({
    n: `P${i + 1}`, ...Object.fromEntries(sel.map((s) => [`t${s.id}`, i < s.d.done.length ? s.d.done.slice(0, i + 1).filter((l) => l.win).length : null])),
  }));
  const barData = [
    { cat: "Puntos a favor", ...Object.fromEntries(sel.map((s) => [`t${s.id}`, per(s, s.d.pf)])) },
    { cat: "Puntos en contra", ...Object.fromEntries(sel.map((s) => [`t${s.id}`, per(s, s.d.pa)])) },
  ];
  const unequal = new Set(sel.map((s) => s.d.done.length)).size > 1;

  return (
    <div className="space-y-5">
      <PageHeader title="Comparador" subtitle="Elegí hasta 4 equipos: todos se miden en el mismo período." actions={<CompareModeSwitch mode="teams" />} />
      <CompareSlots entities={entities} options={options} placeholder="Buscar equipo…"
        onAdd={(id) => setIds([...ids, id])} onRemove={(id) => setIds(ids.filter((x) => x !== id))} />
      {sel.length < 2 ? (
        <EmptyState icon={Shield} title={sel.length ? "Agregá un segundo equipo" : "Elegí dos o más equipos"}>
          Buscalos por nombre en la tarjeta punteada, o entrá desde la ficha de un equipo.
        </EmptyState>
      ) : (
        <>
          <FilterBar><PeriodPicker value={period} onChange={setPeriod} /></FilterBar>
          {unequal && <Notice title="Distinta cantidad de partidos">Los promedios son comparables; los totales, no. Para igualar, usá "Últimos N".</Notice>}
          <div className="grid gap-5 xl:grid-cols-5">
            <Card className="xl:col-span-3" icon={Table2} title="Comparación" subtitle={`${periodText} · indicadores calculados por LNB Stats con datos oficiales. Corona = mejor valor.`}>
              <ComparisonTable entities={entities} rows={rows} highlight />
              <p className="mt-2 text-xs text-muted">Puntos en contra y pérdidas: el mejor es el valor más bajo.</p>
            </Card>
            <Card className="xl:col-span-2" icon={Swords} title={sel.length === 2 ? "Cara a cara" : "Cara a cara (elegí 2)"}>
              {sel.length === 2
                ? <HeadToHead a={entities[0]} b={entities[1]} rows={rows.filter((r) => r.id !== "pj" && r.id !== "dif")} />
                : <p className="text-sm text-muted">Quitá equipos hasta dejar dos para ver el cara a cara.</p>}
            </Card>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard title="Puntos a favor y en contra por partido" subtitle={`${periodText} · Unidad: puntos por partido`} legend={legend} filename="equipos-pf-pc"
              csv={{ headers: ["indicador", ...sel.map((s) => s.name)], rows: barData.map((b) => [b.cat, ...sel.map((s) => (b as Record<string, number | string | null>)[`t${s.id}`])]) }}>
              <BarsChart data={barData} x="cat" series={series} colors={sel.map((s) => s.color)} />
            </ChartCard>
            <ChartCard title="Victorias acumuladas" subtitle={`${periodText} · eje X: n.º de partido de cada equipo`} legend={legend} filename="equipos-victorias"
              csv={{ headers: ["partido", ...sel.map((s) => s.name)], rows: winsData.map((w) => [w.n, ...sel.map((s) => (w as Record<string, number | string | null>)[`t${s.id}`])]) }}>
              <LinesChart data={winsData} x="n" series={series} colors={sel.map((s) => s.color)} unit="victorias" />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

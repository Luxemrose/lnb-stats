import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useData } from "../lib/data";
import { downloadText, fdatetime, toCsv } from "../lib/format";

export interface ThemeColors {
  series: string[]; ink: string; ink2: string; muted: string; grid: string; axis: string; surface: string; border: string;
}

function readColors(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--s${i}`)),
    ink: v("--ink"), ink2: v("--ink-2"), muted: v("--muted"), grid: v("--grid"), axis: v("--axis"),
    surface: v("--surface"), border: v("--axis"),
  };
}

/** Colores reales (hex) de la paleta, para que el PNG exportado conserve los colores. */
export function useThemeColors(): ThemeColors {
  const [c, setC] = useState<ThemeColors>(readColors);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setC(readColors());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return c;
}

export interface SeriesDef { key: string; name: string }

async function exportPng(box: HTMLElement, title: string, subtitle: string, footer: string,
  legend: { name: string; color: string }[], c: ThemeColors, filename: string) {
  // El gráfico es el SVG más grande (los íconos de la leyenda también son SVG).
  const svg = [...box.querySelectorAll<SVGSVGElement>("svg.recharts-surface")]
    .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0] ?? null;
  if (!svg) return;
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("style", "font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 12px");
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  await img.decode();
  const scale = 2, padX = 28, top = 76, legendH = legend.length > 1 ? 30 : 0, bottom = 40;
  const canvas = document.createElement("canvas");
  canvas.width = (width + padX * 2) * scale;
  canvas.height = (height + top + legendH + bottom) * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = c.surface; ctx.fillRect(0, 0, width + padX * 2, height + top + legendH + bottom);
  ctx.fillStyle = c.ink; ctx.font = "600 20px system-ui, sans-serif"; ctx.fillText(title, padX, 34);
  ctx.fillStyle = c.ink2; ctx.font = "13px system-ui, sans-serif"; ctx.fillText(subtitle, padX, 58);
  let x = padX;
  for (const l of legend.length > 1 ? legend : []) {
    ctx.fillStyle = l.color; ctx.fillRect(x, top + 6, 14, 4);
    ctx.fillStyle = c.ink2; ctx.font = "13px system-ui, sans-serif"; ctx.fillText(l.name, x + 20, top + 12);
    x += ctx.measureText(l.name).width + 44;
  }
  ctx.drawImage(img, padX, top + legendH, width, height);
  ctx.fillStyle = c.muted; ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(footer, padX, height + top + legendH + 26);
  canvas.toBlob((b) => {
    if (!b) return;
    const url = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

/** Tarjeta de gráfico: título, período y unidad visibles; exporta PNG (con título y fuente) y CSV. */
export function ChartCard({ title, subtitle, legend, csv, filename, children, note }: {
  title: string; subtitle: string; legend: { name: string; color: string }[];
  csv?: { headers: string[]; rows: (string | number | null)[][] }; filename: string; children: ReactNode; note?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const colors = useThemeColors();
  const { db } = useData();
  const demo = db?.mode === "demo";
  const footer = `${demo ? "DATOS FICTICIOS DE DEMOSTRACIÓN · " : "Fuente: laliganacional.com.ar · "}LNB Stats · datos al ${fdatetime(db?.ds.meta.lastSuccessfulSync?.finished_at ?? db?.ds.meta.generatedAt)}`;
  return (
    <section className="card p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          <div className="text-xs text-muted">{subtitle}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn text-xs" onClick={() => ref.current && exportPng(ref.current, title, subtitle, footer, legend, colors, `${filename}.png`)}>PNG</button>
          {csv && <button className="btn text-xs" onClick={() => downloadText(`${filename}.csv`, toCsv(csv.headers, csv.rows))}>CSV</button>}
        </div>
      </div>
      <div ref={ref}>{children}</div>
      {note && <div className="mt-2 text-xs text-muted">{note}</div>}
    </section>
  );
}

const tooltipStyle = (c: ThemeColors) => ({
  contentStyle: { background: c.surface, border: `1px solid ${c.axis}`, borderRadius: 8, color: c.ink, fontSize: 12 },
  labelStyle: { color: c.ink, fontWeight: 600 },
  itemStyle: { color: c.ink2 },
});

type Row = Record<string, string | number | null>;

/** Línea temporal con varias series. `x` es la clave de la etiqueta del eje X. */
export function LinesChart({ data, x, series, colors, height = 280, unit, refX, refLabel, dashedKeys = [], formatY }: {
  data: Row[]; x: string; series: SeriesDef[]; colors: string[]; height?: number; unit?: string;
  refX?: string; refLabel?: string; dashedKeys?: string[]; formatY?: (v: number) => string;
}) {
  const c = useThemeColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey={x} tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} tickLine={false} minTickGap={16} />
        <YAxis tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} tickLine={false} width={44}
          tickFormatter={formatY} label={unit ? { value: unit, angle: -90, position: "insideLeft", fill: c.muted, fontSize: 11, dy: 30 } : undefined} />
        <Tooltip {...tooltipStyle(c)} formatter={(v) => (typeof v === "number" ? (formatY ? formatY(v) : v.toLocaleString("es-AR", { maximumFractionDigits: 1 })) : "s/d")} />
        {series.length > 1 && <Legend itemSorter={null} wrapperStyle={{ fontSize: 12, color: c.ink2 }} />}
        {refX && <ReferenceLine x={refX} stroke={c.ink2} strokeDasharray="4 4" label={{ value: refLabel, fill: c.ink2, fontSize: 11, position: "insideTopRight" }} />}
        {series.map((s, i) => (
          <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={colors[i]} strokeWidth={2}
            strokeDasharray={dashedKeys.includes(s.key) ? "5 4" : undefined}
            dot={dashedKeys.includes(s.key) ? false : { r: 3, strokeWidth: 0, fill: colors[i] }} activeDot={{ r: 5 }}
            connectNulls={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Barras agrupadas: una categoría por grupo, una serie por jugador/equipo. */
export function BarsChart({ data, x, series, colors, height = 280, formatY }: {
  data: Row[]; x: string; series: SeriesDef[]; colors: string[]; height?: number; formatY?: (v: number) => string;
}) {
  const c = useThemeColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey={x} tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} tickLine={false} />
        <YAxis tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} tickLine={false} width={44} tickFormatter={formatY} />
        <Tooltip {...tooltipStyle(c)} cursor={{ fill: c.grid, opacity: 0.5 }}
          formatter={(v) => (typeof v === "number" ? (formatY ? formatY(v) : v.toLocaleString("es-AR", { maximumFractionDigits: 1 })) : "s/d")} />
        {series.length > 1 && <Legend itemSorter={null} wrapperStyle={{ fontSize: 12, color: c.ink2 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={colors[i]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

import { useRef, type ReactNode } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Download, Image as ImageIcon } from "lucide-react";
import { useData } from "../lib/data";
import { downloadText, fdatetime, toCsv } from "../lib/format";
import { usePrefs } from "../lib/prefs";

export interface ThemeColors {
  series: string[]; ink: string; ink2: string; muted: string; grid: string; axis: string; surface: string;
  surface2: string; border: string; accent: string;
}

// Mismos valores que las variables de index.css. Las series están validadas (daltonismo y contraste)
// para cada superficie: oscura #191F2B y clara #FFFFFF.
const COLORS: Record<"dark" | "light", ThemeColors> = {
  dark: {
    series: ["#4389FF", "#E8691E", "#1E9E77", "#B38A12"], ink: "#E9ECF1", ink2: "#A7B0BF", muted: "#7D8798",
    grid: "#252D3C", axis: "#3A4456", surface: "#191F2B", surface2: "#202737", border: "#3A4558", accent: "#FF8A35",
  },
  light: {
    series: ["#2A6FDB", "#D9631B", "#168A68", "#B08A0C"], ink: "#131923", ink2: "#4A5465", muted: "#6B7587",
    grid: "#E8EBF0", axis: "#C9D0DB", surface: "#FFFFFF", surface2: "#F1F3F7", border: "#C9D0DB", accent: "#F07822",
  },
};

export function useThemeColors(): ThemeColors {
  return COLORS[usePrefs().resolvedTheme];
}

export interface SeriesDef { key: string; name: string }

async function exportPng(box: HTMLElement, title: string, subtitle: string, footer: string,
  legend: { name: string; color: string }[], c: ThemeColors, filename: string) {
  // El gráfico es el SVG más grande (los íconos de la leyenda también son SVG).
  const svg = [...box.querySelectorAll<SVGSVGElement>("svg.recharts-surface")]
    .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
  if (!svg) return;
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("style", "font-family: Inter, system-ui, sans-serif; font-size: 12px");
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  await img.decode();
  const scale = 2, padX = 32, top = 84, legendH = legend.length > 1 ? 32 : 0, bottom = 44;
  const W = width + padX * 2, H = height + top + legendH + bottom;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = c.surface; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.accent; ctx.fillRect(0, 0, W, 4);
  ctx.fillStyle = c.ink; ctx.font = "700 21px Inter, system-ui, sans-serif"; ctx.fillText(title, padX, 40);
  ctx.fillStyle = c.ink2; ctx.font = "13px Inter, system-ui, sans-serif"; ctx.fillText(subtitle, padX, 64);
  let x = padX;
  for (const l of legend.length > 1 ? legend : []) {
    ctx.fillStyle = l.color; ctx.beginPath(); ctx.arc(x + 5, top + 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.ink2; ctx.font = "13px Inter, system-ui, sans-serif"; ctx.fillText(l.name, x + 16, top + 12);
    x += ctx.measureText(l.name).width + 40;
  }
  ctx.drawImage(img, padX, top + legendH, width, height);
  ctx.fillStyle = c.muted; ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.fillText(footer, padX, H - 18);
  ctx.fillStyle = c.accent; ctx.font = "700 12px Inter, system-ui, sans-serif";
  ctx.fillText("LNB Stats", W - padX - ctx.measureText("LNB Stats").width, H - 18);
  canvas.toBlob((b) => {
    if (!b) return;
    const url = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

/** Tarjeta de gráfico: título, período y unidad visibles; exporta PNG (con título y fuente) y CSV. */
export function ChartCard({ title, subtitle, legend, csv, filename, children, note, controls, className = "" }: {
  title: string; subtitle: string; legend: { name: string; color: string }[];
  csv?: { headers: string[]; rows: (string | number | null)[][] }; filename: string; children: ReactNode;
  note?: ReactNode; controls?: ReactNode; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const colors = useThemeColors();
  const { db } = useData();
  const demo = db?.mode === "demo";
  const footer = `${demo ? "DATOS FICTICIOS DE DEMOSTRACIÓN · " : "Fuente: laliganacional.com.ar · "}datos al ${fdatetime(db?.ds.meta.lastSuccessfulSync?.finished_at ?? db?.ds.meta.generatedAt)}`;
  return (
    <section className={`card min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-snug">{title}</h3>
          <div className="mt-0.5 text-xs text-muted">{subtitle}</div>
        </div>
        <div className="flex gap-1.5">
          <button className="btn btn-sm" title="Descargar imagen PNG (con título, período y fuente)"
            onClick={() => ref.current && exportPng(ref.current, title, subtitle, footer, legend, colors, `${filename}.png`)}>
            <ImageIcon size={14} /> PNG
          </button>
          {csv && <button className="btn btn-sm" title="Descargar los datos del gráfico"
            onClick={() => downloadText(`${filename}.csv`, toCsv(csv.headers, csv.rows))}><Download size={14} /> CSV</button>}
        </div>
      </div>
      {controls && <div className="mb-3 flex flex-wrap items-end gap-3">{controls}</div>}
      <div ref={ref}>{children}</div>
      {note && <div className="mt-2 text-xs text-muted">{note}</div>}
    </section>
  );
}

const tooltipStyle = (c: ThemeColors) => ({
  contentStyle: { background: c.surface2, border: `1px solid ${c.border}`, borderRadius: 10, color: c.ink, fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,.25)" },
  labelStyle: { color: c.ink, fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: c.ink2, padding: 0 },
});

type Row = Record<string, string | number | null>;
const fmtNum = (v: number) => v.toLocaleString("es-AR", { maximumFractionDigits: 1 });

/** Línea temporal con varias series (un solo eje). */
export function LinesChart({ data, x, series, colors, height = 280, unit, refX, refLabel, dashedKeys = [], formatY }: {
  data: Row[]; x: string; series: SeriesDef[]; colors: string[]; height?: number; unit?: string;
  refX?: string; refLabel?: string; dashedKeys?: string[]; formatY?: (v: number) => string;
}) {
  const c = useThemeColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey={x} tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} tickLine={false} minTickGap={18} />
        <YAxis tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} tickLine={false} axisLine={false} width={44}
          tickFormatter={formatY} label={unit ? { value: unit, angle: -90, position: "insideLeft", fill: c.muted, fontSize: 11, dy: 30 } : undefined} />
        <Tooltip {...tooltipStyle(c)} cursor={{ stroke: c.axis }} formatter={(v) => (typeof v === "number" ? (formatY ? formatY(v) : fmtNum(v)) : "s/d")} />
        {series.length > 1 && <Legend itemSorter={null} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: c.ink2, paddingTop: 6 }} />}
        {refX && <ReferenceLine x={refX} stroke={c.ink2} strokeDasharray="4 4" label={{ value: refLabel, fill: c.ink2, fontSize: 11, position: "insideTopRight" }} />}
        {series.map((s, i) => (
          <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={colors[i]} strokeWidth={2}
            strokeDasharray={dashedKeys.includes(s.key) ? "5 4" : undefined}
            dot={dashedKeys.includes(s.key) ? false : { r: 3, strokeWidth: 0, fill: colors[i] }}
            activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
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
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey={x} tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} tickLine={false} />
        <YAxis tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} tickLine={false} axisLine={false} width={44} tickFormatter={formatY} />
        <Tooltip {...tooltipStyle(c)} cursor={{ fill: c.grid, opacity: 0.6 }}
          formatter={(v) => (typeof v === "number" ? (formatY ? formatY(v) : fmtNum(v)) : "s/d")} />
        {series.length > 1 && <Legend itemSorter={null} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: c.ink2, paddingTop: 6 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={colors[i]} radius={[4, 4, 0, 0]} maxBarSize={38} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

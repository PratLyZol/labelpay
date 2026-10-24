"use client";

import { useId, useState } from "react";

/* Palette: validated reference categorical slots 1-3 (blue, orange, aqua) + status colors. */
export const SERIES: Record<string, { light: string; dark: string; label: string }> = {
  text: { light: "#2a78d6", dark: "#3987e5", label: "Text" },
  pairwise: { light: "#eb6834", dark: "#d95926", label: "Pairwise" },
  image: { light: "#1baf7a", dark: "#199e70", label: "Image" },
};
export const STATUS = { good: "#008300", warning: "#c98500", serious: "#d93025", neutral: "#9a9890" };

export interface Point { x: number; y: number }
export interface Series { key: string; label: string; color: string; points: Point[] }

function scale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

function fmtTime(t: number) {
  const d = new Date(t);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/** Multi-series line chart with a crosshair tooltip. One y axis only. */
export function LineChart({ series, height = 220, yLabel, yFormat = (v) => String(Math.round(v)), empty = "No data yet" }: {
  series: Series[];
  height?: number;
  yLabel?: string;
  yFormat?: (v: number) => string;
  empty?: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">{empty}</div>;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const xd: [number, number] = [Math.min(...xs), Math.max(...xs)];
  const yMax = Math.max(1, ...ys);
  const x = scale(xd, [pad.l, width - pad.r]);
  const y = scale([0, yMax * 1.1], [height - pad.b, pad.t]);
  const ticks = 4;
  const xTicks = Array.from({ length: 5 }, (_, i) => xd[0] + ((xd[1] - xd[0]) * i) / 4);
  const uniqX = [...new Set(xs)].sort((a, b) => a - b);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const t = xd[0] + ((px - pad.l) / (width - pad.l - pad.r)) * (xd[1] - xd[0]);
    let best = uniqX[0];
    for (const u of uniqX) if (Math.abs(u - t) < Math.abs(best - t)) best = u;
    setHover(best);
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-labelledby={`${id}-t`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <title id={`${id}-t`}>{yLabel ?? "chart"}</title>
        {Array.from({ length: ticks + 1 }, (_, i) => (yMax * 1.1 * i) / ticks).map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.08} />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.6}>{yFormat(v)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={height - 8} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.6}>{fmtTime(t)}</text>
        ))}
        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => a.x - b.x);
          const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.length < 40 && pts.map((p) => <circle key={p.x} cx={x(p.x)} cy={y(p.y)} r={3} fill={s.color} stroke="var(--background)" strokeWidth={2} />)}
            </g>
          );
        })}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} stroke="currentColor" strokeOpacity={0.3} strokeDasharray="3 3" />}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow">
          <div className="mb-1 font-medium">{fmtTime(hover)}</div>
          {series.map((s) => {
            const p = s.points.find((q) => q.x === hover);
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-sm" style={{ background: s.color }} />
                <span className="text-muted-foreground">{s.label}</span>
                <span className="ml-auto font-mono">{p ? yFormat(p.y) : "–"}</span>
              </div>
            );
          })}
        </div>
      )}
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars with a 2px gap and rounded data ends. */
export function Bars({ rows, format = (v) => String(v) }: { rows: { label: string; value: number; color: string; hint?: string }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-sm" title={r.hint}>
          <div className="flex justify-between">
            <span className="flex items-center gap-2"><span className="inline-block size-2.5 rounded-sm" style={{ background: r.color }} />{r.label}</span>
            <span className="font-mono text-xs text-muted-foreground">{format(r.value)}</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${(100 * r.value) / max}%`, background: r.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-[15px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

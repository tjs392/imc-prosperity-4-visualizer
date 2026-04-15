"use client";

import { useEffect, useMemo, useRef } from "react";
import uPlot, { AlignedData, Options } from "uplot";
import "uplot/dist/uPlot.min.css";
import { MetricPoint } from "@/lib/historicalMetrics";
import {
  wheelZoomPlugin,
  resetUPlotX,
  scaleSyncPlugin,
  registerScaleSync,
  unregisterScaleSync,
} from "@/lib/uplotPlugins";
import {
  makeXPlotLinesDrawHook,
  makeYPlotLinesDrawHook,
  computeYRange,
  darkAxes,
  XPlotLine,
} from "@/lib/historicalUplotHelpers";

type Props = {
  rolling: MetricPoint[];
  global: MetricPoint[];
  detrended: MetricPoint[];
  label: string;
  height?: number;
  xPlotLines?: XPlotLine[];
  syncKey?: string;
  resetSignal?: number;
};

const COLORS = {
  rolling: "#60a5fa",
  global: "#f97316",
  detrended: "#a3e635",
};

export default function HistoricalZScoreChart({
  rolling,
  global,
  detrended,
  label,
  height = 260,
  xPlotLines,
  syncKey = "historical",
  resetSignal = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const xPlotLinesRef = useRef(xPlotLines);
  xPlotLinesRef.current = xPlotLines;

  const alignedData = useMemo<AlignedData>(() => {
    const m1 = new Map<number, number>();
    const m2 = new Map<number, number>();
    const m3 = new Map<number, number>();
    for (const p of rolling) m1.set(p.time, p.value);
    for (const p of global) m2.set(p.time, p.value);
    for (const p of detrended) m3.set(p.time, p.value);
    const set = new Set<number>();
    for (const t of m1.keys()) set.add(t);
    for (const t of m2.keys()) set.add(t);
    for (const t of m3.keys()) set.add(t);
    const xs = Array.from(set).sort((a, b) => a - b);
    if (xs.length === 0) {
      return [[], [], [], []] as unknown as AlignedData;
    }
    const a = xs.map((t) => (m1.has(t) ? (m1.get(t) as number) : null));
    const b = xs.map((t) => (m2.has(t) ? (m2.get(t) as number) : null));
    const c = xs.map((t) => (m3.has(t) ? (m3.get(t) as number) : null));
    return [xs, a, b, c] as unknown as AlignedData;
  }, [rolling, global, detrended]);

  useEffect(() => {
    if (!containerRef.current) return;

    const drawXPlotLines = makeXPlotLinesDrawHook(() => xPlotLinesRef.current);
    const drawYPlotLines = makeYPlotLinesDrawHook(() => [
      { value: 2, color: "#525252", dashed: true },
      { value: 0, color: "#737373" },
      { value: -2, color: "#525252", dashed: true },
    ]);

    const opts: Options = {
      width: containerRef.current.clientWidth,
      height,
      plugins: [wheelZoomPlugin(0.75), scaleSyncPlugin(syncKey)],
      series: [
        {},
        {
          label: "Rolling",
          stroke: COLORS.rolling,
          width: 1.25,
          points: { show: false },
          spanGaps: false,
        },
        {
          label: "Global",
          stroke: COLORS.global,
          width: 1.25,
          points: { show: false },
          spanGaps: false,
        },
        {
          label: "Detrended",
          stroke: COLORS.detrended,
          width: 1.25,
          points: { show: false },
          spanGaps: false,
        },
      ],
      cursor: {
        show: true,
        x: true,
        y: true,
        drag: { x: true, y: false, uni: 20 },
        sync: { key: syncKey },
        points: {
          show: true,
          size: 6,
          stroke: () => "#e5e5e5",
          fill: () => "#e5e5e5",
        },
      },
      legend: { show: false },
      scales: { x: { time: false }, y: { auto: true } },
      axes: darkAxes(),
      hooks: {
        draw: [drawYPlotLines, drawXPlotLines],
        setCursor: [
          (u) => {
            const tt = tooltipRef.current;
            const container = containerRef.current;
            if (!tt || !container) return;
            const { idx } = u.cursor;
            if (idx === null || idx === undefined) {
              tt.style.display = "none";
              return;
            }
            const xVal = u.data[0][idx];
            if (xVal === null || xVal === undefined) {
              tt.style.display = "none";
              return;
            }
            const labels = ["", "Rolling", "Global", "Detrended"];
            const colors = ["", COLORS.rolling, COLORS.global, COLORS.detrended];
            const lines: string[] = [
              `<div style="font-size:10px;color:#737373">ts ${xVal}</div>`,
            ];
            for (let s = 1; s <= 3; s++) {
              const v = u.data[s]?.[idx];
              if (v === null || v === undefined) continue;
              lines.push(
                `<div style="font-size:11px;color:${colors[s]};font-family:ui-monospace,monospace">${labels[s]}: ${(v as number).toFixed(2)}</div>`
              );
            }
            if (lines.length === 1) {
              tt.style.display = "none";
              return;
            }
            tt.style.display = "block";
            tt.innerHTML = lines.join("");
            const rect = container.getBoundingClientRect();
            const tw = 160;
            const cl = u.cursor.left ?? 0;
            const ct = u.cursor.top ?? 0;
            let left = cl + 12;
            if (left + tw > rect.width) left = cl - tw - 12;
            tt.style.left = `${left}px`;
            tt.style.top = `${Math.max(4, ct - 30)}px`;
          },
        ],
      },
    };

    const plot = new uPlot(opts, alignedData, containerRef.current);
    plotRef.current = plot;
    registerScaleSync(plot, syncKey);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plot.setSize({ width: entry.contentRect.width, height });
      }
    });
    ro.observe(containerRef.current);
    const local = containerRef.current;
    const leave = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
    };
    local.addEventListener("mouseleave", leave);

    return () => {
      ro.disconnect();
      local.removeEventListener("mouseleave", leave);
      unregisterScaleSync(plot);
      plot.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, syncKey]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    plot.setData(alignedData, false);
    const arrays: (number | null)[][] = [];
    for (let s = 1; s < alignedData.length; s++) {
      arrays.push(alignedData[s] as (number | null)[]);
    }
    const r = computeYRange(arrays);
    if (r) {
      // Ensure ±2 reference lines stay visible.
      const min = Math.min(r.min, -2.2);
      const max = Math.max(r.max, 2.2);
      plot.setScale("y", { min, max });
    } else {
      plot.redraw();
    }
  }, [alignedData]);

  useEffect(() => {
    if (resetSignal === 0) return;
    resetUPlotX(plotRef.current);
  }, [resetSignal]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31] relative min-w-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-neutral-100 text-xs font-semibold">{label}</span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] text-neutral-400">
              <span
                className="inline-block w-2 h-2"
                style={{ backgroundColor: COLORS.rolling }}
              />
              Rolling
            </span>
            <span className="flex items-center gap-1 text-[11px] text-neutral-400">
              <span
                className="inline-block w-2 h-2"
                style={{ backgroundColor: COLORS.global }}
              />
              Global
            </span>
            <span className="flex items-center gap-1 text-[11px] text-neutral-400">
              <span
                className="inline-block w-2 h-2"
                style={{ backgroundColor: COLORS.detrended }}
              />
              Detrended
            </span>
          </div>
        </div>
        <button
          onClick={() => resetUPlotX(plotRef.current)}
          className="text-[11px] text-neutral-400 hover:text-neutral-100 border border-neutral-600 px-1.5 py-0.5"
        >
          Reset
        </button>
      </div>
      <div
        ref={containerRef}
        style={{ width: "100%", height }}
        className="relative"
      />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-[#1f2125] border border-neutral-600 px-2 py-1 z-10"
        style={{ display: "none", top: 0, left: 0, minWidth: 140 }}
      />
    </div>
  );
}
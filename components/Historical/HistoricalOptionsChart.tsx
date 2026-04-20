"use client";

import { useEffect, useMemo, useRef } from "react";
import uPlot, { AlignedData, Options } from "uplot";
import "uplot/dist/uPlot.min.css";
import {
  wheelZoomPlugin,
  resetUPlotX,
  scaleSyncPlugin,
  registerScaleSync,
  unregisterScaleSync,
} from "@/lib/uplotPlugins";
import {
  makeXPlotLinesDrawHook,
  computeYRange,
  darkAxes,
  XPlotLine,
} from "@/lib/historicalUplotHelpers";

export type OptionsSeries = {
  label: string;
  color: string;
  data: { time: number; value: number }[];
};

type Props = {
  series: OptionsSeries[];
  label: string;
  height?: number;
  syncKey?: string;
  resetSignal?: number;
  xPlotLines?: XPlotLine[];
  formatValue?: (v: number) => string;
};

export default function HistoricalOptionsChart({
  series,
  label,
  height = 260,
  syncKey = "historical",
  resetSignal = 0,
  xPlotLines,
  formatValue,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const xPlotLinesRef = useRef(xPlotLines);
  xPlotLinesRef.current = xPlotLines;
  const formatValueRef = useRef(formatValue);
  formatValueRef.current = formatValue;
  const seriesRef = useRef(series);
  seriesRef.current = series;

  const hasAnyData = series.length > 0 && series.some((s) => s.data.length > 0);

  const alignedData = useMemo<AlignedData>(() => {
    const maps = series.map((s) => {
      const m = new Map<number, number>();
      for (const d of s.data) m.set(d.time, d.value);
      return m;
    });
    const tset = new Set<number>();
    for (const m of maps) for (const t of m.keys()) tset.add(t);
    if (tset.size === 0) {
      const empty: (number | null)[][] = [[]];
      for (let i = 0; i < series.length; i++) empty.push([]);
      return empty as unknown as AlignedData;
    }
    const xs = Array.from(tset).sort((a, b) => a - b);
    const cols: (number | null)[][] = [xs];
    for (const m of maps) {
      cols.push(xs.map((t) => (m.has(t) ? (m.get(t) as number) : null)));
    }
    return cols as unknown as AlignedData;
  }, [series]);

  const seriesCount = series.length;

  useEffect(() => {
    if (!containerRef.current) return;
    if (!hasAnyData) return;

    const drawXPlotLines = makeXPlotLinesDrawHook(() => xPlotLinesRef.current);

    const uSeries: Options["series"] = [{}];
    for (const s of seriesRef.current) {
      uSeries.push({
        label: s.label,
        stroke: s.color,
        width: 1.25,
        points: { show: false },
        spanGaps: false,
      });
    }

    const opts: Options = {
      width: containerRef.current.clientWidth,
      height,
      plugins: [wheelZoomPlugin(0.75), scaleSyncPlugin(syncKey)],
      series: uSeries,
      cursor: {
        show: true,
        x: true,
        y: true,
        drag: { x: true, y: false, uni: 20 },
        sync: { key: syncKey },
        points: { show: true, size: 5 },
      },
      legend: { show: false },
      scales: { x: { time: false }, y: { auto: true } },
      axes: darkAxes(),
      hooks: {
        draw: [drawXPlotLines],
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
            const fv = formatValueRef.current;
            const fmt = (v: number) => (fv ? fv(v) : v.toFixed(2));
            const lines: string[] = [
              `<div style="font-size:10px;color:#737373">ts ${xVal}</div>`,
            ];
            const currentSeries = seriesRef.current;
            let anyValid = false;
            for (let i = 0; i < currentSeries.length; i++) {
              const v = u.data[i + 1]?.[idx];
              if (v === null || v === undefined) continue;
              anyValid = true;
              const s = currentSeries[i];
              lines.push(
                `<div style="font-size:11px;color:${s.color};font-family:ui-monospace,monospace">${s.label}: ${fmt(v as number)}</div>`
              );
            }
            if (!anyValid) {
              tt.style.display = "none";
              return;
            }
            tt.style.display = "block";
            tt.innerHTML = lines.join("");
            const rect = container.getBoundingClientRect();
            const tw = 220;
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
  }, [height, syncKey, seriesCount, hasAnyData]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    plot.setData(alignedData, false);
    const arrays: (number | null)[][] = [];
    for (let s = 1; s < alignedData.length; s++) {
      arrays.push(alignedData[s] as (number | null)[]);
    }
    const r = computeYRange(arrays);
    if (r) plot.setScale("y", { min: r.min, max: r.max });
    else plot.redraw();
  }, [alignedData]);

  useEffect(() => {
    if (resetSignal === 0) return;
    resetUPlotX(plotRef.current);
  }, [resetSignal]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31] relative min-w-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <span className="text-neutral-100 text-xs font-semibold">{label}</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {series.map((s) => (
              <span
                key={s.label}
                className="flex items-center gap-1 text-[10px] text-neutral-400"
              >
                <span
                  className="inline-block w-2.5 h-0.5"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </span>
            ))}
          </div>
          <button
            onClick={() => resetUPlotX(plotRef.current)}
            className="text-[11px] text-neutral-400 hover:text-neutral-100 border border-neutral-600 px-1.5 py-0.5"
          >
            Reset
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        style={{ width: "100%", height }}
        className="relative"
      >
        {!hasAnyData && (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-600 text-[11px]">
            no data
          </div>
        )}
      </div>
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-[#1f2125] border border-neutral-600 px-2 py-1 z-10"
        style={{ display: "none", top: 0, left: 0, minWidth: 180 }}
      />
    </div>
  );
}
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
  series: MetricPoint[];
  mean: number;
  stdev: number;
  label: string;
  height?: number;
  xPlotLines?: XPlotLine[];
  syncKey?: string;
  resetSignal?: number;
};

const SPREAD_COLOR = "#e879f9";

export default function HistoricalPairSpreadChart({
  series,
  mean,
  stdev,
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
  const meanRef = useRef(mean);
  meanRef.current = mean;
  const stdevRef = useRef(stdev);
  stdevRef.current = stdev;

  const alignedData = useMemo<AlignedData>(() => {
    if (series.length === 0) return [[], []] as unknown as AlignedData;
    const xs = series.map((p) => p.time);
    const ys = series.map((p) => p.value);
    return [xs, ys] as unknown as AlignedData;
  }, [series]);

  useEffect(() => {
    if (!containerRef.current) return;

    const drawXPlotLines = makeXPlotLinesDrawHook(() => xPlotLinesRef.current);
    const drawYPlotLines = makeYPlotLinesDrawHook(() => {
      const m = meanRef.current;
      const s = stdevRef.current;
      return [
        { value: m + 2 * s, color: "#ef4444", dashed: true },
        { value: m + s, color: "#737373", dashed: true },
        { value: m, color: "#a3a3a3" },
        { value: m - s, color: "#737373", dashed: true },
        { value: m - 2 * s, color: "#22c55e", dashed: true },
      ];
    });

    const opts: Options = {
      width: containerRef.current.clientWidth,
      height,
      plugins: [wheelZoomPlugin(0.75), scaleSyncPlugin(syncKey)],
      series: [
        {},
        {
          label: "Spread",
          stroke: SPREAD_COLOR,
          width: 1.5,
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
          stroke: () => SPREAD_COLOR,
          fill: () => SPREAD_COLOR,
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
            const yVal = u.data[1]?.[idx];
            if (
              xVal === null ||
              xVal === undefined ||
              yVal === null ||
              yVal === undefined
            ) {
              tt.style.display = "none";
              return;
            }
            const v = yVal as number;
            const z = stdevRef.current === 0 ? 0 : (v - meanRef.current) / stdevRef.current;
            tt.style.display = "block";
            tt.innerHTML =
              `<div style="font-size:10px;color:#737373">ts ${xVal}</div>` +
              `<div style="font-size:11px;color:${SPREAD_COLOR};font-family:ui-monospace,monospace">spread: ${v.toFixed(2)}</div>` +
              `<div style="font-size:11px;color:#a3a3a3;font-family:ui-monospace,monospace">z: ${z.toFixed(2)}</div>`;
            const rect = container.getBoundingClientRect();
            const tw = 140;
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
      const m = mean;
      const s = stdev;
      const lo = Math.min(r.min, m - 2.2 * s);
      const hi = Math.max(r.max, m + 2.2 * s);
      plot.setScale("y", { min: lo, max: hi });
    } else {
      plot.redraw();
    }
  }, [alignedData, mean, stdev]);

  useEffect(() => {
    // When mean/stdev change and data didn't, force a redraw so y-plot-lines update.
    plotRef.current?.redraw();
  }, [mean, stdev]);

  useEffect(() => {
    if (resetSignal === 0) return;
    resetUPlotX(plotRef.current);
  }, [resetSignal]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31] relative min-w-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-neutral-100 text-xs font-semibold">{label}</span>
          <span className="text-[11px] text-neutral-500 font-mono">
            mean {mean.toFixed(2)} σ {stdev.toFixed(2)}
          </span>
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
        style={{ display: "none", top: 0, left: 0, minWidth: 120 }}
      />
    </div>
  );
}
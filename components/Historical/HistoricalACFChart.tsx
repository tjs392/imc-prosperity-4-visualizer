"use client";

import { useEffect, useMemo, useRef } from "react";
import uPlot, { AlignedData, Options } from "uplot";
import "uplot/dist/uPlot.min.css";
import { MetricPoint } from "@/lib/historicalMetrics";
import {
  makeYPlotLinesDrawHook,
  computeYRange,
  darkAxes,
} from "@/lib/historicalUplotHelpers";

type Props = {
  data: MetricPoint[];
  confidenceBand: number;
  label: string;
  height?: number;
};

const BAR_COLOR = "#d4d4d4";

export default function HistoricalACFChart({
  data,
  confidenceBand,
  label,
  height = 260,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const bandRef = useRef(confidenceBand);
  bandRef.current = confidenceBand;

  const alignedData = useMemo<AlignedData>(() => {
    if (data.length === 0) return [[], []] as unknown as AlignedData;
    const xs = data.map((p) => p.time);
    const ys = data.map((p) => p.value);
    return [xs, ys] as unknown as AlignedData;
  }, [data]);

  useEffect(() => {
    if (!containerRef.current) return;

    const drawYPlotLines = makeYPlotLinesDrawHook(() => [
      { value: bandRef.current, color: "#f97316", dashed: true },
      { value: 0, color: "#737373" },
      { value: -bandRef.current, color: "#f97316", dashed: true },
    ]);

    const barsBuilder = uPlot.paths.bars!({ size: [0.8, 100] });

    const opts: Options = {
      width: containerRef.current.clientWidth,
      height,
      series: [
        {},
        {
          label: "ACF",
          stroke: BAR_COLOR,
          fill: BAR_COLOR,
          width: 1,
          paths: barsBuilder,
          points: { show: false },
        },
      ],
      cursor: {
        show: true,
        x: true,
        y: true,
        drag: { x: false, y: false },
        points: { show: false },
      },
      legend: { show: false },
      scales: { x: { time: false }, y: { auto: true } },
      axes: darkAxes({ xLabel: "Lag (timestamps)" }),
      hooks: {
        draw: [drawYPlotLines],
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
            const sig = Math.abs(v) > bandRef.current;
            const color = sig ? "#f5f5f5" : "#a3a3a3";
            tt.style.display = "block";
            tt.innerHTML =
              `<div style="font-size:10px;color:#737373">lag ${xVal}</div>` +
              `<div style="font-size:11px;color:${color};font-family:ui-monospace,monospace">corr: ${v.toFixed(4)}</div>`;
            const rect = container.getBoundingClientRect();
            const tw = 130;
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
      plot.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    plot.setData(alignedData, false);
    const arr = (alignedData[1] as (number | null)[]) ?? [];
    const r = computeYRange([arr], 0.1);
    if (r) {
      const lo = Math.min(r.min, -confidenceBand * 1.2, 0);
      const hi = Math.max(r.max, confidenceBand * 1.2, 0);
      plot.setScale("y", { min: lo, max: hi });
    } else {
      plot.redraw();
    }
  }, [alignedData, confidenceBand]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31] relative min-w-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <span className="text-neutral-100 text-xs font-semibold">{label}</span>
        <span className="text-[11px] text-neutral-500 font-mono">
          ±{confidenceBand.toFixed(3)}
        </span>
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
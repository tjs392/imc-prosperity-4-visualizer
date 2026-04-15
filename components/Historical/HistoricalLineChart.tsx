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
  makeYPlotLinesDrawHook,
  computeYRange,
  darkAxes,
  XPlotLine,
} from "@/lib/historicalUplotHelpers";

type Point = { time: number; value: number };

type Props = {
  data: Point[];
  data2?: Point[];
  label: string;
  color: string;
  color2?: string;
  valueLabel?: string;
  valueLabel2?: string;
  fillArea?: boolean;
  zeroLine?: boolean;
  height?: number;
  formatValue?: (v: number) => string;
  syncKey?: string;
  resetSignal?: number;
  xPlotLines?: XPlotLine[];
};

export default function HistoricalLineChart({
  data,
  data2,
  label,
  color,
  color2,
  valueLabel = "value",
  valueLabel2 = "value2",
  fillArea = false,
  zeroLine = false,
  height = 260,
  formatValue,
  syncKey = "historical",
  resetSignal = 0,
  xPlotLines,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const formatValueRef = useRef(formatValue);
  formatValueRef.current = formatValue;
  const valueLabelRef = useRef(valueLabel);
  valueLabelRef.current = valueLabel;
  const valueLabel2Ref = useRef(valueLabel2);
  valueLabel2Ref.current = valueLabel2;
  const xPlotLinesRef = useRef(xPlotLines);
  xPlotLinesRef.current = xPlotLines;
  const hasSecond = data2 !== undefined;

  const alignedData = useMemo<AlignedData>(() => {
    const m1 = new Map<number, number>();
    for (const d of data) m1.set(d.time, d.value);
    const m2 = new Map<number, number>();
    if (hasSecond && data2) for (const d of data2) m2.set(d.time, d.value);
    const tset = new Set<number>();
    for (const t of m1.keys()) tset.add(t);
    for (const t of m2.keys()) tset.add(t);
    if (tset.size === 0) {
      return hasSecond
        ? ([[], [], []] as unknown as AlignedData)
        : ([[], []] as unknown as AlignedData);
    }
    const xs = Array.from(tset).sort((a, b) => a - b);
    const ys1 = xs.map((t) => (m1.has(t) ? (m1.get(t) as number) : null));
    if (!hasSecond) return [xs, ys1] as unknown as AlignedData;
    const ys2 = xs.map((t) => (m2.has(t) ? (m2.get(t) as number) : null));
    return [xs, ys1, ys2] as unknown as AlignedData;
  }, [data, data2, hasSecond]);

  useEffect(() => {
    if (!containerRef.current) return;

    const drawXPlotLines = makeXPlotLinesDrawHook(() => xPlotLinesRef.current);
    const drawZero = zeroLine
      ? makeYPlotLinesDrawHook(() => [
          { value: 0, color: "rgba(212,212,212,0.4)", dashed: true },
        ])
      : null;

    const fillTo = (u: uPlot) => u.valToPos(0, "y", true);

    const series: Options["series"] = [
      {},
      {
        label: valueLabel,
        stroke: color,
        width: 1.5,
        points: { show: false },
        spanGaps: false,
        ...(fillArea ? { fill: color + "55", fillTo } : {}),
      },
    ];
    if (hasSecond) {
      series.push({
        label: valueLabel2,
        stroke: color2 ?? color,
        width: 1.5,
        points: { show: false },
        spanGaps: false,
        ...(fillArea ? { fill: (color2 ?? color) + "55", fillTo } : {}),
      });
    }

    const opts: Options = {
      width: containerRef.current.clientWidth,
      height,
      plugins: [wheelZoomPlugin(0.75), scaleSyncPlugin(syncKey)],
      series,
      cursor: {
        show: true,
        x: true,
        y: true,
        drag: { x: true, y: false, uni: 20 },
        sync: { key: syncKey },
        points: {
          show: true,
          size: 6,
          stroke: () => color,
          fill: () => color,
        },
      },
      legend: { show: false },
      scales: { x: { time: false }, y: { auto: true } },
      axes: darkAxes(),
      hooks: {
        draw: drawZero ? [drawZero, drawXPlotLines] : [drawXPlotLines],
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
            const y1 = u.data[1]?.[idx];
            const y2 = hasSecond ? u.data[2]?.[idx] : undefined;
            const y1Valid = y1 !== null && y1 !== undefined;
            const y2Valid = hasSecond && y2 !== null && y2 !== undefined;
            if (
              xVal === null ||
              xVal === undefined ||
              (!y1Valid && !y2Valid)
            ) {
              tt.style.display = "none";
              return;
            }
            const fv = formatValueRef.current;
            const fmt = (v: number) => (fv ? fv(v) : v.toFixed(2));
            const lines: string[] = [
              `<div style="font-size:10px;color:#737373">ts ${xVal}</div>`,
            ];
            if (y1Valid) {
              lines.push(
                `<div style="font-size:11px;color:${color};font-family:ui-monospace,monospace">${valueLabelRef.current}: ${fmt(y1 as number)}</div>`
              );
            }
            if (y2Valid) {
              lines.push(
                `<div style="font-size:11px;color:${color2 ?? color};font-family:ui-monospace,monospace">${valueLabel2Ref.current}: ${fmt(y2 as number)}</div>`
              );
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
  }, [height, color, color2, syncKey, hasSecond, fillArea, zeroLine]);

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
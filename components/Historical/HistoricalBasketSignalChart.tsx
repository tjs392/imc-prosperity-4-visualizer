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

export type SignalMarker = {
  time: number;
  kind: "entryLong" | "entryShort" | "exit";
};

type Point = { time: number; value: number };

type Props = {
  spread: Point[];
  premium: Point[];
  signal: Point[];
  threshold: number;
  markers: SignalMarker[];
  label: string;
  height?: number;
  syncKey?: string;
  resetSignal?: number;
  xPlotLines?: XPlotLine[];
};

const COLOR_SPREAD = "rgba(245, 158, 11, 0.35)";
const COLOR_PREMIUM = "#a3a3a3";
const COLOR_SIGNAL = "#22d3ee";
const COLOR_BAND = "rgba(96, 165, 250, 0.08)";
const COLOR_ENTRY_LONG = "#4ade80";
const COLOR_ENTRY_SHORT = "#f87171";
const COLOR_EXIT = "#d4d4d4";

export default function HistoricalBasketSignalChart({
  spread,
  premium,
  signal,
  threshold,
  markers,
  label,
  height = 280,
  syncKey = "historical",
  resetSignal = 0,
  xPlotLines,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const xPlotLinesRef = useRef(xPlotLines);
  xPlotLinesRef.current = xPlotLines;
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;
  const markersRef = useRef(markers);
  markersRef.current = markers;

  const alignedData = useMemo<AlignedData>(() => {
    const ms = new Map<number, number>();
    for (const d of spread) ms.set(d.time, d.value);
    const mp = new Map<number, number>();
    for (const d of premium) mp.set(d.time, d.value);
    const mg = new Map<number, number>();
    for (const d of signal) mg.set(d.time, d.value);

    const tset = new Set<number>();
    for (const t of ms.keys()) tset.add(t);
    for (const t of mp.keys()) tset.add(t);
    for (const t of mg.keys()) tset.add(t);
    if (tset.size === 0) {
      return [[], [], [], []] as unknown as AlignedData;
    }
    const xs = Array.from(tset).sort((a, b) => a - b);
    const ys1 = xs.map((t) => (ms.has(t) ? (ms.get(t) as number) : null));
    const ys2 = xs.map((t) => (mp.has(t) ? (mp.get(t) as number) : null));
    const ys3 = xs.map((t) => (mg.has(t) ? (mg.get(t) as number) : null));
    return [xs, ys1, ys2, ys3] as unknown as AlignedData;
  }, [spread, premium, signal]);

  const hasData = alignedData[0].length > 0;

  useEffect(() => {
    if (!containerRef.current) return;
    if (!hasData) return;

    const drawXPlotLines = makeXPlotLinesDrawHook(() => xPlotLinesRef.current);
    const drawZero = makeYPlotLinesDrawHook(() => [
      { value: 0, color: "rgba(212,212,212,0.35)", dashed: true },
    ]);

    const drawBand = (u: uPlot) => {
      const t = thresholdRef.current;
      if (!Number.isFinite(t) || t <= 0) return;
      const ctx = u.ctx;
      const left = u.bbox.left;
      const width = u.bbox.width;
      const top = u.bbox.top;
      const bottom = top + u.bbox.height;
      const yPos = u.valToPos(t, "y", true);
      const yNeg = u.valToPos(-t, "y", true);
      const yTop = Math.max(top, Math.min(yPos, yNeg));
      const yBot = Math.min(bottom, Math.max(yPos, yNeg));
      if (yBot <= yTop) return;
      ctx.save();
      ctx.fillStyle = COLOR_BAND;
      ctx.fillRect(left, yTop, width, yBot - yTop);
      ctx.strokeStyle = "rgba(96, 165, 250, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(left, yPos);
      ctx.lineTo(left + width, yPos);
      ctx.moveTo(left, yNeg);
      ctx.lineTo(left + width, yNeg);
      ctx.stroke();
      ctx.restore();
    };

    const drawMarkers = (u: uPlot) => {
      const ms = markersRef.current;
      if (!ms || ms.length === 0) return;
      const ctx = u.ctx;
      const plotLeft = u.bbox.left;
      const plotTop = u.bbox.top;
      const xMinVis = u.scales.x.min ?? -Infinity;
      const xMaxVis = u.scales.x.max ?? Infinity;
      ctx.save();
      ctx.beginPath();
      ctx.rect(plotLeft, plotTop, u.bbox.width, u.bbox.height);
      ctx.clip();

      const t = thresholdRef.current;

      for (const m of ms) {
        if (m.time < xMinVis || m.time > xMaxVis) continue;
        const x = u.valToPos(m.time, "x", true);
        if (m.kind === "entryLong") {
          const y = u.valToPos(-t, "y", true);
          ctx.fillStyle = COLOR_ENTRY_LONG;
          ctx.strokeStyle = "#0a0a0a";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x, y + 5);
          ctx.lineTo(x - 4, y - 3);
          ctx.lineTo(x + 4, y - 3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (m.kind === "entryShort") {
          const y = u.valToPos(t, "y", true);
          ctx.fillStyle = COLOR_ENTRY_SHORT;
          ctx.strokeStyle = "#0a0a0a";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x, y - 5);
          ctx.lineTo(x - 4, y + 3);
          ctx.lineTo(x + 4, y + 3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          const y = u.valToPos(0, "y", true);
          ctx.fillStyle = COLOR_EXIT;
          ctx.strokeStyle = "#0a0a0a";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    const series: Options["series"] = [
      {},
      {
        label: "spread",
        stroke: COLOR_SPREAD,
        width: 1,
        points: { show: false },
        spanGaps: false,
      },
      {
        label: "premium",
        stroke: COLOR_PREMIUM,
        width: 1,
        dash: [4, 4],
        points: { show: false },
        spanGaps: false,
      },
      {
        label: "signal",
        stroke: COLOR_SIGNAL,
        width: 1.5,
        points: { show: false },
        spanGaps: false,
      },
    ];

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
        points: { show: true, size: 5 },
      },
      legend: { show: false },
      scales: { x: { time: false }, y: { auto: true } },
      axes: darkAxes(),
      hooks: {
        draw: [drawBand, drawZero, drawXPlotLines, drawMarkers],
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
            const ySpread = u.data[1]?.[idx];
            const yPrem = u.data[2]?.[idx];
            const ySig = u.data[3]?.[idx];
            const lines: string[] = [
              `<div style="font-size:10px;color:#737373">ts ${xVal}</div>`,
            ];
            const fmt = (v: number) => v.toFixed(2);
            if (ySpread !== null && ySpread !== undefined) {
              lines.push(
                `<div style="font-size:11px;color:${COLOR_SPREAD};font-family:ui-monospace,monospace">spread: ${fmt(ySpread as number)}</div>`
              );
            }
            if (yPrem !== null && yPrem !== undefined) {
              lines.push(
                `<div style="font-size:11px;color:${COLOR_PREMIUM};font-family:ui-monospace,monospace">premium: ${fmt(yPrem as number)}</div>`
              );
            }
            if (ySig !== null && ySig !== undefined) {
              lines.push(
                `<div style="font-size:11px;color:${COLOR_SIGNAL};font-family:ui-monospace,monospace">signal: ${fmt(ySig as number)}</div>`
              );
            }
            tt.style.display = "block";
            tt.innerHTML = lines.join("");
            const rect = container.getBoundingClientRect();
            const tw = 180;
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
  }, [height, syncKey, hasData]);

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
    const plot = plotRef.current;
    if (!plot) return;
    plot.redraw();
  }, [threshold, markers]);

  useEffect(() => {
    if (resetSignal === 0) return;
    resetUPlotX(plotRef.current);
  }, [resetSignal]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31] relative min-w-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <span className="text-neutral-100 text-xs font-semibold">{label}</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] text-neutral-400">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-0.5" style={{ backgroundColor: COLOR_SPREAD }} />
              spread
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-0.5"
                style={{ backgroundColor: COLOR_PREMIUM, borderTop: `1px dashed ${COLOR_PREMIUM}` }}
              />
              premium
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-0.5" style={{ backgroundColor: COLOR_SIGNAL }} />
              signal
            </span>
          </div>
          <button
            onClick={() => resetUPlotX(plotRef.current)}
            className="text-[11px] text-neutral-400 hover:text-neutral-100 border border-neutral-600 px-1.5 py-0.5"
          >
            Reset
          </button>
        </div>
      </div>
      <div ref={containerRef} style={{ width: "100%", height }} className="relative">
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-600 text-[11px]">
            no data
          </div>
        )}
      </div>
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-[#1f2125] border border-neutral-600 px-2 py-1 z-10"
        style={{ display: "none", top: 0, left: 0, minWidth: 150 }}
      />
    </div>
  );
}
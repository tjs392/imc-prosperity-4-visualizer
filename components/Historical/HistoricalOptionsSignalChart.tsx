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
  darkAxes,
  XPlotLine,
} from "@/lib/historicalUplotHelpers";

type Point = { time: number; value: number };
export type OptionsEntryMarker = { time: number; side: "long" | "short" };

type Props = {
  primaryData: Point[];
  primaryColor: string;
  primaryLabel: string;
  secondaryData?: Point[];
  secondaryColor?: string;
  secondaryLabel?: string;
  markers?: OptionsEntryMarker[];
  zeroLine?: boolean;
  label: string;
  height?: number;
  syncKey?: string;
  resetSignal?: number;
  xPlotLines?: XPlotLine[];
  formatValue?: (v: number) => string;
};

export default function HistoricalOptionsSignalChart({
  primaryData,
  primaryColor,
  primaryLabel,
  secondaryData,
  secondaryColor,
  secondaryLabel,
  markers,
  zeroLine = false,
  label,
  height = 220,
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
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const primaryLabelRef = useRef(primaryLabel);
  primaryLabelRef.current = primaryLabel;
  const secondaryLabelRef = useRef(secondaryLabel);
  secondaryLabelRef.current = secondaryLabel;
  const formatValueRef = useRef(formatValue);
  formatValueRef.current = formatValue;

  const hasSecondary = secondaryData !== undefined;

  const alignedData = useMemo<AlignedData>(() => {
    const m1 = new Map<number, number>();
    for (const p of primaryData) m1.set(p.time, p.value);
    const m2 = new Map<number, number>();
    if (hasSecondary && secondaryData) {
      for (const p of secondaryData) m2.set(p.time, p.value);
    }
    const xSet = new Set<number>();
    for (const t of m1.keys()) xSet.add(t);
    for (const t of m2.keys()) xSet.add(t);
    const xs = Array.from(xSet).sort((a, b) => a - b);
    const y1 = xs.map((t) => (m1.has(t) ? (m1.get(t) as number) : null));
    const y2 = xs.map((t) => (m2.has(t) ? (m2.get(t) as number) : null));
    if (hasSecondary) return [xs, y1, y2] as unknown as AlignedData;
    return [xs, y1] as unknown as AlignedData;
  }, [primaryData, secondaryData, hasSecondary]);

  useEffect(() => {
    if (!containerRef.current) return;

    const drawXPlotLines = makeXPlotLinesDrawHook(() => xPlotLinesRef.current);
    const drawZero = zeroLine
      ? makeYPlotLinesDrawHook(() => [
          { value: 0, color: "rgba(212,212,212,0.4)", dashed: true },
        ])
      : null;

    const drawMarkers = (u: uPlot) => {
      const ms = markersRef.current;
      if (!ms || ms.length === 0) return;
      const ctx = u.ctx;
      const [xMin, xMax] = u.scales.x.min != null && u.scales.x.max != null
        ? [u.scales.x.min, u.scales.x.max]
        : [-Infinity, Infinity];
      ctx.save();
      for (const mk of ms) {
        if (mk.time < xMin || mk.time > xMax) continue;
        const x = u.valToPos(mk.time, "x", true);
        const top = u.bbox.top;
        const bottom = u.bbox.top + u.bbox.height;
        const color = mk.side === "long" ? "#4ade80" : "#f87171";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        const size = 4;
        const cy = (top + bottom) / 2;
        ctx.beginPath();
        ctx.moveTo(x - size, cy - size);
        ctx.lineTo(x + size, cy + size);
        ctx.moveTo(x + size, cy - size);
        ctx.lineTo(x - size, cy + size);
        ctx.stroke();
      }
      ctx.restore();
    };

    const series: Options["series"] = [
      {},
      {
        label: primaryLabel,
        stroke: primaryColor,
        width: 1.5,
        points: { show: false },
        spanGaps: false,
      },
    ];
    if (hasSecondary) {
      series.push({
        label: secondaryLabel ?? "secondary",
        stroke: secondaryColor ?? "#f97316",
        width: 1.5,
        points: { show: false },
        spanGaps: false,
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
          size: 5,
          stroke: () => primaryColor,
          fill: () => primaryColor,
        },
      },
      legend: { show: false },
      scales: { x: { time: false }, y: { auto: true } },
      axes: darkAxes(),
      hooks: {
        draw: drawZero
          ? [drawZero, drawXPlotLines, drawMarkers]
          : [drawXPlotLines, drawMarkers],
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
            const y2 = hasSecondary ? u.data[2]?.[idx] : undefined;
            if (xVal === null || xVal === undefined) {
              tt.style.display = "none";
              return;
            }
            const y1Valid = y1 !== null && y1 !== undefined;
            const y2Valid = hasSecondary && y2 !== null && y2 !== undefined;
            if (!y1Valid && !y2Valid) {
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
                `<div style="font-size:11px;color:${primaryColor};font-family:ui-monospace,monospace">${primaryLabelRef.current}: ${fmt(y1 as number)}</div>`
              );
            }
            if (y2Valid) {
              lines.push(
                `<div style="font-size:11px;color:${secondaryColor ?? "#f97316"};font-family:ui-monospace,monospace">${secondaryLabelRef.current ?? "secondary"}: ${fmt(y2 as number)}</div>`
              );
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

    const u = new uPlot(opts, alignedData, containerRef.current);
    plotRef.current = u;
    registerScaleSync(u, syncKey);

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        u.setSize({ width: containerRef.current.clientWidth, height });
      }
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      unregisterScaleSync(u);
      u.destroy();
      plotRef.current = null;
    };
  }, [height, primaryColor, secondaryColor, syncKey, hasSecondary, zeroLine, primaryLabel, secondaryLabel]);

  useEffect(() => {
    if (plotRef.current) {
      plotRef.current.setData(alignedData);
    }
  }, [alignedData]);

  useEffect(() => {
    if (plotRef.current) {
      plotRef.current.redraw();
    }
  }, [markers, xPlotLines]);

  useEffect(() => {
    if (plotRef.current) resetUPlotX(plotRef.current);
  }, [resetSignal]);

  return (
    <div className="border border-neutral-700 bg-[#1f2125] p-1.5 pt-2 relative">
      <div className="flex items-center justify-between px-1 pb-0.5 text-[10px]">
        <span className="text-neutral-400 font-mono">{label}</span>
        <div className="flex gap-2 font-mono">
          <span style={{ color: primaryColor }}>■ {primaryLabel}</span>
          {hasSecondary && (
            <span style={{ color: secondaryColor ?? "#f97316" }}>
              ■ {secondaryLabel ?? "secondary"}
            </span>
          )}
          <span className="text-[#4ade80]">× long</span>
          <span className="text-[#f87171]">× short</span>
        </div>
      </div>
      <div ref={containerRef} style={{ width: "100%", height }} />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none border border-neutral-700 bg-[#0a0a0a]/95 px-2 py-1 rounded-none"
        style={{ display: "none", zIndex: 10 }}
      />
    </div>
  );
}
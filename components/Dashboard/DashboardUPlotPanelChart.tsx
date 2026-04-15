"use client";

import { useEffect, useMemo, useRef } from "react";
import uPlot, { AlignedData, Options } from "uplot";
import "uplot/dist/uPlot.min.css";
import { wheelZoomPlugin, resetUPlotX, scaleSyncPlugin, registerScaleSync, unregisterScaleSync } from "@/lib/uplotPlugins";

type DataPoint = { time: number; value: number };

type Props = {
  data: DataPoint[];
  data2?: DataPoint[];
  label: string;
  color: string;
  color2?: string;
  valueLabel?: string;
  valueLabel2?: string;
  fillArea?: boolean;
  zeroLine?: boolean;
  step?: boolean;
  height?: number;
  formatValue?: (v: number) => string;
  syncKey?: string;
  resetSignal?: number;
};

export default function DashboardUPlotPanelChart({
  data,
  data2,
  label,
  color,
  color2,
  valueLabel = "value",
  valueLabel2 = "value2",
  fillArea = false,
  zeroLine = false,
  step = false,
  height = 160,
  formatValue,
  syncKey = "dashboard",
  resetSignal = 0,
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
  const hasSecond = data2 !== undefined;

  const alignedData = useMemo<AlignedData>(() => {
    const map1 = new Map<number, number>();
    for (const d of data) map1.set(d.time, d.value);
    const map2 = new Map<number, number>();
    if (hasSecond && data2) for (const d of data2) map2.set(d.time, d.value);
    const times = new Set<number>();
    for (const t of map1.keys()) times.add(t);
    for (const t of map2.keys()) times.add(t);
    if (times.size === 0) {
      return hasSecond
        ? ([[], [], []] as unknown as AlignedData)
        : ([[], []] as unknown as AlignedData);
    }
    const xs = Array.from(times).sort((a, b) => a - b);
    const ys1 = xs.map((t) => (map1.has(t) ? (map1.get(t) as number) : null));
    if (!hasSecond) return [xs, ys1] as unknown as AlignedData;
    const ys2 = xs.map((t) => (map2.has(t) ? (map2.get(t) as number) : null));
    return [xs, ys1, ys2] as unknown as AlignedData;
  }, [data, data2, hasSecond]);

  useEffect(() => {
    if (!containerRef.current) return;

    const stepLeft = step ? uPlot.paths.stepped!({ align: -1 }) : undefined;

    const makeFillTo = (): ((u: uPlot, seriesIdx: number) => number) => {
      return (u) => u.valToPos(0, "y", true);
    };

    const series: Options["series"] = [
      {},
      {
        label: valueLabel,
        stroke: color,
        width: 2,
        paths: stepLeft,
        points: { show: false },
        spanGaps: false,
        ...(fillArea
          ? { fill: color + "55", fillTo: makeFillTo() }
          : {}),
      },
    ];
    if (hasSecond) {
      series.push({
        label: valueLabel2,
        stroke: color2 ?? color,
        width: 2,
        paths: stepLeft,
        points: { show: false },
        spanGaps: false,
        ...(fillArea
          ? { fill: (color2 ?? color) + "55", fillTo: makeFillTo() }
          : {}),
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
        sync: {
          key: syncKey,
        },
        points: {
          show: true,
          size: 6,
          stroke: () => color,
          fill: () => color,
        },
      },
      legend: { show: false },
      scales: {
        x: { time: false },
        y: { auto: true },
      },
      axes: [
        {
          stroke: "#a3a3a3",
          grid: { stroke: "#3a3d41", width: 1 },
          ticks: { stroke: "#525252", width: 1, size: 5 },
          values: (_u, splits) => splits.map((s) => String(s)),
          font: "11px sans-serif",
        },
        {
          stroke: "#a3a3a3",
          grid: { stroke: "#3a3d41", width: 1 },
          ticks: { stroke: "#525252", width: 1, size: 5 },
          values: (_u, splits) => splits.map((s) => String(s)),
          font: "11px sans-serif",
        },
      ],
      hooks: {
        draw: zeroLine
          ? [
              (u) => {
                const ctx = u.ctx;
                const y = u.valToPos(0, "y", true);
                const left = u.bbox.left;
                const right = left + u.bbox.width;
                if (y < u.bbox.top || y > u.bbox.top + u.bbox.height) return;
                ctx.save();
                ctx.strokeStyle = "rgba(212,212,212,0.4)";
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(left, y);
                ctx.lineTo(right, y);
                ctx.stroke();
                ctx.restore();
              },
            ]
          : [],
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
            const yVal = u.data[1][idx];
            const yVal2 = hasSecond ? u.data[2]?.[idx] : undefined;
            const y1Valid =
              yVal !== null && yVal !== undefined;
            const y2Valid =
              hasSecond && yVal2 !== null && yVal2 !== undefined;
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

            const rows: string[] = [];
            rows.push(
              `<div style="font-size:10px;color:#737373">${xVal}</div>`
            );
            if (y1Valid) {
              rows.push(
                `<div style="font-size:11px;color:${color};font-family:ui-monospace,monospace">${valueLabelRef.current}: ${fmt(
                  yVal as number
                )}</div>`
              );
            }
            if (y2Valid) {
              rows.push(
                `<div style="font-size:11px;color:${
                  color2 ?? color
                };font-family:ui-monospace,monospace">${valueLabel2Ref.current}: ${fmt(
                  yVal2 as number
                )}</div>`
              );
            }
            tt.style.display = "block";
            tt.innerHTML = rows.join("");

            const containerRect = container.getBoundingClientRect();
            const tooltipWidth = 160;
            const cursorLeft = u.cursor.left ?? 0;
            const cursorTop = u.cursor.top ?? 0;
            let left = cursorLeft + 12;
            if (left + tooltipWidth > containerRect.width) {
              left = cursorLeft - tooltipWidth - 12;
            }
            tt.style.left = `${left}px`;
            tt.style.top = `${Math.max(4, cursorTop - 30)}px`;
          },
        ],
      },
    };

    const plot = new uPlot(opts, alignedData, containerRef.current);
    plotRef.current = plot;
    registerScaleSync(plot, syncKey);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plot.setSize({ width: entry.contentRect.width, height });
      }
    });
    resizeObserver.observe(containerRef.current);

    const leaveHandler = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
    };
    containerRef.current.addEventListener("mouseleave", leaveHandler);
    const localContainer = containerRef.current;

    return () => {
      resizeObserver.disconnect();
      localContainer.removeEventListener("mouseleave", leaveHandler);
      unregisterScaleSync(plot);
      plot.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, color, color2, step, syncKey, hasSecond, fillArea, zeroLine]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    plot.setData(alignedData, false);
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let s = 1; s < alignedData.length; s++) {
      const arr = alignedData[s] as (number | null)[];
      for (const v of arr) {
        if (v === null || v === undefined) continue;
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (Number.isFinite(yMin) && Number.isFinite(yMax)) {
      if (yMin === yMax) {
        yMin -= 1;
        yMax += 1;
      } else {
        const pad = (yMax - yMin) * 0.05;
        yMin -= pad;
        yMax += pad;
      }
      plot.setScale("y", { min: yMin, max: yMax });
    }
  }, [alignedData]);

  useEffect(() => {
    if (resetSignal === 0) return;
    resetUPlotX(plotRef.current);
  }, [resetSignal]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31] relative min-w-0 flex-none overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <span className="text-neutral-100 text-xs font-semibold">{label}</span>
      </div>
      <div ref={containerRef} style={{ width: "100%", height }} className="relative" />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-[#1f2125] border border-neutral-600 px-2 py-1 z-10"
        style={{ display: "none", top: 0, left: 0, minWidth: 120 }}
      />
    </div>
  );
}
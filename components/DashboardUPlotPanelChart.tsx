"use client";

import { useEffect, useMemo, useRef } from "react";
import uPlot, { AlignedData, Options } from "uplot";
import "uplot/dist/uPlot.min.css";
import { wheelZoomPlugin, resetUPlotX, scaleSyncPlugin, registerScaleSync, unregisterScaleSync } from "@/lib/uplotPlugins";

type DataPoint = { time: number; value: number };

type Props = {
  data: DataPoint[];
  label: string;
  color: string;
  valueLabel?: string;
  step?: boolean;
  height?: number;
  formatValue?: (v: number) => string;
  syncKey?: string;
  resetSignal?: number;
};

export default function DashboardUPlotPanelChart({
  data,
  label,
  color,
  valueLabel = "value",
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

  const alignedData = useMemo<AlignedData>(() => {
    if (!data || data.length === 0) {
      return [[], []] as unknown as AlignedData;
    }
    const byTime = new Map<number, number>();
    for (const d of data) byTime.set(d.time, d.value);
    const xs = Array.from(byTime.keys()).sort((a, b) => a - b);
    const ys = xs.map((t) => byTime.get(t) as number);
    return [xs, ys] as AlignedData;
  }, [data]);

  useEffect(() => {
    if (!containerRef.current) return;

    const stepLeft = step ? uPlot.paths.stepped!({ align: -1 }) : undefined;

    const opts: Options = {
      width: containerRef.current.clientWidth,
      height,
      plugins: [wheelZoomPlugin(0.75), scaleSyncPlugin(syncKey)],
      series: [
        {},
        {
          label: valueLabel,
          stroke: color,
          width: 2,
          paths: stepLeft,
          points: { show: false },
          spanGaps: false,
        },
      ],
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
            if (
              xVal === null ||
              xVal === undefined ||
              yVal === null ||
              yVal === undefined
            ) {
              tt.style.display = "none";
              return;
            }

            const fv = formatValueRef.current;
            const valueStr = fv
              ? fv(yVal as number)
              : (yVal as number).toFixed(2);

            tt.style.display = "block";
            tt.innerHTML = `
              <div style="font-size:10px;color:#737373">${xVal}</div>
              <div style="font-size:11px;color:#f5f5f5;font-family:ui-monospace,monospace">${valueLabelRef.current}: ${valueStr}</div>
            `;

            const containerRect = container.getBoundingClientRect();
            const tooltipWidth = 140;
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
  }, [height, color, step, syncKey]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    plot.setData(alignedData);
  }, [alignedData]);

  useEffect(() => {
    if (resetSignal === 0) return;
    resetUPlotX(plotRef.current);
  }, [resetSignal]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31] relative min-w-0 flex-none">
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
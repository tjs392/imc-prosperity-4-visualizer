"use client";

import { useEffect, useMemo, useRef } from "react";
import uPlot, { AlignedData, Options } from "uplot";
import "uplot/dist/uPlot.min.css";
import { darkAxes } from "@/lib/historicalUplotHelpers";

export type SmilePoint = {
  moneyness: number;
  iv: number;
  strike: number;
};

export type SmileFitOverlay = {
  xs: number[];
  ys: number[];
};

type Props = {
  points: SmilePoint[];
  fit?: SmileFitOverlay | null;
  strikeColors: Record<number, string>;
  label: string;
  height?: number;
  fitLabel?: string;
};

export default function HistoricalSmileScatterChart({
  points,
  fit,
  strikeColors,
  label,
  height = 300,
  fitLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  const strikesInOrder = useMemo(() => {
    const set = new Set<number>();
    for (const p of points) set.add(p.strike);
    return Array.from(set).sort((a, b) => a - b);
  }, [points]);

  const alignedData = useMemo<AlignedData>(() => {
    const allXs = new Set<number>();
    for (const p of points) allXs.add(p.moneyness);
    if (fit) for (const x of fit.xs) allXs.add(x);
    const xs = Array.from(allXs).sort((a, b) => a - b);
    const cols: (number | null)[][] = [xs];
    for (const K of strikesInOrder) {
      const m = new Map<number, number>();
      for (const p of points) if (p.strike === K) m.set(p.moneyness, p.iv);
      cols.push(xs.map((x) => (m.has(x) ? (m.get(x) as number) : null)));
    }
    if (fit) {
      const m = new Map<number, number>();
      for (let i = 0; i < fit.xs.length; i++) m.set(fit.xs[i], fit.ys[i]);
      cols.push(xs.map((x) => (m.has(x) ? (m.get(x) as number) : null)));
    }
    return cols as unknown as AlignedData;
  }, [points, fit, strikesInOrder]);

  const hasAnyData = points.length > 0;

  useEffect(() => {
    if (!containerRef.current) return;
    if (!hasAnyData) return;

    const uSeries: Options["series"] = [{}];
    for (const K of strikesInOrder) {
      uSeries.push({
        label: `K=${K}`,
        stroke: "transparent",
        width: 0,
        points: {
          show: true,
          size: 3,
          stroke: strikeColors[K] ?? "#d4d4d4",
          fill: strikeColors[K] ?? "#d4d4d4",
        },
      });
    }
    if (fit) {
      uSeries.push({
        label: fitLabel ?? "fit",
        stroke: "#ffffff",
        width: 1.8,
        points: { show: false },
        spanGaps: true,
      });
    }

    const opts: Options = {
      width: containerRef.current.clientWidth,
      height,
      series: uSeries,
      cursor: { show: true, x: true, y: true, drag: { x: false, y: false } },
      legend: { show: false },
      scales: { x: { time: false, auto: true }, y: { auto: true } },
      axes: darkAxes(),
    };

    const u = new uPlot(opts, alignedData, containerRef.current);
    plotRef.current = u;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        u.setSize({ width: containerRef.current.clientWidth, height });
      }
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      u.destroy();
      plotRef.current = null;
    };
  }, [height, strikesInOrder, fit, strikeColors, fitLabel, hasAnyData, alignedData]);

  useEffect(() => {
    if (plotRef.current && hasAnyData) {
      plotRef.current.setData(alignedData);
    }
  }, [alignedData, hasAnyData]);

  return (
    <div className="border border-neutral-700 bg-[#1f2125] p-1.5 pt-2">
      <div className="flex items-center justify-between px-1 pb-0.5 text-[10px]">
        <span className="text-neutral-400 font-mono">{label}</span>
        <div className="flex gap-2 font-mono">
          {strikesInOrder.map((K) => (
            <span key={K} style={{ color: strikeColors[K] ?? "#d4d4d4" }}>
              K={K}
            </span>
          ))}
          {fit && <span className="text-white">── fit</span>}
        </div>
      </div>
      {hasAnyData ? (
        <div ref={containerRef} style={{ width: "100%", height }} />
      ) : (
        <div
          className="flex items-center justify-center text-neutral-500 text-xs"
          style={{ height }}
        >
          no data
        </div>
      )}
    </div>
  );
}
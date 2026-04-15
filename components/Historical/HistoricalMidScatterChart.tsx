"use client";

import { useEffect, useMemo, useRef } from "react";
import uPlot, { AlignedData, Options } from "uplot";
import "uplot/dist/uPlot.min.css";
import { ActivityRow } from "@/lib/types";
import { darkAxes, computeYRange } from "@/lib/historicalUplotHelpers";

type Props = {
  aRows: ActivityRow[];
  bRows: ActivityRow[];
  productA: string;
  productB: string;
  label: string;
  height?: number;
};

const EARLY = "#60a5fa";
const LATE = "#ef4444";

function lerpColor(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const r = Math.round(96 + (239 - 96) * c);
  const g = Math.round(165 + (68 - 165) * c);
  const b = Math.round(250 + (68 - 250) * c);
  return `rgb(${r},${g},${b})`;
}

export default function HistoricalMidScatterChart({
  aRows,
  bRows,
  productA,
  productB,
  label,
  height = 260,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  const { alignedData, colors, productsRef } = useMemo(() => {
    const bByTs = new Map<number, number>();
    for (const r of bRows) {
      if (r.midPrice !== null) bByTs.set(r.timestamp, r.midPrice);
    }
    const triples: { x: number; y: number; ts: number }[] = [];
    for (const r of aRows) {
      if (r.midPrice === null) continue;
      const b = bByTs.get(r.timestamp);
      if (b === undefined) continue;
      triples.push({ x: b, y: r.midPrice, ts: r.timestamp });
    }

    if (triples.length === 0) {
      return {
        alignedData: [[], []] as unknown as AlignedData,
        colors: [] as string[],
        productsRef: { a: productA, b: productB },
      };
    }

    // Sort by x for uPlot (uPlot expects monotonic x).
    triples.sort((p, q) => p.x - q.x);

    const minTs = Math.min(...triples.map((t) => t.ts));
    const maxTs = Math.max(...triples.map((t) => t.ts));
    const tsRange = maxTs - minTs || 1;

    const xs: number[] = [];
    const ys: number[] = [];
    const cs: string[] = [];
    for (const t of triples) {
      xs.push(t.x);
      ys.push(t.y);
      cs.push(lerpColor((t.ts - minTs) / tsRange));
    }
    return {
      alignedData: [xs, ys] as unknown as AlignedData,
      colors: cs,
      productsRef: { a: productA, b: productB },
    };
  }, [aRows, bRows, productA, productB]);

  const colorsRef = useRef<string[]>(colors);
  colorsRef.current = colors;
  const labelRef = useRef(productsRef);
  labelRef.current = productsRef;

  useEffect(() => {
    if (!containerRef.current) return;

    const noLine: uPlot.Series.PathBuilder = () => null;

    // Per-point colored scatter: draw circles ourselves in a draw hook.
    const drawScatter = (u: uPlot) => {
      const ctx = u.ctx;
      const xs = u.data[0] as number[];
      const ys = u.data[1] as (number | null)[];
      if (!xs || xs.length === 0) return;
      const xMin = u.scales.x.min ?? -Infinity;
      const xMax = u.scales.x.max ?? Infinity;
      const yMin = u.scales.y.min ?? -Infinity;
      const yMax = u.scales.y.max ?? Infinity;
      const cs = colorsRef.current;
      const left = u.bbox.left;
      const top = u.bbox.top;
      const right = left + u.bbox.width;
      const bottom = top + u.bbox.height;
      ctx.save();
      // Clip to plot area so points outside the panned/zoomed window are hidden.
      ctx.beginPath();
      ctx.rect(left, top, u.bbox.width, u.bbox.height);
      ctx.clip();
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i];
        const y = ys[i];
        if (y === null || y === undefined) continue;
        if (x < xMin || x > xMax || y < yMin || y > yMax) continue;
        const px = u.valToPos(x, "x", true);
        const py = u.valToPos(y, "y", true);
        if (px < left || px > right || py < top || py > bottom) continue;
        ctx.fillStyle = cs[i] ?? EARLY;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const opts: Options = {
      width: containerRef.current.clientWidth,
      height,
      series: [
        {},
        {
          label: "mid",
          stroke: EARLY,
          fill: EARLY,
          width: 0,
          paths: noLine,
          points: { show: false },
        },
      ],
      cursor: {
        show: true,
        x: true,
        y: true,
        drag: { x: true, y: true, uni: 20 },
        points: { show: false },
      },
      legend: { show: false },
      scales: { x: { time: false }, y: { auto: true } },
      axes: darkAxes({ xLabel: productB, yLabel: productA }),
      hooks: {
        draw: [drawScatter],
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
            const lr = labelRef.current;
            tt.style.display = "block";
            tt.innerHTML =
              `<div style="font-size:11px;color:#a3a3a3;font-family:ui-monospace,monospace">${lr.b}: ${xVal}</div>` +
              `<div style="font-size:11px;color:#a3a3a3;font-family:ui-monospace,monospace">${lr.a}: ${yVal}</div>`;
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
  }, [height, productA, productB]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    plot.setData(alignedData, false);
    const ys = (alignedData[1] as (number | null)[]) ?? [];
    const xs = (alignedData[0] as number[]) ?? [];
    const yr = computeYRange([ys], 0.05);
    const xr = computeYRange([xs as unknown as (number | null)[]], 0.05);
    if (yr) plot.setScale("y", { min: yr.min, max: yr.max });
    if (xr) plot.setScale("x", { min: xr.min, max: xr.max });
    else plot.redraw();
  }, [alignedData]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31] relative min-w-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <span className="text-neutral-100 text-xs font-semibold">{label}</span>
        <span className="text-[11px] text-neutral-500 font-mono flex items-center gap-1">
          early
          <span
            className="inline-block w-2 h-2"
            style={{ backgroundColor: EARLY }}
          />
          {" → "}
          <span
            className="inline-block w-2 h-2"
            style={{ backgroundColor: LATE }}
          />
          late
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
        style={{ display: "none", top: 0, left: 0, minWidth: 140 }}
      />
    </div>
  );
}
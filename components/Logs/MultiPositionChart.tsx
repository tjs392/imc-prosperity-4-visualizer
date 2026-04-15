"use client";

import { useEffect, useMemo, useRef } from "react";
import Highcharts from "highcharts/highstock";
import { Trade } from "@/lib/types";
import { buildColorMap } from "@/lib/productColors";

type Props = {
  trades: Trade[];
  products: string[];
  label: string;
  height?: number;
};

const KNOWN_LIMITS: Record<string, number> = {
  EMERALDS: 80,
  TOMATOES: 80,
};

const LIMIT_PADDING = 10;

function buildPositionSeries(trades: Trade[], product: string): [number, number][] {
  const productTrades = trades.filter((t) => t.symbol === product);
  const points: [number, number][] = [];
  let position = 0;
  if (productTrades.length > 0) {
    points.push([productTrades[0].timestamp, 0]);
  }
  for (const t of productTrades) {
    if (t.buyer === "SUBMISSION" && t.seller !== "SUBMISSION") {
      position += t.quantity;
    } else if (t.seller === "SUBMISSION" && t.buyer !== "SUBMISSION") {
      position -= t.quantity;
    } else {
      continue;
    }
    points.push([t.timestamp, position]);
  }
  return points;
}

export default function MultiPositionChart({
  trades,
  products,
  label,
  height = 260,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);

  const productsKey = products.join(",");
  const colorMap = useMemo(() => buildColorMap(products), [productsKey]);

  useEffect(() => {
    if (!containerRef.current) return;

    const rawSeriesByProduct = new Map<string, [number, number][]>();
    for (const p of products) {
      rawSeriesByProduct.set(p, buildPositionSeries(trades, p));
    }

    const allTs = new Set<number>();
    for (const arr of rawSeriesByProduct.values()) {
      for (const [t] of arr) allTs.add(t);
    }
    const sortedTs = Array.from(allTs).sort((a, b) => a - b);

    const densified: Record<string, [number, number][]> = {};
    for (const p of products) {
      densified[p] = [];
      const raw = rawSeriesByProduct.get(p) ?? [];
      const lookup = new Map<number, number>();
      for (const [t, v] of raw) lookup.set(t, v);
      let last = 0;
      for (const t of sortedTs) {
        const v = lookup.get(t);
        if (v !== undefined) last = v;
        densified[p].push([t, last]);
      }
    }

    const series: Highcharts.SeriesOptionsType[] = products.map((p) => ({
      type: "line",
      name: p,
      color: colorMap[p],
      data: densified[p],
      lineWidth: 1.5,
      step: "left",
    }));

    const maxLimit = Math.max(
      ...products.map((p) => KNOWN_LIMITS[p] ?? 0),
      0
    );
    const axisMax = maxLimit > 0 ? maxLimit + LIMIT_PADDING : undefined;
    const axisMin = maxLimit > 0 ? -(maxLimit + LIMIT_PADDING) : undefined;

    const plotLines: Highcharts.YAxisPlotLinesOptions[] = [
      { value: 0, color: "#737373", width: 1 },
    ];
    const uniqueLimits = new Set<number>();
    for (const p of products) {
      const l = KNOWN_LIMITS[p];
      if (l !== undefined) uniqueLimits.add(l);
    }
    for (const l of uniqueLimits) {
      plotLines.push({ value: l, color: "#525252", width: 1, dashStyle: "Dot" });
      plotLines.push({ value: -l, color: "#525252", width: 1, dashStyle: "Dot" });
    }

    const options: Highcharts.Options = {
      chart: {
        height,
        animation: false,
        backgroundColor: "#2a2d31",
        spacing: [6, 6, 6, 6],
        zooming: { type: "x" },
        panning: { enabled: true, type: "x" },
        panKey: "shift",
        style: { fontFamily: "inherit" },
        ...({ showResetZoom: false } as object),
      },
      credits: { enabled: false },
      title: { text: undefined },
      rangeSelector: { enabled: false },
      navigator: { enabled: false },
      scrollbar: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        type: "linear",
        ordinal: false,
        lineColor: "#525252",
        tickColor: "#525252",
        gridLineColor: "#3a3d41",
        gridLineWidth: 1,
        gridLineDashStyle: "Dot",
        labels: {
          style: { color: "#a3a3a3", fontSize: "11px" },
          formatter() {
            return String(this.value);
          },
        },
      },
      yAxis: {
        opposite: false,
        min: axisMin,
        max: axisMax,
        gridLineColor: "#3a3d41",
        gridLineWidth: 1,
        gridLineDashStyle: "Dot",
        lineColor: "#525252",
        tickColor: "#525252",
        title: { text: undefined },
        labels: { style: { color: "#a3a3a3", fontSize: "11px" } },
        plotLines,
      },
      tooltip: {
        shared: true,
        split: false,
        outside: false,
        hideDelay: 999999,
        backgroundColor: "rgba(42,45,49,0.96)",
        borderColor: "#737373",
        borderRadius: 0,
        borderWidth: 1,
        shadow: false,
        padding: 8,
        style: { color: "#f5f5f5", fontSize: "12px" },
        useHTML: true,
        formatter(this: unknown) {
          const ctx = this as {
            x: number;
            points?: { y: number; series: { name: string; color: string } }[];
          };
          const ts = ctx.x;
          const pts = ctx.points ?? [];
          const lines = pts.map((p) => {
            const limit = KNOWN_LIMITS[p.series.name];
            const limitStr = limit !== undefined ? ` <span style="color:#737373">/ ${limit}</span>` : "";
            return `<span style="color:${p.series.color}">\u25CF</span> <span style="color:#a3a3a3">${p.series.name}</span> <b style="color:#f5f5f5">${p.y}</b>${limitStr}`;
          });
          return `<div style="line-height:1.5"><span style="color:#737373">ts</span> <span style="color:#f5f5f5">${ts}</span><br/>${lines.join("<br/>")}</div>`;
        },
      },
      plotOptions: {
        series: {
          animation: false,
          states: {
            hover: { lineWidthPlus: 0 },
            inactive: { opacity: 1 },
          },
          marker: { enabled: false },
          dataGrouping: { enabled: false },
        },
      },
      series,
    };

    const chart = Highcharts.stockChart(containerRef.current, options);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [height, trades, products, colorMap]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31]">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-neutral-100 text-xs font-semibold">{label}</span>
          <div className="flex items-center gap-2">
            {products.map((p) => (
              <span
                key={p}
                className="flex items-center gap-1 text-[11px] text-neutral-400"
              >
                <span
                  className="inline-block w-2 h-2"
                  style={{ backgroundColor: colorMap[p] }}
                />
                {p}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => chartRef.current?.xAxis[0].setExtremes()}
          className="text-[11px] text-neutral-400 hover:text-neutral-100 border border-neutral-600 px-1.5 py-0.5"
        >
          Reset
        </button>
      </div>
      <div ref={containerRef} style={{ width: "100%", height }} />
    </div>
  );
}
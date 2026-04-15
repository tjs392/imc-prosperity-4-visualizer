"use client";

import { useEffect, useMemo, useRef } from "react";
import Highcharts from "highcharts/highstock";
import { ProductSeries } from "@/lib/types";
import { buildColorMap } from "@/lib/productColors";

type Props = {
  products: ProductSeries[];
  label: string;
  height?: number;
};

const TOTAL_COLOR = "#f5f5f5";

export default function MultiPnLChart({ products, label, height = 260 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);

  const productNames = products.map((p) => p.product);
  const productsKey = productNames.join(",");
  const colorMap = useMemo(() => buildColorMap(productNames), [productsKey]);

  useEffect(() => {
    if (!containerRef.current) return;

    const perProductSeries: Highcharts.SeriesOptionsType[] = products.map((p) => ({
      type: "line",
      name: p.product,
      color: colorMap[p.product],
      data: p.rows.map((r) => [r.timestamp, r.pnl] as [number, number]),
      lineWidth: 1.25,
    }));

    const allTs = new Set<number>();
    for (const p of products) {
      for (const r of p.rows) allTs.add(r.timestamp);
    }
    const sortedTs = Array.from(allTs).sort((a, b) => a - b);

    const productMaps = products.map((p) => {
      const m = new Map<number, number>();
      for (const r of p.rows) m.set(r.timestamp, r.pnl);
      return m;
    });
    const lastSeen = new Array(products.length).fill(0);
    const totalData: [number, number][] = [];
    for (const ts of sortedTs) {
      let sum = 0;
      for (let i = 0; i < products.length; i++) {
        const v = productMaps[i].get(ts);
        if (v !== undefined) lastSeen[i] = v;
        sum += lastSeen[i];
      }
      totalData.push([ts, sum]);
    }

    const totalSeries: Highcharts.SeriesOptionsType = {
      type: "line",
      name: "Total",
      color: TOTAL_COLOR,
      data: totalData,
      lineWidth: 2,
    };

    const series: Highcharts.SeriesOptionsType[] = [
      ...perProductSeries,
      totalSeries,
    ];

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
        gridLineColor: "#3a3d41",
        gridLineWidth: 1,
        gridLineDashStyle: "Dot",
        lineColor: "#525252",
        tickColor: "#525252",
        title: { text: undefined },
        labels: { style: { color: "#a3a3a3", fontSize: "11px" } },
        plotLines: [{ value: 0, color: "#737373", width: 1 }],
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
            points?: {
              y: number;
              series: { name: string; color: string };
            }[];
          };
          const ts = ctx.x;
          const pts = ctx.points ?? [];
          const lines = pts.map(
            (p) =>
              `<span style="color:${p.series.color}">\u25CF</span> <span style="color:#a3a3a3">${p.series.name}</span> <b style="color:#f5f5f5">${p.y.toFixed(1)}</b>`
          );
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
          dataGrouping: {
            enabled: true,
            forced: true,
            groupPixelWidth: 2,
            approximation(this: unknown, values: number[]): number {
              return values[0];
            },
          },
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
  }, [height, products, colorMap]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31]">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-neutral-100 text-xs font-semibold">{label}</span>
          <div className="flex items-center gap-2">
            {products.map((p) => (
              <span
                key={p.product}
                className="flex items-center gap-1 text-[11px] text-neutral-400"
              >
                <span
                  className="inline-block w-2 h-2"
                  style={{ backgroundColor: colorMap[p.product] }}
                />
                {p.product}
              </span>
            ))}
            <span className="flex items-center gap-1 text-[11px] text-neutral-400">
              <span
                className="inline-block w-2 h-2"
                style={{ backgroundColor: TOTAL_COLOR }}
              />
              Total
            </span>
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
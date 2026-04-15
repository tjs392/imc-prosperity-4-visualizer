"use client";

import { useEffect, useMemo, useRef } from "react";
import Highcharts from "highcharts/highstock";
import { ActivityRow, Trade } from "@/lib/types";
import { buildColorMap } from "@/lib/productColors";

type Props = {
  activitiesByProduct: Map<string, ActivityRow[]>;
  trades: Trade[];
  products: string[];
  label: string;
  height?: number;
};

export default function MultiPriceChart({
  activitiesByProduct,
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

    const yAxes: Highcharts.YAxisOptions[] = products.map((p, idx) => ({
      opposite: idx % 2 === 1,
      gridLineColor: idx === 0 ? "#3a3d41" : undefined,
      gridLineWidth: idx === 0 ? 1 : 0,
      gridLineDashStyle: "Dot",
      lineColor: "#525252",
      tickColor: "#525252",
      title: { text: undefined },
      labels: {
        style: {
          color: colorMap[p],
          fontSize: "11px",
        },
      },
    }));

    const series: Highcharts.SeriesOptionsType[] = [];
    products.forEach((p, idx) => {
      const rows = activitiesByProduct.get(p) ?? [];
      const midData: [number, number][] = [];
      for (const row of rows) {
        if (row.midPrice !== null) midData.push([row.timestamp, row.midPrice]);
      }
      series.push({
        type: "line",
        name: p,
        color: colorMap[p],
        data: midData,
        lineWidth: 1.5,
        yAxis: idx,
      });

      const buyFills: { x: number; y: number }[] = [];
      const sellFills: { x: number; y: number }[] = [];
      for (const t of trades) {
        if (t.symbol !== p) continue;
        if (t.buyer === "SUBMISSION" && t.seller !== "SUBMISSION") {
          buyFills.push({ x: t.timestamp, y: t.price });
        } else if (t.seller === "SUBMISSION" && t.buyer !== "SUBMISSION") {
          sellFills.push({ x: t.timestamp, y: t.price });
        }
      }
      series.push({
        type: "scatter",
        name: `${p} Buy`,
        color: "#22c55e",
        data: buyFills,
        yAxis: idx,
        enableMouseTracking: false,
        stickyTracking: false,
        showInLegend: false,
        states: {
          hover: { enabled: false },
          inactive: { enabled: false, opacity: 1 },
        },
        marker: {
          symbol: "triangle",
          radius: 4,
          lineWidth: 1,
          lineColor: "#2a2d31",
          states: {
            hover: { enabled: false },
          },
        },
      });
      series.push({
        type: "scatter",
        name: `${p} Sell`,
        color: "#ef4444",
        data: sellFills,
        yAxis: idx,
        enableMouseTracking: false,
        stickyTracking: false,
        showInLegend: false,
        states: {
          hover: { enabled: false },
          inactive: { enabled: false, opacity: 1 },
        },
        marker: {
          symbol: "triangle-down",
          radius: 4,
          lineWidth: 1,
          lineColor: "#2a2d31",
          states: {
            hover: { enabled: false },
          },
        },
      });
    });

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
      yAxis: yAxes,
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
          const lines = pts.map(
            (p) =>
              `<span style="color:${p.series.color}">\u25CF</span> <span style="color:#a3a3a3">${p.series.name}</span> <b style="color:#f5f5f5">${p.y}</b>`
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
        },
        line: {
          dataGrouping: {
            enabled: true,
            forced: true,
            groupPixelWidth: 2,
            approximation(this: unknown, values: number[]): number {
              return values[0];
            },
          },
        },
        scatter: {
          dataGrouping: { enabled: false },
          marker: {
            enabled: true,
            radius: 4,
            lineWidth: 1,
            lineColor: "#2a2d31",
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
  }, [height, activitiesByProduct, trades, products, colorMap]);

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
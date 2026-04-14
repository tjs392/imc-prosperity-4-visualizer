"use client";

import { useEffect, useRef } from "react";
import Highcharts from "highcharts/highstock";
import { ActivityRow, Trade } from "@/lib/types";

type Props = {
  rows: ActivityRow[];
  trades: Trade[];
  product: string;
  label: string;
  height?: number;
  xPlotLines?: { value: number; label?: string }[];
};

const BID_COLORS = ["#4ade80", "#22c55e", "#16a34a"];
const ASK_COLORS = ["#f87171", "#ef4444", "#dc2626"];
const TRADE_COLOR = "#f5f5f5";

export default function HistoricalPriceChart({
  rows,
  trades,
  product,
  label,
  height = 260,
  xPlotLines,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const bid1: [number, number][] = [];
    const bid2: [number, number][] = [];
    const bid3: [number, number][] = [];
    const mid: [number, number][] = [];
    const ask1: [number, number][] = [];
    const ask2: [number, number][] = [];
    const ask3: [number, number][] = [];

    for (const row of rows) {
      if (row.bidPrice1 !== null) bid1.push([row.timestamp, row.bidPrice1]);
      if (row.bidPrice2 !== null) bid2.push([row.timestamp, row.bidPrice2]);
      if (row.bidPrice3 !== null) bid3.push([row.timestamp, row.bidPrice3]);
      if (row.midPrice !== null) mid.push([row.timestamp, row.midPrice]);
      if (row.askPrice1 !== null) ask1.push([row.timestamp, row.askPrice1]);
      if (row.askPrice2 !== null) ask2.push([row.timestamp, row.askPrice2]);
      if (row.askPrice3 !== null) ask3.push([row.timestamp, row.askPrice3]);
    }

    const tradeDots: { x: number; y: number }[] = [];
    for (const t of trades) {
      if (t.symbol !== product) continue;
      tradeDots.push({ x: t.timestamp, y: t.price });
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
        plotLines: xPlotLines?.map((pl) => ({
          value: pl.value,
          color: "#737373",
          width: 1,
          dashStyle: "Dash" as Highcharts.DashStyleValue,
          zIndex: 2,
          label: pl.label
            ? {
                text: pl.label,
                style: { color: "#a3a3a3", fontSize: "10px" },
                align: "left",
                x: 4,
                y: 12,
              }
            : undefined,
        })),
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
          const pts = (ctx.points ?? []).filter(
            (p) => p.series.name !== "Trade"
          );
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
        },
      },
      series: [
        { type: "line", name: "Bid 3", color: BID_COLORS[0], data: bid3, lineWidth: 1 },
        { type: "line", name: "Bid 2", color: BID_COLORS[1], data: bid2, lineWidth: 1 },
        { type: "line", name: "Bid 1", color: BID_COLORS[2], data: bid1, lineWidth: 1.25 },
        { type: "line", name: "Mid", color: "#e5e5e5", data: mid, lineWidth: 1.5 },
        { type: "line", name: "Ask 1", color: ASK_COLORS[2], data: ask1, lineWidth: 1.25 },
        { type: "line", name: "Ask 2", color: ASK_COLORS[1], data: ask2, lineWidth: 1 },
        { type: "line", name: "Ask 3", color: ASK_COLORS[0], data: ask3, lineWidth: 1 },
        {
          type: "scatter",
          name: "Trade",
          color: TRADE_COLOR,
          data: tradeDots,
          enableMouseTracking: false,
          stickyTracking: false,
          showInLegend: false,
          states: {
            hover: { enabled: false },
            inactive: { enabled: false, opacity: 1 },
          },
          marker: {
            symbol: "circle",
            radius: 2.5,
            lineWidth: 0,
            states: { hover: { enabled: false } },
          },
        },
      ],
    };

    const chart = Highcharts.stockChart(containerRef.current, options);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [height, rows, trades, product, xPlotLines]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31]">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <span className="text-neutral-100 text-xs font-semibold">{label}</span>
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
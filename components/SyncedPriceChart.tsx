"use client";

import { useEffect, useRef, useState } from "react";
import Highcharts from "highcharts/highstock";
import { ActivityRow, Trade } from "@/lib/types";

type Props = {
  rows: ActivityRow[];
  trades: Trade[];
  product: string;
  label: string;
  height?: number;
};

const BID_COLORS = ["#4ade80", "#22c55e", "#16a34a"];
const ASK_COLORS = ["#f87171", "#ef4444", "#dc2626"];
const BUY_FILL_COLOR = "#22c55e";
const SELL_FILL_COLOR = "#ef4444";

export default function SyncedPriceChart({
  rows,
  trades,
  product,
  label,
  height = 280,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);
  const [showFills, setShowFills] = useState(true);

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

    const productTrades = trades.filter((t) => t.symbol === product);
    const buyFills: { x: number; y: number; qty: number }[] = [];
    const sellFills: { x: number; y: number; qty: number }[] = [];

    for (const t of productTrades) {
      if (t.buyer === "SUBMISSION" && t.seller !== "SUBMISSION") {
        buyFills.push({ x: t.timestamp, y: t.price, qty: t.quantity });
      } else if (t.seller === "SUBMISSION" && t.buyer !== "SUBMISSION") {
        sellFills.push({ x: t.timestamp, y: t.price, qty: t.quantity });
      }
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
        lineColor: "#737373",
        tickColor: "#a3a3a3",
        tickWidth: 1,
        tickLength: 5,
        gridLineColor: "#4a4d52",
        gridLineWidth: 1,
        gridLineDashStyle: "Solid",
        minorTicks: true,
        minorTickInterval: "auto",
        minorTickColor: "#4a4d52",
        minorTickLength: 3,
        minorTickWidth: 1,
        minorGridLineWidth: 0,
        labels: {
          style: { color: "#d4d4d4", fontSize: "11px" },
          formatter() {
            return String(this.value);
          },
        },
      },
      yAxis: {
        opposite: false,
        gridLineColor: "#4a4d52",
        gridLineWidth: 1,
        gridLineDashStyle: "Solid",
        lineColor: "#737373",
        tickColor: "#a3a3a3",
        tickWidth: 1,
        tickLength: 5,
        minorTicks: true,
        minorTickInterval: "auto",
        minorTickColor: "#4a4d52",
        minorTickLength: 3,
        minorTickWidth: 1,
        minorGridLineWidth: 0,
        title: { text: undefined },
        labels: { style: { color: "#d4d4d4", fontSize: "11px" } },
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
              point?: { qty?: number };
            }[];
          };
          const ts = ctx.x;
          const pts = ctx.points ?? [];
          const lines = pts.map((p) => {
            const qtyStr = p.point?.qty !== undefined ? ` (qty ${p.point.qty})` : "";
            return `<span style="color:${p.series.color}">\u25CF</span> <span style="color:#a3a3a3">${p.series.name}</span> <b style="color:#f5f5f5">${p.y}</b>${qtyStr}`;
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
            radius: 5,
            lineWidth: 1,
            lineColor: "#2a2d31",
          },
        },
      },
      series: [
        { type: "line", name: "Bid 3", color: BID_COLORS[0], data: bid3, lineWidth: 1 },
        { type: "line", name: "Bid 2", color: BID_COLORS[1], data: bid2, lineWidth: 1 },
        { type: "line", name: "Bid 1", color: BID_COLORS[2], data: bid1, lineWidth: 1.5 },
        {
          type: "line",
          name: "Mid",
          color: "#d4d4d4",
          data: mid,
          lineWidth: 1,
          dashStyle: "Dash",
        },
        { type: "line", name: "Ask 1", color: ASK_COLORS[2], data: ask1, lineWidth: 1.5 },
        { type: "line", name: "Ask 2", color: ASK_COLORS[1], data: ask2, lineWidth: 1 },
        { type: "line", name: "Ask 3", color: ASK_COLORS[0], data: ask3, lineWidth: 1 },
        {
          type: "scatter",
          name: "Buy Fill",
          color: BUY_FILL_COLOR,
          data: buyFills,
          visible: showFills,
          enableMouseTracking: false,
          stickyTracking: false,
          showInLegend: false,
          states: {
            hover: { enabled: false },
            inactive: { enabled: false, opacity: 1 },
          },
          marker: {
            symbol: "triangle",
            radius: 5,
            states: { hover: { enabled: false } },
          },
        },
        {
          type: "scatter",
          name: "Sell Fill",
          color: SELL_FILL_COLOR,
          data: sellFills,
          visible: showFills,
          enableMouseTracking: false,
          stickyTracking: false,
          showInLegend: false,
          states: {
            hover: { enabled: false },
            inactive: { enabled: false, opacity: 1 },
          },
          marker: {
            symbol: "triangle-down",
            radius: 5,
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
  }, [height, rows, trades, product, showFills]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31]">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <span className="text-neutral-100 text-xs font-semibold">{label}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowFills((v) => !v)}
            className={`text-[11px] border px-1.5 py-0.5 ${
              showFills
                ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                : "border-neutral-600 text-neutral-400 hover:text-neutral-100"
            }`}
          >
            Fills
          </button>
          <button
            onClick={() => chartRef.current?.xAxis[0].setExtremes()}
            className="text-[11px] text-neutral-400 hover:text-neutral-100 border border-neutral-600 px-1.5 py-0.5"
          >
            Reset
          </button>
        </div>
      </div>
      <div ref={containerRef} style={{ width: "100%", height }} />
    </div>
  );
}
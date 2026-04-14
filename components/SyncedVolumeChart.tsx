"use client";

import { useEffect, useRef } from "react";
import Highcharts from "highcharts/highstock";
import { ActivityRow } from "@/lib/types";

type Props = {
  rows: ActivityRow[];
  label: string;
  height?: number;
};

const BID_COLORS = ["#4ade80", "#22c55e", "#16a34a"];
const ASK_COLORS = ["#f87171", "#ef4444", "#dc2626"];

export default function SyncedVolumeChart({ rows, label, height = 280 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const bid1: [number, number][] = [];
    const bid2: [number, number][] = [];
    const bid3: [number, number][] = [];
    const ask1: [number, number][] = [];
    const ask2: [number, number][] = [];
    const ask3: [number, number][] = [];

    for (const row of rows) {
      if (row.bidVolume1 !== null) bid1.push([row.timestamp, row.bidVolume1]);
      if (row.bidVolume2 !== null) bid2.push([row.timestamp, row.bidVolume2]);
      if (row.bidVolume3 !== null) bid3.push([row.timestamp, row.bidVolume3]);
      if (row.askVolume1 !== null) ask1.push([row.timestamp, -row.askVolume1]);
      if (row.askVolume2 !== null) ask2.push([row.timestamp, -row.askVolume2]);
      if (row.askVolume3 !== null) ask3.push([row.timestamp, -row.askVolume3]);
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
        labels: {
          style: { color: "#d4d4d4", fontSize: "11px" },
          formatter() {
            return String(Math.abs(this.value as number));
          },
        },
        plotLines: [
          {
            value: 0,
            color: "#737373",
            width: 1,
          },
        ],
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
          const lines = pts
            .slice()
            .sort((a, b) => b.y - a.y)
            .map((p) => {
              const absY = Math.round(Math.abs(p.y));
              return `<span style="color:${p.series.color}">\u25A0</span> <span style="color:#a3a3a3">${p.series.name}</span> <b style="color:#f5f5f5">${absY}</b>`;
            });
          return `<div style="line-height:1.5"><span style="color:#737373">ts</span> <span style="color:#f5f5f5">${ts}</span><br/>${lines.join("<br/>")}</div>`;
        },
      },
      plotOptions: {
        column: {
          stacking: "normal",
          borderWidth: 0,
          groupPadding: 0,
          pointPadding: 0,
          animation: false,
          findNearestPointBy: "x",
          states: {
            hover: { enabled: false },
            inactive: { opacity: 1 },
          },
          dataGrouping: {
            enabled: true,
            forced: true,
            groupPixelWidth: 4,
            approximation: "average",
          },
        },
      },
      series: [
        { type: "column", name: "Bid 3", color: BID_COLORS[0], data: bid3 },
        { type: "column", name: "Bid 2", color: BID_COLORS[1], data: bid2 },
        { type: "column", name: "Bid 1", color: BID_COLORS[2], data: bid1 },
        { type: "column", name: "Ask 1", color: ASK_COLORS[2], data: ask1 },
        { type: "column", name: "Ask 2", color: ASK_COLORS[1], data: ask2 },
        { type: "column", name: "Ask 3", color: ASK_COLORS[0], data: ask3 },
      ],
    };

    const chart = Highcharts.stockChart(containerRef.current, options);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [height, rows]);

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
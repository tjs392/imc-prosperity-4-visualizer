"use client";

import { useEffect, useRef } from "react";
import Highcharts from "highcharts/highstock";
import { Trade } from "@/lib/types";

type Props = {
  trades: Trade[];
  product: string;
  label: string;
  height?: number;
};

const KNOWN_LIMITS: Record<string, number> = {
  EMERALDS: 80,
  TOMATOES: 80,
};

const LIMIT_PADDING = 10;

export default function SyncedPositionChart({
  trades,
  product,
  label,
  height = 280,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const productTrades = trades.filter((t) => t.symbol === product);
    const positionPoints: [number, number][] = [];
    let position = 0;

    if (productTrades.length > 0) {
      positionPoints.push([productTrades[0].timestamp, 0]);
    }
    for (const t of productTrades) {
      if (t.buyer === "SUBMISSION" && t.seller !== "SUBMISSION") {
        position += t.quantity;
      } else if (t.seller === "SUBMISSION" && t.buyer !== "SUBMISSION") {
        position -= t.quantity;
      } else {
        continue;
      }
      positionPoints.push([t.timestamp, position]);
    }

    const limit = KNOWN_LIMITS[product] ?? null;

    const rawPositions: [number, number][] = positionPoints;

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
        min: limit !== null ? -(limit + LIMIT_PADDING) : undefined,
        max: limit !== null ? limit + LIMIT_PADDING : undefined,
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
        },
        plotLines:
          limit !== null
            ? [
                { value: 0, color: "#737373", width: 1 },
                { value: limit, color: "#525252", width: 1, dashStyle: "Dot" },
                { value: -limit, color: "#525252", width: 1, dashStyle: "Dot" },
              ]
            : [{ value: 0, color: "#737373", width: 1 }],
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
          const limitStr = limit !== null ? ` <span style="color:#737373">/ ${limit}</span>` : "";
          const lines = pts.map((p) => {
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
          dataGrouping: {
            enabled: false,
          },
        },
      },
      series: [
        {
          type: "line",
          name: "Position",
          color: "#60a5fa",
          data: rawPositions,
          lineWidth: 1.5,
          step: "left",
        },
      ],
    };

    const chart = Highcharts.stockChart(containerRef.current, options);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [height, trades, product]);

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
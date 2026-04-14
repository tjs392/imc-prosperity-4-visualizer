"use client";

import { useEffect, useRef } from "react";
import Highcharts from "highcharts/highstock";
import { MetricPoint } from "@/lib/historicalMetrics";

type Props = {
  data: MetricPoint[];
  confidenceBand: number;
  label: string;
  height?: number;
};

export default function HistoricalACFChart({
  data,
  confidenceBand,
  label,
  height = 260,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const barData: [number, number][] = data.map((p) => [p.time, p.value]);

    const options: Highcharts.Options = {
      chart: {
        type: "column",
        height,
        animation: false,
        backgroundColor: "#2a2d31",
        spacing: [6, 6, 6, 6],
        style: { fontFamily: "inherit" },
      },
      credits: { enabled: false },
      title: { text: undefined },
      legend: { enabled: false },
      xAxis: {
        type: "linear",
        title: {
          text: "Lag (timestamps)",
          style: { color: "#737373", fontSize: "10px" },
        },
        lineColor: "#525252",
        tickColor: "#525252",
        gridLineColor: "#3a3d41",
        gridLineWidth: 0,
        labels: {
          style: { color: "#a3a3a3", fontSize: "11px" },
        },
      },
      yAxis: {
        title: { text: undefined },
        gridLineColor: "#3a3d41",
        gridLineWidth: 1,
        gridLineDashStyle: "Dot",
        lineColor: "#525252",
        tickColor: "#525252",
        labels: { style: { color: "#a3a3a3", fontSize: "11px" } },
        plotLines: [
          {
            value: confidenceBand,
            color: "#f97316",
            width: 1,
            dashStyle: "Dash",
            zIndex: 3,
          },
          {
            value: 0,
            color: "#737373",
            width: 1,
            zIndex: 3,
          },
          {
            value: -confidenceBand,
            color: "#f97316",
            width: 1,
            dashStyle: "Dash",
            zIndex: 3,
          },
        ],
      },
      tooltip: {
        backgroundColor: "rgba(42,45,49,0.96)",
        borderColor: "#737373",
        borderRadius: 0,
        borderWidth: 1,
        shadow: false,
        padding: 8,
        style: { color: "#f5f5f5", fontSize: "12px" },
        useHTML: true,
        formatter(this: unknown) {
          const ctx = this as { x: number; y: number };
          const sig = Math.abs(ctx.y) > confidenceBand;
          const color = sig ? "#f5f5f5" : "#a3a3a3";
          return `<div style="line-height:1.5"><span style="color:#737373">lag</span> <span style="color:#f5f5f5">${ctx.x}</span><br/><span style="color:#737373">corr</span> <b style="color:${color}">${ctx.y.toFixed(4)}</b></div>`;
        },
      },
      plotOptions: {
        column: {
          animation: false,
          borderWidth: 0,
          pointPadding: 0.1,
          groupPadding: 0,
          color: "#d4d4d4",
          states: {
            hover: { enabled: true, color: "#f5f5f5" },
            inactive: { opacity: 1 },
          },
        },
      },
      series: [
        {
          type: "column",
          name: "ACF",
          data: barData,
        },
      ],
    };

    const chart = Highcharts.chart(containerRef.current, options);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [data, confidenceBand, height]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31]">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <span className="text-neutral-100 text-xs font-semibold">{label}</span>
        <span className="text-[11px] text-neutral-500 font-mono">
          ±{confidenceBand.toFixed(3)}
        </span>
      </div>
      <div ref={containerRef} style={{ width: "100%", height }} />
    </div>
  );
}
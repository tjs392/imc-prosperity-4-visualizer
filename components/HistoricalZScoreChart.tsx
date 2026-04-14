"use client";

import { useEffect, useRef } from "react";
import Highcharts from "highcharts/highstock";
import { MetricPoint } from "@/lib/historicalMetrics";

type Props = {
  rolling: MetricPoint[];
  global: MetricPoint[];
  detrended: MetricPoint[];
  label: string;
  height?: number;
  xPlotLines?: { value: number; label?: string }[];
};

export default function HistoricalZScoreChart({
  rolling,
  global,
  detrended,
  label,
  height = 260,
  xPlotLines,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

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
        plotLines: [
          { value: 2, color: "#525252", width: 1, dashStyle: "Dash", zIndex: 3 },
          { value: 0, color: "#737373", width: 1, zIndex: 3 },
          { value: -2, color: "#525252", width: 1, dashStyle: "Dash", zIndex: 3 },
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
            points?: { y: number; series: { name: string; color: string } }[];
          };
          const ts = ctx.x;
          const pts = ctx.points ?? [];
          const lines = pts.map(
            (p) =>
              `<span style="color:${p.series.color}">\u25CF</span> <span style="color:#a3a3a3">${p.series.name}</span> <b style="color:#f5f5f5">${p.y.toFixed(2)}</b>`
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
      series: [
        {
          type: "line",
          name: "Rolling",
          color: "#60a5fa",
          data: rolling.map((p) => [p.time, p.value] as [number, number]),
          lineWidth: 1.25,
        },
        {
          type: "line",
          name: "Global",
          color: "#f97316",
          data: global.map((p) => [p.time, p.value] as [number, number]),
          lineWidth: 1.25,
        },
        {
          type: "line",
          name: "Detrended",
          color: "#a3e635",
          data: detrended.map((p) => [p.time, p.value] as [number, number]),
          lineWidth: 1.25,
        },
      ],
    };

    const chart = Highcharts.stockChart(containerRef.current, options);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [height, rolling, global, detrended, xPlotLines]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31]">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-neutral-100 text-xs font-semibold">{label}</span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] text-neutral-400">
              <span className="inline-block w-2 h-2" style={{ backgroundColor: "#60a5fa" }} />
              Rolling
            </span>
            <span className="flex items-center gap-1 text-[11px] text-neutral-400">
              <span className="inline-block w-2 h-2" style={{ backgroundColor: "#f97316" }} />
              Global
            </span>
            <span className="flex items-center gap-1 text-[11px] text-neutral-400">
              <span className="inline-block w-2 h-2" style={{ backgroundColor: "#a3e635" }} />
              Detrended
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
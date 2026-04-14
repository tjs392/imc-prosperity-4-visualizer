"use client";

import { useEffect, useRef } from "react";
import Highcharts from "highcharts/highstock";
import { MetricPoint } from "@/lib/historicalMetrics";

type Props = {
  series: MetricPoint[];
  mean: number;
  stdev: number;
  label: string;
  height?: number;
  xPlotLines?: { value: number; label?: string }[];
};

export default function HistoricalPairSpreadChart({
  series,
  mean,
  stdev,
  label,
  height = 260,
  xPlotLines,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const data: [number, number][] = series.map((p) => [p.time, p.value]);

    const plotLines: Highcharts.YAxisPlotLinesOptions[] = [
      { value: mean + 2 * stdev, color: "#ef4444", width: 1, dashStyle: "Dash", zIndex: 3 },
      { value: mean + stdev, color: "#737373", width: 1, dashStyle: "Dot", zIndex: 3 },
      { value: mean, color: "#a3a3a3", width: 1, zIndex: 3 },
      { value: mean - stdev, color: "#737373", width: 1, dashStyle: "Dot", zIndex: 3 },
      { value: mean - 2 * stdev, color: "#22c55e", width: 1, dashStyle: "Dash", zIndex: 3 },
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
            const z = stdev === 0 ? 0 : (p.y - mean) / stdev;
            return `<span style="color:${p.series.color}">\u25CF</span> <span style="color:#a3a3a3">spread</span> <b style="color:#f5f5f5">${p.y.toFixed(2)}</b> <span style="color:#737373">z=${z.toFixed(2)}</span>`;
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
          name: "Spread",
          color: "#e879f9",
          data,
          lineWidth: 1.5,
        },
      ],
    };

    const chart = Highcharts.stockChart(containerRef.current, options);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [series, mean, stdev, height, xPlotLines]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31]">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-neutral-100 text-xs font-semibold">{label}</span>
          <span className="text-[11px] text-neutral-500 font-mono">
            mean {mean.toFixed(2)} σ {stdev.toFixed(2)}
          </span>
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
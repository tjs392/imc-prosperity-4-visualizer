"use client";

import { useEffect, useRef } from "react";
import Highcharts from "highcharts/highstock";

type DataPoint = {
  time: number;
  value: number;
};

type Props = {
  data: DataPoint[];
  label: string;
  color?: string;
  height?: number;
  valueLabel?: string;
};

export default function SyncedLineChart({
  data,
  label,
  color = "#fbbf24",
  height = 260,
  valueLabel = "value",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const seriesData: [number, number][] = data.map((d) => [d.time, d.value]);

    const options: Highcharts.Options = {
      chart: {
        height,
        animation: false,
        backgroundColor: "#2a2d31",
        spacing: [6, 6, 6, 6],
        zooming: { type: "x" },
        panning: { enabled: true, type: "x" },
        panKey: "shift",
        style: { fontFamily: "ui-monospace, Menlo, monospace" },
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
        },
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
        style: {
          color: "#f5f5f5",
          fontSize: "12px",
        },
        useHTML: true,
        formatter(this: unknown) {
          const ctx = this as {
            x: number;
            y: number;
            series: { name: string; color: string };
            points?: { y: number; series: { name: string; color: string } }[];
          };
          const ts = ctx.x;
          const pts = ctx.points ?? [ctx];
          const lines = pts.map((p) => {
            const seriesColor = (p.series && p.series.color) || color;
            return `<span style="color:${seriesColor}">\u25CF</span> <span style="color:#a3a3a3">${p.series.name}</span> <b style="color:#f5f5f5">${p.y}</b>`;
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
          dataGrouping: {
            enabled: true,
            forced: true,
            groupPixelWidth: 2,
            approximation(this: unknown, values: number[]): number {
              return values[0];
            },
          },
          marker: { enabled: false },
        },
      },
      series: [
        {
          type: "line",
          name: valueLabel,
          data: seriesData,
          color,
          lineWidth: 1,
        },
      ],
    };

    const chart = Highcharts.stockChart(containerRef.current, options);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [color, height, label, valueLabel, data]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31]">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <span className="text-neutral-100 text-xs font-semibold">
          {label}
        </span>
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
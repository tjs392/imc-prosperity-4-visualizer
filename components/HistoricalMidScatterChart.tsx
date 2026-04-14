"use client";

import { useEffect, useRef } from "react";
import Highcharts from "highcharts/highstock";
import { ActivityRow } from "@/lib/types";

type Props = {
  aRows: ActivityRow[];
  bRows: ActivityRow[];
  productA: string;
  productB: string;
  label: string;
  height?: number;
};

function lerpColor(t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  const r = Math.round(96 + (239 - 96) * clamp);
  const g = Math.round(165 + (68 - 165) * clamp);
  const b = Math.round(250 + (68 - 250) * clamp);
  return `rgb(${r},${g},${b})`;
}

export default function HistoricalMidScatterChart({
  aRows,
  bRows,
  productA,
  productB,
  label,
  height = 260,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const bByTs = new Map<number, number>();
    for (const r of bRows) {
      if (r.midPrice !== null) bByTs.set(r.timestamp, r.midPrice);
    }
    const pairs: { x: number; y: number; ts: number }[] = [];
    for (const r of aRows) {
      if (r.midPrice === null) continue;
      const b = bByTs.get(r.timestamp);
      if (b === undefined) continue;
      pairs.push({ x: b, y: r.midPrice, ts: r.timestamp });
    }

    if (pairs.length === 0) {
      return () => {
        // nothing to destroy
      };
    }

    const minTs = pairs[0].ts;
    const maxTs = pairs[pairs.length - 1].ts;
    const tsRange = maxTs - minTs || 1;

    const points = pairs.map((p) => ({
      x: p.x,
      y: p.y,
      color: lerpColor((p.ts - minTs) / tsRange),
    }));

    const options: Highcharts.Options = {
      chart: {
        type: "scatter",
        height,
        animation: false,
        backgroundColor: "#2a2d31",
        spacing: [6, 6, 6, 6],
        zooming: { type: "xy" },
        style: { fontFamily: "inherit" },
      },
      credits: { enabled: false },
      title: { text: undefined },
      legend: { enabled: false },
      xAxis: {
        type: "linear",
        title: {
          text: productB,
          style: { color: "#737373", fontSize: "10px" },
        },
        lineColor: "#525252",
        tickColor: "#525252",
        gridLineColor: "#3a3d41",
        gridLineWidth: 1,
        gridLineDashStyle: "Dot",
        labels: { style: { color: "#a3a3a3", fontSize: "11px" } },
      },
      yAxis: {
        title: {
          text: productA,
          style: { color: "#737373", fontSize: "10px" },
        },
        gridLineColor: "#3a3d41",
        gridLineWidth: 1,
        gridLineDashStyle: "Dot",
        lineColor: "#525252",
        tickColor: "#525252",
        labels: { style: { color: "#a3a3a3", fontSize: "11px" } },
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
          return `<div style="line-height:1.5"><span style="color:#737373">${productB}</span> <span style="color:#f5f5f5">${ctx.x}</span><br/><span style="color:#737373">${productA}</span> <span style="color:#f5f5f5">${ctx.y}</span></div>`;
        },
      },
      plotOptions: {
        scatter: {
          animation: false,
          marker: {
            radius: 2,
            lineWidth: 0,
            states: { hover: { enabled: true } },
          },
          states: { inactive: { opacity: 1 } },
        },
      },
      series: [
        {
          type: "scatter",
          name: "mid pairs",
          data: points,
        },
      ],
    };

    const chart = Highcharts.chart(containerRef.current, options);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [aRows, bRows, productA, productB, height]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31]">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <span className="text-neutral-100 text-xs font-semibold">{label}</span>
        <span className="text-[11px] text-neutral-500 font-mono">
          early{" "}
          <span className="inline-block w-2 h-2" style={{ backgroundColor: "#60a5fa" }} />
          {" → "}
          <span className="inline-block w-2 h-2" style={{ backgroundColor: "#ef4444" }} />
          {" late"}
        </span>
      </div>
      <div ref={containerRef} style={{ width: "100%", height }} />
    </div>
  );
}
"use client";

import { useMemo } from "react";
import { ActivityRow } from "@/lib/types";
import HistoricalLineChart from "./HistoricalLineChart";
import { XPlotLine } from "@/lib/historicalUplotHelpers";

type Props = {
  rows: ActivityRow[];
  label: string;
  height?: number;
  xPlotLines?: XPlotLine[];
  syncKey?: string;
  resetSignal?: number;
};

function sumVol(vs: (number | null)[]): number {
  let s = 0;
  for (const v of vs) if (v !== null && v !== undefined) s += v;
  return s;
}

/**
 * Total bid depth (positive) vs total ask depth (negative) over time, drawn
 * as filled areas around a zero baseline. Mirrors the dashboard's
 * "signed depth" volume mode for the historical view.
 */
export default function HistoricalVolumeChart({
  rows,
  label,
  height = 260,
  xPlotLines,
  syncKey = "historical",
  resetSignal = 0,
}: Props) {
  const { bids, asks } = useMemo(() => {
    const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
    const b: { time: number; value: number }[] = [];
    const a: { time: number; value: number }[] = [];
    for (const r of sorted) {
      const bv = sumVol([r.bidVolume1, r.bidVolume2, r.bidVolume3]);
      const av = sumVol([r.askVolume1, r.askVolume2, r.askVolume3]);
      b.push({ time: r.timestamp, value: bv });
      a.push({ time: r.timestamp, value: -av });
    }
    return { bids: b, asks: a };
  }, [rows]);

  return (
    <HistoricalLineChart
      data={bids}
      data2={asks}
      label={label}
      color="#60a5fa"
      color2="#ef4444"
      valueLabel="bid"
      valueLabel2="ask"
      fillArea
      zeroLine
      height={height}
      formatValue={(v) => Math.abs(v).toFixed(0)}
      syncKey={syncKey}
      resetSignal={resetSignal}
      xPlotLines={xPlotLines}
    />
  );
}
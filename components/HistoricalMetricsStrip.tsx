"use client";

import { ProductMetrics, PairMetrics } from "@/lib/historicalMetrics";

type Props = {
  productMetrics: ProductMetrics[];
  pairMetrics: PairMetrics | null;
};

function fmt(
  v: number | null,
  digits = 2,
  prefix = "",
  suffix = ""
): string {
  if (v === null || !Number.isFinite(v)) return "-";
  return `${prefix}${v.toFixed(digits)}${suffix}`;
}

function vrColor(vr: number | null): string {
  if (vr === null) return "#a3a3a3";
  if (vr < 0.7) return "#4ade80";
  if (vr > 1.3) return "#f87171";
  return "#d4d4d4";
}

function vrLabel(vr: number | null): string {
  if (vr === null) return "";
  if (vr < 0.7) return "↓";
  if (vr > 1.3) return "↑";
  return "─";
}

function trendColor(r2: number | null): string {
  if (r2 === null) return "#a3a3a3";
  if (r2 > 0.5) return "#fbbf24";
  if (r2 > 0.2) return "#d4d4d4";
  return "#737373";
}

function trendLabel(r2: number | null, slope: number | null): string {
  if (r2 === null || slope === null) return "-";
  if (r2 < 0.2) return "flat";
  const dir = slope > 0 ? "up" : "dn";
  const strength = r2 > 0.7 ? "strong" : "mild";
  return `${strength} ${dir}`;
}

function halfLifeColor(hl: number | null): string {
  if (hl === null) return "#a3a3a3";
  if (hl < 100) return "#4ade80";
  if (hl > 500) return "#f87171";
  return "#d4d4d4";
}

function corrColor(c: number | null): string {
  if (c === null) return "#a3a3a3";
  if (Math.abs(c) > 0.5) return "#4ade80";
  if (Math.abs(c) < 0.2) return "#f87171";
  return "#d4d4d4";
}

export default function HistoricalMetricsStrip({
  productMetrics,
  pairMetrics,
}: Props) {
  return (
    <div className="border border-neutral-600 bg-[#2a2d31] mb-3 font-mono text-[11px]">
      {productMetrics.map((m) => (
        <div
          key={m.product}
          className="flex items-center gap-5 px-3 py-1.5 border-b border-neutral-700 last:border-b-0"
        >
          <span className="text-neutral-100 font-semibold min-w-[180px]">
            {m.product}
          </span>
          <span className="text-neutral-500">
            Trend{" "}
            <span style={{ color: trendColor(m.trendR2) }}>
              {trendLabel(m.trendR2, m.trendSlope)}
            </span>
          </span>
          <span className="text-neutral-500">
            VR{" "}
            <span style={{ color: vrColor(m.hurst) }}>
              {fmt(m.hurst, 2)} {vrLabel(m.hurst)}
            </span>
          </span>
          <span className="text-neutral-500">
            HL{" "}
            <span style={{ color: halfLifeColor(m.halfLife) }}>
              {m.halfLife !== null ? `${Math.round(m.halfLife)}t` : "-"}
            </span>
          </span>
          <span className="text-neutral-500">
            Vol{" "}
            <span className="text-neutral-200">{fmt(m.volatility, 5)}</span>
          </span>
          <span className="text-neutral-500">
            Spread{" "}
            <span className="text-neutral-200">{fmt(m.avgSpread, 2)}</span>
          </span>
          <span className="text-neutral-500">
            Ticks <span className="text-neutral-200">{m.ticks}</span>
          </span>
        </div>
      ))}
      {pairMetrics && (
        <div className="flex items-center gap-5 px-3 py-1.5 bg-[#33363a]">
          <span className="text-neutral-100 font-semibold min-w-[180px]">
            PAIR {pairMetrics.productA} × {pairMetrics.productB}
          </span>
          <span className="text-neutral-500">
            Corr{" "}
            <span style={{ color: corrColor(pairMetrics.correlation) }}>
              {fmt(pairMetrics.correlation, 2)}
            </span>
          </span>
          <span className="text-neutral-500">
            β <span className="text-neutral-200">{fmt(pairMetrics.beta, 3)}</span>
          </span>
          <span className="text-neutral-500">
            Spread HL{" "}
            <span style={{ color: halfLifeColor(pairMetrics.spreadHalfLife) }}>
              {pairMetrics.spreadHalfLife !== null
                ? `${Math.round(pairMetrics.spreadHalfLife)}t`
                : "-"}
            </span>
          </span>
          <span className="text-neutral-500">
            Spread z{" "}
            <span className="text-neutral-200">
              {fmt(pairMetrics.currentSpreadZ, 2)}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
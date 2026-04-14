"use client";

import { ParsedLog } from "@/lib/types";
import DashboardLogViewer from "@/components/DashboardLogViewer";
import type { Normalizer } from "@/components/DashboardUPlotChart";
import type { LevelKey, TradeKey, OrderKey, PnlStats } from "@/components/DashboardView";

type TradeShape = "square" | "triangleUp" | "triangleDown";

const LEVEL_ORDER: { key: LevelKey; label: string; color: string }[] = [
  { key: "ask3", label: "Ask 3", color: "rgba(239, 68, 68, 0.35)" },
  { key: "ask2", label: "Ask 2", color: "rgba(239, 68, 68, 0.65)" },
  { key: "ask1", label: "Ask 1", color: "rgba(239, 68, 68, 1)" },
  { key: "mid", label: "Mid", color: "#d4d4d4" },
  { key: "bid1", label: "Bid 1", color: "rgba(59, 130, 246, 1)" },
  { key: "bid2", label: "Bid 2", color: "rgba(59, 130, 246, 0.65)" },
  { key: "bid3", label: "Bid 3", color: "rgba(59, 130, 246, 0.35)" },
];

const TRADE_ORDER: {
  key: TradeKey;
  label: string;
  color: string;
  shape: TradeShape;
}[] = [
  { key: "botMaker", label: "Makers", color: "#a3a3a3", shape: "square" },
  { key: "botTaker", label: "Takers", color: "#22d3ee", shape: "triangleUp" },
  { key: "myBuy", label: "My Buys", color: "#fbbf24", shape: "triangleUp" },
  { key: "mySell", label: "My Sells", color: "#fbbf24", shape: "triangleDown" },
];

const ORDER_ORDER: { key: OrderKey; label: string; color: string }[] = [
  { key: "ownOrders", label: "Own Orders", color: "#86efac" },
];

function TradeShapeIcon({
  shape,
  color,
}: {
  shape: TradeShape;
  color: string;
}) {
  if (shape === "square") {
    return (
      <svg width="10" height="10" viewBox="0 0 12 12" className="flex-none">
        <rect x="1.5" y="1.5" width="9" height="9" fill={color} stroke="#2a2d31" strokeWidth="1" />
      </svg>
    );
  }
  if (shape === "triangleDown") {
    return (
      <svg width="10" height="10" viewBox="0 0 12 12" className="flex-none">
        <polygon points="6,11 11,1 1,1" fill={color} stroke="#2a2d31" strokeWidth="1" />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" className="flex-none">
      <polygon points="6,1 11,11 1,11" fill={color} stroke="#2a2d31" strokeWidth="1" />
    </svg>
  );
}

type Props = {
  parsed: ParsedLog | null;
  selectedProduct: string | null;
  onSelectProduct: (p: string) => void;
  normalizer: Normalizer;
  onSelectNormalizer: (n: Normalizer) => void;
  visibleLevels: Record<LevelKey, boolean>;
  onToggleLevel: (k: LevelKey) => void;
  visibleTrades: Record<TradeKey, boolean>;
  onToggleTrade: (k: TradeKey) => void;
  visibleOrders: Record<OrderKey, boolean>;
  onToggleOrder: (k: OrderKey) => void;
  qtyMin: number;
  qtyMax: number | null;
  maxTradeQty: number;
  onQtyMinChange: (n: number) => void;
  onQtyMaxChange: (n: number | null) => void;
  pnlStats: PnlStats;
  hoveredTime: number | null;
};

export default function DashboardRightPanel({
  parsed,
  selectedProduct,
  onSelectProduct,
  normalizer,
  onSelectNormalizer,
  visibleLevels,
  onToggleLevel,
  visibleTrades,
  onToggleTrade,
  visibleOrders,
  onToggleOrder,
  qtyMin,
  qtyMax,
  maxTradeQty,
  onQtyMinChange,
  onQtyMaxChange,
  pnlStats,
  hoveredTime,
}: Props) {
  const products = parsed?.products ?? [];
  const effectiveMax = maxTradeQty > 0 ? maxTradeQty : 100;
  const maxForSlider = qtyMax === null ? effectiveMax : qtyMax;

  const handleSliderMin = (v: number) => {
    const clamped = Math.max(0, Math.min(v, effectiveMax));
    if (qtyMax !== null && clamped > qtyMax) {
      onQtyMinChange(qtyMax);
    } else {
      onQtyMinChange(clamped);
    }
  };

  const handleSliderMax = (v: number) => {
    const clamped = Math.max(0, Math.min(v, effectiveMax));
    if (clamped < qtyMin) {
      onQtyMaxChange(qtyMin);
    } else if (clamped >= effectiveMax) {
      onQtyMaxChange(null);
    } else {
      onQtyMaxChange(clamped);
    }
  };

  return (
    <div className="border border-neutral-600 bg-[#2a2d31] h-full flex flex-col min-h-0 min-w-0">
      <div className="flex-none border-b border-neutral-600 px-3 py-2 space-y-2 overflow-y-auto max-h-[60%]">
        <div className="text-neutral-100 text-xs font-semibold">
          Selection Controls
        </div>

        <div className="flex items-center gap-2">
          <span className="text-neutral-400 text-[11px] w-16 flex-none">
            Product
          </span>
          <select
            value={selectedProduct ?? ""}
            onChange={(e) => onSelectProduct(e.target.value)}
            disabled={products.length === 0}
            className="flex-1 min-w-0 border border-neutral-600 bg-[#1f2125] text-neutral-200 px-2 py-1 text-[11px] focus:border-neutral-300 focus:outline-none disabled:text-neutral-600"
          >
            {products.length === 0 ? (
              <option>-</option>
            ) : (
              products.map((p) => (
                <option
                  key={p.product}
                  value={p.product}
                  className="bg-[#1f2125]"
                >
                  {p.product}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-neutral-400 text-[11px] w-16 flex-none">
            Normalize
          </span>
          <select
            value={normalizer}
            onChange={(e) => onSelectNormalizer(e.target.value as Normalizer)}
            className="flex-1 min-w-0 border border-neutral-600 bg-[#1f2125] text-neutral-200 px-2 py-1 text-[11px] focus:border-neutral-300 focus:outline-none"
          >
            <option value="none" className="bg-[#1f2125]">
              None
            </option>
            <option value="wallMid" className="bg-[#1f2125]">
              WallMid
            </option>
          </select>
        </div>

        <div className="pt-1">
          <div className="text-neutral-500 text-[10px] uppercase tracking-wide mb-1">
            Levels
          </div>
          <div className="flex flex-wrap gap-1">
            {LEVEL_ORDER.map(({ key, label, color }) => {
              const isOn = visibleLevels[key];
              return (
                <button
                  key={key}
                  onClick={() => onToggleLevel(key)}
                  className={`flex items-center gap-1 border px-1.5 py-0.5 text-[10px] transition-colors ${
                    isOn
                      ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                      : "border-neutral-600 bg-[#1f2125] text-neutral-500 hover:text-neutral-200"
                  }`}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 flex-none"
                    style={{ backgroundColor: color }}
                  />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-neutral-500 text-[10px] uppercase tracking-wide mb-1">
            Trades
          </div>
          <div className="flex flex-wrap gap-1">
            {TRADE_ORDER.map(({ key, label, color, shape }) => {
              const isOn = visibleTrades[key];
              return (
                <button
                  key={key}
                  onClick={() => onToggleTrade(key)}
                  className={`flex items-center gap-1 border px-1.5 py-0.5 text-[10px] transition-colors ${
                    isOn
                      ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                      : "border-neutral-600 bg-[#1f2125] text-neutral-500 hover:text-neutral-200"
                  }`}
                >
                  <TradeShapeIcon shape={shape} color={color} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-neutral-500 text-[10px] uppercase tracking-wide mb-1">
            Orders
          </div>
          <div className="flex flex-wrap gap-1">
            {ORDER_ORDER.map(({ key, label, color }) => {
              const isOn = visibleOrders[key];
              return (
                <button
                  key={key}
                  onClick={() => onToggleOrder(key)}
                  className={`flex items-center gap-1 border px-1.5 py-0.5 text-[10px] transition-colors ${
                    isOn
                      ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                      : "border-neutral-600 bg-[#1f2125] text-neutral-500 hover:text-neutral-200"
                  }`}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full border flex-none"
                    style={{ borderColor: color }}
                  />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-neutral-500 text-[10px] uppercase tracking-wide mb-1">
            Quantity Filter
          </div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              value={qtyMin}
              min={0}
              max={effectiveMax}
              onChange={(e) => {
                const v = e.target.value === "" ? 0 : Number(e.target.value);
                handleSliderMin(Number.isFinite(v) ? v : 0);
              }}
              className="flex-1 min-w-0 border border-neutral-600 bg-[#1f2125] text-neutral-200 px-2 py-1 text-[11px] focus:border-neutral-300 focus:outline-none"
              placeholder="min"
            />
            <span className="text-neutral-500 text-[10px]">to</span>
            <input
              type="number"
              value={qtyMax === null ? "" : qtyMax}
              min={0}
              max={effectiveMax}
              onChange={(e) => {
                if (e.target.value === "") {
                  onQtyMaxChange(null);
                  return;
                }
                const v = Number(e.target.value);
                handleSliderMax(Number.isFinite(v) ? v : effectiveMax);
              }}
              className="flex-1 min-w-0 border border-neutral-600 bg-[#1f2125] text-neutral-200 px-2 py-1 text-[11px] focus:border-neutral-300 focus:outline-none"
              placeholder="max"
            />
          </div>

          <div className="relative h-5">
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-neutral-700" />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-neutral-300"
              style={{
                left: `${(qtyMin / effectiveMax) * 100}%`,
                right: `${100 - (maxForSlider / effectiveMax) * 100}%`,
              }}
            />
            <input
              type="range"
              min={0}
              max={effectiveMax}
              value={qtyMin}
              onChange={(e) => handleSliderMin(Number(e.target.value))}
              className="qty-slider-thumb absolute inset-0 w-full appearance-none bg-transparent pointer-events-none"
              style={{ zIndex: qtyMin > effectiveMax - 1 ? 5 : 3 }}
            />
            <input
              type="range"
              min={0}
              max={effectiveMax}
              value={maxForSlider}
              onChange={(e) => handleSliderMax(Number(e.target.value))}
              className="qty-slider-thumb absolute inset-0 w-full appearance-none bg-transparent pointer-events-none"
              style={{ zIndex: 4 }}
            />
          </div>
          <div className="flex justify-between text-neutral-600 text-[9px] mt-0.5">
            <span>0</span>
            <span>{effectiveMax}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] border-t border-neutral-600">
        <div className="min-h-0 min-w-0 border-r border-neutral-600 flex flex-col">
          <StatsSection stats={pnlStats} />
        </div>
        <div className="min-h-0 min-w-0 flex flex-col">
          <DashboardLogViewer
            sandbox={parsed?.sandbox ?? []}
            hoveredTime={hoveredTime}
          />
        </div>
      </div>
    </div>
  );
}

function StatsSection({ stats }: { stats: PnlStats }) {
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const fmtSigned = (n: number) => (n >= 0 ? "+" : "") + fmt(n);
  const calmarStr =
    stats.calmar === null
      ? "-"
      : !Number.isFinite(stats.calmar)
      ? "inf"
      : fmt(stats.calmar);
  const pnlColor =
    stats.finalPnl > 0
      ? "#a3e635"
      : stats.finalPnl < 0
      ? "#ef4444"
      : "#d4d4d4";

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center border-b border-neutral-600 px-3 py-1.5 flex-none">
        <span className="text-neutral-100 text-xs font-semibold">Stats</span>
      </div>
      <div className="flex-1 overflow-auto px-3 py-3 space-y-3 text-[11px]">
        <Stat label="Final PnL" value={fmtSigned(stats.finalPnl)} color={pnlColor} />
        <Stat label="Peak PnL" value={fmtSigned(stats.peakPnl)} />
        <Stat
          label="Peak at"
          value={stats.peakAt === null ? "-" : `ts ${stats.peakAt}`}
          muted
        />
        <div className="border-t border-neutral-700 pt-2">
          <Stat
            label="Max Drawdown"
            value={stats.maxDrawdown > 0 ? `-${fmt(stats.maxDrawdown)}` : "0"}
            color={stats.maxDrawdown > 0 ? "#ef4444" : undefined}
          />
          <Stat
            label="DD at"
            value={stats.drawdownAt === null ? "-" : `ts ${stats.drawdownAt}`}
            muted
          />
          <Stat
            label="Time in DD"
            value={`${stats.timeInDrawdownPct.toFixed(1)}%`}
          />
        </div>
        <div className="border-t border-neutral-700 pt-2">
          <Stat label="Calmar" value={calmarStr} />
          <div className="text-neutral-600 text-[9px] mt-1 leading-snug">
            Calmar = Final PnL / Max Drawdown. Higher is better. A negative
            value means the session finished below its starting point.
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  muted,
}: {
  label: string;
  value: string;
  color?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-neutral-500 text-[10px] uppercase tracking-wide">
        {label}
      </span>
      <span
        className={`font-mono ${muted ? "text-[10px]" : "text-[12px]"}`}
        style={{ color: color ?? (muted ? "#737373" : "#f5f5f5") }}
      >
        {value}
      </span>
    </div>
  );
}
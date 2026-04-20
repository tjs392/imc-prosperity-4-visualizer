"use client";

import { useState } from "react";
import { ParsedLog, ActivityRow, Trade } from "@/lib/types";
import type { SpreadType, VolumeType } from "@/lib/bookMath";
import DashboardLogViewer from "@/components/Dashboard/DashboardLogViewer";
import type { Normalizer } from "@/components/Dashboard/DashboardUPlotChart";
import type { LevelKey, TradeKey, OrderKey, PnlStats } from "@/components/Dashboard/DashboardView";
import { OrderDepthTable } from "@/components/Logs/tables";

type TradeShape = "square" | "triangleUp" | "triangleDown" | "star";

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

const ORDER_ORDER: {
  key: OrderKey;
  label: string;
  color: string;
  shape: TradeShape;
}[] = [
  { key: "myBids", label: "My Bids", color: "#86efac", shape: "star" },
  { key: "myAsks", label: "My Asks", color: "#fca5a5", shape: "star" },
];

const BID_TINT = "rgba(74,222,128,0.10)";
const ASK_TINT = "rgba(248,113,113,0.10)";

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
  if (shape === "star") {
    return (
      <svg width="10" height="10" viewBox="0 0 12 12" className="flex-none">
        <polygon
          points="6,1 7.47,4.37 11.12,4.73 8.4,7.19 9.24,10.77 6,8.9 2.76,10.77 3.6,7.19 0.88,4.73 4.53,4.37"
          fill={color}
          stroke="#2a2d31"
          strokeWidth="0.5"
        />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" className="flex-none">
      <polygon points="6,1 11,11 1,11" fill={color} stroke="#2a2d31" strokeWidth="1" />
    </svg>
  );
}

type PanelKey = "pnl" | "position";

type Props = {
  parsed: ParsedLog | null;
  selectedProduct: string | null;
  onSelectProduct: (p: string) => void;
  normalizer: Normalizer;
  onSelectNormalizer: (n: Normalizer) => void;
  spreadType: SpreadType | "off";
  onSelectSpreadType: (t: SpreadType | "off") => void;
  volumeType: VolumeType | "off";
  onSelectVolumeType: (t: VolumeType | "off") => void;
  visibleLevels: Record<LevelKey, boolean>;
  onToggleLevel: (k: LevelKey) => void;
  visibleTrades: Record<TradeKey, boolean>;
  onToggleTrade: (k: TradeKey) => void;
  visibleOrders: Record<OrderKey, boolean>;
  onToggleOrder: (k: OrderKey) => void;
  visiblePanels: { pnl: boolean; position: boolean };
  onTogglePanel: (k: PanelKey) => void;
  qtyMin: number;
  qtyMax: number | null;
  maxTradeQty: number;
  onQtyMinChange: (n: number) => void;
  onQtyMaxChange: (n: number | null) => void;
  pnlStats: PnlStats;
  skippedPnlTicks: number;
  hoveredTime: number | null;
  zoomRange: { min: number; max: number } | null;
};

export default function DashboardRightPanel({
  parsed,
  selectedProduct,
  onSelectProduct,
  normalizer,
  onSelectNormalizer,
  spreadType,
  onSelectSpreadType,
  volumeType,
  onSelectVolumeType,
  visibleLevels,
  onToggleLevel,
  visibleTrades,
  onToggleTrade,
  visibleOrders,
  onToggleOrder,
  visiblePanels,
  onTogglePanel,
  qtyMin,
  qtyMax,
  maxTradeQty,
  onQtyMinChange,
  onQtyMaxChange,
  pnlStats,
  skippedPnlTicks,
  hoveredTime,
  zoomRange,
}: Props) {
  const products = parsed?.products ?? [];

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    tables: true,
    controls: false,
  });
  const toggle = (id: string) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="border border-neutral-600 bg-[#2a2d31] h-full flex flex-col min-h-0 min-w-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <PanelSection
          title="Tables"
          open={openSections.tables}
          onToggle={() => toggle("tables")}
        >
          <TablesSection
            activities={parsed?.activities ?? []}
            trades={parsed?.trades ?? []}
            selectedProduct={selectedProduct}
            hoveredTime={hoveredTime}
            zoomRange={zoomRange}
            qtyMin={qtyMin}
            qtyMax={qtyMax}
            maxTradeQty={maxTradeQty}
            onQtyMinChange={onQtyMinChange}
            onQtyMaxChange={onQtyMaxChange}
          />
        </PanelSection>

        <PanelSection
          title="Chart Controls"
          open={openSections.controls}
          onToggle={() => toggle("controls")}
        >
          <div className="flex flex-col gap-3">
            {/* Selection Controls */}
            <div>
              <div className="text-neutral-500 text-[10px] uppercase tracking-wide mb-1">Selection</div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400 text-[11px] w-16 flex-none">Product</span>
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
                        <option key={p.product} value={p.product} className="bg-[#1f2125]">
                          {p.product}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400 text-[11px] w-16 flex-none">Normalize</span>
                  <select
                    value={normalizer}
                    onChange={(e) => onSelectNormalizer(e.target.value as Normalizer)}
                    className="flex-1 min-w-0 border border-neutral-600 bg-[#1f2125] text-neutral-200 px-2 py-1 text-[11px] focus:border-neutral-300 focus:outline-none"
                  >
                    <option value="none" className="bg-[#1f2125]">None</option>
                    <option value="wallMid" className="bg-[#1f2125]">WallMid</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400 text-[11px] w-16 flex-none">Spread</span>
                  <select
                    value={spreadType}
                    onChange={(e) => onSelectSpreadType(e.target.value as SpreadType | "off")}
                    className="flex-1 min-w-0 border border-neutral-600 bg-[#1f2125] text-neutral-200 px-2 py-1 text-[11px] focus:border-neutral-300 focus:outline-none"
                  >
                    <option value="off" className="bg-[#1f2125]">Off</option>
                    <option value="absolute" className="bg-[#1f2125]">Absolute</option>
                    <option value="wall" className="bg-[#1f2125]">Wall</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400 text-[11px] w-16 flex-none">Volume</span>
                  <select
                    value={volumeType}
                    onChange={(e) => onSelectVolumeType(e.target.value as VolumeType | "off")}
                    className="flex-1 min-w-0 border border-neutral-600 bg-[#1f2125] text-neutral-200 px-2 py-1 text-[11px] focus:border-neutral-300 focus:outline-none"
                  >
                    <option value="off" className="bg-[#1f2125]">Off</option>
                    <option value="obi" className="bg-[#1f2125]">OBI (imbalance ratio)</option>
                    <option value="totalDepth" className="bg-[#1f2125]">Total Depth</option>
                    <option value="ownTrade" className="bg-[#1f2125]">Own Trade Volume</option>
                    <option value="signedDepth" className="bg-[#1f2125]">Signed Depth (3 levels)</option>
                    <option value="topOfBook" className="bg-[#1f2125]">Top of Book</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Panels */}
            <div>
              <div className="text-neutral-500 text-[10px] uppercase tracking-wide mb-1">Panels</div>
              <div className="flex flex-wrap gap-1">
                <PanelToggle label="P&L" on={visiblePanels.pnl} onClick={() => onTogglePanel("pnl")} />
                <PanelToggle label="Position" on={visiblePanels.position} onClick={() => onTogglePanel("position")} />
                <PanelToggle
                  label="Spread"
                  on={spreadType !== "off"}
                  onClick={() => onSelectSpreadType(spreadType === "off" ? "absolute" : "off")}
                />
                <PanelToggle
                  label="Volume"
                  on={volumeType !== "off"}
                  onClick={() => onSelectVolumeType(volumeType === "off" ? "obi" : "off")}
                />
              </div>
            </div>

            {/* Levels */}
            <div>
              <div className="text-neutral-500 text-[10px] uppercase tracking-wide mb-1">Levels</div>
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
                      <span className="inline-block w-2.5 h-2.5 flex-none" style={{ backgroundColor: color }} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Trades */}
            <div>
              <div className="text-neutral-500 text-[10px] uppercase tracking-wide mb-1">Trades</div>
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

            {/* Orders */}
            <div>
              <div className="text-neutral-500 text-[10px] uppercase tracking-wide mb-1">Orders</div>
              <div className="flex flex-wrap gap-1">
                {ORDER_ORDER.map(({ key, label, color, shape }) => {
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
                      <TradeShapeIcon shape={shape} color={color} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </PanelSection>

        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] border-t border-neutral-600 min-h-[240px]">
          <div className="min-h-0 min-w-0 border-r border-neutral-600 flex flex-col">
            <StatsSection stats={pnlStats} skippedPnlTicks={skippedPnlTicks} />
          </div>
          <div className="min-h-0 min-w-0 flex flex-col">
            <DashboardLogViewer sandbox={parsed?.sandbox ?? []} hoveredTime={hoveredTime} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-neutral-700">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2e3137] transition-colors"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
          {title}
        </span>
        <span className="text-neutral-500 text-[10px]">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function TablesSection({
  activities,
  trades,
  selectedProduct,
  hoveredTime,
  zoomRange,
  qtyMin,
  qtyMax,
  maxTradeQty,
  onQtyMinChange,
  onQtyMaxChange,
}: {
  activities: ActivityRow[];
  trades: Trade[];
  selectedProduct: string | null;
  hoveredTime: number | null;
  zoomRange: { min: number; max: number } | null;
  qtyMin: number;
  qtyMax: number | null;
  maxTradeQty: number;
  onQtyMinChange: (n: number) => void;
  onQtyMaxChange: (n: number | null) => void;
}) {
  const productOptions = Array.from(
    new Set(activities.map((r) => r.product))
  ).sort();
  const [localProduct, setLocalProduct] = useState<string | null>(null);
  const [tradeHistoryOpen, setTradeHistoryOpen] = useState(false);
  const [microOpen, setMicroOpen] = useState(false);
  const [qtyFilterOpen, setQtyFilterOpen] = useState(false);
  const [orderDepthOpen, setOrderDepthOpen] = useState(false);
  const effectiveProduct =
    localProduct ?? selectedProduct ?? productOptions[0] ?? null;

  // Build mid lookup for the current product, skipping one-sided books so
  // buy/sell classification isn't polluted by synthesized mids.
  const midByTs = (() => {
    if (!effectiveProduct) return new Map<number, number>();
    const m = new Map<number, number>();
    for (const r of activities) {
      if (r.product !== effectiveProduct) continue;
      if (r.midPrice === null) continue;
      if (r.bidPrice1 === null || r.askPrice1 === null) continue;
      m.set(r.timestamp, r.midPrice);
    }
    return m;
  })();

  // In-range predicate for stats. When user has zoomed, restrict to window.
  const inRange = (ts: number) => {
    if (!zoomRange) return true;
    return ts >= zoomRange.min && ts <= zoomRange.max;
  };

  // Per-side stats over the (filter-applied, zoom-scoped) trades.
  const sideStats = (() => {
    let buyCount = 0,
      buyQty = 0;
    let sellCount = 0,
      sellQty = 0;
    let neutralCount = 0,
      neutralQty = 0;
    if (effectiveProduct) {
      for (const t of trades) {
        if (t.symbol !== effectiveProduct) continue;
        if (!inRange(t.timestamp)) continue;
        const mid = midByTs.get(t.timestamp);
        const qty = Math.abs(t.quantity);
        if (mid === undefined) {
          neutralCount++;
          neutralQty += qty;
        } else if (t.price > mid) {
          buyCount++;
          buyQty += qty;
        } else if (t.price < mid) {
          sellCount++;
          sellQty += qty;
        } else {
          neutralCount++;
          neutralQty += qty;
        }
      }
    }
    return {
      buyCount,
      buyQty,
      sellCount,
      sellQty,
      neutralCount,
      neutralQty,
      avgBuy: buyCount === 0 ? null : buyQty / buyCount,
      avgSell: sellCount === 0 ? null : sellQty / sellCount,
    };
  })();

  const totalFills =
    sideStats.buyCount + sideStats.sellCount + sideStats.neutralCount;

  // Book-side stats: avg spread, avg/total volume on bid/ask side, zoom-scoped.
  const bookStats = (() => {
    let spreadSum = 0,
      spreadCount = 0;
    let bidVolSum = 0,
      bidVolCount = 0;
    let askVolSum = 0,
      askVolCount = 0;
    if (effectiveProduct) {
      for (const r of activities) {
        if (r.product !== effectiveProduct) continue;
        if (!inRange(r.timestamp)) continue;
        if (r.bidPrice1 !== null && r.askPrice1 !== null) {
          spreadSum += r.askPrice1 - r.bidPrice1;
          spreadCount++;
        }
        const bv =
          (r.bidVolume1 ?? 0) + (r.bidVolume2 ?? 0) + (r.bidVolume3 ?? 0);
        const av =
          (r.askVolume1 ?? 0) + (r.askVolume2 ?? 0) + (r.askVolume3 ?? 0);
        if (bv > 0) {
          bidVolSum += bv;
          bidVolCount++;
        }
        if (av > 0) {
          askVolSum += av;
          askVolCount++;
        }
      }
    }
    return {
      avgSpread: spreadCount === 0 ? null : spreadSum / spreadCount,
      avgBidVol: bidVolCount === 0 ? null : bidVolSum / bidVolCount,
      avgAskVol: askVolCount === 0 ? null : askVolSum / askVolCount,
      totalBidVol: bidVolSum,
      totalAskVol: askVolSum,
      snapshots: Math.max(bidVolCount, askVolCount),
    };
  })();

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

  if (activities.length === 0 && trades.length === 0) {
    return (
      <div className="text-[11px] text-neutral-500 leading-relaxed">
        Load a log to see order-depth and trade tables. Hover the price chart
        to pin the depth view to that timestamp, or zoom the chart to filter
        stats to a window.
      </div>
    );
  }

  const qtyActive = qtyMin > 0 || qtyMax !== null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-14 flex-none">
          Product
        </span>
        <select
          value={effectiveProduct ?? ""}
          onChange={(e) => setLocalProduct(e.target.value || null)}
          className="flex-1 min-w-0 border border-neutral-600 bg-[#1f2125] text-neutral-200 px-2 py-1 text-[11px] focus:border-neutral-300 focus:outline-none"
        >
          {productOptions.length === 0 ? (
            <option>-</option>
          ) : (
            productOptions.map((p) => (
              <option key={p} value={p} className="bg-[#1f2125]">
                {p}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="text-[10px] text-neutral-500 font-mono flex items-center justify-between gap-2">
        <span>
          {hoveredTime === null ? (
            <span className="text-neutral-600">hover chart to pin timestamp</span>
          ) : (
            <>
              hovering ts <span className="text-neutral-300">{hoveredTime}</span>
            </>
          )}
        </span>
        <span className="text-right">
          {zoomRange ? (
            <>
              <span className="text-amber-400">zoom</span>{" "}
              <span className="text-neutral-400">
                {Math.round(zoomRange.min).toLocaleString()} –{" "}
                {Math.round(zoomRange.max).toLocaleString()}
              </span>
            </>
          ) : (
            <span className="text-neutral-600">full range</span>
          )}
        </span>
      </div>

      {/* Trade + Book stats side by side */}
      <div className="bg-[#2a2d31] border border-neutral-700/60">
        <div className="flex items-center justify-between px-2 py-1 border-b border-neutral-700/60 bg-[#2e3137]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Market Stats
          </span>
          {(qtyActive || zoomRange) && (
            <span className="text-[9px] text-amber-400 font-mono">
              {[qtyActive && "filtered", zoomRange && "zoomed"]
                .filter(Boolean)
                .join(" + ")}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 divide-x divide-neutral-700/60">
          {/* Left: Trade fills */}
          <div className="px-2 py-2">
            <div className="text-[9px] uppercase tracking-wider text-neutral-500 mb-1.5">
              Fills
            </div>
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider">
                  <th className="text-left font-medium pb-1"></th>
                  <th
                    className="text-right font-medium pb-1 px-0.5"
                    style={{ color: "#4ade80" }}
                  >
                    Buy
                  </th>
                  <th
                    className="text-right font-medium pb-1 px-0.5"
                    style={{ color: "#f87171" }}
                  >
                    Sell
                  </th>
                </tr>
              </thead>
              <tbody className="text-neutral-200">
                <tr className="border-t border-neutral-700/40">
                  <td className="py-0.5 text-neutral-500 text-[10px]">Count</td>
                  <td className="py-0.5 text-right px-0.5">
                    {sideStats.buyCount.toLocaleString()}
                  </td>
                  <td className="py-0.5 text-right px-0.5">
                    {sideStats.sellCount.toLocaleString()}
                  </td>
                </tr>
                <tr className="border-t border-neutral-700/40">
                  <td className="py-0.5 text-neutral-500 text-[10px]">Vol</td>
                  <td className="py-0.5 text-right px-0.5">
                    {sideStats.buyQty.toLocaleString()}
                  </td>
                  <td className="py-0.5 text-right px-0.5">
                    {sideStats.sellQty.toLocaleString()}
                  </td>
                </tr>
                <tr className="border-t border-neutral-700/40">
                  <td className="py-0.5 text-neutral-500 text-[10px]">Avg</td>
                  <td className="py-0.5 text-right px-0.5">
                    {sideStats.avgBuy === null ? (
                      <span className="text-neutral-600">-</span>
                    ) : (
                      sideStats.avgBuy.toFixed(1)
                    )}
                  </td>
                  <td className="py-0.5 text-right px-0.5">
                    {sideStats.avgSell === null ? (
                      <span className="text-neutral-600">-</span>
                    ) : (
                      sideStats.avgSell.toFixed(1)
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="text-[9px] text-neutral-600 font-mono mt-1">
              {totalFills.toLocaleString()} total
            </div>
          </div>

          {/* Right: Book / order stats */}
          <div className="px-2 py-2">
            <div className="text-[9px] uppercase tracking-wider text-neutral-500 mb-1.5">
              Book
            </div>
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider">
                  <th className="text-left font-medium pb-1"></th>
                  <th
                    className="text-right font-medium pb-1 px-0.5"
                    style={{ color: "#60a5fa" }}
                  >
                    Bid
                  </th>
                  <th
                    className="text-right font-medium pb-1 px-0.5"
                    style={{ color: "#f87171" }}
                  >
                    Ask
                  </th>
                </tr>
              </thead>
              <tbody className="text-neutral-200">
                <tr className="border-t border-neutral-700/40">
                  <td className="py-0.5 text-neutral-500 text-[10px]">
                    Avg vol
                  </td>
                  <td className="py-0.5 text-right px-0.5">
                    {bookStats.avgBidVol === null ? (
                      <span className="text-neutral-600">-</span>
                    ) : (
                      bookStats.avgBidVol.toFixed(1)
                    )}
                  </td>
                  <td className="py-0.5 text-right px-0.5">
                    {bookStats.avgAskVol === null ? (
                      <span className="text-neutral-600">-</span>
                    ) : (
                      bookStats.avgAskVol.toFixed(1)
                    )}
                  </td>
                </tr>
                <tr className="border-t border-neutral-700/40">
                  <td className="py-0.5 text-neutral-500 text-[10px]">
                    Tot vol
                  </td>
                  <td className="py-0.5 text-right px-0.5">
                    {bookStats.totalBidVol.toLocaleString()}
                  </td>
                  <td className="py-0.5 text-right px-0.5">
                    {bookStats.totalAskVol.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="flex items-baseline justify-between mt-1.5 pt-1 border-t border-neutral-700/40">
              <span className="text-[10px] text-neutral-500">Avg spread</span>
              <span className="text-[11px] text-neutral-200 font-mono">
                {bookStats.avgSpread === null ? (
                  <span className="text-neutral-600">-</span>
                ) : (
                  bookStats.avgSpread.toFixed(2)
                )}
              </span>
            </div>
            <div className="text-[9px] text-neutral-600 font-mono mt-1">
              {bookStats.snapshots.toLocaleString()} snapshots
            </div>
          </div>
        </div>
      </div>

      {/* Microstructure Analytics — collapsible */}
      <div className="bg-[#2a2d31] border border-neutral-700/60">
        <button
          onClick={() => setMicroOpen((v) => !v)}
          className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-[#2e3137] transition-colors"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Microstructure Analytics
          </span>
          <span className="text-neutral-500 text-[10px]">
            {microOpen ? "▾" : "▸"}
          </span>
        </button>
        {microOpen && (
          <div className="px-2 pb-2">
            <MicrostructureSection
              trades={trades}
              activities={activities}
              product={effectiveProduct}
              zoomRange={zoomRange}
              midByTs={midByTs}
            />
          </div>
        )}
      </div>

      {/* Trade history — collapsible, shows all trades in zoom window */}
      <div className="bg-[#2a2d31] border border-neutral-700/60">
        <button
          onClick={() => setTradeHistoryOpen((v) => !v)}
          className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-[#2e3137] transition-colors"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Trade History
          </span>
          <span className="text-neutral-500 text-[10px]">
            {tradeHistoryOpen ? "▾" : "▸"}
          </span>
        </button>
        {tradeHistoryOpen && (
          <div className="px-2 pb-2">
            <ZoomTradeTable
              trades={trades}
              activities={activities}
              product={effectiveProduct}
              zoomRange={zoomRange}
            />
          </div>
        )}
      </div>

      {/* Quantity filter — collapsible */}
      <div className="bg-[#2a2d31] border border-neutral-700/60">
        <button
          onClick={() => setQtyFilterOpen((v) => !v)}
          className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-[#2e3137] transition-colors"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
            Quantity Filter
            {qtyActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </span>
          <span className="text-neutral-500 text-[10px]">
            {qtyFilterOpen ? "▾" : "▸"}
          </span>
        </button>
        {qtyFilterOpen && (
          <div className="px-2 pb-2">
            <div className="flex items-center justify-between mb-1.5">
              {qtyActive && (
                <button
                  onClick={() => {
                    onQtyMinChange(0);
                    onQtyMaxChange(null);
                  }}
                  className="text-[9px] text-neutral-500 hover:text-neutral-200 underline"
                >
                  reset
                </button>
              )}
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
        )}
      </div>

      {/* Order Depth — collapsible */}
      <div className="bg-[#2a2d31] border border-neutral-700/60">
        <button
          onClick={() => setOrderDepthOpen((v) => !v)}
          className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-[#2e3137] transition-colors"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Order Depth
          </span>
          <span className="text-neutral-500 text-[10px]">
            {orderDepthOpen ? "▾" : "▸"}
          </span>
        </button>
        {orderDepthOpen && (
          <div className="px-2 pb-2">
            <OrderDepthTable
              activities={activities}
              timestamp={hoveredTime}
              product={effectiveProduct}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MicrostructureSection({
  trades,
  activities,
  product,
  zoomRange,
  midByTs,
}: {
  trades: Trade[];
  activities: ActivityRow[];
  product: string | null;
  zoomRange: { min: number; max: number } | null;
  midByTs: Map<number, number>;
}) {
  const [nearMissOpen, setNearMissOpen] = useState(false);
  const [sizeDistOpen, setSizeDistOpen] = useState(false);

  if (!product) {
    return (
      <div className="text-[11px] text-neutral-500">Select a product.</div>
    );
  }

  const inRange = (ts: number) =>
    !zoomRange || (ts >= zoomRange.min && ts <= zoomRange.max);

  const productTrades: Trade[] = [];
  for (const t of trades) {
    if (t.symbol !== product) continue;
    if (!inRange(t.timestamp)) continue;
    productTrades.push(t);
  }

  const productRows: ActivityRow[] = [];
  for (const r of activities) {
    if (r.product !== product) continue;
    if (!inRange(r.timestamp)) continue;
    productRows.push(r);
  }

  // Time between fills
  const interArrivals: number[] = [];
  for (let i = 1; i < productTrades.length; i++) {
    interArrivals.push(
      productTrades[i].timestamp - productTrades[i - 1].timestamp
    );
  }
  const avgInterArrival =
    interArrivals.length === 0
      ? null
      : interArrivals.reduce((a, b) => a + b, 0) / interArrivals.length;
  const medianInterArrival = (() => {
    if (interArrivals.length === 0) return null;
    const sorted = [...interArrivals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  })();
  const timestepSize =
    productRows.length >= 2
      ? productRows[1].timestamp - productRows[0].timestamp
      : 100;
  const fillsPerTick =
    productRows.length === 0 ? null : productTrades.length / productRows.length;
  const ticksPerFill =
    fillsPerTick && fillsPerTick > 0 ? 1 / fillsPerTick : null;

  // MM edge analysis: spread captured vs drift missed
  const spreadByTs = new Map<number, number>();
  for (const r of productRows) {
    if (r.bidPrice1 !== null && r.askPrice1 !== null) {
      spreadByTs.set(r.timestamp, r.askPrice1 - r.bidPrice1);
    }
  }
  let spreadAtFillSum = 0,
    spreadAtFillCount = 0;
  for (const t of productTrades) {
    const s = spreadByTs.get(t.timestamp);
    if (s !== undefined) {
      spreadAtFillSum += s;
      spreadAtFillCount++;
    }
  }
  const avgSpreadPerFill =
    spreadAtFillCount === 0 ? null : spreadAtFillSum / spreadAtFillCount;

  let driftSum = 0,
    driftCount = 0;
  for (let i = 1; i < productRows.length; i++) {
    const m0 = midByTs.get(productRows[i - 1].timestamp);
    const m1 = midByTs.get(productRows[i].timestamp);
    if (m0 !== undefined && m1 !== undefined) {
      driftSum += Math.abs(m1 - m0);
      driftCount++;
    }
  }
  const driftPerTick = driftCount === 0 ? null : driftSum / driftCount;
  const driftMissed =
    driftPerTick !== null && ticksPerFill !== null
      ? driftPerTick * ticksPerFill
      : null;
  const mmEdge =
    avgSpreadPerFill !== null && driftMissed !== null
      ? avgSpreadPerFill - driftMissed
      : null;

  // Return autocorrelation (lag-1)
  const midSeries: number[] = [];
  for (const r of productRows) {
    const m = midByTs.get(r.timestamp);
    if (m !== undefined) midSeries.push(m);
  }
  const returns: number[] = [];
  for (let i = 1; i < midSeries.length; i++) {
    returns.push(midSeries[i] - midSeries[i - 1]);
  }
  const autocorr = (() => {
    if (returns.length < 3) return null;
    const mu = returns.reduce((a, b) => a + b, 0) / returns.length;
    let num = 0,
      den = 0;
    for (let i = 0; i < returns.length; i++) {
      den += (returns[i] - mu) ** 2;
    }
    for (let i = 1; i < returns.length; i++) {
      num += (returns[i] - mu) * (returns[i - 1] - mu);
    }
    return den === 0 ? 0 : num / den;
  })();
  const autocorrLabel =
    autocorr === null
      ? "-"
      : autocorr > 0.05
      ? "momentum"
      : autocorr < -0.05
      ? "mean-reverting"
      : "neutral";
  const autocorrColor =
    autocorr === null
      ? "#737373"
      : autocorr > 0.05
      ? "#60a5fa"
      : autocorr < -0.05
      ? "#f59e0b"
      : "#737373";

  // Trade size distribution
  const sizeCounts = new Map<number, number>();
  for (const t of productTrades) {
    const s = Math.abs(t.quantity);
    sizeCounts.set(s, (sizeCounts.get(s) ?? 0) + 1);
  }
  const sizeEntries = Array.from(sizeCounts.entries()).sort(
    (a, b) => a[0] - b[0]
  );
  const maxSizeCount = Math.max(1, ...sizeEntries.map(([, c]) => c));

  // Near-miss events
  const tradeTimestamps = new Set<number>();
  for (const t of productTrades) tradeTimestamps.add(t.timestamp);

  type NearMiss = {
    ts: number;
    ask: number;
    prevMid: number;
    gap: number;
    bid: number | null;
    spread: number | null;
  };
  const nearMisses: NearMiss[] = [];
  let prevMid: number | null = null;
  for (const r of productRows) {
    const mid = midByTs.get(r.timestamp) ?? null;
    if (
      r.askPrice1 !== null &&
      prevMid !== null &&
      !tradeTimestamps.has(r.timestamp)
    ) {
      const gap = r.askPrice1 - prevMid;
      if (avgSpreadPerFill !== null && gap < avgSpreadPerFill * 0.5) {
        nearMisses.push({
          ts: r.timestamp,
          ask: r.askPrice1,
          prevMid,
          gap,
          bid: r.bidPrice1,
          spread: r.bidPrice1 !== null ? r.askPrice1 - r.bidPrice1 : null,
        });
      }
    }
    if (mid !== null) prevMid = mid;
  }

  const fmt = (v: number | null, d = 2) =>
    v === null ? <span className="text-neutral-600">-</span> : v.toFixed(d);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Time between fills */}
      <div>
        <div className="text-[9px] uppercase tracking-wider text-neutral-500 mb-1">
          Time between fills
        </div>
        <table className="w-full text-[11px] font-mono">
          <tbody className="text-neutral-200">
            <tr className="border-t border-neutral-700/40">
              <td className="py-0.5 text-neutral-500 text-[10px]">
                Avg inter-arrival
              </td>
              <td className="py-0.5 text-right">
                {fmt(avgInterArrival, 0)}{" "}
                <span className="text-neutral-600 text-[9px]">ts</span>
              </td>
            </tr>
            <tr className="border-t border-neutral-700/40">
              <td className="py-0.5 text-neutral-500 text-[10px]">
                Median inter-arrival
              </td>
              <td className="py-0.5 text-right">
                {fmt(medianInterArrival, 0)}{" "}
                <span className="text-neutral-600 text-[9px]">ts</span>
              </td>
            </tr>
            <tr className="border-t border-neutral-700/40">
              <td className="py-0.5 text-neutral-500 text-[10px]">
                Fills per tick
              </td>
              <td className="py-0.5 text-right">{fmt(fillsPerTick, 3)}</td>
            </tr>
            <tr className="border-t border-neutral-700/40">
              <td className="py-0.5 text-neutral-500 text-[10px]">
                Ticks per fill
              </td>
              <td className="py-0.5 text-right">{fmt(ticksPerFill, 1)}</td>
            </tr>
          </tbody>
        </table>
        <div className="text-[9px] text-neutral-600 mt-1">
          {productTrades.length.toLocaleString()} fills across{" "}
          {productRows.length.toLocaleString()} ticks (step {timestepSize})
        </div>
      </div>

      {/* MM edge analysis */}
      <div>
        <div className="text-[9px] uppercase tracking-wider text-neutral-500 mb-1">
          MM edge analysis
        </div>
        <table className="w-full text-[11px] font-mono">
          <tbody className="text-neutral-200">
            <tr className="border-t border-neutral-700/40">
              <td className="py-0.5 text-neutral-500 text-[10px]">
                Avg spread at fill
              </td>
              <td className="py-0.5 text-right">{fmt(avgSpreadPerFill)}</td>
            </tr>
            <tr className="border-t border-neutral-700/40">
              <td className="py-0.5 text-neutral-500 text-[10px]">
                Drift per tick
              </td>
              <td className="py-0.5 text-right">{fmt(driftPerTick, 3)}</td>
            </tr>
            <tr className="border-t border-neutral-700/40">
              <td className="py-0.5 text-neutral-500 text-[10px]">
                Drift missed (per fill)
              </td>
              <td className="py-0.5 text-right">{fmt(driftMissed)}</td>
            </tr>
            <tr className="border-t border-neutral-700/40">
              <td className="py-0.5 text-neutral-500 text-[10px] font-semibold">
                MM edge
              </td>
              <td
                className="py-0.5 text-right font-semibold"
                style={{
                  color:
                    mmEdge === null
                      ? "#737373"
                      : mmEdge > 0
                      ? "#4ade80"
                      : "#f87171",
                }}
              >
                {mmEdge === null ? (
                  <span className="text-neutral-600">-</span>
                ) : (
                  (mmEdge > 0 ? "+" : "") + mmEdge.toFixed(2)
                )}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="text-[9px] text-neutral-600 mt-1 leading-snug">
          {mmEdge !== null && mmEdge > 0
            ? "Spread > drift missed → market-making adds value on top of directional."
            : mmEdge !== null && mmEdge <= 0
            ? "Drift missed ≥ spread → pure directional may outperform market-making."
            : ""}
        </div>
      </div>

      {/* Autocorrelation */}
      <div>
        <div className="text-[9px] uppercase tracking-wider text-neutral-500 mb-1">
          Return autocorrelation (lag-1)
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="text-[11px] font-mono"
            style={{ color: autocorrColor }}
          >
            {autocorr === null ? "-" : autocorr.toFixed(4)}
          </span>
          <span
            className="text-[10px] font-mono"
            style={{ color: autocorrColor }}
          >
            {autocorrLabel}
          </span>
        </div>
        <div className="text-[9px] text-neutral-600 mt-1 leading-snug">
          {autocorrLabel === "mean-reverting"
            ? "Negative → dips tend to reverse. Favor buying dips, selling rips."
            : autocorrLabel === "momentum"
            ? "Positive → trends tend to continue. Favor trend-following."
            : "Near zero → no predictable pattern in consecutive returns."}
        </div>
      </div>

      {/* Trade size distribution — collapsible */}
      <div className="border-t border-neutral-700/40 pt-2">
        <button
          onClick={() => setSizeDistOpen((v) => !v)}
          className="w-full flex items-center justify-between hover:text-neutral-200 transition-colors"
        >
          <span className="text-[9px] uppercase tracking-wider text-neutral-500">
            Trade size distribution ({sizeEntries.length} sizes)
          </span>
          <span className="text-neutral-500 text-[10px]">
            {sizeDistOpen ? "▾" : "▸"}
          </span>
        </button>
        {sizeDistOpen && (
          <div className="mt-1.5 flex flex-col gap-0.5">
            {sizeEntries.map(([size, count]) => (
              <div
                key={size}
                className="flex items-center gap-2 text-[10px] font-mono"
              >
                <span className="w-8 text-right text-neutral-400">{size}</span>
                <div className="flex-1 h-3 bg-neutral-800 relative">
                  <div
                    className="h-full bg-purple-500/60"
                    style={{ width: `${(count / maxSizeCount) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right text-neutral-500">
                  {count}
                </span>
              </div>
            ))}
            <div className="text-[9px] text-neutral-600 mt-1 leading-snug">
              Look for a single size that dominates at specific price levels —
              could indicate an informed trader with a fixed lot size.
            </div>
          </div>
        )}
      </div>

      {/* Near-miss events — collapsible */}
      <div className="border-t border-neutral-700/40 pt-2">
        <button
          onClick={() => setNearMissOpen((v) => !v)}
          className="w-full flex items-center justify-between hover:text-neutral-200 transition-colors"
        >
          <span className="text-[9px] uppercase tracking-wider text-neutral-500">
            Near misses ({nearMisses.length})
          </span>
          <span className="text-neutral-500 text-[10px]">
            {nearMissOpen ? "▾" : "▸"}
          </span>
        </button>
        {nearMissOpen && (
          <div className="mt-1.5">
            {nearMisses.length === 0 ? (
              <div className="text-[11px] text-neutral-500">
                No near misses found (ask never came within half-spread of prev
                mid without a fill).
              </div>
            ) : (
              <>
                <div className="overflow-x-auto border border-neutral-700 max-h-[250px] overflow-y-auto">
                  <table className="w-full border-collapse text-[10px] font-mono whitespace-nowrap">
                    <thead className="sticky top-0 bg-[#2e3137] z-10">
                      <tr className="text-[9px] uppercase tracking-wider text-neutral-500">
                        <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700">
                          ts
                        </th>
                        <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700">
                          Ask
                        </th>
                        <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700">
                          Prev Mid
                        </th>
                        <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700">
                          Gap
                        </th>
                        <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700">
                          Bid
                        </th>
                        <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700">
                          Spread
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {nearMisses.slice(0, 100).map((nm, i) => (
                        <tr
                          key={i}
                          className="text-neutral-200 border-t border-neutral-700/40"
                        >
                          <td className="px-1.5 py-0.5 text-right text-neutral-600">
                            {nm.ts}
                          </td>
                          <td
                            className="px-1.5 py-0.5 text-right"
                            style={{ color: "#f87171" }}
                          >
                            {nm.ask}
                          </td>
                          <td className="px-1.5 py-0.5 text-right text-neutral-400">
                            {nm.prevMid.toFixed(1)}
                          </td>
                          <td
                            className="px-1.5 py-0.5 text-right"
                            style={{
                              color: nm.gap < 0 ? "#f87171" : "#f59e0b",
                            }}
                          >
                            {nm.gap.toFixed(1)}
                          </td>
                          <td className="px-1.5 py-0.5 text-right text-neutral-400">
                            {nm.bid === null ? "-" : nm.bid}
                          </td>
                          <td className="px-1.5 py-0.5 text-right text-neutral-400">
                            {nm.spread === null ? "-" : nm.spread.toFixed(0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {nearMisses.length > 100 && (
                  <div className="text-[9px] text-neutral-600 mt-1">
                    Showing first 100 of {nearMisses.length} near misses.
                  </div>
                )}
                <div className="text-[9px] text-neutral-600 mt-1 leading-snug">
                  Moments where the ask came within half the avg spread of the
                  previous mid but no fill occurred. Negative gap = ask crossed
                  below prev mid. Study what was different at these timestamps
                  to find the taker bot&apos;s boundary.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ZoomTradeTable({
  trades,
  activities,
  product,
  zoomRange,
}: {
  trades: Trade[];
  activities: ActivityRow[];
  product: string | null;
  zoomRange: { min: number; max: number } | null;
}) {
  if (!product) {
    return (
      <div className="text-[11px] text-neutral-500">Select a product.</div>
    );
  }

  type FullSnap = {
    bid1: number | null;
    bid2: number | null;
    bid3: number | null;
    ask1: number | null;
    ask2: number | null;
    ask3: number | null;
    bidVol1: number | null;
    bidVol2: number | null;
    bidVol3: number | null;
    askVol1: number | null;
    askVol2: number | null;
    askVol3: number | null;
    mid: number | null;
  };

  const snapByTs = new Map<number, FullSnap>();
  const sortedTs: number[] = [];
  for (const r of activities) {
    if (r.product !== product) continue;
    snapByTs.set(r.timestamp, {
      bid1: r.bidPrice1,
      bid2: r.bidPrice2,
      bid3: r.bidPrice3,
      ask1: r.askPrice1,
      ask2: r.askPrice2,
      ask3: r.askPrice3,
      bidVol1: r.bidVolume1,
      bidVol2: r.bidVolume2,
      bidVol3: r.bidVolume3,
      askVol1: r.askVolume1,
      askVol2: r.askVolume2,
      askVol3: r.askVolume3,
      mid:
        r.bidPrice1 !== null && r.askPrice1 !== null ? r.midPrice : null,
    });
    sortedTs.push(r.timestamp);
  }
  sortedTs.sort((a, b) => a - b);

  const prevMidAt = (ts: number): number | null => {
    let lo = 0,
      hi = sortedTs.length - 1,
      ans = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (sortedTs[m] < ts) {
        ans = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    if (ans < 0) return null;
    return snapByTs.get(sortedTs[ans])?.mid ?? null;
  };

  const wallMidAt = (snap: FullSnap): number | null => {
    const bidLevels: [number | null, number | null][] = [
      [snap.bid1, snap.bidVol1],
      [snap.bid2, snap.bidVol2],
      [snap.bid3, snap.bidVol3],
    ];
    const askLevels: [number | null, number | null][] = [
      [snap.ask1, snap.askVol1],
      [snap.ask2, snap.askVol2],
      [snap.ask3, snap.askVol3],
    ];
    let wallBid: number | null = null,
      wallBidVol = -1;
    for (const [p, v] of bidLevels) {
      if (p !== null && v !== null && v > wallBidVol) {
        wallBid = p;
        wallBidVol = v;
      }
    }
    let wallAsk: number | null = null,
      wallAskVol = -1;
    for (const [p, v] of askLevels) {
      if (p !== null && v !== null && v > wallAskVol) {
        wallAsk = p;
        wallAskVol = v;
      }
    }
    if (wallBid === null || wallAsk === null) return null;
    return (wallBid + wallAsk) / 2;
  };

  const filtered: Trade[] = [];
  for (const t of trades) {
    if (t.symbol !== product) continue;
    if (
      zoomRange &&
      (t.timestamp < zoomRange.min || t.timestamp > zoomRange.max)
    )
      continue;
    filtered.push(t);
  }

  type Row = {
    price: number;
    size: number;
    side: "buy" | "sell" | "neutral";
    bestBid: number | null;
    bestAsk: number | null;
    prevMid: number | null;
    wallMid: number | null;
    ts: number;
  };

  const rows: Row[] = [];
  for (const t of filtered) {
    const snap = snapByTs.get(t.timestamp);
    const mid = snap?.mid ?? null;
    const side: Row["side"] =
      mid !== null
        ? t.price > mid
          ? "buy"
          : t.price < mid
          ? "sell"
          : "neutral"
        : "neutral";
    rows.push({
      price: t.price,
      size: Math.abs(t.quantity),
      side,
      bestBid: snap?.bid1 ?? null,
      bestAsk: snap?.ask1 ?? null,
      prevMid: prevMidAt(t.timestamp),
      wallMid: snap ? wallMidAt(snap) : null,
      ts: t.timestamp,
    });
  }

  const cell = (v: number | null) =>
    v === null ? <span className="text-neutral-600">-</span> : v;
  const cellFmt = (v: number | null, decimals = 1) =>
    v === null ? (
      <span className="text-neutral-600">-</span>
    ) : (
      v.toFixed(decimals)
    );

  if (rows.length === 0) {
    return (
      <div className="text-[11px] text-neutral-500">
        {zoomRange
          ? "No trades in zoomed range."
          : "No trades loaded. Zoom in to filter."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[9px] text-neutral-600 font-mono">
        {rows.length.toLocaleString()} trades
        {zoomRange ? (
          <span className="text-amber-400 ml-1">in zoom</span>
        ) : (
          <span className="ml-1">(zoom chart to filter)</span>
        )}
      </div>
      <div className="overflow-x-auto border border-neutral-700 max-h-[400px] overflow-y-auto">
        <table className="w-full border-collapse text-[10px] font-mono whitespace-nowrap">
          <thead className="sticky top-0 bg-[#2e3137] z-10">
            <tr className="text-[9px] uppercase tracking-wider text-neutral-500">
              <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700">
                Price
              </th>
              <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700">
                Size
              </th>
              <th className="text-center font-medium px-1.5 py-1 border-b border-neutral-700">
                Side
              </th>
              <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700">
                Bid
              </th>
              <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700">
                Ask
              </th>
              <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700">
                Prev Mid
              </th>
              <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700">
                Wall Mid
              </th>
              <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700">
                ts
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const bg =
                r.side === "buy"
                  ? BID_TINT
                  : r.side === "sell"
                  ? ASK_TINT
                  : undefined;
              const sideLabel =
                r.side === "buy" ? "▲" : r.side === "sell" ? "▼" : "—";
              const sideColor =
                r.side === "buy"
                  ? "#4ade80"
                  : r.side === "sell"
                  ? "#f87171"
                  : "#737373";
              return (
                <tr
                  key={i}
                  className="text-neutral-200 border-t border-neutral-700/40"
                  style={bg ? { backgroundColor: bg } : undefined}
                >
                  <td className="px-1.5 py-0.5 text-right">{r.price}</td>
                  <td className="px-1.5 py-0.5 text-right">{r.size}</td>
                  <td
                    className="px-1.5 py-0.5 text-center"
                    style={{ color: sideColor }}
                  >
                    {sideLabel}
                  </td>
                  <td className="px-1.5 py-0.5 text-right text-neutral-400">
                    {cell(r.bestBid)}
                  </td>
                  <td className="px-1.5 py-0.5 text-right text-neutral-400">
                    {cell(r.bestAsk)}
                  </td>
                  <td className="px-1.5 py-0.5 text-right text-neutral-400">
                    {cellFmt(r.prevMid)}
                  </td>
                  <td className="px-1.5 py-0.5 text-right text-neutral-400">
                    {cellFmt(r.wallMid)}
                  </td>
                  <td className="px-1.5 py-0.5 text-right text-neutral-600">
                    {r.ts}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatsSection({
  stats,
  skippedPnlTicks,
}: {
  stats: PnlStats;
  skippedPnlTicks: number;
}) {
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
        {skippedPnlTicks > 0 && (
          <div className="border-t border-neutral-700 pt-2 text-neutral-500 text-[10px] leading-snug">
            <span className="text-amber-300">
              {skippedPnlTicks} bad tick{skippedPnlTicks === 1 ? "" : "s"} skipped
            </span>
            <div className="text-neutral-600 text-[9px] mt-1">
              Backtester reported mid=0 on these ticks, producing phantom PnL
              spikes. Excluded from chart and stats.
            </div>
          </div>
        )}
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

function PanelToggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`border px-1.5 py-0.5 text-[10px] transition-colors ${
        on
          ? "border-neutral-300 bg-neutral-700 text-neutral-100"
          : "border-neutral-600 bg-[#1f2125] text-neutral-500 hover:text-neutral-200"
      }`}
    >
      {label}
    </button>
  );
}
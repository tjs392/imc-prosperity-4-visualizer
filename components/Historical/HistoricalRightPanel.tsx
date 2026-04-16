"use client";

import { useEffect, useState } from "react";
import type { FeatureSet, ProductFeatures, SimMode } from "@/lib/simulation/extractFeatures";
import type { ActivityRow, Trade } from "@/lib/types";
import { OrderDepthTable, TradeTable } from "@/components/Logs/tables";

type LoadedInfo = { day: number; rows: number; trades: number };

const FALLBACK_SMOOTHING = 0.05;

type Overrides = {
  slopeMultiplier: number;
  noiseMultiplier: number;
  levelShift: number;
  applyAfterTimestamp: number | null;
};

const DEFAULT_OVERRIDES: Overrides = {
  slopeMultiplier: 1,
  noiseMultiplier: 1,
  levelShift: 0,
  applyAfterTimestamp: null,
};

type Props = {
  round: number | null;
  onClose: () => void;
  onGenerated?: (day: number) => void;
  activities?: ActivityRow[];
  trades?: Trade[];
  allTrades?: Trade[];
  hoveredTime?: number | null;
  selectedProduct?: string | null;
  qtyMin?: number;
  qtyMax?: number | null;
  maxTradeQty?: number;
  onQtyMinChange?: (n: number) => void;
  onQtyMaxChange?: (n: number | null) => void;
  zoomRange?: { min: number; max: number } | null;
};

export default function HistoricalRightPanel({
  round,
  onClose,
  onGenerated,
  activities = [],
  trades = [],
  allTrades = [],
  hoveredTime = null,
  selectedProduct = null,
  qtyMin = 0,
  qtyMax = null,
  maxTradeQty = 0,
  onQtyMinChange,
  onQtyMaxChange,
  zoomRange = null,
}: Props) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    tables: true,
    buckets: false,
    features: false,
    generator: false,
  });

  const toggle = (id: string) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="flex flex-col bg-[#22252a] border border-neutral-700 text-neutral-200">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700 bg-[#1d1f23]">
        <div className="text-[12px] font-semibold text-neutral-100 uppercase tracking-wider">
          Tools {round !== null && <span className="text-neutral-500 normal-case font-normal">· round {round}</span>}
        </div>
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-100 text-base leading-none px-1"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      <div>
        <PanelSection
          id="tables"
          title="Tables"
          open={openSections.tables}
          onToggle={() => toggle("tables")}
        >
          <TablesSection
            activities={activities}
            trades={trades}
            allTrades={allTrades}
            hoveredTime={hoveredTime}
            selectedProduct={selectedProduct}
            qtyMin={qtyMin}
            qtyMax={qtyMax}
            maxTradeQty={maxTradeQty}
            onQtyMinChange={onQtyMinChange}
            onQtyMaxChange={onQtyMaxChange}
            zoomRange={zoomRange}
          />
        </PanelSection>
        <PanelSection
          id="buckets"
          title="Price Bucket Analysis"
          open={openSections.buckets}
          onToggle={() => toggle("buckets")}
        >
          <PriceBucketSection
            activities={activities}
            trades={trades}
            selectedProduct={selectedProduct}
            zoomRange={zoomRange}
          />
        </PanelSection>
        <PanelSection
          id="features"
          title="Feature Extraction"
          open={openSections.features}
          onToggle={() => toggle("features")}
        >
          <FeatureExtractionSection round={round} />
        </PanelSection>
        <PanelSection
          id="generator"
          title="Simulation Generator"
          open={openSections.generator}
          onToggle={() => toggle("generator")}
        >
          <GeneratorSection round={round} onGenerated={onGenerated} />
        </PanelSection>
      </div>
    </div>
  );
}

function TablesSection({
  activities,
  trades,
  allTrades,
  hoveredTime,
  selectedProduct,
  qtyMin,
  qtyMax,
  maxTradeQty,
  onQtyMinChange,
  onQtyMaxChange,
  zoomRange,
}: {
  activities: ActivityRow[];
  trades: Trade[];
  allTrades: Trade[];
  hoveredTime: number | null;
  selectedProduct: string | null;
  qtyMin: number;
  qtyMax: number | null;
  maxTradeQty: number;
  onQtyMinChange?: (n: number) => void;
  onQtyMaxChange?: (n: number | null) => void;
  zoomRange: { min: number; max: number } | null;
}) {
  const productOptions = Array.from(
    new Set(activities.map((r) => r.product))
  ).sort();
  const [localProduct, setLocalProduct] = useState<string | null>(null);
  const [tradeWindow, setTradeWindow] = useState<number>(30);
  const [tradeHistoryOpen, setTradeHistoryOpen] = useState(false);
  const [qtyFilterOpen, setQtyFilterOpen] = useState(false);
  const [orderDepthOpen, setOrderDepthOpen] = useState(false);
  const effectiveProduct = localProduct ?? selectedProduct ?? productOptions[0] ?? null;
  const filterProducts = effectiveProduct ? [effectiveProduct] : null;

  // Build mid lookup for the current product, skipping one-sided books so
  // buy/sell classification isn't polluted by the bogus synthesized mids.
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
    let buyCount = 0, buyQty = 0;
    let sellCount = 0, sellQty = 0;
    let neutralCount = 0, neutralQty = 0;
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
      buyCount, buyQty,
      sellCount, sellQty,
      neutralCount, neutralQty,
      avgBuy: buyCount === 0 ? null : buyQty / buyCount,
      avgSell: sellCount === 0 ? null : sellQty / sellCount,
    };
  })();

  const totalFills = sideStats.buyCount + sideStats.sellCount + sideStats.neutralCount;

  // Book-side stats: avg spread, avg/total volume on bid/ask side, zoom-scoped.
  const bookStats = (() => {
    let spreadSum = 0, spreadCount = 0;
    let bidVolSum = 0, bidVolCount = 0;
    let askVolSum = 0, askVolCount = 0;
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
        if (bv > 0) { bidVolSum += bv; bidVolCount++; }
        if (av > 0) { askVolSum += av; askVolCount++; }
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
    if (!onQtyMinChange) return;
    const clamped = Math.max(0, Math.min(v, effectiveMax));
    if (qtyMax !== null && clamped > qtyMax) {
      onQtyMinChange(qtyMax);
    } else {
      onQtyMinChange(clamped);
    }
  };

  const handleSliderMax = (v: number) => {
    if (!onQtyMaxChange) return;
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
        Load a day to see order-depth and trade tables here. Hover the price
        chart to pin the depth view to that timestamp.
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
            <>hovering ts <span className="text-neutral-300">{hoveredTime}</span></>
          )}
        </span>
        <span className="text-right">
          {zoomRange ? (
            <>
              <span className="text-amber-400">zoom</span>{" "}
              <span className="text-neutral-400">{Math.round(zoomRange.min).toLocaleString()} – {Math.round(zoomRange.max).toLocaleString()}</span>
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
              {[qtyActive && "filtered", zoomRange && "zoomed"].filter(Boolean).join(" + ")}
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
                  <th className="text-right font-medium pb-1 px-0.5" style={{ color: "#4ade80" }}>Buy</th>
                  <th className="text-right font-medium pb-1 px-0.5" style={{ color: "#f87171" }}>Sell</th>
                </tr>
              </thead>
              <tbody className="text-neutral-200">
                <tr className="border-t border-neutral-700/40">
                  <td className="py-0.5 text-neutral-500 text-[10px]">Count</td>
                  <td className="py-0.5 text-right px-0.5">{sideStats.buyCount.toLocaleString()}</td>
                  <td className="py-0.5 text-right px-0.5">{sideStats.sellCount.toLocaleString()}</td>
                </tr>
                <tr className="border-t border-neutral-700/40">
                  <td className="py-0.5 text-neutral-500 text-[10px]">Vol</td>
                  <td className="py-0.5 text-right px-0.5">{sideStats.buyQty.toLocaleString()}</td>
                  <td className="py-0.5 text-right px-0.5">{sideStats.sellQty.toLocaleString()}</td>
                </tr>
                <tr className="border-t border-neutral-700/40">
                  <td className="py-0.5 text-neutral-500 text-[10px]">Avg</td>
                  <td className="py-0.5 text-right px-0.5">
                    {sideStats.avgBuy === null ? <span className="text-neutral-600">-</span> : sideStats.avgBuy.toFixed(1)}
                  </td>
                  <td className="py-0.5 text-right px-0.5">
                    {sideStats.avgSell === null ? <span className="text-neutral-600">-</span> : sideStats.avgSell.toFixed(1)}
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
                  <th className="text-right font-medium pb-1 px-0.5" style={{ color: "#60a5fa" }}>Bid</th>
                  <th className="text-right font-medium pb-1 px-0.5" style={{ color: "#f87171" }}>Ask</th>
                </tr>
              </thead>
              <tbody className="text-neutral-200">
                <tr className="border-t border-neutral-700/40">
                  <td className="py-0.5 text-neutral-500 text-[10px]">Avg vol</td>
                  <td className="py-0.5 text-right px-0.5">
                    {bookStats.avgBidVol === null ? <span className="text-neutral-600">-</span> : bookStats.avgBidVol.toFixed(1)}
                  </td>
                  <td className="py-0.5 text-right px-0.5">
                    {bookStats.avgAskVol === null ? <span className="text-neutral-600">-</span> : bookStats.avgAskVol.toFixed(1)}
                  </td>
                </tr>
                <tr className="border-t border-neutral-700/40">
                  <td className="py-0.5 text-neutral-500 text-[10px]">Tot vol</td>
                  <td className="py-0.5 text-right px-0.5">{bookStats.totalBidVol.toLocaleString()}</td>
                  <td className="py-0.5 text-right px-0.5">{bookStats.totalAskVol.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            <div className="flex items-baseline justify-between mt-1.5 pt-1 border-t border-neutral-700/40">
              <span className="text-[10px] text-neutral-500">Avg spread</span>
              <span className="text-[11px] text-neutral-200 font-mono">
                {bookStats.avgSpread === null ? <span className="text-neutral-600">-</span> : bookStats.avgSpread.toFixed(2)}
              </span>
            </div>
            <div className="text-[9px] text-neutral-600 font-mono mt-1">
              {bookStats.snapshots.toLocaleString()} snapshots
            </div>
          </div>
        </div>
      </div>

      {/* Trade history — collapsible */}
      <div className="bg-[#2a2d31] border border-neutral-700/60">
        <button
          onClick={() => setTradeHistoryOpen((v) => !v)}
          className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-[#2e3137] transition-colors"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Trade History
          </span>
          <span className="text-neutral-500 text-[10px]">{tradeHistoryOpen ? "▾" : "▸"}</span>
        </button>
        {tradeHistoryOpen && (
          <div className="px-2 pb-2 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-neutral-500">
                Window
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={tradeWindow}
                  min={1}
                  max={500}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setTradeWindow(Math.max(1, Math.min(500, Math.floor(v))));
                  }}
                  className="w-16 border border-neutral-600 bg-[#1f2125] text-neutral-200 px-1.5 py-0.5 text-[11px] font-mono text-right focus:border-neutral-300 focus:outline-none"
                />
                <span className="text-[10px] text-neutral-500">trades</span>
              </div>
            </div>
            <TradeTable
              trades={trades}
              timestamp={hoveredTime}
              filterProducts={filterProducts}
              windowSize={tradeWindow}
              classifyBySide
              activities={activities}
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
            {qtyActive && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
          </span>
          <span className="text-neutral-500 text-[10px]">{qtyFilterOpen ? "▾" : "▸"}</span>
        </button>
        {qtyFilterOpen && (
          <div className="px-2 pb-2">
            <div className="flex items-center justify-between mb-1.5">
              {qtyActive && onQtyMinChange && onQtyMaxChange && (
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
                    onQtyMaxChange?.(null);
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
          <span className="text-neutral-500 text-[10px]">{orderDepthOpen ? "▾" : "▸"}</span>
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

type BucketRow = {
  label: string;
  lo: number;
  hi: number;
  buyCount: number;
  sellCount: number;
  buyVol: number;
  sellVol: number;
};

function PriceBucketSection({
  activities,
  trades,
  selectedProduct,
  zoomRange,
}: {
  activities: ActivityRow[];
  trades: Trade[];
  selectedProduct: string | null;
  zoomRange: { min: number; max: number } | null;
}) {
  const productOptions = Array.from(new Set(activities.map((r) => r.product))).sort();
  const [localProduct, setLocalProduct] = useState<string | null>(null);
  const effectiveProduct = localProduct ?? selectedProduct ?? productOptions[0] ?? null;

  // Auto-detect center from mid mean for selected product.
  const autoCenter = (() => {
    if (!effectiveProduct) return 0;
    let sum = 0, count = 0;
    for (const r of activities) {
      if (r.product !== effectiveProduct) continue;
      if (r.midPrice === null || r.bidPrice1 === null || r.askPrice1 === null) continue;
      if (zoomRange && (r.timestamp < zoomRange.min || r.timestamp > zoomRange.max)) continue;
      sum += r.midPrice;
      count++;
    }
    return count === 0 ? 0 : Math.round(sum / count);
  })();

  const [centerOverride, setCenterOverride] = useState<string>("");
  const center = centerOverride.trim() !== "" && Number.isFinite(Number(centerOverride))
    ? Number(centerOverride)
    : autoCenter;

  // Auto bucket width: based on data range. Aim for ~6-8 buckets.
  const autoWidth = (() => {
    if (!effectiveProduct) return 5;
    let lo = Infinity, hi = -Infinity;
    for (const r of activities) {
      if (r.product !== effectiveProduct) continue;
      if (r.midPrice === null || r.bidPrice1 === null || r.askPrice1 === null) continue;
      if (zoomRange && (r.timestamp < zoomRange.min || r.timestamp > zoomRange.max)) continue;
      if (r.midPrice < lo) lo = r.midPrice;
      if (r.midPrice > hi) hi = r.midPrice;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) return 5;
    const range = hi - lo;
    // Pick a nice round bucket width that gives 6-8 buckets
    const raw = range / 7;
    const candidates = [1, 2, 5, 10, 15, 20, 25, 50, 100, 200, 500];
    let best = 5;
    let bestDist = Infinity;
    for (const c of candidates) {
      const d = Math.abs(c - raw);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  })();

  const [widthOverride, setWidthOverride] = useState<string>("");
  const bucketWidth = widthOverride.trim() !== "" && Number.isFinite(Number(widthOverride)) && Number(widthOverride) > 0
    ? Number(widthOverride)
    : autoWidth;

  // Build mid lookup (two-sided only)
  const midByTs = (() => {
    if (!effectiveProduct) return new Map<number, number>();
    const m = new Map<number, number>();
    for (const r of activities) {
      if (r.product !== effectiveProduct) continue;
      if (r.midPrice === null || r.bidPrice1 === null || r.askPrice1 === null) continue;
      m.set(r.timestamp, r.midPrice);
    }
    return m;
  })();

  // Compute buckets
  const bucketData = (() => {
    // Generate symmetric bucket boundaries around center
    // e.g. center=10000, width=5 => [..., 9990-9995, 9995-10000, 10000-10005, 10005-10010, ...]
    // We'll create enough to cover all trades in range, plus catch-all edges.
    const inRange = (ts: number) => !zoomRange || (ts >= zoomRange.min && ts <= zoomRange.max);

    // First pass: find price extremes across trades in product + range
    let lo = Infinity, hi = -Infinity;
    for (const t of trades) {
      if (t.symbol !== effectiveProduct) continue;
      if (!inRange(t.timestamp)) continue;
      if (t.price < lo) lo = t.price;
      if (t.price > hi) hi = t.price;
    }
    if (!Number.isFinite(lo)) return [];

    // Generate bucket edges from center outward to cover lo..hi
    const stepsDown = Math.ceil((center - lo) / bucketWidth) + 1;
    const stepsUp = Math.ceil((hi - center) / bucketWidth) + 1;
    const edges: number[] = [];
    for (let i = -stepsDown; i <= stepsUp; i++) {
      edges.push(center + i * bucketWidth);
    }

    // Create bucket rows
    const rows: BucketRow[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      rows.push({
        label: `${edges[i]}–${edges[i + 1]}`,
        lo: edges[i],
        hi: edges[i + 1],
        buyCount: 0, sellCount: 0,
        buyVol: 0, sellVol: 0,
      });
    }

    // Classify trades into buckets
    for (const t of trades) {
      if (t.symbol !== effectiveProduct) continue;
      if (!inRange(t.timestamp)) continue;
      const mid = midByTs.get(t.timestamp);
      const qty = Math.abs(t.quantity);
      const isBuy = mid !== undefined && t.price > mid;
      const isSell = mid !== undefined && t.price < mid;

      // Find which bucket this trade's price falls into
      for (const row of rows) {
        if (t.price >= row.lo && t.price < row.hi) {
          if (isBuy) { row.buyCount++; row.buyVol += qty; }
          else if (isSell) { row.sellCount++; row.sellVol += qty; }
          else { row.buyCount += 0.5; row.sellCount += 0.5; row.buyVol += qty / 2; row.sellVol += qty / 2; }
          break;
        }
      }
      // Edge case: price exactly equals last edge — put in last bucket
      if (t.price === edges[edges.length - 1] && rows.length > 0) {
        const row = rows[rows.length - 1];
        if (isBuy) { row.buyCount++; row.buyVol += qty; }
        else if (isSell) { row.sellCount++; row.sellVol += qty; }
      }
    }

    // Filter to non-empty buckets
    return rows.filter((r) => r.buyCount > 0 || r.sellCount > 0);
  })();

  // Find the max count for the imbalance bar scaling
  const maxCount = Math.max(1, ...bucketData.map((r) => Math.max(r.buyCount, r.sellCount)));

  if (activities.length === 0) {
    return (
      <div className="text-[11px] text-neutral-500 leading-relaxed">
        Load data to run price-bucket analysis. Classifies trades into
        symmetric price bands around a center (auto-detected or manual)
        to reveal buy/sell asymmetry at different price levels.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Controls */}
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
              <option key={p} value={p} className="bg-[#1f2125]">{p}</option>
            ))
          )}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500">
            Center price
          </span>
          <input
            type="number"
            value={centerOverride}
            placeholder={String(autoCenter)}
            onChange={(e) => setCenterOverride(e.target.value)}
            className="border border-neutral-600 bg-[#1f2125] text-neutral-200 px-2 py-1 text-[11px] font-mono focus:border-neutral-300 focus:outline-none placeholder-neutral-600"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500">
            Bucket width
          </span>
          <input
            type="number"
            value={widthOverride}
            placeholder={String(autoWidth)}
            onChange={(e) => setWidthOverride(e.target.value)}
            className="border border-neutral-600 bg-[#1f2125] text-neutral-200 px-2 py-1 text-[11px] font-mono focus:border-neutral-300 focus:outline-none placeholder-neutral-600"
          />
        </label>
      </div>

      <div className="text-[9px] text-neutral-600 font-mono">
        center {center.toLocaleString()} · width {bucketWidth} · {bucketData.length} buckets
        {zoomRange && <span className="text-amber-400 ml-1">zoom scoped</span>}
      </div>

      {/* Results table */}
      {bucketData.length === 0 ? (
        <div className="text-[11px] text-neutral-500">No trades in range.</div>
      ) : (
        <div className="border border-neutral-700 bg-[#2a2d31] overflow-x-auto">
          <table className="w-full border-collapse text-[10px] font-mono">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-neutral-500">
                <th className="text-left font-medium px-1.5 py-1 border-b border-neutral-700">Price range</th>
                <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700" style={{ color: "#4ade80" }}>Buys</th>
                <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700" style={{ color: "#f87171" }}>Sells</th>
                <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700" style={{ color: "#4ade80" }}>B vol</th>
                <th className="text-right font-medium px-1.5 py-1 border-b border-neutral-700" style={{ color: "#f87171" }}>S vol</th>
                <th className="text-center font-medium px-1.5 py-1 border-b border-neutral-700">Imbalance</th>
              </tr>
            </thead>
            <tbody className="text-neutral-200">
              {bucketData.map((row, i) => {
                const total = row.buyCount + row.sellCount;
                const imbalance = total === 0 ? 0 : (row.buyCount - row.sellCount) / total;
                const isCenterBucket = center >= row.lo && center < row.hi;
                const avgBuy = row.buyCount === 0 ? null : row.buyVol / row.buyCount;
                const avgSell = row.sellCount === 0 ? null : row.sellVol / row.sellCount;
                const buyPct = maxCount === 0 ? 0 : (row.buyCount / maxCount) * 100;
                const sellPct = maxCount === 0 ? 0 : (row.sellCount / maxCount) * 100;
                return (
                  <tr
                    key={i}
                    className={`border-t border-neutral-700/40 ${isCenterBucket ? "bg-neutral-700/20" : ""}`}
                    title={`Avg buy: ${avgBuy?.toFixed(1) ?? "-"} | Avg sell: ${avgSell?.toFixed(1) ?? "-"}`}
                  >
                    <td className="px-1.5 py-1 text-neutral-400 whitespace-nowrap">
                      {row.label}
                      {isCenterBucket && <span className="text-amber-400 ml-1">◆</span>}
                    </td>
                    <td className="px-1.5 py-1 text-right">{Math.round(row.buyCount)}</td>
                    <td className="px-1.5 py-1 text-right">{Math.round(row.sellCount)}</td>
                    <td className="px-1.5 py-1 text-right text-neutral-400">{Math.round(row.buyVol).toLocaleString()}</td>
                    <td className="px-1.5 py-1 text-right text-neutral-400">{Math.round(row.sellVol).toLocaleString()}</td>
                    <td className="px-1.5 py-1">
                      <div className="flex items-center gap-0.5 justify-center">
                        <div className="w-12 h-2.5 bg-neutral-800 relative overflow-hidden flex">
                          <div
                            className="absolute right-1/2 top-0 h-full"
                            style={{
                              width: `${buyPct / 2}%`,
                              backgroundColor: "rgba(74,222,128,0.6)",
                              transform: "translateX(0)",
                              right: "50%",
                              left: "auto",
                            }}
                          />
                          <div
                            className="absolute left-1/2 top-0 h-full"
                            style={{
                              width: `${sellPct / 2}%`,
                              backgroundColor: "rgba(248,113,113,0.6)",
                            }}
                          />
                          <div className="absolute left-1/2 top-0 w-px h-full bg-neutral-600" />
                        </div>
                        <span
                          className="text-[9px] w-8 text-right"
                          style={{
                            color: imbalance > 0.05 ? "#4ade80" : imbalance < -0.05 ? "#f87171" : "#737373",
                          }}
                        >
                          {imbalance > 0 ? "+" : ""}{(imbalance * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[9px] text-neutral-600 leading-snug">
        Buys = trade price &gt; mid (taker bought). Sells = trade price &lt; mid.
        Hover a row to see avg fill sizes. Symmetric counts across buckets
        suggest mechanical mean reversion; asymmetry suggests informed flow.
        ◆ marks the bucket containing the center price.
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
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-neutral-700">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2d31] transition-colors"
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

function FeatureExtractionSection({ round }: { round: number | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<FeatureSet | null>(null);
  const [loaded, setLoaded] = useState<LoadedInfo[]>([]);
  const [persist, setPersist] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setFeatures(null);
    setLoaded([]);
    setSelected(null);
    setError(null);
  }, [round]);

  async function run() {
    if (round === null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulation/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round, persist }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = await res.json();
      setFeatures(j.features);
      setLoaded(j.loaded);
      const products = Object.keys(j.features.products);
      if (products.length > 0) setSelected(products[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const productList = features ? Object.keys(features.products).sort() : [];
  const current: ProductFeatures | null =
    features && selected ? features.products[selected] : null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <button
          onClick={run}
          disabled={loading || round === null}
          className="border border-neutral-300 bg-neutral-700 text-neutral-100 hover:bg-neutral-600 px-2 py-1 text-[11px] disabled:opacity-50 disabled:cursor-default"
        >
          {loading ? "Extracting..." : features ? "Re-run" : "Extract"}
        </button>
        <label className="flex items-center gap-1.5 text-neutral-400 text-[11px] cursor-pointer">
          <input
            type="checkbox"
            checked={persist}
            onChange={(e) => setPersist(e.target.checked)}
            className="accent-neutral-300"
          />
          Save to disk
        </label>
      </div>

      {error && (
        <div className="px-2 py-1.5 text-[11px] text-red-300 bg-red-950/40 border border-red-900/60">
          {error}
        </div>
      )}

      {!features && !loading && !error && (
        <div className="text-[11px] text-neutral-500 leading-relaxed">
          Computes per-product statistics from{" "}
          <code className="text-neutral-300">
            public/historical/round{round ?? "?"}/
          </code>. One-sided book snapshots (only bid or only ask present) are
          excluded from mid-price stats since they distort volatility.
        </div>
      )}

      {loaded.length > 0 && (
        <div className="text-[10px] text-neutral-500 font-mono">
          {loaded.map((l, i) => (
            <span key={l.day}>
              {i > 0 && " · "}
              day {l.day} ({l.rows.toLocaleString()}/{l.trades})
            </span>
          ))}
        </div>
      )}

      {features && (
        <>
          <div className="flex flex-wrap gap-1">
            {productList.map((p) => (
              <button
                key={p}
                onClick={() => setSelected(p)}
                className={`px-2 py-0.5 text-[10px] transition-colors border ${
                  p === selected
                    ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                    : "border-neutral-600 bg-[#2a2d31] text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {current && <ProductView p={current} />}
        </>
      )}
    </div>
  );
}

type GenInfoProduct = {
  suggestedMode: SimMode;
  suggestedSmoothing: number;
  fairPrice: number;
  slopePerStep: number;
  intercept: number;
  lag1Autocorr: number;
  oneSidedRate: number;
};

type GenInfo = {
  nextDay: number;
  hasFeatures: boolean;
  products: Record<string, GenInfoProduct>;
};

function GeneratorSection({
  round,
  onGenerated,
}: {
  round: number | null;
  onGenerated?: (day: number) => void;
}) {
  const [info, setInfo] = useState<GenInfo | null>(null);
  const [duration, setDuration] = useState(1_000_000);
  const [step, setStep] = useState(100);
  const [seed, setSeed] = useState<string>("");
  const [modes, setModes] = useState<Record<string, SimMode>>({});
  const [smoothing, setSmoothing] = useState<Record<string, number>>({});
  const [overrides, setOverrides] = useState<Record<string, Overrides>>({});
  const [overridesOpen, setOverridesOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    day: number;
    pricesPath: string;
    tradesPath: string;
    stats: { products: number; snapshots: number; activityRows: number; trades: number };
  } | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
    setInfo(null);
    setModes({});
    setSmoothing({});
    setOverrides({});
    setOverridesOpen({});
    if (round === null) return;
    fetch(`/api/simulation/generate?round=${round}`)
      .then((r) => r.json())
      .then((j: GenInfo) => {
        setInfo(j);
        const initialModes: Record<string, SimMode> = {};
        const initialSmoothing: Record<string, number> = {};
        const initialOverrides: Record<string, Overrides> = {};
        for (const [name, p] of Object.entries(j.products)) {
          initialModes[name] = p.suggestedMode;
          initialSmoothing[name] = p.suggestedSmoothing ?? FALLBACK_SMOOTHING;
          initialOverrides[name] = { ...DEFAULT_OVERRIDES };
        }
        setModes(initialModes);
        setSmoothing(initialSmoothing);
        setOverrides(initialOverrides);
      })
      .catch(() => {});
  }, [round]);

  async function run() {
    if (round === null || info === null) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const productModes: Record<string, { mode: SimMode; smoothing: number; overrides: Overrides }> = {};
      for (const name of Object.keys(modes)) {
        productModes[name] = {
          mode: modes[name],
          smoothing: smoothing[name] ?? info.products[name]?.suggestedSmoothing ?? FALLBACK_SMOOTHING,
          overrides: overrides[name] ?? DEFAULT_OVERRIDES,
        };
      }
      const body: Record<string, unknown> = {
        round,
        day: info.nextDay,
        durationTimestamps: duration,
        step,
        productModes,
      };
      if (seed.trim() !== "") body.seed = Number(seed);

      const res = await fetch("/api/simulation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = await res.json();
      setResult({
        day: j.day,
        pricesPath: j.pricesPath,
        tradesPath: j.tradesPath,
        stats: j.stats,
      });
      if (onGenerated) onGenerated(j.day);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function updateOverride<K extends keyof Overrides>(name: string, key: K, value: Overrides[K]) {
    setOverrides((prev) => ({
      ...prev,
      [name]: { ...(prev[name] ?? DEFAULT_OVERRIDES), [key]: value },
    }));
  }

  function resetOverrides(name: string) {
    setOverrides((prev) => ({ ...prev, [name]: { ...DEFAULT_OVERRIDES } }));
  }

  function isOverrideActive(o: Overrides) {
    return o.slopeMultiplier !== 1 || o.noiseMultiplier !== 1 || o.levelShift !== 0;
  }

  const productNames = info ? Object.keys(info.products).sort() : [];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-[11px] text-neutral-500 leading-relaxed">
        Generates the next day forward. Use overrides to test scenarios:
        slow/speed/reverse a trend, spike volatility, or shift a price level.
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Day (auto)">
          <input
            type="number"
            value={info?.nextDay ?? ""}
            disabled
            className="w-full border border-neutral-700 bg-[#1d1f23] text-neutral-400 px-2 py-1 text-[11px] cursor-not-allowed"
          />
        </Field>
        <Field label="Duration (ts)">
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full border border-neutral-600 bg-[#2a2d31] text-neutral-200 px-2 py-1 text-[11px] focus:border-neutral-300 focus:outline-none"
          />
        </Field>
        <Field label="Step">
          <input
            type="number"
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            className="w-full border border-neutral-600 bg-[#2a2d31] text-neutral-200 px-2 py-1 text-[11px] focus:border-neutral-300 focus:outline-none"
          />
        </Field>
        <Field label="Seed (optional)">
          <input
            type="text"
            value={seed}
            placeholder="random"
            onChange={(e) => setSeed(e.target.value)}
            className="w-full border border-neutral-600 bg-[#2a2d31] text-neutral-200 px-2 py-1 text-[11px] focus:border-neutral-300 focus:outline-none placeholder-neutral-600"
          />
        </Field>
      </div>

      {info && productNames.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">Per-product configuration</div>
          {productNames.map((name) => {
            const p = info.products[name];
            const mode = modes[name] ?? p.suggestedMode;
            const sm = smoothing[name] ?? p.suggestedSmoothing ?? FALLBACK_SMOOTHING;
            const suggested = p.suggestedSmoothing ?? FALLBACK_SMOOTHING;
            const onSuggested = Math.abs(sm - suggested) < 0.0001;
            const ov = overrides[name] ?? DEFAULT_OVERRIDES;
            const isOpen = overridesOpen[name] ?? false;
            const overrideActive = isOverrideActive(ov);
            return (
              <div key={name} className="bg-[#2a2d31] border border-neutral-700/60 px-2 py-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-200 font-mono truncate">{name}</span>
                  <select
                    value={mode}
                    onChange={(e) =>
                      setModes((prev) => ({ ...prev, [name]: e.target.value as SimMode }))
                    }
                    className="border border-neutral-600 bg-[#1d1f23] text-neutral-200 px-1.5 py-0.5 text-[10px] focus:border-neutral-300 focus:outline-none"
                  >
                    <option value="meanRevert" className="bg-[#1d1f23]">Mean revert</option>
                    <option value="linearTrend" className="bg-[#1d1f23]">Linear trend</option>
                  </select>
                </div>
                <div className="text-[9px] text-neutral-500 font-mono">
                  {mode === "meanRevert"
                    ? `fair ${p.fairPrice.toFixed(1)}`
                    : `slope ${p.slopePerStep.toExponential(2)}/step · intercept ${p.intercept.toFixed(1)}`}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-neutral-500 w-16">Smoothing</span>
                  <input
                    type="range"
                    min={0.005}
                    max={0.5}
                    step={0.005}
                    value={sm}
                    onChange={(e) =>
                      setSmoothing((prev) => ({ ...prev, [name]: Number(e.target.value) }))
                    }
                    className="flex-1 accent-neutral-300"
                  />
                  <span className="text-[10px] text-neutral-300 font-mono w-12 text-right">
                    {sm.toFixed(3)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-neutral-600">
                  <span>
                    Suggested: <span className="text-neutral-400 font-mono">{suggested.toFixed(3)}</span>
                    {onSuggested && <span className="text-emerald-500 ml-1">●</span>}
                  </span>
                  {!onSuggested && (
                    <button
                      onClick={() => setSmoothing((prev) => ({ ...prev, [name]: suggested }))}
                      className="text-neutral-400 hover:text-neutral-200 underline"
                    >
                      reset
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setOverridesOpen((prev) => ({ ...prev, [name]: !isOpen }))}
                  className="flex items-center justify-between gap-2 mt-1 pt-1.5 border-t border-neutral-700/60 hover:bg-[#2e3137] -mx-2 px-2 transition-colors"
                >
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                    Scenario Overrides
                    {overrideActive && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                  </span>
                  <span className="text-neutral-500 text-[10px]">{isOpen ? "▾" : "▸"}</span>
                </button>

                {isOpen && (
                  <div className="flex flex-col gap-2 pt-1">
                    {mode === "linearTrend" && (
                      <SliderRow
                        label="Slope ×"
                        min={-3}
                        max={3}
                        step={0.05}
                        value={ov.slopeMultiplier}
                        format={(v) => `${v.toFixed(2)}×`}
                        onChange={(v) => updateOverride(name, "slopeMultiplier", v)}
                        hints={[
                          { value: 0, label: "flat" },
                          { value: 1, label: "normal" },
                          { value: -1, label: "reverse" },
                        ]}
                      />
                    )}
                    <SliderRow
                      label="Noise ×"
                      min={0}
                      max={5}
                      step={0.1}
                      value={ov.noiseMultiplier}
                      format={(v) => `${v.toFixed(1)}×`}
                      onChange={(v) => updateOverride(name, "noiseMultiplier", v)}
                      hints={[
                        { value: 0, label: "calm" },
                        { value: 1, label: "normal" },
                        { value: 3, label: "spike" },
                      ]}
                    />
                    <SliderRow
                      label="Level shift"
                      min={-200}
                      max={200}
                      step={1}
                      value={ov.levelShift}
                      format={(v) => (v > 0 ? `+${v.toFixed(0)}` : v.toFixed(0))}
                      onChange={(v) => updateOverride(name, "levelShift", v)}
                      hints={[{ value: 0, label: "none" }]}
                    />
                    <div className="flex flex-col gap-1">
                      <label className="flex items-center gap-2 text-[10px] text-neutral-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ov.applyAfterTimestamp !== null}
                          onChange={(e) =>
                            updateOverride(
                              name,
                              "applyAfterTimestamp",
                              e.target.checked ? Math.floor(duration / 2) : null
                            )
                          }
                          className="accent-neutral-300"
                        />
                        Apply mid-day (kick in at timestamp)
                      </label>
                      {ov.applyAfterTimestamp !== null && (
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={duration}
                            step={Math.max(1, Math.floor(duration / 100))}
                            value={ov.applyAfterTimestamp}
                            onChange={(e) =>
                              updateOverride(name, "applyAfterTimestamp", Number(e.target.value))
                            }
                            className="flex-1 accent-neutral-300"
                          />
                          <span className="text-[10px] text-neutral-300 font-mono w-20 text-right">
                            ts {ov.applyAfterTimestamp.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                    {overrideActive && (
                      <button
                        onClick={() => resetOverrides(name)}
                        className="text-[10px] text-neutral-500 hover:text-neutral-200 underline self-start mt-1"
                      >
                        reset all overrides
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {info && !info.hasFeatures && (
        <div className="text-[10px] text-amber-400">
          No features found. Run feature extraction with &quot;Save to disk&quot; first.
        </div>
      )}

      <div>
        <button
          onClick={run}
          disabled={loading || round === null || info === null || !info.hasFeatures}
          className="border border-neutral-300 bg-neutral-700 text-neutral-100 hover:bg-neutral-600 px-2 py-1 text-[11px] disabled:opacity-50 disabled:cursor-default"
        >
          {loading ? "Generating..." : `Generate day ${info?.nextDay ?? ""}`}
        </button>
      </div>

      {error && (
        <div className="px-2 py-1.5 text-[11px] text-red-300 bg-red-950/40 border border-red-900/60">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-[#2a2d31] border border-emerald-900/60 px-2 py-2">
          <div className="text-[11px] text-emerald-400 mb-1.5">
            Generated day {result.day}
          </div>
          <div className="text-[10px] text-neutral-400 font-mono leading-snug">
            <div>products: {result.stats.products}</div>
            <div>snapshots: {result.stats.snapshots.toLocaleString()}</div>
            <div>activity rows: {result.stats.activityRows.toLocaleString()}</div>
            <div>trades: {result.stats.trades.toLocaleString()}</div>
          </div>
          <div className="mt-2 text-[10px] text-neutral-500 font-mono break-all">
            <div>{result.pricesPath}</div>
            <div>{result.tradesPath}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  format,
  onChange,
  hints,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  hints?: { value: number; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-wider text-neutral-500 w-16">{label}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-neutral-300"
        />
        <span className="text-[10px] text-neutral-300 font-mono w-12 text-right">
          {format(value)}
        </span>
      </div>
      {hints && hints.length > 0 && (
        <div className="flex gap-2 ml-[72px] text-[9px] text-neutral-600">
          {hints.map((h) => (
            <button
              key={h.value}
              onClick={() => onChange(h.value)}
              className="hover:text-neutral-300 underline-offset-2 hover:underline"
            >
              {h.label} ({format(h.value)})
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function ProductView({ p }: { p: ProductFeatures }) {
  const filteredOut = p.mid.totalSnapshotCount - p.mid.validSnapshotCount;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Snapshots" value={p.snapshotCount.toLocaleString()} sub={`step ${p.timestampStep}`} />
        <Stat label="Mid mean" value={p.mid.mean.toFixed(2)} sub={`stddev ${p.mid.std.toFixed(1)}`} />
        <Stat label="Trades" value={p.trades.count.toLocaleString()} sub={`${p.trades.perTimestepRate.toFixed(2)}/step`} />
      </div>

      <SubCard title="Data Quality">
        <KVGrid>
          <KV k="valid mids" v={p.mid.validSnapshotCount.toLocaleString()} />
          <KV k="filtered out" v={filteredOut.toLocaleString()} hint={`${(p.mid.oneSidedRate * 100).toFixed(1)}%`} />
          <KV k="autocorr" v={p.mid.lag1Autocorr.toFixed(4)} />
          <KV k="suggested smoothing" v={p.mid.suggestedSmoothing.toFixed(3)} />
        </KVGrid>
        {p.mid.oneSidedRate > 0.05 && (
          <div className="text-[9px] text-amber-500 mt-1.5">
            {(p.mid.oneSidedRate * 100).toFixed(1)}% of snapshots had only one side of the book and were excluded from mid stats.
          </div>
        )}
      </SubCard>

      <SubCard title="Mean Revert Model">
        <KVGrid>
          <KV k="fair price" v={p.mid.fairPrice.toFixed(2)} />
          <KV k="noise stddev" v={p.mid.noiseStd.toFixed(2)} />
          <KV k="range" v={`${p.mid.min} – ${p.mid.max}`} />
        </KVGrid>
      </SubCard>

      <SubCard title="Linear Trend Model">
        <KVGrid>
          <KV k="slope/step" v={p.mid.slopePerStep.toExponential(3)} />
          <KV k="intercept" v={p.mid.intercept.toFixed(2)} />
          <KV k="trend noise" v={p.mid.trendNoiseStd.toFixed(2)} />
          <KV k="suggested" v={p.mid.suggestedMode === "meanRevert" ? "mean revert" : "linear trend"} />
        </KVGrid>
      </SubCard>

      <SubCard title="Spread">
        <div className="grid grid-cols-2 gap-x-3 mb-1.5">
          <KV k="mean" v={p.book.spreadMean.toFixed(2)} />
          <KV k="stddev" v={p.book.spreadStd.toFixed(2)} />
        </div>
        <Histo h={p.book.spreadHist} />
      </SubCard>

      <SubCard title="Order Book Depth">
        <BookTable bid={p.book.bid} ask={p.book.ask} />
      </SubCard>

      <SubCard title="Trade Flow">
        <KVGrid>
          <KV k="size mean" v={p.trades.sizeMean.toFixed(1)} />
          <KV k="size stddev" v={p.trades.sizeStd.toFixed(1)} />
          <KV k="interarrival mean" v={p.trades.interArrivalMean.toFixed(0)} />
          <KV k="interarrival stddev" v={p.trades.interArrivalStd.toFixed(0)} />
          <KV k="vs mid mean" v={p.trades.priceVsMidMean.toFixed(2)} />
          <KV k="vs mid stddev" v={p.trades.priceVsMidStd.toFixed(2)} />
        </KVGrid>
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Aggressor</div>
          <AggressorBar
            buy={p.trades.buyAggressorRate}
            sell={p.trades.sellAggressorRate}
            mid={p.trades.midbookRate}
          />
        </div>
      </SubCard>
    </div>
  );
}

function SubCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#2a2d31] border border-neutral-700/60">
      <div className="px-2 py-1 border-b border-neutral-700/60 bg-[#2e3137]">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
          {title}
        </div>
      </div>
      <div className="px-2 py-2">{children}</div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#2a2d31] border border-neutral-700/60 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="text-[12px] text-neutral-100 font-mono leading-tight mt-0.5">{value}</div>
      {sub && <div className="text-[9px] text-neutral-500 font-mono">{sub}</div>}
    </div>
  );
}

function KVGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">{children}</div>;
}

function KV({ k, v, hint }: { k: string; v: string | number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 border-b border-neutral-700/30">
      <span className="text-[10px] text-neutral-500">{k}</span>
      <span className="text-[11px] text-neutral-200 font-mono text-right">
        {v}
        {hint && <span className="text-neutral-600 ml-1 text-[9px]">{hint}</span>}
      </span>
    </div>
  );
}

function BookTable({
  bid,
  ask,
}: {
  bid: { presenceRate: number; offsetMean: number; volumeMean: number; volumeStd: number }[];
  ask: { presenceRate: number; offsetMean: number; volumeMean: number; volumeStd: number }[];
}) {
  return (
    <div className="font-mono text-[11px]">
      <div className="grid grid-cols-[24px_1fr_1fr_1.2fr] gap-x-2 text-[9px] uppercase tracking-wider text-neutral-500 pb-1 border-b border-neutral-700/60 mb-1">
        <div></div>
        <div className="text-right">present</div>
        <div className="text-right">offset</div>
        <div className="text-right">volume</div>
      </div>
      {[2, 1, 0].map((i) => (
        <BookRow key={`a${i}`} side="ask" level={(i + 1) as 1 | 2 | 3} lp={ask[i]} />
      ))}
      <div className="my-1 border-t border-neutral-600/60" />
      {[0, 1, 2].map((i) => (
        <BookRow key={`b${i}`} side="bid" level={(i + 1) as 1 | 2 | 3} lp={bid[i]} />
      ))}
    </div>
  );
}

function BookRow({
  side,
  level,
  lp,
}: {
  side: "bid" | "ask";
  level: 1 | 2 | 3;
  lp: { presenceRate: number; offsetMean: number; volumeMean: number; volumeStd: number };
}) {
  const sideColor = side === "bid" ? "text-blue-400" : "text-red-400";
  return (
    <div className="grid grid-cols-[24px_1fr_1fr_1.2fr] gap-x-2 py-0.5 items-baseline">
      <div className={`${sideColor} font-semibold text-[10px]`}>{side === "ask" ? "A" : "B"}{level}</div>
      <div className="text-right text-neutral-300 text-[10px]">{(lp.presenceRate * 100).toFixed(1)}%</div>
      <div className="text-right text-neutral-300 text-[10px]">{lp.offsetMean.toFixed(2)}</div>
      <div className="text-right text-neutral-300 text-[10px]">
        {lp.volumeMean.toFixed(1)}
        <span className="text-neutral-600"> ±{lp.volumeStd.toFixed(1)}</span>
      </div>
    </div>
  );
}

function Histo({ h }: { h: { bins: number[]; counts: number[]; binWidth: number } }) {
  if (h.counts.length === 0) return null;
  const max = Math.max(...h.counts);
  return (
    <div>
      <div className="flex items-end gap-px h-10 bg-neutral-900/40 p-1">
        {h.counts.map((c, i) => (
          <div
            key={i}
            title={`${h.bins[i].toFixed(2)} – ${(h.bins[i] + h.binWidth).toFixed(2)}: ${c}`}
            className="flex-1 bg-amber-500/80"
            style={{
              height: max === 0 ? 0 : `${(c / max) * 100}%`,
              minHeight: c > 0 ? 1 : 0,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-neutral-600 font-mono mt-0.5">
        <span>{h.bins[0]?.toFixed(1)}</span>
        <span>{(h.bins[h.bins.length - 1] + h.binWidth).toFixed(1)}</span>
      </div>
    </div>
  );
}

function AggressorBar({ buy, sell, mid }: { buy: number; sell: number; mid: number }) {
  return (
    <>
      <div className="flex h-4 border border-neutral-700">
        <div className="bg-emerald-500" style={{ width: `${buy * 100}%` }} title={`buy ${(buy * 100).toFixed(1)}%`} />
        <div className="bg-neutral-600" style={{ width: `${mid * 100}%` }} title={`mid ${(mid * 100).toFixed(1)}%`} />
        <div className="bg-red-500" style={{ width: `${sell * 100}%` }} title={`sell ${(sell * 100).toFixed(1)}%`} />
      </div>
      <div className="flex justify-between text-[10px] mt-1 font-mono">
        <span className="text-emerald-400">buy {(buy * 100).toFixed(1)}%</span>
        <span className="text-neutral-500">mid {(mid * 100).toFixed(1)}%</span>
        <span className="text-red-400">sell {(sell * 100).toFixed(1)}%</span>
      </div>
    </>
  );
}
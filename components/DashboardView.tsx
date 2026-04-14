"use client";

import { useEffect, useMemo, useState } from "react";
import { ParsedLog, ActivityRow, Trade } from "@/lib/types";
import DashboardUPlotChart from "@/components/DashboardUPlotChart";
import DashboardUPlotPanelChart from "@/components/DashboardUPlotPanelChart";
import DashboardLogViewer from "@/components/DashboardLogViewer";

type Props = {
  active: boolean;
  parsed: ParsedLog | null;
  loading: boolean;
};

type LevelKey = "bid1" | "bid2" | "bid3" | "ask1" | "ask2" | "ask3";
type TradeKey = "market" | "ownBuy" | "ownSell";

const LEVEL_ORDER: { key: LevelKey; label: string; color: string }[] = [
  { key: "ask3", label: "Ask 3", color: "rgba(239, 68, 68, 0.35)" },
  { key: "ask2", label: "Ask 2", color: "rgba(239, 68, 68, 0.65)" },
  { key: "ask1", label: "Ask 1", color: "rgba(239, 68, 68, 1)" },
  { key: "bid1", label: "Bid 1", color: "rgba(59, 130, 246, 1)" },
  { key: "bid2", label: "Bid 2", color: "rgba(59, 130, 246, 0.65)" },
  { key: "bid3", label: "Bid 3", color: "rgba(59, 130, 246, 0.35)" },
];

const TRADE_ORDER: { key: TradeKey; label: string; color: string }[] = [
  { key: "market", label: "Market Trades", color: "#fbbf24" },
  { key: "ownBuy", label: "Own Buys", color: "#22c55e" },
  { key: "ownSell", label: "Own Sells", color: "#ef4444" },
];

function computePositions(
  trades: Trade[],
  product: string
): { time: number; value: number }[] {
  const own: Trade[] = [];
  for (const t of trades) {
    if (t.symbol !== product) continue;
    if (t.buyer === "SUBMISSION" || t.seller === "SUBMISSION") own.push(t);
  }
  own.sort((a, b) => a.timestamp - b.timestamp);
  const out: { time: number; value: number }[] = [];
  let pos = 0;
  for (const t of own) {
    if (t.buyer === "SUBMISSION") pos += t.quantity;
    else if (t.seller === "SUBMISSION") pos -= t.quantity;
    out.push({ time: t.timestamp, value: pos });
  }
  return out;
}

export default function DashboardView({ active, parsed, loading }: Props) {
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [visibleLevels, setVisibleLevels] = useState<Record<LevelKey, boolean>>({
    bid1: true,
    bid2: true,
    bid3: true,
    ask1: true,
    ask2: true,
    ask3: true,
  });
  const [visibleTrades, setVisibleTrades] = useState<Record<TradeKey, boolean>>(
    {
      market: true,
      ownBuy: true,
      ownSell: true,
    }
  );

  useEffect(() => {
    if (!parsed || parsed.products.length === 0) return;
    if (
      !selectedProduct ||
      !parsed.products.some((p) => p.product === selectedProduct)
    ) {
      setSelectedProduct(parsed.products[0].product);
    }
  }, [parsed, selectedProduct]);

  const toggleLevel = (key: LevelKey) => {
    setVisibleLevels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTrade = (key: TradeKey) => {
    setVisibleTrades((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const productObj = parsed?.products.find(
    (p) => p.product === selectedProduct
  );

  const activityRows = useMemo<ActivityRow[]>(() => {
    if (!parsed || !selectedProduct) return [];
    return parsed.activities.filter((r) => r.product === selectedProduct);
  }, [parsed, selectedProduct]);

  const pnlData = useMemo(() => {
    if (!productObj) return [];
    return productObj.rows
      .map((r) => ({ time: r.timestamp, value: r.pnl }))
      .filter(
        (d): d is { time: number; value: number } =>
          d.value !== null && Number.isFinite(d.value)
      );
  }, [productObj]);

  const positionData = useMemo(() => {
    if (!parsed || !productObj) return [];
    return computePositions(parsed.trades, productObj.product);
  }, [parsed, productObj]);

  return (
    <div
      className="h-[calc(100vh-136px)] overflow-auto"
      style={{ display: active ? undefined : "none" }}
    >
      <div className="p-2 flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between border-b border-neutral-700 pb-1.5 mb-2 flex-none">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-neutral-100 font-semibold text-[13px]">
              Dashboard
            </h2>
            {productObj && (
              <span className="text-neutral-500 text-xs">
                {productObj.rows.length} ticks
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-neutral-400 text-xs">Product</span>
            <select
              value={selectedProduct ?? ""}
              onChange={(e) => setSelectedProduct(e.target.value)}
              disabled={!parsed || parsed.products.length === 0}
              className="border border-neutral-600 bg-[#2a2d31] text-neutral-200 px-2 py-1 text-xs focus:border-neutral-300 focus:outline-none disabled:text-neutral-600"
            >
              {!parsed || parsed.products.length === 0 ? (
                <option>-</option>
              ) : (
                parsed.products.map((p) => (
                  <option
                    key={p.product}
                    value={p.product}
                    className="bg-[#2a2d31]"
                  >
                    {p.product}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {!parsed && !loading && (
          <p className="text-neutral-500 text-xs">No log loaded.</p>
        )}
        {!parsed && loading && (
          <p className="text-neutral-500 text-xs">Loading...</p>
        )}

        {parsed && productObj && (
          <>
            <div className="flex items-center gap-4 flex-wrap mb-2 pb-1.5 border-b border-neutral-700 flex-none">
              <span className="text-neutral-400 text-xs">Levels</span>
              <div className="flex items-center gap-2 flex-wrap">
                {LEVEL_ORDER.map(({ key, label, color }) => {
                  const isOn = visibleLevels[key];
                  return (
                    <button
                      key={key}
                      onClick={() => toggleLevel(key)}
                      className={`flex items-center gap-1.5 border px-2 py-1 text-[11px] transition-colors ${
                        isOn
                          ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                          : "border-neutral-600 bg-[#2a2d31] text-neutral-500 hover:text-neutral-200"
                      }`}
                    >
                      <span
                        className="inline-block w-2 h-2"
                        style={{ backgroundColor: color }}
                      />
                      {label}
                    </button>
                  );
                })}
              </div>
              <span className="text-neutral-600">|</span>
              <span className="text-neutral-400 text-xs">Trades</span>
              <div className="flex items-center gap-2 flex-wrap">
                {TRADE_ORDER.map(({ key, label, color }) => {
                  const isOn = visibleTrades[key];
                  return (
                    <button
                      key={key}
                      onClick={() => toggleTrade(key)}
                      className={`flex items-center gap-1.5 border px-2 py-1 text-[11px] transition-colors ${
                        isOn
                          ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                          : "border-neutral-600 bg-[#2a2d31] text-neutral-500 hover:text-neutral-200"
                      }`}
                    >
                      <span
                        className="inline-block w-2 h-2"
                        style={{ backgroundColor: color }}
                      />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <div className="grid grid-cols-[2fr_1fr] gap-2 flex-1 min-h-0">
                <DashboardUPlotChart
                  rows={activityRows}
                  trades={parsed.trades}
                  product={productObj.product}
                  label={`Order Book · ${productObj.product}`}
                  minHeight={320}
                  visibleLevels={visibleLevels}
                  visibleTrades={visibleTrades}
                  resetSignal={resetSignal}
                  onResetRequest={() => setResetSignal((n) => n + 1)}
                  onHoverTime={setHoveredTime}
                />

                <div className="h-full min-h-0">
                  <DashboardLogViewer
                    sandbox={parsed.sandbox}
                    hoveredTime={hoveredTime}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 flex-none">
                <DashboardUPlotPanelChart
                  data={pnlData}
                  label={`Profit / Loss · ${productObj.product}`}
                  color="#a3e635"
                  valueLabel="pnl"
                  height={120}
                  formatValue={(v) => v.toFixed(0)}
                  resetSignal={resetSignal}
                />
                <DashboardUPlotPanelChart
                  data={positionData}
                  label={`Position · ${productObj.product}`}
                  color="#60a5fa"
                  valueLabel="pos"
                  step
                  height={120}
                  formatValue={(v) => v.toFixed(0)}
                  resetSignal={resetSignal}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
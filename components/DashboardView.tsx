"use client";

import { useEffect, useMemo, useState } from "react";
import { ParsedLog, ActivityRow, Trade } from "@/lib/types";
import DashboardUPlotChart from "@/components/DashboardUPlotChart";
import type { Normalizer, QtyFilter } from "@/components/DashboardUPlotChart";
import DashboardUPlotPanelChart from "@/components/DashboardUPlotPanelChart";
import DashboardRightPanel from "@/components/DashboardRightPanel";
import DashboardInfoPanel from "@/components/DashboardInfoPanel";

type Props = {
  active: boolean;
  parsed: ParsedLog | null;
  loading: boolean;
};

export type LevelKey = "bid1" | "bid2" | "bid3" | "ask1" | "ask2" | "ask3" | "mid";
export type TradeKey = "botMaker" | "botTaker" | "myBuy" | "mySell";
export type OrderKey = "ownOrders";

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
  const [normalizer, setNormalizer] = useState<Normalizer>("none");
  const [infoOpen, setInfoOpen] = useState(false);
  const [qtyMin, setQtyMin] = useState(0);
  const [qtyMax, setQtyMax] = useState<number | null>(null);
  const [visibleLevels, setVisibleLevels] = useState<Record<LevelKey, boolean>>({
    bid1: true,
    bid2: true,
    bid3: true,
    ask1: true,
    ask2: true,
    ask3: true,
    mid: true,
  });
  const [visibleTrades, setVisibleTrades] = useState<Record<TradeKey, boolean>>(
    {
      botMaker: true,
      botTaker: true,
      myBuy: true,
      mySell: true,
    }
  );
  const [visibleOrders, setVisibleOrders] = useState<Record<OrderKey, boolean>>(
    {
      ownOrders: true,
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
    setResetSignal((n) => n + 1);
  }, [parsed, selectedProduct]);

  const toggleLevel = (key: LevelKey) => {
    setVisibleLevels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTrade = (key: TradeKey) => {
    setVisibleTrades((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleOrder = (key: OrderKey) => {
    setVisibleOrders((prev) => ({ ...prev, [key]: !prev[key] }));
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

  const maxTradeQty = useMemo(() => {
    if (!parsed || !productObj) return 0;
    let m = 0;
    for (const t of parsed.trades) {
      if (t.symbol !== productObj.product) continue;
      const a = Math.abs(t.quantity);
      if (a > m) m = a;
    }
    return m;
  }, [parsed, productObj]);

  useEffect(() => {
    setQtyMin(0);
    setQtyMax(null);
  }, [selectedProduct]);

  return (
    <div
      className="h-[calc(100vh-136px)] overflow-y-auto overflow-x-hidden"
      style={{ display: active ? undefined : "none" }}
    >
      <div className="p-2 flex flex-col h-full min-h-0 min-w-0">
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
            <button
              onClick={() => setInfoOpen(true)}
              className="border border-neutral-600 bg-[#2a2d31] text-neutral-300 hover:text-neutral-100 hover:border-neutral-400 px-2 py-1 text-xs font-mono transition-colors"
              aria-label="Open reference panel"
            >
              info
            </button>
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
            <div className="flex flex-col gap-2 flex-1 min-h-0 min-w-0">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2 flex-1 min-h-0 min-w-0">
                <DashboardUPlotChart
                  rows={activityRows}
                  trades={parsed.trades}
                  sandbox={parsed.sandbox}
                  product={productObj.product}
                  label={`Order Book - ${productObj.product}`}
                  minHeight={240}
                  visibleLevels={visibleLevels}
                  visibleTrades={visibleTrades}
                  visibleOrders={visibleOrders}
                  normalizer={normalizer}
                  qtyFilter={{
                    min: qtyMin,
                    max: qtyMax === null ? Infinity : qtyMax,
                  }}
                  resetSignal={resetSignal}
                  onResetRequest={() => setResetSignal((n) => n + 1)}
                  onHoverTime={setHoveredTime}
                />

                <div className="h-full min-h-0 min-w-0 hidden lg:block">
                  <DashboardRightPanel
                    parsed={parsed}
                    selectedProduct={selectedProduct}
                    onSelectProduct={setSelectedProduct}
                    normalizer={normalizer}
                    onSelectNormalizer={setNormalizer}
                    visibleLevels={visibleLevels}
                    onToggleLevel={toggleLevel}
                    visibleTrades={visibleTrades}
                    onToggleTrade={toggleTrade}
                    visibleOrders={visibleOrders}
                    onToggleOrder={toggleOrder}
                    qtyMin={qtyMin}
                    qtyMax={qtyMax}
                    maxTradeQty={maxTradeQty}
                    onQtyMinChange={setQtyMin}
                    onQtyMaxChange={setQtyMax}
                    hoveredTime={hoveredTime}
                  />
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 flex-none min-w-0">
                <DashboardUPlotPanelChart
                  data={pnlData}
                  label={`Profit / Loss - ${productObj.product}`}
                  color="#a3e635"
                  valueLabel="pnl"
                  height={120}
                  formatValue={(v) => v.toFixed(0)}
                  resetSignal={resetSignal}
                />
                <DashboardUPlotPanelChart
                  data={positionData}
                  label={`Position - ${productObj.product}`}
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
      <DashboardInfoPanel open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}
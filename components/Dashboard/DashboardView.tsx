"use client";

import { useEffect, useMemo, useState } from "react";
import { ParsedLog, ActivityRow, Trade } from "@/lib/types";
import { computeSpreadSeries, SpreadType, computeVolumeSeries, VolumeType } from "@/lib/bookMath";
import DashboardUPlotChart from "@/components/Dashboard/DashboardUPlotChart";
import type { Normalizer, QtyFilter } from "@/components/Dashboard/DashboardUPlotChart";
import DashboardUPlotPanelChart from "@/components/Dashboard/DashboardUPlotPanelChart";
import DashboardRightPanel from "@/components/Dashboard/DashboardRightPanel";
import DashboardInfoPanel from "@/components/Dashboard/DashboardInfoPanel";

type Props = {
  active: boolean;
  parsed: ParsedLog | null;
  loading: boolean;
  selectedProduct: string | null;
  onSelectProduct: (p: string | null) => void;
  infoOpen: boolean;
  onInfoOpenChange: (v: boolean) => void;
  rightPanelCollapsed: boolean;
};

export type LevelKey = "bid1" | "bid2" | "bid3" | "ask1" | "ask2" | "ask3" | "mid";
export type TradeKey = "botMaker" | "botTaker" | "myBuy" | "mySell";
export type OrderKey = "myBids" | "myAsks";

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

export type PnlStats = {
  finalPnl: number;
  peakPnl: number;
  peakAt: number | null;
  maxDrawdown: number;
  drawdownAt: number | null;
  timeInDrawdownPct: number;
  calmar: number | null;
};

function computePnlStats(
  pnlData: { time: number; value: number }[]
): PnlStats {
  if (pnlData.length === 0) {
    return {
      finalPnl: 0,
      peakPnl: 0,
      peakAt: null,
      maxDrawdown: 0,
      drawdownAt: null,
      timeInDrawdownPct: 0,
      calmar: null,
    };
  }
  let peak = pnlData[0].value;
  let peakAt: number | null = pnlData[0].time;
  let maxDd = 0;
  let ddAt: number | null = null;
  let inDdCount = 0;
  for (const p of pnlData) {
    if (p.value > peak) {
      peak = p.value;
      peakAt = p.time;
    }
    const dd = peak - p.value;
    if (dd > maxDd) {
      maxDd = dd;
      ddAt = p.time;
    }
    if (p.value < peak) inDdCount++;
  }
  const finalPnl = pnlData[pnlData.length - 1].value;
  const calmar = maxDd > 0 ? finalPnl / maxDd : null;
  return {
    finalPnl,
    peakPnl: peak,
    peakAt,
    maxDrawdown: maxDd,
    drawdownAt: ddAt,
    timeInDrawdownPct: (inDdCount / pnlData.length) * 100,
    calmar,
  };
}

export default function DashboardView({
  active,
  parsed,
  loading,
  selectedProduct,
  onSelectProduct,
  infoOpen,
  onInfoOpenChange,
  rightPanelCollapsed,
}: Props) {
  const setSelectedProduct = onSelectProduct;
  const setInfoOpen = onInfoOpenChange;
  const [resetSignal, setResetSignal] = useState(0);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const [normalizer, setNormalizer] = useState<Normalizer>("none");
  const [spreadType, setSpreadType] = useState<SpreadType | "off">("off");
  const [volumeType, setVolumeType] = useState<VolumeType | "off">("off");
  const [visiblePanels, setVisiblePanels] = useState({
    pnl: true,
    position: true,
  });
  const [qtyMin, setQtyMin] = useState(0);
  const [qtyMax, setQtyMax] = useState<number | null>(null);
  const [visibleLevels, setVisibleLevels] = useState<Record<LevelKey, boolean>>({
    bid1: true,
    bid2: false,
    bid3: false,
    ask1: true,
    ask2: false,
    ask3: false,
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
      myBids: false,
      myAsks: false,
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
    if (!productObj) return { data: [], skipped: 0 };
    const badTs = new Set<number>();
    for (const r of activityRows) {
      if (r.midPrice === null || r.midPrice === 0) {
        badTs.add(r.timestamp);
      }
    }
    let skipped = 0;
    const data: { time: number; value: number }[] = [];
    for (const r of productObj.rows) {
      if (r.pnl === null || !Number.isFinite(r.pnl)) continue;
      if (badTs.has(r.timestamp)) {
        skipped++;
        continue;
      }
      data.push({ time: r.timestamp, value: r.pnl });
    }
    return { data, skipped };
  }, [productObj, activityRows]);

  const positionData = useMemo(() => {
    if (!parsed || !productObj) return [];
    return computePositions(parsed.trades, productObj.product);
  }, [parsed, productObj]);

  const pnlStats = useMemo(() => computePnlStats(pnlData.data), [pnlData]);

  const spreadData = useMemo(() => {
    if (spreadType === "off" || activityRows.length === 0) return [];
    return computeSpreadSeries(activityRows, spreadType);
  }, [activityRows, spreadType]);

  const volumeData = useMemo(() => {
    if (volumeType === "off" || !parsed || !productObj) return null;
    return computeVolumeSeries(
      activityRows,
      parsed.trades,
      productObj.product,
      volumeType
    );
  }, [activityRows, parsed, productObj, volumeType]);

  const volumeDualSplit = useMemo(() => {
    if (!volumeData || volumeData.kind !== "dual") return null;
    const bids: { time: number; value: number }[] = [];
    const asks: { time: number; value: number }[] = [];
    for (const d of volumeData.data) {
      bids.push({ time: d.time, value: d.bids });
      asks.push({ time: d.time, value: d.asks });
    }
    return { bids, asks };
  }, [volumeData]);

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
      className="min-h-[calc(100vh-44px)] overflow-x-hidden"
      style={{ display: active ? undefined : "none" }}
    >
      <div className="p-2 flex flex-col min-h-full min-w-0">
        {!parsed && !loading && (
          <p className="text-neutral-500 text-xs">No log loaded.</p>
        )}
        {!parsed && loading && (
          <p className="text-neutral-500 text-xs">Loading...</p>
        )}

        {parsed && productObj && (
          <div
            className={`grid grid-cols-1 gap-2 flex-1 min-w-0 ${
              rightPanelCollapsed
                ? ""
                : "lg:grid-cols-[minmax(0,6fr)_minmax(0,4fr)]"
            }`}
          >
            <div className="flex flex-col gap-2 min-w-0">
              <DashboardUPlotChart
                rows={activityRows}
                trades={parsed.trades}
                sandbox={parsed.sandbox}
                product={productObj.product}
                label={`Order Book - ${productObj.product}`}
                minHeight="min(500px, 50vh)"
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
                onXRangeChange={setZoomRange}
              />
              {visiblePanels.pnl && (
                <DashboardUPlotPanelChart
                  data={pnlData.data}
                  label={`Profit / Loss - ${productObj.product}`}
                  color="#a3e635"
                  valueLabel="pnl"
                  height={120}
                  formatValue={(v) => v.toFixed(0)}
                  resetSignal={resetSignal}
                />
              )}
              {visiblePanels.position && (
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
              )}
              {spreadType !== "off" && (
                <DashboardUPlotPanelChart
                  data={spreadData}
                  label={`Spread (${spreadLabel(spreadType)}) - ${productObj.product}`}
                  color="#f59e0b"
                  valueLabel="spread"
                  height={120}
                  formatValue={(v) => v.toFixed(2)}
                  resetSignal={resetSignal}
                />
              )}
              {volumeData !== null &&
                (volumeData.kind === "single" ? (
                  <DashboardUPlotPanelChart
                    data={volumeData.data}
                    label={`Volume (${volumeLabel(volumeType)}) - ${productObj.product}`}
                    color="#c084fc"
                    valueLabel={volumeLabel(volumeType)}
                    height={120}
                    fillArea
                    zeroLine={volumeType === "obi"}
                    formatValue={(v) =>
                      volumeType === "obi" ? v.toFixed(3) : v.toFixed(0)
                    }
                    resetSignal={resetSignal}
                  />
                ) : volumeDualSplit !== null ? (
                  <DashboardUPlotPanelChart
                    data={volumeDualSplit.bids}
                    data2={volumeDualSplit.asks}
                    label={`Volume (${volumeLabel(volumeType)}) - ${productObj.product}`}
                    color="#60a5fa"
                    color2="#ef4444"
                    valueLabel="bid"
                    valueLabel2="ask"
                    height={120}
                    fillArea
                    zeroLine
                    formatValue={(v) => Math.abs(v).toFixed(0)}
                    resetSignal={resetSignal}
                  />
                ) : null)}
            </div>

            {!rightPanelCollapsed && (
              <div className="h-full min-h-0 min-w-0 hidden lg:block">
                <DashboardRightPanel
                parsed={parsed}
                selectedProduct={selectedProduct}
                onSelectProduct={setSelectedProduct}
                normalizer={normalizer}
                onSelectNormalizer={setNormalizer}
                spreadType={spreadType}
                onSelectSpreadType={setSpreadType}
                volumeType={volumeType}
                onSelectVolumeType={setVolumeType}
                visibleLevels={visibleLevels}
                onToggleLevel={toggleLevel}
                visibleTrades={visibleTrades}
                onToggleTrade={toggleTrade}
                visibleOrders={visibleOrders}
                onToggleOrder={toggleOrder}
                visiblePanels={visiblePanels}
                onTogglePanel={(k) =>
                  setVisiblePanels((prev) => ({ ...prev, [k]: !prev[k] }))
                }
                qtyMin={qtyMin}
                qtyMax={qtyMax}
                maxTradeQty={maxTradeQty}
                onQtyMinChange={setQtyMin}
                onQtyMaxChange={setQtyMax}
                pnlStats={pnlStats}
                skippedPnlTicks={pnlData.skipped}
                hoveredTime={hoveredTime}
                zoomRange={zoomRange}
              />
              </div>
            )}
          </div>
        )}
      </div>
      <DashboardInfoPanel open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}

function spreadLabel(t: SpreadType): string {
  if (t === "absolute") return "abs";
  return "wall";
}

function volumeLabel(t: VolumeType | "off"): string {
  if (t === "obi") return "OBI";
  if (t === "totalDepth") return "total";
  if (t === "ownTrade") return "own";
  if (t === "signedDepth") return "signed";
  if (t === "topOfBook") return "top";
  return "off";
}
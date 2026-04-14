"use client";

import { useEffect, useMemo, useState } from "react";
import { parseLog } from "@/lib/parseLog";
import { ActivityRow } from "@/lib/types";
import { PLOT_TYPES } from "@/lib/plotTypes";
import SyncedLineChart from "@/components/SyncedLineChart";
import SyncedVolumeChart from "@/components/SyncedVolumeChart";
import SyncedPriceChart from "@/components/SyncedPriceChart";
import SyncedPositionChart from "@/components/SyncedPositionChart";
import MultiPnLChart from "@/components/MultiPnLChart";
import MultiPositionChart from "@/components/MultiPositionChart";
import MultiPriceChart from "@/components/MultiPriceChart";
import HistoricalView from "@/components/HistoricalView";
import DashboardView from "@/components/DashboardView";
import {
  ListingTable,
  PositionTable,
  ProfitLossTable,
  OrderDepthTable,
  OrderTable,
  TradeTable,
} from "@/components/tables";
import { useHighchartsSync } from "@/lib/useHighchartsSync";

const FIXED_PLOT_IDS = ["pnl", "position", "price", "volume"];

function MultiProductSelector({
  products,
  selected,
  onToggle,
}: {
  products: string[];
  selected: string[];
  onToggle: (p: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {products.map((p) => {
        const active = selected.includes(p);
        return (
          <button
            key={p}
            onClick={() => onToggle(p)}
            className={`border px-2 py-1 text-xs transition-colors ${
              active
                ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                : "border-neutral-600 bg-[#2a2d31] text-neutral-500 hover:text-neutral-200"
            }`}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [hoveredTs, setHoveredTs] = useState<number | null>(null);
  const [tab, setTab] = useState<"dashboard" | "logs" | "historical">(
    "dashboard"
  );
  useHighchartsSync((ts) => {
    if (ts !== null) setHoveredTs(ts);
  });

  const [logs, setLogs] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [rawLog, setRawLog] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [chartsProducts, setChartsProducts] = useState<string[]>([]);
  const [tablesProducts, setTablesProducts] = useState<string[]>([]);
  const [dashboardProduct, setDashboardProduct] = useState<string | null>(null);
  const [dashboardInfoOpen, setDashboardInfoOpen] = useState(false);

  const toggleChartsProduct = (p: string) => {
    setChartsProducts((prev) => {
      if (prev.includes(p)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== p);
      }
      return [...prev, p];
    });
  };

  const toggleTablesProduct = (p: string) => {
    setTablesProducts((prev) => {
      if (prev.includes(p)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== p);
      }
      return [...prev, p];
    });
  };

  const parsed = useMemo(() => (rawLog ? parseLog(rawLog) : null), [rawLog]);

  const activityRowsByProduct = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    if (!parsed) return map;
    for (const product of parsed.products) {
      map.set(
        product.product,
        parsed.activities.filter((r) => r.product === product.product)
      );
    }
    return map;
  }, [parsed]);

  const lineDataByKey = useMemo(() => {
    const map = new Map<string, { time: number; value: number }[]>();
    if (!parsed) return map;
    for (const product of parsed.products) {
      for (const plotType of PLOT_TYPES) {
        if (plotType.kind !== "line") continue;
        const key = `${product.product}:${plotType.id}`;
        const data = product.rows
          .map((r) => ({ time: r.timestamp, value: plotType.getValue(r) }))
          .filter(
            (d): d is { time: number; value: number } => d.value !== null
          );
        map.set(key, data);
      }
    }
    return map;
  }, [parsed]);

  useEffect(() => {
    if (!parsed || parsed.products.length === 0) return;
    const available = parsed.products.map((p) => p.product);
    setChartsProducts((prev) => {
      const stillValid = prev.filter((p) => available.includes(p));
      if (stillValid.length === 0) return [available[0]];
      return stillValid;
    });
    setTablesProducts((prev) => {
      const stillValid = prev.filter((p) => available.includes(p));
      if (stillValid.length === 0) return available.slice();
      return stillValid;
    });
  }, [parsed]);

  useEffect(() => {
    fetch("/api/logs")
      .then((r) => r.json())
      .then((files: string[]) => {
        setLogs(files);
        if (files.length > 0) setSelected(files[0]);
      })
      .catch((err) => console.error("Failed to load log list:", err));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    fetch(`/logs/${selected}`)
      .then((r) => r.text())
      .then((text) => {
        setRawLog(text);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load log:", err);
        setLoading(false);
      });
  }, [selected]);

  const [timeStr, setTimeStr] = useState<string>("");
  useEffect(() => {
    const update = () => setTimeStr(new Date().toISOString().slice(11, 19));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, []);
  const productList = parsed?.products.map((p) => p.product) ?? [];
  const isMulti = chartsProducts.length > 1;
  const chartsProductsKey = chartsProducts.join(",");
  const stableChartsProducts = useMemo(
    () => chartsProducts.slice(),
    [chartsProductsKey]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  );
  const selectedProductObjs = useMemo(
    () =>
      parsed?.products.filter((p) => chartsProducts.includes(p.product)) ?? [],
    [parsed, chartsProductsKey]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  );

  return (
    <main className="min-h-screen bg-[#2a2d31] text-neutral-200 font-sans text-sm">
      <header className="sticky top-0 z-10 border-b border-neutral-600 bg-[#2a2d31]">
        <div className="flex items-center gap-3 px-5 py-2 min-w-0">
          <span className="text-neutral-100 font-semibold text-[13px] flex-none">
            Prosperity 4
          </span>
          <span className="text-neutral-600 flex-none">|</span>
          <div className="flex items-center gap-1.5 flex-none">
            <button
              onClick={() => setTab("dashboard")}
              className={`border px-2 py-1 text-xs transition-colors ${
                tab === "dashboard"
                  ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                  : "border-neutral-600 bg-[#2a2d31] text-neutral-500 hover:text-neutral-200"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setTab("logs")}
              className={`border px-2 py-1 text-xs transition-colors ${
                tab === "logs"
                  ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                  : "border-neutral-600 bg-[#2a2d31] text-neutral-500 hover:text-neutral-200"
              }`}
            >
              Logs
            </button>
            <button
              onClick={() => setTab("historical")}
              className={`border px-2 py-1 text-xs transition-colors ${
                tab === "historical"
                  ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                  : "border-neutral-600 bg-[#2a2d31] text-neutral-500 hover:text-neutral-200"
              }`}
            >
              Historical
            </button>
          </div>
          {(tab === "logs" || tab === "dashboard") && (
            <>
              <span className="text-neutral-600 flex-none">|</span>
              <span className="text-neutral-400 text-xs flex-none">Log</span>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={logs.length === 0}
                className="border border-neutral-600 bg-[#2a2d31] text-neutral-200 px-2 py-1 text-xs focus:border-neutral-300 focus:outline-none disabled:text-neutral-600 flex-none max-w-[220px] truncate"
              >
                {logs.length === 0 ? (
                  <option>No logs</option>
                ) : (
                  logs.map((name) => (
                    <option key={name} value={name} className="bg-[#2a2d31]">
                      {name}
                    </option>
                  ))
                )}
              </select>
            </>
          )}
          {tab === "dashboard" && (
            <>
              <span className="text-neutral-600 flex-none">|</span>
              <span className="text-neutral-400 text-xs flex-none">Product</span>
              <select
                value={dashboardProduct ?? ""}
                onChange={(e) => setDashboardProduct(e.target.value)}
                disabled={!parsed || parsed.products.length === 0}
                className="border border-neutral-600 bg-[#2a2d31] text-neutral-200 px-2 py-1 text-xs focus:border-neutral-300 focus:outline-none disabled:text-neutral-600 flex-none"
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
                onClick={() => setDashboardInfoOpen(true)}
                className="border border-neutral-600 bg-[#2a2d31] text-neutral-300 hover:text-neutral-100 hover:border-neutral-400 px-2 py-1 text-xs font-mono transition-colors flex-none"
                aria-label="Open reference panel"
              >
                info
              </button>
            </>
          )}
          <div className="flex-1 min-w-0" />
          <div className="flex items-center gap-2 text-neutral-500 text-xs flex-none">
            <span>
              <span className={loading ? "text-neutral-300" : "text-neutral-100"}>
                {loading ? "Loading" : "Ready"}
              </span>
            </span>
            <span className="text-neutral-600">|</span>
            <span className="font-mono">{timeStr}Z</span>
          </div>
        </div>
      </header>

      <div
        className="flex h-[calc(100vh-44px)]"
        style={{ display: tab === "logs" ? undefined : "none" }}
      >
        <div className="w-1/2 overflow-auto border-r border-neutral-700 p-3">
          <div className="flex items-center justify-between border-b border-neutral-700 pb-1.5 mb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-neutral-100 font-semibold text-[13px]">
                Charts
              </h2>
              {selectedProductObjs.length > 0 && (
                <span className="text-neutral-500 text-xs">
                  {selectedProductObjs.length === 1
                    ? `${selectedProductObjs[0].rows.length} ticks`
                    : `${selectedProductObjs.length} products`}
                </span>
              )}
            </div>
            <MultiProductSelector
              products={productList}
              selected={chartsProducts}
              onToggle={toggleChartsProduct}
            />
          </div>
          {!parsed && !loading && (
            <p className="text-neutral-500 text-xs">No log loaded.</p>
          )}
          {parsed && !isMulti && selectedProductObjs.length === 1 && (() => {
            const chartsProductObj = selectedProductObjs[0];
            return (
              <div className="grid grid-cols-2 gap-3">
                {FIXED_PLOT_IDS.map((plotId) => {
                  const plotType = PLOT_TYPES.find((pt) => pt.id === plotId);
                  if (!plotType) return null;
                  const chartHeight = 260;
                  if (plotType.kind === "line") {
                    const data =
                      lineDataByKey.get(
                        `${chartsProductObj.product}:${plotType.id}`
                      ) ?? [];
                    return (
                      <SyncedLineChart
                        key={plotId}
                        data={data}
                        label={plotType.label}
                        color={plotType.color}
                        valueLabel={plotType.valueLabel}
                        height={chartHeight}
                      />
                    );
                  }
                  const activityRows =
                    activityRowsByProduct.get(chartsProductObj.product) ?? [];
                  if (plotType.kind === "price") {
                    return (
                      <SyncedPriceChart
                        key={plotId}
                        rows={activityRows}
                        trades={parsed.trades}
                        product={chartsProductObj.product}
                        label={plotType.label}
                        height={chartHeight}
                      />
                    );
                  }
                  if (plotType.kind === "position") {
                    return (
                      <SyncedPositionChart
                        key={plotId}
                        trades={parsed.trades}
                        product={chartsProductObj.product}
                        label={plotType.label}
                        height={chartHeight}
                      />
                    );
                  }
                  return (
                    <SyncedVolumeChart
                      key={plotId}
                      rows={activityRows}
                      label={plotType.label}
                      height={chartHeight}
                    />
                  );
                })}
              </div>
            );
          })()}
          {parsed && isMulti && (
            <div className="grid grid-cols-2 gap-3">
              <MultiPnLChart
                products={selectedProductObjs}
                label="Profit / Loss"
                height={260}
              />
              <MultiPositionChart
                trades={parsed.trades}
                products={stableChartsProducts}
                label="Position"
                height={260}
              />
              <div className="col-span-2">
                <MultiPriceChart
                  activitiesByProduct={activityRowsByProduct}
                  trades={parsed.trades}
                  products={stableChartsProducts}
                  label="Mid Price"
                  height={260}
                />
              </div>
            </div>
          )}
        </div>

        <div className="w-1/2 overflow-auto p-3">
          <div className="flex items-center justify-between border-b border-neutral-700 pb-1.5 mb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-neutral-100 font-semibold text-[13px]">
                Tables
              </h2>
              <span className="text-neutral-500 text-xs font-mono">
                ts {hoveredTs ?? "-"}
              </span>
            </div>
            <MultiProductSelector
              products={productList}
              selected={tablesProducts}
              onToggle={toggleTablesProduct}
            />
          </div>
          {parsed && tablesProducts.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <ListingTable
                  listings={parsed.listings}
                  filterProducts={tablesProducts}
                />
                <PositionTable
                  trades={parsed.trades}
                  upToTimestamp={hoveredTs}
                  filterProducts={tablesProducts}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ProfitLossTable
                  activities={parsed.activities}
                  timestamp={hoveredTs}
                  filterProducts={tablesProducts}
                />
                <OrderTable
                  sandbox={parsed.sandbox}
                  timestamp={hoveredTs}
                  filterProducts={tablesProducts}
                />
              </div>
              {tablesProducts.map((p) => (
                <OrderDepthTable
                  key={p}
                  activities={parsed.activities}
                  timestamp={hoveredTs}
                  product={p}
                />
              ))}
              <TradeTable
                trades={parsed.trades}
                timestamp={hoveredTs}
                filterProducts={tablesProducts}
              />
            </div>
          ) : (
            <p className="text-neutral-500 text-xs">
              No log loaded.
            </p>
          )}
        </div>
      </div>

      <DashboardView
        active={tab === "dashboard"}
        parsed={parsed}
        loading={loading}
        selectedProduct={dashboardProduct}
        onSelectProduct={setDashboardProduct}
        infoOpen={dashboardInfoOpen}
        onInfoOpenChange={setDashboardInfoOpen}
      />

      <HistoricalView active={tab === "historical"} />
    </main>
  );
}
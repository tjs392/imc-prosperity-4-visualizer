"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildHistoricalDay,
  mergeHistoricalDays,
  MergedHistorical,
} from "@/lib/parseHistorical";
import { HistoricalDay, ActivityRow, Trade } from "@/lib/types";
import {
  computeSpread,
  computeRollingVolatility,
  computeRollingZScore,
  computeGlobalZScore,
  computeDetrendedZScore,
  computePairSpread,
  computeProductMetrics,
  computePairMetrics,
  ProductMetrics,
  PairMetrics,
} from "@/lib/historicalMetrics";
import HistoricalLineChart from "@/components/Historical/HistoricalLineChart";
import HistoricalVolumeChart from "@/components/Historical/HistoricalVolumeChart";
import HistoricalPriceChart from "@/components/Historical/HistoricalPriceChart";
import HistoricalZScoreChart from "@/components/Historical/HistoricalZScoreChart";
import HistoricalPairSpreadChart from "@/components/Historical/HistoricalPairSpreadChart";
import HistoricalMetricsStrip from "@/components/Historical/HistoricalMetricsStrip";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import HistoricalRightPanel from "@/components/Historical/HistoricalRightPanel";

const ROLLING_WINDOW = 100;
const ALL_KEY = "__all__";

// Shared cursor + x-scale sync key for every time-axis chart on this page.
// All charts that pass this key will pan/zoom and crosshair together.
const HISTORICAL_SYNC_KEY = "historical";

type DaySelection = number | typeof ALL_KEY;

type ChartId =
  | "price"
  | "volume"
  | "spread"
  | "volatility"
  | "zscore"
  | "pairSpread";

const CHART_LABELS: Record<ChartId, string> = {
  price: "Price",
  volume: "Volume",
  spread: "Bid-Ask Spread",
  volatility: "Volatility",
  zscore: "Z-Scores",
  pairSpread: "Pair Spread",
};

const ALL_CHARTS: ChartId[] = [
  "price",
  "volume",
  "spread",
  "volatility",
  "zscore",
  "pairSpread",
];

const SINGLE_CHART_IDS: ChartId[] = [
  "price",
  "volume",
  "spread",
  "volatility",
  "zscore",
];

const PAIR_CHART_IDS: ChartId[] = ["pairSpread"];

const PAIR_CHARTS: Set<ChartId> = new Set(PAIR_CHART_IDS);

const DEFAULT_ENABLED: ChartId[] = ["price"];

const STORAGE_KEY = "historical_enabled_charts";

type Props = {
  active: boolean;
};

type LoadedData = {
  activities: ActivityRow[];
  trades: Trade[];
  products: string[];
  dayBoundaries: { day: number; start: number }[];
  label: string;
};

export default function HistoricalView({ active }: Props) {
  const [rounds, setRounds] = useState<number[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [selectedDay, setSelectedDay] = useState<DaySelection | null>(null);
  const [loadedData, setLoadedData] = useState<LoadedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [dayCache, setDayCache] = useState<Map<number, HistoricalDay>>(
    new Map()
  );
  const [mergedCache, setMergedCache] = useState<MergedHistorical | null>(null);
  const [enabledCharts, setEnabledCharts] =
    useState<ChartId[]>(DEFAULT_ENABLED);
  // Bumping this signal triggers every time-axis chart to reset its x-zoom
  // to the full data range (mirrors the dashboard's resetSignal pattern).
  const [resetSignal, setResetSignal] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [source, setSource] = useState<"historical" | "simulated">("historical");
  const [simDays, setSimDays] = useState<number[]>([]);
  const [refreshSignal, setRefreshSignal] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        const valid = parsed.filter((id): id is ChartId =>
          ALL_CHARTS.includes(id as ChartId)
        );
        if (valid.length > 0) setEnabledCharts(valid);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enabledCharts));
    } catch {
      // ignore
    }
  }, [enabledCharts]);

  useEffect(() => {
    fetch("/api/historical")
      .then((r) => r.json())
      .then((j: { rounds: number[] }) => {
        setRounds(j.rounds);
        if (j.rounds.length > 0) setSelectedRound(j.rounds[0]);
      })
      .catch((err) => console.error("rounds list failed:", err));
  }, []);

  useEffect(() => {
    if (selectedRound === null) return;
    setDayCache(new Map());
    setMergedCache(null);
    setLoadedData(null);
    setSelectedDay(null);
    setSimDays([]);

    const histReq = fetch(`/api/historical?round=${selectedRound}`).then((r) => r.json());
    const simReq =
      source === "simulated"
        ? fetch(`/api/historical?round=${selectedRound}&source=simulated`).then((r) => r.json())
        : Promise.resolve([] as number[]);

    Promise.all([histReq, simReq])
      .then(([histList, simList]: [number[], number[]]) => {
        const histSet = new Set(histList);
        const simOnly = simList.filter((d) => !histSet.has(d));
        const combined = [...histList, ...simOnly].sort((a, b) => a - b);
        setDays(combined);
        setSimDays(simOnly);
        if (combined.length > 0) {
          setSelectedDay(combined.length > 1 ? ALL_KEY : combined[0]);
        }
      })
      .catch((err) => console.error("days list failed:", err));
  }, [selectedRound, source]);

  useEffect(() => {
    if (refreshSignal === 0) return;
    if (selectedRound === null) return;
    if (source !== "simulated") {
      setSource("simulated");
      return;
    }

    fetch(`/api/historical?round=${selectedRound}&source=simulated`)
      .then((r) => r.json())
      .then((simList: number[]) => {
        setDayCache((prev) => {
          const next = new Map(prev);
          for (const d of simList) next.delete(d);
          return next;
        });
        setMergedCache(null);

        return fetch(`/api/historical?round=${selectedRound}`)
          .then((r) => r.json())
          .then((histList: number[]) => {
            const histSet = new Set(histList);
            const simOnly = simList.filter((d) => !histSet.has(d));
            const combined = [...histList, ...simOnly].sort((a, b) => a - b);
            setDays(combined);
            setSimDays(simOnly);
            setLoadedData(null);
            setSelectedDay((prev) => prev ?? (combined.length > 1 ? ALL_KEY : combined[0] ?? null));
          });
      })
      .catch((err) => console.error("refresh failed:", err));
  }, [refreshSignal, selectedRound, source]);

  const fetchSingleDay = async (day: number): Promise<HistoricalDay> => {
    const cached = dayCache.get(day);
    if (cached) return cached;
    const round = selectedRound;
    const isSim = simDays.includes(day);
    const baseDir = isSim
      ? `/simulation/round${round}/generated`
      : `/historical/round${round}`;
    const pricesUrl = `${baseDir}/prices_round_${round}_day_${day}.csv`;
    const tradesUrl = `${baseDir}/trades_round_${round}_day_${day}.csv`;
    const [pricesRaw, tradesRaw] = await Promise.all([
      fetch(pricesUrl).then((r) => r.text()),
      fetch(tradesUrl).then((r) => r.text()),
    ]);
    const built = buildHistoricalDay(day, pricesRaw, tradesRaw);
    setDayCache((prev) => {
      const next = new Map(prev);
      next.set(day, built);
      return next;
    });
    return built;
  };

  useEffect(() => {
    if (selectedDay === null) return;

    if (selectedDay === ALL_KEY) {
      if (mergedCache) {
        setLoadedData({
          activities: mergedCache.activities,
          trades: mergedCache.trades,
          products: mergedCache.products,
          dayBoundaries: mergedCache.dayBoundaries,
          label: "All",
        });
        return;
      }
      if (days.length === 0) return;
      setLoading(true);
      Promise.all(days.map((d) => fetchSingleDay(d)))
        .then((allDays) => {
          const merged = mergeHistoricalDays(allDays);
          setMergedCache(merged);
          setLoadedData({
            activities: merged.activities,
            trades: merged.trades,
            products: merged.products,
            dayBoundaries: merged.dayBoundaries,
            label: "All",
          });
          setLoading(false);
        })
        .catch((err) => {
          console.error("historical all load failed:", err);
          setLoading(false);
        });
      return;
    }

    const cached = dayCache.get(selectedDay);
    if (cached) {
      setLoadedData({
        activities: cached.activities,
        trades: cached.trades,
        products: cached.products,
        dayBoundaries: [{ day: cached.day, start: 0 }],
        label: String(cached.day),
      });
      return;
    }
    setLoading(true);
    fetchSingleDay(selectedDay)
      .then((built) => {
        setLoadedData({
          activities: built.activities,
          trades: built.trades,
          products: built.products,
          dayBoundaries: [{ day: built.day, start: 0 }],
          label: String(built.day),
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error("historical day load failed:", err);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, days, mergedCache]);

  // When the dataset changes, snap every chart back to its full range.
  useEffect(() => {
    if (!loadedData) return;
    setResetSignal((n) => n + 1);
  }, [loadedData]);

  useEffect(() => {
    if (!loadedData || loadedData.products.length === 0) return;
    setSelectedProducts((prev) => {
      const stillValid = prev.filter((p) => loadedData.products.includes(p));
      if (stillValid.length === 0) return loadedData.products.slice();
      return stillValid;
    });
  }, [loadedData]);

  const toggleChart = (id: ChartId) => {
    setEnabledCharts((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const rowsByProduct = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    if (!loadedData) return map;
    for (const p of loadedData.products) {
      map.set(
        p,
        loadedData.activities.filter((r) => r.product === p)
      );
    }
    return map;
  }, [loadedData]);

  const xPlotLines = useMemo(() => {
    if (!loadedData) return undefined;
    if (loadedData.dayBoundaries.length <= 1) return undefined;
    return loadedData.dayBoundaries.slice(1).map((b) => ({
      value: b.start,
      label: `day ${b.day}`,
    }));
  }, [loadedData]);

  const productMetrics = useMemo<ProductMetrics[]>(() => {
    return selectedProducts.map((p) =>
      computeProductMetrics(p, rowsByProduct.get(p) ?? [])
    );
  }, [selectedProducts, rowsByProduct]);

  const pairMetrics = useMemo<PairMetrics | null>(() => {
    if (selectedProducts.length < 2) return null;
    const [a, b] = selectedProducts;
    return computePairMetrics(
      a,
      b,
      rowsByProduct.get(a) ?? [],
      rowsByProduct.get(b) ?? []
    );
  }, [selectedProducts, rowsByProduct]);

  const pairSpreadData = useMemo(() => {
    if (selectedProducts.length < 2) return null;
    const [a, b] = selectedProducts;
    return computePairSpread(
      rowsByProduct.get(a) ?? [],
      rowsByProduct.get(b) ?? []
    );
  }, [selectedProducts, rowsByProduct]);

  const hasPair = selectedProducts.length >= 2;
  const primaryProduct = selectedProducts[0] ?? null;
  const primaryRows = primaryProduct
    ? rowsByProduct.get(primaryProduct) ?? []
    : [];

  const spreadByProduct = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeSpread>>();
    for (const p of selectedProducts) {
      m.set(p, computeSpread(rowsByProduct.get(p) ?? []));
    }
    return m;
  }, [selectedProducts, rowsByProduct]);

  const volByProduct = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeRollingVolatility>>();
    for (const p of selectedProducts) {
      m.set(
        p,
        computeRollingVolatility(rowsByProduct.get(p) ?? [], ROLLING_WINDOW)
      );
    }
    return m;
  }, [selectedProducts, rowsByProduct]);

  const rollingZByProduct = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeRollingZScore>>();
    for (const p of selectedProducts) {
      m.set(
        p,
        computeRollingZScore(rowsByProduct.get(p) ?? [], ROLLING_WINDOW)
      );
    }
    return m;
  }, [selectedProducts, rowsByProduct]);

  const globalZByProduct = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeGlobalZScore>>();
    for (const p of selectedProducts) {
      m.set(p, computeGlobalZScore(rowsByProduct.get(p) ?? []));
    }
    return m;
  }, [selectedProducts, rowsByProduct]);

  const detrendedZByProduct = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeDetrendedZScore>>();
    for (const p of selectedProducts) {
      m.set(p, computeDetrendedZScore(rowsByProduct.get(p) ?? []));
    }
    return m;
  }, [selectedProducts, rowsByProduct]);

  const isChartAvailable = (id: ChartId): boolean => {
    if (PAIR_CHARTS.has(id)) return hasPair;
    return true;
  };

  const visibleSingleCharts = enabledCharts.filter(
    (id) => SINGLE_CHART_IDS.includes(id) && isChartAvailable(id)
  );
  const visiblePairCharts = enabledCharts.filter(
    (id) => PAIR_CHART_IDS.includes(id) && isChartAvailable(id)
  );

  const displayLabel =
    selectedDay === ALL_KEY
      ? "All"
      : selectedDay !== null
      ? String(selectedDay)
      : "-";

  const tickLabel =
    loadedData && primaryProduct
      ? selectedDay === ALL_KEY
        ? `${loadedData.dayBoundaries.length} days · ${primaryRows.length} ticks`
        : `${primaryRows.length} ticks`
      : null;

  return (
    <div
      className="min-h-[calc(100vh-44px)]"
      style={{ display: active ? undefined : "none" }}
    >
      <div className="p-3">
        <div className="flex items-center justify-between border-b border-neutral-700 pb-1.5 mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-neutral-100 font-semibold text-[13px]">
              Historical
            </h2>
            <span className="text-neutral-500 text-xs">
              Day <span className="text-neutral-200">{displayLabel}</span>
            </span>
            {tickLabel && (
              <span className="text-neutral-500 text-xs">{tickLabel}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setResetSignal((n) => n + 1)}
              disabled={!loadedData}
              className="border border-neutral-600 bg-[#2a2d31] text-neutral-300 hover:text-neutral-100 px-2 py-1 text-[11px] disabled:text-neutral-600"
            >
              Reset zoom
            </button>
            <button
              onClick={() => setShowPanel((v) => !v)}
              className={`border px-2 py-1 text-[11px] ${
                showPanel
                  ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                  : "border-neutral-600 bg-[#2a2d31] text-neutral-300 hover:text-neutral-100"
              }`}
            >
              Tools
            </button>
            <span className="text-neutral-400 text-xs">Source</span>
            <div className="flex">
              <button
                onClick={() => setSource("historical")}
                className={`border px-2 py-1 text-[11px] ${
                  source === "historical"
                    ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                    : "border-neutral-600 bg-[#2a2d31] text-neutral-300 hover:text-neutral-100"
                }`}
              >
                Historical
              </button>
              <button
                onClick={() => setSource("simulated")}
                className={`border-t border-r border-b px-2 py-1 text-[11px] ${
                  source === "simulated"
                    ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                    : "border-neutral-600 bg-[#2a2d31] text-neutral-300 hover:text-neutral-100"
                }`}
              >
                Simulated
              </button>
            </div>
            <span className="text-neutral-400 text-xs">Round</span>
            <select
              value={selectedRound ?? ""}
              onChange={(e) => setSelectedRound(Number(e.target.value))}
              disabled={rounds.length === 0}
              className="border border-neutral-600 bg-[#2a2d31] text-neutral-200 px-2 py-1 text-xs focus:border-neutral-300 focus:outline-none disabled:text-neutral-600"
            >
              {rounds.length === 0 ? (
                <option>-</option>
              ) : (
                rounds.map((r) => (
                  <option key={r} value={r} className="bg-[#2a2d31]">
                    {r}
                  </option>
                ))
              )}
            </select>
            <span className="text-neutral-400 text-xs">Day</span>
            <select
              value={selectedDay ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === ALL_KEY) setSelectedDay(ALL_KEY);
                else setSelectedDay(Number(v));
              }}
              disabled={days.length === 0}
              className="border border-neutral-600 bg-[#2a2d31] text-neutral-200 px-2 py-1 text-xs focus:border-neutral-300 focus:outline-none disabled:text-neutral-600"
            >
              {days.length === 0 ? (
                <option>-</option>
              ) : (
                <>
                  {days.length > 1 && (
                    <option value={ALL_KEY} className="bg-[#2a2d31]">
                      All
                    </option>
                  )}
                  {days.map((d) => (
                    <option key={d} value={d} className="bg-[#2a2d31]">
                      {d}{simDays.includes(d) ? " (sim)" : ""}
                    </option>
                  ))}
                </>
              )}
            </select>
            <span className="text-neutral-600">|</span>
            {loadedData && loadedData.products.length > 0 && (
              <MultiSelectDropdown
                options={loadedData.products}
                selected={selectedProducts}
                onChange={setSelectedProducts}
                placeholder="Products"
              />
            )}
          </div>
        </div>

        {!loadedData && loading && (
          <p className="text-neutral-500 text-xs">Loading...</p>
        )}
        {!loadedData && !loading && rounds.length === 0 && (
          <p className="text-neutral-500 text-xs">
            No historical data found. Place files in public/historical/round1/, public/historical/round2/, etc.
          </p>
        )}
        {!loadedData && !loading && rounds.length > 0 && days.length === 0 && (
          <p className="text-neutral-500 text-xs">
            No CSV files found in public/historical/round{selectedRound}/.
          </p>
        )}

        {loadedData && selectedProducts.length > 0 && (
          <div
            className={
              showPanel
                ? "grid gap-3 grid-cols-1 lg:grid-cols-[minmax(0,6fr)_minmax(0,4fr)]"
                : ""
            }
          >
            <div className="min-w-0">
              <HistoricalMetricsStrip
              productMetrics={productMetrics}
              pairMetrics={pairMetrics}
            />

            <div className="flex items-center gap-2 flex-wrap mb-3 pb-2 border-b border-neutral-700">
              <span className="text-neutral-400 text-xs">Single</span>
              {SINGLE_CHART_IDS.map((id) => {
                const isOn = enabledCharts.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleChart(id)}
                    className={`border px-2 py-1 text-[11px] transition-colors ${
                      isOn
                        ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                        : "border-neutral-600 bg-[#2a2d31] text-neutral-500 hover:text-neutral-200"
                    }`}
                  >
                    {CHART_LABELS[id]}
                  </button>
                );
              })}
              {hasPair && (
                <>
                  <span className="text-neutral-600 mx-1">|</span>
                  <span className="text-neutral-400 text-xs">Pair</span>
                  {PAIR_CHART_IDS.map((id) => {
                    const isOn = enabledCharts.includes(id);
                    return (
                      <button
                        key={id}
                        onClick={() => toggleChart(id)}
                        className={`border px-2 py-1 text-[11px] transition-colors ${
                          isOn
                            ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                            : "border-neutral-600 bg-[#2a2d31] text-neutral-500 hover:text-neutral-200"
                        }`}
                      >
                        {CHART_LABELS[id]}
                      </button>
                    );
                  })}
                </>
              )}
            </div>

            <div
              className="grid gap-3 mb-3"
              style={{
                gridTemplateColumns: `repeat(${Math.min(
                  selectedProducts.length,
                  3
                )}, minmax(0, 1fr))`,
              }}
            >
              {visibleSingleCharts.flatMap((id) =>
                selectedProducts.map((p) => {
                  const rows = rowsByProduct.get(p) ?? [];
                  if (id === "price") {
                    return (
                      <HistoricalPriceChart
                        key={`${id}-${p}`}
                        rows={rows}
                        trades={loadedData.trades}
                        product={p}
                        label={`Price · ${p}`}
                        height={260}
                        xPlotLines={xPlotLines}
                        syncKey={HISTORICAL_SYNC_KEY}
                        resetSignal={resetSignal}
                      />
                    );
                  }
                  if (id === "volume") {
                    return (
                      <HistoricalVolumeChart
                        key={`${id}-${p}`}
                        rows={rows}
                        label={`Volume · ${p}`}
                        height={260}
                        xPlotLines={xPlotLines}
                        syncKey={HISTORICAL_SYNC_KEY}
                        resetSignal={resetSignal}
                      />
                    );
                  }
                  if (id === "spread") {
                    return (
                      <HistoricalLineChart
                        key={`${id}-${p}`}
                        data={spreadByProduct.get(p) ?? []}
                        label={`Bid-Ask Spread · ${p}`}
                        color="#60a5fa"
                        valueLabel="spread"
                        height={260}
                        xPlotLines={xPlotLines}
                        syncKey={HISTORICAL_SYNC_KEY}
                        resetSignal={resetSignal}
                      />
                    );
                  }
                  if (id === "volatility") {
                    return (
                      <HistoricalLineChart
                        key={`${id}-${p}`}
                        data={volByProduct.get(p) ?? []}
                        label={`Volatility (${ROLLING_WINDOW * 100}ts) · ${p}`}
                        color="#f97316"
                        valueLabel="stdev"
                        height={260}
                        formatValue={(v) => v.toFixed(5)}
                        xPlotLines={xPlotLines}
                        syncKey={HISTORICAL_SYNC_KEY}
                        resetSignal={resetSignal}
                      />
                    );
                  }
                  if (id === "zscore") {
                    return (
                      <HistoricalZScoreChart
                        key={`${id}-${p}`}
                        rolling={rollingZByProduct.get(p) ?? []}
                        global={globalZByProduct.get(p) ?? []}
                        detrended={detrendedZByProduct.get(p) ?? []}
                        label={`Z-Scores (${ROLLING_WINDOW * 100}ts) · ${p}`}
                        height={260}
                        xPlotLines={xPlotLines}
                        syncKey={HISTORICAL_SYNC_KEY}
                        resetSignal={resetSignal}
                      />
                    );
                  }
                  return null;
                })
              )}
            </div>

            {hasPair && visiblePairCharts.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {visiblePairCharts.map((id) => {
                  if (id === "pairSpread" && pairSpreadData) {
                    const [a, b] = selectedProducts;
                    return (
                      <HistoricalPairSpreadChart
                        key={id}
                        series={pairSpreadData.series}
                        mean={pairSpreadData.mean}
                        stdev={pairSpreadData.stdev}
                        label={`Pair Spread · ${a} - ${pairSpreadData.beta.toFixed(
                          3
                        )}·${b}`}
                        height={260}
                        xPlotLines={xPlotLines}
                        syncKey={HISTORICAL_SYNC_KEY}
                        resetSignal={resetSignal}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            )}
            </div>
            {showPanel && (
              <div className="min-w-0">
                <HistoricalRightPanel
                  round={selectedRound}
                  onClose={() => setShowPanel(false)}
                  onGenerated={() => setRefreshSignal((n) => n + 1)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
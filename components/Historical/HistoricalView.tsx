"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildHistoricalDay,
  mergeHistoricalDays,
  MergedHistorical,
} from "@/lib/parseHistorical";
import { HistoricalDay, ActivityRow, Trade } from "@/lib/types";
import HistoricalPriceChart from "@/components/Historical/HistoricalPriceChart";
import HistoricalLineChart from "@/components/Historical/HistoricalLineChart";
import HistoricalOptionsChart, { OptionsSeries } from "@/components/Historical/HistoricalOptionsChart";
import HistoricalBasketSignalChart, { SignalMarker } from "@/components/Historical/HistoricalBasketSignalChart";
import HistoricalSmileScatterChart, { SmilePoint, SmileFitOverlay } from "@/components/Historical/HistoricalSmileScatterChart";
import { bsCall, impliedVol, fitParabola, evalParabola, ParabolaFit } from "@/lib/optionsMath";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import HistoricalRightPanel from "@/components/Historical/HistoricalRightPanel";

const ALL_KEY = "__all__";

// Shared cursor + x-scale sync key for every time-axis chart on this page.
// All charts that pass this key will pan/zoom and crosshair together.
const HISTORICAL_SYNC_KEY = "historical";

type DaySelection = number | typeof ALL_KEY;

type ChartId = "price" | "basket" | "options";

const CHART_LABELS: Record<ChartId, string> = {
  price: "Price",
  basket: "ETF Basket",
  options: "Options",
};

const ALL_CHARTS: ChartId[] = ["price", "basket", "options"];

const SINGLE_CHART_IDS: ChartId[] = ["price"];

const GLOBAL_CHART_IDS: ChartId[] = ["basket", "options"];

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
  const [prosperity, setProsperity] = useState<"p3" | "p4">("p4");
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
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [qtyMin, setQtyMin] = useState<number>(0);
  const [qtyMax, setQtyMax] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const [historyDays, setHistoryDays] = useState<number | null>(null);
  const [totalHistDays, setTotalHistDays] = useState(0);
  const [basketWindow, setBasketWindow] = useState(200);
  const [basketThreshold, setBasketThreshold] = useState(50);
  const [optionsExtrinsicFloor, setOptionsExtrinsicFloor] = useState(0.5);
  const [optionsOverlaysOn, setOptionsOverlaysOn] = useState(true);
  const [optionsStrikesOn, setOptionsStrikesOn] = useState<Set<number>>(
    () => new Set([9500, 9750, 10000, 10250, 10500])
  );

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
    setDayCache(new Map());
    setMergedCache(null);
    setLoadedData(null);
    setSelectedDay(null);
    setSelectedRound(null);
    setDays([]);
    setSimDays([]);
    setSelectedProducts([]);
    setZoomRange(null);

    fetch(`/api/historical?prosperity=${prosperity}`)
      .then((r) => r.json())
      .then((j: { rounds: number[] }) => {
        setRounds(j.rounds);
        if (j.rounds.length > 0) setSelectedRound(j.rounds[0]);
      })
      .catch((err) => console.error("rounds list failed:", err));
  }, [prosperity]);

  useEffect(() => {
    if (selectedRound === null) return;
    setDayCache(new Map());
    setMergedCache(null);
    setLoadedData(null);
    setSelectedDay(null);
    setSimDays([]);

    const histReq = fetch(`/api/historical?round=${selectedRound}&prosperity=${prosperity}`).then((r) => r.json());
    const simReq =
      source === "simulated"
        ? fetch(`/api/historical?round=${selectedRound}&source=simulated&prosperity=${prosperity}`).then((r) => r.json())
        : Promise.resolve([] as number[]);

    Promise.all([histReq, simReq])
      .then(([histList, simList]: [number[], number[]]) => {
        const histSet = new Set(histList);
        const simOnly = simList.filter((d) => !histSet.has(d));
        setTotalHistDays(histList.length);
        // When in simulated mode with a historyDays limit, only include
        // the last N historical days before the first sim day.
        let filteredHist = histList;
        if (source === "simulated" && historyDays !== null && historyDays >= 0) {
          const sorted = [...histList].sort((a, b) => a - b);
          filteredHist = sorted.slice(-historyDays);
        }
        const combined = [...filteredHist, ...simOnly].sort((a, b) => a - b);
        setDays(combined);
        setSimDays(simOnly);
        if (combined.length > 0) {
          setSelectedDay(combined.length > 1 ? ALL_KEY : combined[0]);
        }
      })
      .catch((err) => console.error("days list failed:", err));
  }, [selectedRound, source, historyDays, prosperity]);

  useEffect(() => {
    if (refreshSignal === 0) return;
    if (selectedRound === null) return;
    if (source !== "simulated") {
      setSource("simulated");
      return;
    }

    fetch(`/api/historical?round=${selectedRound}&source=simulated&prosperity=${prosperity}`)
      .then((r) => r.json())
      .then((simList: number[]) => {
        setDayCache((prev) => {
          const next = new Map(prev);
          for (const d of simList) next.delete(d);
          return next;
        });
        setMergedCache(null);

        return fetch(`/api/historical?round=${selectedRound}&prosperity=${prosperity}`)
          .then((r) => r.json())
          .then((histList: number[]) => {
            const histSet = new Set(histList);
            const simOnly = simList.filter((d) => !histSet.has(d));
            let filteredHist = histList;
            if (historyDays !== null && historyDays >= 0) {
              const sorted = [...histList].sort((a, b) => a - b);
              filteredHist = sorted.slice(-historyDays);
            }
            const combined = [...filteredHist, ...simOnly].sort((a, b) => a - b);
            setDays(combined);
            setSimDays(simOnly);
            setLoadedData(null);
            setSelectedDay((prev) => prev ?? (combined.length > 1 ? ALL_KEY : combined[0] ?? null));
          });
      })
      .catch((err) => console.error("refresh failed:", err));
  }, [refreshSignal, selectedRound, source, historyDays, prosperity]);

  const fetchSingleDay = async (day: number): Promise<HistoricalDay> => {
    const cached = dayCache.get(day);
    if (cached) return cached;
    const round = selectedRound;
    const isSim = simDays.includes(day);
    const baseDir = isSim
      ? `/simulation/round${round}/generated`
      : `/historical/${prosperity}/round${round}`;
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

  const maxTradeQty = useMemo(() => {
    if (!loadedData) return 0;
    let m = 0;
    for (const t of loadedData.trades) {
      const a = Math.abs(t.quantity);
      if (a > m) m = a;
    }
    return m;
  }, [loadedData]);

  const qtyFilter = useMemo(
    () => ({ min: qtyMin, max: qtyMax === null ? Infinity : qtyMax }),
    [qtyMin, qtyMax]
  );

  const filteredTrades = useMemo(() => {
    if (!loadedData) return [];
    if (qtyMin === 0 && qtyMax === null) return loadedData.trades;
    const max = qtyMax === null ? Infinity : qtyMax;
    return loadedData.trades.filter((t) => {
      const a = Math.abs(t.quantity);
      return a >= qtyMin && a <= max;
    });
  }, [loadedData, qtyMin, qtyMax]);

  // Clear the zoom range whenever the loaded dataset changes or reset is
  // requested, so stats fall back to full-day until the user zooms again.
  useEffect(() => {
    setZoomRange(null);
  }, [loadedData, resetSignal]);

  const xPlotLines = useMemo(() => {
    if (!loadedData) return undefined;
    if (loadedData.dayBoundaries.length <= 1) return undefined;
    return loadedData.dayBoundaries.slice(1).map((b) => ({
      value: b.start,
      label: `day ${b.day}`,
    }));
  }, [loadedData]);

  const primaryProduct = selectedProducts[0] ?? null;
  const primaryRows = primaryProduct
    ? rowsByProduct.get(primaryProduct) ?? []
    : [];

  const basketData = useMemo(() => {
    if (!loadedData) return null;
    const byProdTs = new Map<string, Map<number, number>>();
    const needed = ["CROISSANTS", "JAMS", "DJEMBES", "PICNIC_BASKET1", "PICNIC_BASKET2"];
    for (const p of needed) byProdTs.set(p, new Map());
    for (const r of loadedData.activities) {
      const m = byProdTs.get(r.product);
      if (!m) continue;
      if (r.midPrice === null) continue;
      if (r.bidPrice1 === null || r.askPrice1 === null) continue;
      m.set(r.timestamp, r.midPrice);
    }
    const croissants = byProdTs.get("CROISSANTS")!;
    const jams = byProdTs.get("JAMS")!;
    const djembes = byProdTs.get("DJEMBES")!;
    const pb1 = byProdTs.get("PICNIC_BASKET1")!;
    const pb2 = byProdTs.get("PICNIC_BASKET2")!;

    const hasComponents = croissants.size > 0 && jams.size > 0;
    const hasPB1 = pb1.size > 0 && djembes.size > 0;
    const hasPB2 = pb2.size > 0;

    if (!hasComponents || (!hasPB1 && !hasPB2)) return null;

    const pb1Mid: { time: number; value: number }[] = [];
    const pb1Syn: { time: number; value: number }[] = [];
    const pb1Spread: { time: number; value: number }[] = [];
    if (hasPB1) {
      for (const [t, basket] of pb1) {
        const c = croissants.get(t);
        const j = jams.get(t);
        const d = djembes.get(t);
        if (c === undefined || j === undefined || d === undefined) continue;
        const syn = 6 * c + 3 * j + d;
        pb1Mid.push({ time: t, value: basket });
        pb1Syn.push({ time: t, value: syn });
        pb1Spread.push({ time: t, value: basket - syn });
      }
      pb1Mid.sort((a, b) => a.time - b.time);
      pb1Syn.sort((a, b) => a.time - b.time);
      pb1Spread.sort((a, b) => a.time - b.time);
    }

    const pb2Mid: { time: number; value: number }[] = [];
    const pb2Syn: { time: number; value: number }[] = [];
    const pb2Spread: { time: number; value: number }[] = [];
    if (hasPB2) {
      for (const [t, basket] of pb2) {
        const c = croissants.get(t);
        const j = jams.get(t);
        if (c === undefined || j === undefined) continue;
        const syn = 4 * c + 2 * j;
        pb2Mid.push({ time: t, value: basket });
        pb2Syn.push({ time: t, value: syn });
        pb2Spread.push({ time: t, value: basket - syn });
      }
      pb2Mid.sort((a, b) => a.time - b.time);
      pb2Syn.sort((a, b) => a.time - b.time);
      pb2Spread.sort((a, b) => a.time - b.time);
    }

    return {
      pb1: hasPB1 ? { mid: pb1Mid, syn: pb1Syn, spread: pb1Spread } : null,
      pb2: hasPB2 ? { mid: pb2Mid, syn: pb2Syn, spread: pb2Spread } : null,
    };
  }, [loadedData]);

  const basketSignals = useMemo(() => {
    if (!basketData) return null;
    const w = Math.max(2, Math.floor(basketWindow));
    const alpha = 2 / (w + 1);
    const t = Math.max(0, basketThreshold);

    const analyzeOne = (spread: { time: number; value: number }[]) => {
      if (spread.length === 0) {
        return {
          premium: [] as { time: number; value: number }[],
          signal: [] as { time: number; value: number }[],
          markers: [] as SignalMarker[],
          stats: { entries: 0, pnl: 0, avgHold: null as number | null, wins: 0, losses: 0 },
        };
      }
      const premium: { time: number; value: number }[] = [];
      const signal: { time: number; value: number }[] = [];
      let ema = spread[0].value;
      for (let i = 0; i < spread.length; i++) {
        const s = spread[i];
        if (i === 0) {
          ema = s.value;
        } else {
          ema = alpha * s.value + (1 - alpha) * ema;
        }
        premium.push({ time: s.time, value: ema });
        signal.push({ time: s.time, value: s.value - ema });
      }

      const markers: SignalMarker[] = [];
      type Pos = { dir: 1 | -1; entryTime: number; entrySpread: number; entryPremium: number };
      let pos: Pos | null = null;
      let totalPnl = 0;
      let totalHold = 0;
      let entries = 0;
      let wins = 0;
      let losses = 0;

      for (let i = 0; i < spread.length; i++) {
        const s = spread[i];
        const prem = premium[i].value;
        const sig = signal[i].value;

        if (pos === null) {
          if (sig < -t) {
            pos = { dir: 1, entryTime: s.time, entrySpread: s.value, entryPremium: prem };
            markers.push({ time: s.time, kind: "entryLong" });
            entries++;
          } else if (sig > t) {
            pos = { dir: -1, entryTime: s.time, entrySpread: s.value, entryPremium: prem };
            markers.push({ time: s.time, kind: "entryShort" });
            entries++;
          }
        } else {
          const crossedZero =
            (pos.dir === 1 && sig >= 0) || (pos.dir === -1 && sig <= 0);
          if (crossedZero) {
            const pnl = pos.dir === 1 ? s.value - pos.entrySpread : pos.entrySpread - s.value;
            totalPnl += pnl;
            totalHold += s.time - pos.entryTime;
            if (pnl > 0) wins++;
            else if (pnl < 0) losses++;
            markers.push({ time: s.time, kind: "exit" });
            pos = null;
          }
        }
      }

      const closed = wins + losses;
      const avgHold = closed > 0 ? totalHold / closed : null;

      return {
        premium,
        signal,
        markers,
        stats: { entries, pnl: totalPnl, avgHold, wins, losses },
      };
    };

    return {
      pb1: basketData.pb1 ? analyzeOne(basketData.pb1.spread) : null,
      pb2: basketData.pb2 ? analyzeOne(basketData.pb2.spread) : null,
    };
  }, [basketData, basketWindow, basketThreshold]);

  const optionsData = useMemo(() => {
    if (!loadedData) return null;
    const voucherRe = /^VOLCANIC_ROCK_VOUCHER_(\d+)$/;
    const strikes = new Map<string, number>();
    for (const p of loadedData.products) {
      const m = p.match(voucherRe);
      if (m) strikes.set(p, Number(m[1]));
    }
    if (strikes.size === 0) return null;
    const hasUnderlying = loadedData.products.includes("VOLCANIC_ROCK");
    const byProd = new Map<string, { time: number; value: number }[]>();
    for (const name of strikes.keys()) byProd.set(name, []);
    if (hasUnderlying) byProd.set("VOLCANIC_ROCK", []);
    for (const r of loadedData.activities) {
      const arr = byProd.get(r.product);
      if (!arr) continue;
      if (r.midPrice === null) continue;
      if (r.bidPrice1 === null || r.askPrice1 === null) continue;
      arr.push({ time: r.timestamp, value: r.midPrice });
    }
    for (const arr of byProd.values()) arr.sort((a, b) => a.time - b.time);

    const voucherColors = ["#60a5fa", "#22d3ee", "#a3e635", "#f59e0b", "#f87171"];
    const sortedStrikes = Array.from(strikes.entries()).sort((a, b) => a[1] - b[1]);
    const voucherSeries: OptionsSeries[] = sortedStrikes.map(([name, strike], i) => ({
      label: `V${strike}`,
      color: voucherColors[i % voucherColors.length],
      data: byProd.get(name) ?? [],
    }));

    const moneynessSeries: OptionsSeries[] = [];
    if (hasUnderlying) {
      const underMap = new Map<number, number>();
      for (const d of byProd.get("VOLCANIC_ROCK") ?? []) underMap.set(d.time, d.value);
      sortedStrikes.forEach(([, strike], i) => {
        const data: { time: number; value: number }[] = [];
        for (const [t, u] of underMap) data.push({ time: t, value: u - strike });
        data.sort((a, b) => a.time - b.time);
        moneynessSeries.push({
          label: `S-${strike}`,
          color: voucherColors[i % voucherColors.length],
          data,
        });
      });
    }

    return { voucherSeries, moneynessSeries, hasUnderlying };
  }, [loadedData]);

  const VOUCHER_STRIKE_COLORS: Record<number, string> = {
    9500: "#60a5fa",
    9750: "#22d3ee",
    10000: "#a3e635",
    10250: "#f59e0b",
    10500: "#f87171",
  };

  const optionsSignalData = useMemo(() => {
    if (!loadedData) return null;
    if (!optionsData) return null;
    if (!optionsData.hasUnderlying) return null;

    const voucherRe = /^VOLCANIC_ROCK_VOUCHER_(\d+)$/;
    const strikesByProduct = new Map<string, number>();
    for (const p of loadedData.products) {
      const m = p.match(voucherRe);
      if (m) strikesByProduct.set(p, Number(m[1]));
    }
    if (strikesByProduct.size === 0) return null;

    const round = selectedRound ?? 3;
    const tteAtStart = round === 3 ? 7.0 : round === 4 ? 3.0 : round === 5 ? 2.0 : 7.0;
    const TICKS_PER_DAY = 1_000_000;
    const tteDays = (ts: number): number => {
      const daysUsed = ts / TICKS_PER_DAY;
      return Math.max(tteAtStart - daysUsed, 0);
    };

    const computeWallBidAsk = (r: ActivityRow): { bid: number; ask: number } | null => {
      const bidPs = [r.bidPrice1, r.bidPrice2, r.bidPrice3];
      const bidVs = [r.bidVolume1, r.bidVolume2, r.bidVolume3];
      const askPs = [r.askPrice1, r.askPrice2, r.askPrice3];
      const askVs = [r.askVolume1, r.askVolume2, r.askVolume3];
      let bestBidP: number | null = null;
      let bestBidV = -1;
      for (let i = 0; i < 3; i++) {
        const p = bidPs[i];
        const v = bidVs[i];
        if (p === null || v === null) continue;
        if (v > bestBidV) {
          bestBidP = p;
          bestBidV = v;
        }
      }
      let bestAskP: number | null = null;
      let bestAskV = -1;
      for (let i = 0; i < 3; i++) {
        const p = askPs[i];
        const v = askVs[i];
        if (p === null || v === null) continue;
        if (v > bestAskV) {
          bestAskP = p;
          bestAskV = v;
        }
      }
      if (bestBidP === null || bestAskP === null) return null;
      return { bid: bestBidP, ask: bestAskP };
    };

    const byTsUnderlying = new Map<number, number>();
    const byTsVoucher = new Map<number, Map<number, { bid: number; ask: number; mid: number }>>();

    for (const r of loadedData.activities) {
      const wb = computeWallBidAsk(r);
      if (wb === null) continue;
      const wm = (wb.bid + wb.ask) / 2;
      if (r.product === "VOLCANIC_ROCK") {
        byTsUnderlying.set(r.timestamp, wm);
        continue;
      }
      const strike = strikesByProduct.get(r.product);
      if (strike === undefined) continue;
      let m = byTsVoucher.get(r.timestamp);
      if (!m) {
        m = new Map();
        byTsVoucher.set(r.timestamp, m);
      }
      m.set(strike, { bid: wb.bid, ask: wb.ask, mid: wm });
    }

    type Obs = {
      ts: number;
      strike: number;
      tte: number;
      S: number;
      voucherMid: number;
      voucherBid: number;
      voucherAsk: number;
      moneyness: number;
      iv: number;
    };
    const observations: Obs[] = [];
    const timestamps = Array.from(byTsUnderlying.keys()).sort((a, b) => a - b);
    for (const ts of timestamps) {
      const S = byTsUnderlying.get(ts);
      if (S === undefined || S <= 0) continue;
      const vMap = byTsVoucher.get(ts);
      if (!vMap) continue;
      const T = tteDays(ts);
      if (T <= 0) continue;
      for (const [strike, vq] of vMap.entries()) {
        const iv = impliedVol(vq.mid, S, strike, T, optionsExtrinsicFloor);
        if (iv === null) continue;
        observations.push({
          ts,
          strike,
          tte: T,
          S,
          voucherMid: vq.mid,
          voucherBid: vq.bid,
          voucherAsk: vq.ask,
          moneyness: Math.log(S / strike),
          iv,
        });
      }
    }

    const xs = observations.map((o) => o.moneyness);
    const ys = observations.map((o) => o.iv);
    const fit = fitParabola(xs, ys);
    if (!fit) {
      return {
        smilePoints: [] as SmilePoint[],
        smileFit: null,
        fitOverlay: null,
        ivResidualSeries: [] as OptionsSeries[],
        priceResidualSeries: [] as OptionsSeries[],
        marketVsFairByStrike: [] as {
          strike: number;
          bid: { time: number; value: number }[];
          ask: { time: number; value: number }[];
          fair: { time: number; value: number }[];
          bidNorm: { time: number; value: number }[];
          askNorm: { time: number; value: number }[];
        }[],
        observationCount: 0,
        fitCoefficients: null as ParabolaFit | null,
      };
    }

    const sortedStrikes = Array.from(new Set(observations.map((o) => o.strike))).sort((a, b) => a - b);
    const ivResidualByStrike = new Map<number, { time: number; value: number }[]>();
    const priceResidualByStrike = new Map<number, { time: number; value: number }[]>();
    const bidByStrike = new Map<number, { time: number; value: number }[]>();
    const askByStrike = new Map<number, { time: number; value: number }[]>();
    const fairByStrike = new Map<number, { time: number; value: number }[]>();
    const bidNormByStrike = new Map<number, { time: number; value: number }[]>();
    const askNormByStrike = new Map<number, { time: number; value: number }[]>();
    for (const K of sortedStrikes) {
      ivResidualByStrike.set(K, []);
      priceResidualByStrike.set(K, []);
      bidByStrike.set(K, []);
      askByStrike.set(K, []);
      fairByStrike.set(K, []);
      bidNormByStrike.set(K, []);
      askNormByStrike.set(K, []);
    }

    const smilePoints: SmilePoint[] = [];
    for (const o of observations) {
      const ivFit = evalParabola(fit, o.moneyness);
      const fairPrice = bsCall(o.S, o.strike, o.tte, ivFit);
      const ivResidual = o.iv - ivFit;
      const priceResidual = o.voucherMid - fairPrice;
      ivResidualByStrike.get(o.strike)!.push({ time: o.ts, value: ivResidual });
      priceResidualByStrike.get(o.strike)!.push({ time: o.ts, value: priceResidual });
      bidByStrike.get(o.strike)!.push({ time: o.ts, value: o.voucherBid });
      askByStrike.get(o.strike)!.push({ time: o.ts, value: o.voucherAsk });
      fairByStrike.get(o.strike)!.push({ time: o.ts, value: fairPrice });
      bidNormByStrike.get(o.strike)!.push({ time: o.ts, value: o.voucherBid - fairPrice });
      askNormByStrike.get(o.strike)!.push({ time: o.ts, value: o.voucherAsk - fairPrice });
      smilePoints.push({ moneyness: o.moneyness, iv: o.iv, strike: o.strike });
    }

    let minM = Infinity;
    let maxM = -Infinity;
    for (const p of smilePoints) {
      if (p.moneyness < minM) minM = p.moneyness;
      if (p.moneyness > maxM) maxM = p.moneyness;
    }
    let fitOverlay: SmileFitOverlay | null = null;
    if (isFinite(minM) && isFinite(maxM) && maxM > minM) {
      const N_OVERLAY = 200;
      const xsO: number[] = [];
      const ysO: number[] = [];
      const step = (maxM - minM) / (N_OVERLAY - 1);
      for (let i = 0; i < N_OVERLAY; i++) {
        const x = minM + step * i;
        xsO.push(x);
        ysO.push(evalParabola(fit, x));
      }
      fitOverlay = { xs: xsO, ys: ysO };
    }

    const ivResidualSeries: OptionsSeries[] = sortedStrikes.map((K) => ({
      label: `K=${K}`,
      color: VOUCHER_STRIKE_COLORS[K] ?? "#d4d4d4",
      data: ivResidualByStrike.get(K) ?? [],
    }));
    const priceResidualSeries: OptionsSeries[] = sortedStrikes.map((K) => ({
      label: `K=${K}`,
      color: VOUCHER_STRIKE_COLORS[K] ?? "#d4d4d4",
      data: priceResidualByStrike.get(K) ?? [],
    }));
    const marketVsFairByStrike = sortedStrikes.map((K) => ({
      strike: K,
      bid: bidByStrike.get(K) ?? [],
      ask: askByStrike.get(K) ?? [],
      fair: fairByStrike.get(K) ?? [],
      bidNorm: bidNormByStrike.get(K) ?? [],
      askNorm: askNormByStrike.get(K) ?? [],
    }));

    return {
      smilePoints,
      smileFit: fit,
      fitOverlay,
      ivResidualSeries,
      priceResidualSeries,
      marketVsFairByStrike,
      observationCount: observations.length,
      fitCoefficients: fit,
    };
  }, [loadedData, optionsData, optionsExtrinsicFloor, selectedRound]);

  const isChartAvailable = (id: ChartId): boolean => {
    if (id === "basket") return basketData !== null;
    if (id === "options") return optionsData !== null;
    return true;
  };

  const visibleSingleCharts = enabledCharts.filter(
    (id) => SINGLE_CHART_IDS.includes(id) && isChartAvailable(id)
  );
  const visibleGlobalCharts = enabledCharts.filter(
    (id) => GLOBAL_CHART_IDS.includes(id) && isChartAvailable(id)
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
            <span className="text-neutral-400 text-xs">Prosperity</span>
            <div className="flex">
              <button
                onClick={() => setProsperity("p3")}
                className={`border px-2 py-1 text-[11px] ${
                  prosperity === "p3"
                    ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                    : "border-neutral-600 bg-[#2a2d31] text-neutral-300 hover:text-neutral-100"
                }`}
              >
                P3
              </button>
              <button
                onClick={() => setProsperity("p4")}
                className={`border-t border-r border-b px-2 py-1 text-[11px] ${
                  prosperity === "p4"
                    ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                    : "border-neutral-600 bg-[#2a2d31] text-neutral-300 hover:text-neutral-100"
                }`}
              >
                P4
              </button>
            </div>
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
            {source === "simulated" && (
              <div className="flex items-center gap-1">
                <span className="text-neutral-500 text-[10px]">History</span>
                <select
                  value={historyDays === null ? "all" : String(historyDays)}
                  onChange={(e) => {
                    if (e.target.value === "all") {
                      setHistoryDays(null);
                    } else {
                      setHistoryDays(Number(e.target.value));
                    }
                  }}
                  className="border border-neutral-600 bg-[#2a2d31] text-neutral-200 px-1.5 py-1 text-[11px] focus:border-neutral-300 focus:outline-none"
                  title="Number of historical days to include before sim days"
                >
                  <option value="all" className="bg-[#2a2d31]">All ({totalHistDays})</option>
                  <option value="0" className="bg-[#2a2d31]">None (sim only)</option>
                  {Array.from({ length: totalHistDays }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={String(n)} className="bg-[#2a2d31]">
                      Last {n} day{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
            No historical data found. Place files in public/historical/{prosperity}/round1/, public/historical/{prosperity}/round2/, etc.
          </p>
        )}
        {!loadedData && !loading && rounds.length > 0 && days.length === 0 && (
          <p className="text-neutral-500 text-xs">
            No CSV files found in public/historical/{prosperity}/round{selectedRound}/.
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
              {GLOBAL_CHART_IDS.some((id) => isChartAvailable(id)) && (
                <>
                  <span className="text-neutral-600 mx-1">|</span>
                  <span className="text-neutral-400 text-xs">Global</span>
                  {GLOBAL_CHART_IDS.map((id) => {
                    if (!isChartAvailable(id)) return null;
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
                        onHoverTime={setHoveredTime}
                        qtyFilter={qtyFilter}
                        onXRangeChange={setZoomRange}
                      />
                    );
                  }
                  return null;
                })
              )}
            </div>

            {visibleGlobalCharts.includes("basket") && basketData && basketSignals && (
              <>
                <div className="mt-3 mb-2 flex items-center gap-3 text-[10px] text-neutral-500 font-mono border border-neutral-700/60 bg-[#22252a] px-2.5 py-1.5 flex-wrap">
                  <span className="text-neutral-300 font-semibold uppercase tracking-wider text-[9px]">
                    Compositions
                  </span>
                  <span>
                    <span className="text-neutral-300">PB1</span> = 6·CROISSANTS + 3·JAMS + 1·DJEMBE
                  </span>
                  <span className="text-neutral-700">|</span>
                  <span>
                    <span className="text-neutral-300">PB2</span> = 4·CROISSANTS + 2·JAMS
                  </span>
                  <span className="text-neutral-700">|</span>
                  <span className="text-neutral-600">P3 weights</span>
                  <span className="text-neutral-700 mx-1">||</span>
                  <label className="flex items-center gap-1.5">
                    <span className="text-neutral-400">EMA window</span>
                    <input
                      type="number"
                      value={basketWindow}
                      min={2}
                      step={10}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= 2) setBasketWindow(v);
                      }}
                      className="w-16 border border-neutral-600 bg-[#1f2125] text-neutral-200 px-1.5 py-0.5 text-[10px] focus:border-neutral-300 focus:outline-none"
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className="text-neutral-400">Threshold</span>
                    <input
                      type="number"
                      value={basketThreshold}
                      min={0}
                      step={5}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= 0) setBasketThreshold(v);
                      }}
                      className="w-14 border border-neutral-600 bg-[#1f2125] text-neutral-200 px-1.5 py-0.5 text-[10px] focus:border-neutral-300 focus:outline-none"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {basketData.pb1 && (
                    <HistoricalLineChart
                      data={basketData.pb1.mid}
                      data2={basketData.pb1.syn}
                      label="PB1 · basket vs synthetic (6C+3J+1D)"
                      color="#a3e635"
                      color2="#22d3ee"
                      valueLabel="basket"
                      valueLabel2="synth"
                      height={220}
                      xPlotLines={xPlotLines}
                      syncKey={HISTORICAL_SYNC_KEY}
                      resetSignal={resetSignal}
                    />
                  )}
                  {basketData.pb2 && (
                    <HistoricalLineChart
                      data={basketData.pb2.mid}
                      data2={basketData.pb2.syn}
                      label="PB2 · basket vs synthetic (4C+2J)"
                      color="#a3e635"
                      color2="#22d3ee"
                      valueLabel="basket"
                      valueLabel2="synth"
                      height={220}
                      xPlotLines={xPlotLines}
                      syncKey={HISTORICAL_SYNC_KEY}
                      resetSignal={resetSignal}
                    />
                  )}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
                  {basketData.pb1 && basketSignals.pb1 && (
                    <div>
                      <BasketStatsStrip label="PB1" stats={basketSignals.pb1.stats} />
                      <HistoricalBasketSignalChart
                        spread={basketData.pb1.spread}
                        premium={basketSignals.pb1.premium}
                        signal={basketSignals.pb1.signal}
                        threshold={basketThreshold}
                        markers={basketSignals.pb1.markers}
                        label={`PB1 · spread + premium(EMA${basketWindow}) + signal · T=±${basketThreshold}`}
                        height={280}
                        xPlotLines={xPlotLines}
                        syncKey={HISTORICAL_SYNC_KEY}
                        resetSignal={resetSignal}
                      />
                    </div>
                  )}
                  {basketData.pb2 && basketSignals.pb2 && (
                    <div>
                      <BasketStatsStrip label="PB2" stats={basketSignals.pb2.stats} />
                      <HistoricalBasketSignalChart
                        spread={basketData.pb2.spread}
                        premium={basketSignals.pb2.premium}
                        signal={basketSignals.pb2.signal}
                        threshold={basketThreshold}
                        markers={basketSignals.pb2.markers}
                        label={`PB2 · spread + premium(EMA${basketWindow}) + signal · T=±${basketThreshold}`}
                        height={280}
                        xPlotLines={xPlotLines}
                        syncKey={HISTORICAL_SYNC_KEY}
                        resetSignal={resetSignal}
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {visibleGlobalCharts.includes("options") && optionsData && optionsSignalData && (
              <>
                <div className="mt-3 mb-2 flex items-center gap-3 text-[10px] text-neutral-500 font-mono border border-neutral-700/60 bg-[#22252a] px-2.5 py-1.5 flex-wrap">
                  <span className="text-neutral-300 font-semibold uppercase tracking-wider text-[9px]">
                    Options
                  </span>
                  <span>
                    vouchers = <span className="text-neutral-300">VOLCANIC_ROCK_VOUCHER_{"{K}"}</span>
                  </span>
                  <span className="text-neutral-700">|</span>
                  <span>
                    strikes: <span className="text-neutral-300">9500 / 9750 / 10000 / 10250 / 10500</span>
                  </span>
                  {optionsSignalData.fitCoefficients && (
                    <>
                      <span className="text-neutral-700">|</span>
                      <span>
                        fit:{" "}
                        <span className="text-neutral-300">
                          {optionsSignalData.fitCoefficients.a.toFixed(3)}·m² +{" "}
                          {optionsSignalData.fitCoefficients.b.toFixed(4)}·m +{" "}
                          {optionsSignalData.fitCoefficients.c.toFixed(4)}
                        </span>
                      </span>
                      <span className="text-neutral-700">|</span>
                      <span>
                        n = <span className="text-neutral-300">{optionsSignalData.observationCount.toLocaleString()}</span>
                      </span>
                    </>
                  )}
                  <span className="text-neutral-700 mx-1">||</span>
                  <label className="flex items-center gap-1.5">
                    <span className="text-neutral-400">Extrinsic floor</span>
                    <input
                      type="number"
                      value={optionsExtrinsicFloor}
                      min={0}
                      step={0.1}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= 0) setOptionsExtrinsicFloor(v);
                      }}
                      className="w-16 border border-neutral-600 bg-[#1f2125] text-neutral-200 px-1.5 py-0.5 text-[10px] focus:border-neutral-300 focus:outline-none"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2 flex-wrap mb-3 pb-2 border-b border-neutral-700">
                  <span className="text-neutral-400 text-xs">Show</span>
                  <button
                    onClick={() => setOptionsOverlaysOn((v) => !v)}
                    className={`border px-2 py-1 text-[11px] transition-colors ${
                      optionsOverlaysOn
                        ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                        : "border-neutral-600 bg-[#2a2d31] text-neutral-500 hover:text-neutral-200"
                    }`}
                  >
                    Overlays
                  </button>
                  <span className="text-neutral-600 mx-1">|</span>
                  {[9500, 9750, 10000, 10250, 10500].map((K) => {
                    const isOn = optionsStrikesOn.has(K);
                    return (
                      <button
                        key={K}
                        onClick={() =>
                          setOptionsStrikesOn((prev) => {
                            const next = new Set(prev);
                            if (next.has(K)) next.delete(K);
                            else next.add(K);
                            return next;
                          })
                        }
                        className={`border px-2 py-1 text-[11px] transition-colors ${
                          isOn
                            ? "border-neutral-300 bg-neutral-700 text-neutral-100"
                            : "border-neutral-600 bg-[#2a2d31] text-neutral-500 hover:text-neutral-200"
                        }`}
                        style={isOn ? { color: VOUCHER_STRIKE_COLORS[K] } : {}}
                      >
                        K={K}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {optionsOverlaysOn && (
                    <>
                      <HistoricalSmileScatterChart
                        points={optionsSignalData.smilePoints}
                        fit={optionsSignalData.fitOverlay}
                        strikeColors={VOUCHER_STRIKE_COLORS}
                        label="Volatility smile · IV vs log-moneyness (wall-mid)"
                        height={300}
                        fitLabel="parabola fit"
                      />
                      {optionsSignalData.ivResidualSeries.length > 0 && (
                        <HistoricalOptionsChart
                          series={optionsSignalData.ivResidualSeries}
                          label="IV residuals · observed IV − fit (v − v̂)"
                          height={220}
                          xPlotLines={xPlotLines}
                          syncKey={HISTORICAL_SYNC_KEY}
                          resetSignal={resetSignal}
                          formatValue={(v) => v.toFixed(5)}
                        />
                      )}
                      {optionsSignalData.priceResidualSeries.length > 0 && (
                        <HistoricalOptionsChart
                          series={optionsSignalData.priceResidualSeries}
                          label="Price residuals · market − BS(v̂) [SeaShells]"
                          height={220}
                          xPlotLines={xPlotLines}
                          syncKey={HISTORICAL_SYNC_KEY}
                          resetSignal={resetSignal}
                          formatValue={(v) => v.toFixed(2)}
                        />
                      )}
                    </>
                  )}
                  {optionsSignalData.marketVsFairByStrike
                    .filter((entry) => optionsStrikesOn.has(entry.strike))
                    .map((entry) => {
                    const rawSeries: OptionsSeries[] = [
                      { label: "bid", color: "#4ade80", data: entry.bid },
                      { label: "ask", color: "#f87171", data: entry.ask },
                      { label: "fair", color: "#f97316", data: entry.fair },
                    ];
                    const normSeries: OptionsSeries[] = [
                      { label: "bid − fair", color: "#4ade80", data: entry.bidNorm },
                      { label: "ask − fair", color: "#f87171", data: entry.askNorm },
                    ];
                    return (
                      <div key={`voucher-${entry.strike}`} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <HistoricalOptionsChart
                          series={rawSeries}
                          label={`K=${entry.strike} · wall-bid / wall-ask / BS-fair`}
                          height={220}
                          xPlotLines={xPlotLines}
                          syncKey={HISTORICAL_SYNC_KEY}
                          resetSignal={resetSignal}
                        />
                        <HistoricalOptionsChart
                          series={normSeries}
                          label={`K=${entry.strike} · normalized (bid/ask minus fair, fair = 0)`}
                          height={220}
                          xPlotLines={xPlotLines}
                          syncKey={HISTORICAL_SYNC_KEY}
                          resetSignal={resetSignal}
                          formatValue={(v) => v.toFixed(2)}
                          zeroLineColor="#f97316"
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            </div>
            {showPanel && (
              <div className="min-w-0">
                <HistoricalRightPanel
                  round={selectedRound}
                  onClose={() => setShowPanel(false)}
                  onGenerated={() => setRefreshSignal((n) => n + 1)}
                  activities={loadedData?.activities ?? []}
                  trades={filteredTrades}
                  allTrades={loadedData?.trades ?? []}
                  hoveredTime={hoveredTime}
                  selectedProduct={selectedProducts[0] ?? null}
                  qtyMin={qtyMin}
                  qtyMax={qtyMax}
                  maxTradeQty={maxTradeQty}
                  onQtyMinChange={setQtyMin}
                  onQtyMaxChange={setQtyMax}
                  zoomRange={zoomRange}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
type BasketStats = {
  entries: number;
  pnl: number;
  avgHold: number | null;
  wins: number;
  losses: number;
};

function BasketStatsStrip({ label, stats }: { label: string; stats: BasketStats }) {
  const pnlColor =
    stats.pnl > 0 ? "#4ade80" : stats.pnl < 0 ? "#f87171" : "#d4d4d4";
  const closed = stats.wins + stats.losses;
  const winRate = closed > 0 ? (stats.wins / closed) * 100 : null;
  return (
    <div className="flex items-center gap-4 px-2.5 py-1 text-[10px] font-mono text-neutral-400 border border-neutral-700/60 border-b-0 bg-[#2a2d31]">
      <span className="text-neutral-200 font-semibold text-[11px]">{label}</span>
      <span>
        Entries <span className="text-neutral-200">{stats.entries}</span>
      </span>
      <span>
        Closed <span className="text-neutral-200">{closed}</span>
      </span>
      <span>
        Wins <span className="text-neutral-200">{stats.wins}</span>
      </span>
      <span>
        Losses <span className="text-neutral-200">{stats.losses}</span>
      </span>
      <span>
        Win rate{" "}
        <span className="text-neutral-200">
          {winRate === null ? "-" : `${winRate.toFixed(0)}%`}
        </span>
      </span>
      <span>
        Avg hold{" "}
        <span className="text-neutral-200">
          {stats.avgHold === null ? "-" : `${Math.round(stats.avgHold)}ts`}
        </span>
      </span>
      <span className="ml-auto">
        Sim PnL{" "}
        <span style={{ color: pnlColor }}>
          {stats.pnl > 0 ? "+" : ""}
          {stats.pnl.toFixed(1)}
        </span>
      </span>
    </div>
  );
}
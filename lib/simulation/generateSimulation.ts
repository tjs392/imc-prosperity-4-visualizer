import { ActivityRow, Trade } from "@/lib/types";
import {
  FeatureSet,
  ProductFeatures,
  LevelProfile,
  SimMode,
} from "@/lib/simulation/extractFeatures";

/** A single trend segment within a day. */
export type TrendSegment = {
  /** Timestamp (within the day) where this segment starts. */
  startTs: number;
  /** Slope multiplier relative to the base slope from extraction. */
  slopeMultiplier: number;
  /** Noise multiplier (1 = normal). */
  noiseMultiplier?: number;
  /** Additive level shift applied in this segment. */
  levelShift?: number;
};

/** Per-day configuration for a single product. */
export type DayConfig = {
  /** Ordered list of segments. First segment's startTs should be 0. */
  segments: TrendSegment[];
};

export type ProductModeConfig = {
  mode: SimMode;
  smoothing?: number;
  /** Per-day configs. Index 0 = first generated day, index 1 = second (if 2-day). */
  days?: DayConfig[];
  /** Legacy single-day overrides (used if `days` is not provided). */
  overrides?: {
    slopeMultiplier?: number;
    noiseMultiplier?: number;
    levelShift?: number;
    applyAfterTimestamp?: number | null;
  };
};

export type GeneratorParams = {
  durationTimestamps: number;
  step: number;
  seed?: number;
  startDay: number;
  /** Number of days to generate (1 or 2). Default 1. */
  numDays?: number;
  productModes?: Record<string, ProductModeConfig>;
};

export type GeneratorOutput = {
  activities: ActivityRow[];
  trades: Trade[];
};

export const DEFAULT_SMOOTHING = 0.05;

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function sampleFrom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function poissonSample(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) {
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gaussian(rng)));
  }
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

function generateLevelOrNull(
  lp: LevelProfile,
  midPrice: number,
  side: "bid" | "ask",
  rng: () => number
): { price: number | null; volume: number | null } {
  if (lp.offsetSamples.length === 0 || rng() >= lp.presenceRate) {
    return { price: null, volume: null };
  }
  const offset = sampleFrom(lp.offsetSamples, rng);
  const volume = sampleFrom(lp.volumeSamples, rng);
  const price =
    side === "bid"
      ? Math.round(midPrice - Math.abs(offset))
      : Math.round(midPrice + Math.abs(offset));
  return { price, volume: Math.max(1, Math.round(volume)) };
}

/**
 * Resolve the active segment at a given within-day timestamp.
 * Segments are sorted by startTs. We pick the last one whose startTs <= ts.
 */
function activeSegment(segments: TrendSegment[], ts: number): TrendSegment {
  let active = segments[0];
  for (const seg of segments) {
    if (seg.startTs <= ts) active = seg;
    else break;
  }
  return active;
}

/** Convert legacy single-override format to a single-segment DayConfig. */
function legacyToDayConfig(overrides?: ProductModeConfig["overrides"]): DayConfig {
  if (!overrides) {
    return { segments: [{ startTs: 0, slopeMultiplier: 1 }] };
  }
  if (overrides.applyAfterTimestamp !== null && overrides.applyAfterTimestamp !== undefined) {
    // Two segments: normal until the kick-in, then overrides after
    return {
      segments: [
        { startTs: 0, slopeMultiplier: 1, noiseMultiplier: 1, levelShift: 0 },
        {
          startTs: overrides.applyAfterTimestamp,
          slopeMultiplier: overrides.slopeMultiplier ?? 1,
          noiseMultiplier: overrides.noiseMultiplier ?? 1,
          levelShift: overrides.levelShift ?? 0,
        },
      ],
    };
  }
  return {
    segments: [{
      startTs: 0,
      slopeMultiplier: overrides.slopeMultiplier ?? 1,
      noiseMultiplier: overrides.noiseMultiplier ?? 1,
      levelShift: overrides.levelShift ?? 0,
    }],
  };
}

function generateProductDay(
  pf: ProductFeatures,
  mode: SimMode,
  smoothing: number,
  dayConfig: DayConfig,
  durationTimestamps: number,
  step: number,
  dayNumber: number,
  startMid: number,
  startTrendValue: number,
  rng: () => number
): { output: GeneratorOutput; endMid: number; endTrendValue: number } {
  const activities: ActivityRow[] = [];
  const trades: Trade[] = [];

  const numSnapshots = Math.floor(durationTimestamps / step);
  const tradeRatePerStep = pf.trades.perTimestepRate;
  const alpha = Math.max(0.001, Math.min(1, smoothing));
  const baseSlope = pf.mid.slopePerStep;

  // Sort segments by startTs
  const segments = [...dayConfig.segments].sort((a, b) => a.startTs - b.startTs);
  if (segments.length === 0) {
    segments.push({ startTs: 0, slopeMultiplier: 1 });
  }

  let trendValue = startTrendValue;
  let smoothedNoise = 0;
  let mid = startMid;

  for (let i = 0; i < numSnapshots; i++) {
    const withinDayTs = i * step;
    const seg = activeSegment(segments, withinDayTs);

    const effectiveSlopeMult = seg.slopeMultiplier;
    const effectiveNoiseMult = seg.noiseMultiplier ?? 1;
    const effectiveLevelShift = seg.levelShift ?? 0;

    if (mode === "linearTrend") {
      trendValue = trendValue + baseSlope * effectiveSlopeMult;
    } else {
      trendValue = pf.mid.fairPrice;
    }

    const noiseStd =
      (mode === "linearTrend" ? pf.mid.trendNoiseStd : pf.mid.noiseStd) * effectiveNoiseMult;
    const newNoise = noiseStd * gaussian(rng);
    smoothedNoise = (1 - alpha) * smoothedNoise + alpha * newNoise;

    mid = trendValue + smoothedNoise + effectiveLevelShift;
    const midRounded = Math.round(mid * 2) / 2;

    const bid1 = generateLevelOrNull(pf.book.bid[0], midRounded, "bid", rng);
    const bid2 = generateLevelOrNull(pf.book.bid[1], midRounded, "bid", rng);
    const bid3 = generateLevelOrNull(pf.book.bid[2], midRounded, "bid", rng);
    const ask1 = generateLevelOrNull(pf.book.ask[0], midRounded, "ask", rng);
    const ask2 = generateLevelOrNull(pf.book.ask[1], midRounded, "ask", rng);
    const ask3 = generateLevelOrNull(pf.book.ask[2], midRounded, "ask", rng);

    if (bid1.price !== null && ask1.price !== null && ask1.price <= bid1.price) {
      ask1.price = bid1.price + 1;
    }

    activities.push({
      timestamp: withinDayTs,
      product: pf.product,
      day: dayNumber,
      bidPrice1: bid1.price,
      bidVolume1: bid1.volume,
      bidPrice2: bid2.price,
      bidVolume2: bid2.volume,
      bidPrice3: bid3.price,
      bidVolume3: bid3.volume,
      askPrice1: ask1.price,
      askVolume1: ask1.volume,
      askPrice2: ask2.price,
      askVolume2: ask2.volume,
      askPrice3: ask3.price,
      askVolume3: ask3.volume,
      midPrice: midRounded,
      pnl: 0,
    });

    const numTrades = poissonSample(tradeRatePerStep, rng);
    for (let j = 0; j < numTrades; j++) {
      if (pf.trades.sizeSamples.length === 0) break;
      const size = Math.max(1, Math.round(sampleFrom(pf.trades.sizeSamples, rng)));
      const r = rng();
      let price: number;
      if (r < pf.trades.buyAggressorRate && ask1.price !== null) {
        price = ask1.price;
      } else if (
        r < pf.trades.buyAggressorRate + pf.trades.sellAggressorRate &&
        bid1.price !== null
      ) {
        price = bid1.price;
      } else if (bid1.price !== null && ask1.price !== null) {
        price = Math.round((bid1.price + ask1.price) / 2);
      } else {
        price = Math.round(midRounded);
      }
      trades.push({
        timestamp: withinDayTs,
        buyer: "",
        seller: "",
        symbol: pf.product,
        currency: "XIRECS",
        price,
        quantity: size,
      });
    }
  }

  return {
    output: { activities, trades },
    endMid: mid,
    endTrendValue: trendValue,
  };
}

export type MultiDayOutput = {
  days: { day: number; activities: ActivityRow[]; trades: Trade[] }[];
  allActivities: ActivityRow[];
  allTrades: Trade[];
};

export function generateDay(
  features: FeatureSet,
  params: GeneratorParams
): MultiDayOutput {
  const rng = makeRng(params.seed ?? Date.now());
  const numDays = Math.max(1, Math.min(2, params.numDays ?? 1));
  const perDay = new Map<number, { activities: ActivityRow[]; trades: Trade[] }>();

  for (const product of Object.keys(features.products)) {
    const pf = features.products[product];
    const cfg = params.productModes?.[product];
    const mode = cfg?.mode ?? pf.mid.suggestedMode;
    const smoothing = cfg?.smoothing ?? DEFAULT_SMOOTHING;

    // Resolve per-day configs.
    let dayConfigs: DayConfig[];
    if (cfg?.days && cfg.days.length > 0) {
      dayConfigs = cfg.days;
    } else {
      const single = legacyToDayConfig(cfg?.overrides);
      dayConfigs = [single, single];
    }

    const historicalLength = pf.mid.validSnapshotCount;
    let trendValue =
      mode === "linearTrend"
        ? pf.mid.intercept + pf.mid.slopePerStep * historicalLength
        : pf.mid.fairPrice;
    let mid = trendValue;

    for (let d = 0; d < numDays; d++) {
      const dayNumber = params.startDay + d;
      const dayConf = dayConfigs[Math.min(d, dayConfigs.length - 1)];

      const { output, endMid, endTrendValue } = generateProductDay(
        pf,
        mode,
        smoothing,
        dayConf,
        params.durationTimestamps,
        params.step,
        dayNumber,
        mid,
        trendValue,
        rng
      );

      if (!perDay.has(dayNumber)) {
        perDay.set(dayNumber, { activities: [], trades: [] });
      }
      const bucket = perDay.get(dayNumber)!;
      bucket.activities.push(...output.activities);
      bucket.trades.push(...output.trades);

      mid = endMid;
      trendValue = endTrendValue;
    }
  }

  const days: MultiDayOutput["days"] = [];
  const allActivities: ActivityRow[] = [];
  const allTrades: Trade[] = [];

  for (const [dayNum, bucket] of Array.from(perDay.entries()).sort((a, b) => a[0] - b[0])) {
    bucket.activities.sort((a, b) => a.timestamp - b.timestamp || a.product.localeCompare(b.product));
    bucket.trades.sort((a, b) => a.timestamp - b.timestamp);
    days.push({ day: dayNum, activities: bucket.activities, trades: bucket.trades });
    allActivities.push(...bucket.activities);
    allTrades.push(...bucket.trades);
  }

  return { days, allActivities, allTrades };
}

export function activitiesToCSV(rows: ActivityRow[], day: number): string {
  const header =
    "day;timestamp;product;bid_price_1;bid_volume_1;bid_price_2;bid_volume_2;bid_price_3;bid_volume_3;ask_price_1;ask_volume_1;ask_price_2;ask_volume_2;ask_price_3;ask_volume_3;mid_price;profit_and_loss";
  const fmt = (v: number | null | undefined) =>
    v === null || v === undefined ? "" : String(v);
  const lines = [header];
  for (const r of rows) {
    lines.push(
      [
        r.day ?? day,
        r.timestamp,
        r.product,
        fmt(r.bidPrice1),
        fmt(r.bidVolume1),
        fmt(r.bidPrice2),
        fmt(r.bidVolume2),
        fmt(r.bidPrice3),
        fmt(r.bidVolume3),
        fmt(r.askPrice1),
        fmt(r.askVolume1),
        fmt(r.askPrice2),
        fmt(r.askVolume2),
        fmt(r.askPrice3),
        fmt(r.askVolume3),
        r.midPrice === null ? "" : r.midPrice.toFixed(1),
        r.pnl.toFixed(1),
      ].join(";")
    );
  }
  return lines.join("\n");
}

export function tradesToCSV(trades: Trade[]): string {
  const header = "timestamp;buyer;seller;symbol;currency;price;quantity";
  const lines = [header];
  for (const t of trades) {
    lines.push(
      [
        t.timestamp,
        t.buyer,
        t.seller,
        t.symbol,
        t.currency,
        t.price.toFixed(1),
        t.quantity,
      ].join(";")
    );
  }
  return lines.join("\n");
}
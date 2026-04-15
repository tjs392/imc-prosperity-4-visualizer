import { ActivityRow, Trade } from "@/lib/types";
import {
  FeatureSet,
  ProductFeatures,
  LevelProfile,
  SimMode,
} from "@/lib/simulation/extractFeatures";

export type ProductOverrides = {
  slopeMultiplier?: number;
  noiseMultiplier?: number;
  levelShift?: number;
  applyAfterTimestamp?: number | null;
};

export type ProductModeConfig = {
  mode: SimMode;
  smoothing?: number;
  overrides?: ProductOverrides;
};

export type GeneratorParams = {
  durationTimestamps: number;
  step: number;
  seed?: number;
  startDay: number;
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

function generateProduct(
  pf: ProductFeatures,
  mode: SimMode,
  smoothing: number,
  overrides: ProductOverrides,
  params: GeneratorParams,
  rng: () => number
): GeneratorOutput {
  const activities: ActivityRow[] = [];
  const trades: Trade[] = [];

  const numSnapshots = Math.floor(params.durationTimestamps / params.step);
  const tradeRatePerStep = pf.trades.perTimestepRate;
  const alpha = Math.max(0.001, Math.min(1, smoothing));

  const slopeMult = overrides.slopeMultiplier ?? 1;
  const noiseMult = overrides.noiseMultiplier ?? 1;
  const levelShift = overrides.levelShift ?? 0;
  const kickInTs =
    overrides.applyAfterTimestamp === undefined || overrides.applyAfterTimestamp === null
      ? 0
      : overrides.applyAfterTimestamp;

  const historicalLength = pf.mid.validSnapshotCount;
  const baseSlope = pf.mid.slopePerStep;
  const baseTrendStart =
    mode === "linearTrend"
      ? pf.mid.intercept + pf.mid.slopePerStep * historicalLength
      : pf.mid.fairPrice;

  let trendValue = baseTrendStart;
  let smoothedNoise = 0;
  let lastEffectiveSlope = mode === "linearTrend" ? baseSlope : 0;

  for (let i = 0; i < numSnapshots; i++) {
    const ts = i * params.step;
    const overrideActive = ts >= kickInTs;

    const effectiveSlopeMult = overrideActive ? slopeMult : 1;
    const effectiveNoiseMult = overrideActive ? noiseMult : 1;
    const effectiveLevelShift = overrideActive ? levelShift : 0;

    if (mode === "linearTrend") {
      const newSlope = baseSlope * effectiveSlopeMult;
      trendValue = trendValue + newSlope;
      lastEffectiveSlope = newSlope;
    } else {
      trendValue = pf.mid.fairPrice;
    }

    const noiseStd = (mode === "linearTrend" ? pf.mid.trendNoiseStd : pf.mid.noiseStd) * effectiveNoiseMult;
    const newNoise = noiseStd * gaussian(rng);
    smoothedNoise = (1 - alpha) * smoothedNoise + alpha * newNoise;

    const mid = trendValue + smoothedNoise + effectiveLevelShift;
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
      timestamp: ts,
      product: pf.product,
      day: params.startDay,
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
      } else if (r < pf.trades.buyAggressorRate + pf.trades.sellAggressorRate && bid1.price !== null) {
        price = bid1.price;
      } else if (bid1.price !== null && ask1.price !== null) {
        price = Math.round((bid1.price + ask1.price) / 2);
      } else {
        price = Math.round(midRounded);
      }
      trades.push({
        timestamp: ts,
        buyer: "",
        seller: "",
        symbol: pf.product,
        currency: "XIRECS",
        price,
        quantity: size,
      });
    }
  }

  void lastEffectiveSlope;
  return { activities, trades };
}

export function generateDay(
  features: FeatureSet,
  params: GeneratorParams
): GeneratorOutput {
  const rng = makeRng(params.seed ?? Date.now());
  const allActivities: ActivityRow[] = [];
  const allTrades: Trade[] = [];

  for (const product of Object.keys(features.products)) {
    const pf = features.products[product];
    const cfg = params.productModes?.[product];
    const mode = cfg?.mode ?? pf.mid.suggestedMode;
    const smoothing = cfg?.smoothing ?? DEFAULT_SMOOTHING;
    const overrides = cfg?.overrides ?? {};
    const { activities, trades } = generateProduct(pf, mode, smoothing, overrides, params, rng);
    allActivities.push(...activities);
    allTrades.push(...trades);
  }

  allActivities.sort((a, b) => a.timestamp - b.timestamp || a.product.localeCompare(b.product));
  allTrades.sort((a, b) => a.timestamp - b.timestamp);
  return { activities: allActivities, trades: allTrades };
}

export function activitiesToCSV(rows: ActivityRow[], day: number): string {
  const header = "day;timestamp;product;bid_price_1;bid_volume_1;bid_price_2;bid_volume_2;bid_price_3;bid_volume_3;ask_price_1;ask_volume_1;ask_price_2;ask_volume_2;ask_price_3;ask_volume_3;mid_price;profit_and_loss";
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  const lines = [header];
  for (const r of rows) {
    lines.push([
      day,
      r.timestamp,
      r.product,
      fmt(r.bidPrice1), fmt(r.bidVolume1),
      fmt(r.bidPrice2), fmt(r.bidVolume2),
      fmt(r.bidPrice3), fmt(r.bidVolume3),
      fmt(r.askPrice1), fmt(r.askVolume1),
      fmt(r.askPrice2), fmt(r.askVolume2),
      fmt(r.askPrice3), fmt(r.askVolume3),
      r.midPrice === null ? "" : r.midPrice.toFixed(1),
      r.pnl.toFixed(1),
    ].join(";"));
  }
  return lines.join("\n");
}

export function tradesToCSV(trades: Trade[]): string {
  const header = "timestamp;buyer;seller;symbol;currency;price;quantity";
  const lines = [header];
  for (const t of trades) {
    lines.push([
      t.timestamp,
      t.buyer,
      t.seller,
      t.symbol,
      t.currency,
      t.price.toFixed(1),
      t.quantity,
    ].join(";"));
  }
  return lines.join("\n");
}
import { ActivityRow, Trade } from "@/lib/types";

export type Histogram = {
  bins: number[];
  counts: number[];
  binWidth: number;
  total: number;
};

export type LevelProfile = {
  presenceRate: number;
  offsetMean: number;
  offsetStd: number;
  offsetSamples: number[];
  volumeMean: number;
  volumeStd: number;
  volumeSamples: number[];
};

export type BookProfile = {
  bid: [LevelProfile, LevelProfile, LevelProfile];
  ask: [LevelProfile, LevelProfile, LevelProfile];
  spreadHist: Histogram;
  spreadMean: number;
  spreadStd: number;
};

export type SimMode = "meanRevert" | "linearTrend";

export type MidProcess = {
  mean: number;
  std: number;
  min: number;
  max: number;
  lastValue: number;
  fairPrice: number;
  noiseStd: number;
  slopePerStep: number;
  intercept: number;
  trendNoiseStd: number;
  suggestedMode: SimMode;
  validSnapshotCount: number;
  totalSnapshotCount: number;
  oneSidedRate: number;
  lag1Autocorr: number;
  suggestedSmoothing: number;
};

export type TradeStats = {
  count: number;
  perTimestepRate: number;
  interArrivalMean: number;
  interArrivalStd: number;
  sizeMean: number;
  sizeStd: number;
  sizeSamples: number[];
  buyAggressorRate: number;
  sellAggressorRate: number;
  midbookRate: number;
  priceVsMidMean: number;
  priceVsMidStd: number;
};

export type ProductFeatures = {
  product: string;
  snapshotCount: number;
  timestampStep: number;
  mid: MidProcess;
  book: BookProfile;
  trades: TradeStats;
};

export type FeatureSet = {
  products: Record<string, ProductFeatures>;
  dayRange: { firstTs: number; lastTs: number };
  generatedAt: string;
  source: { round: number; days: number[] };
};

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function std(xs: number[], mu?: number): number {
  if (xs.length < 2) return 0;
  const m = mu ?? mean(xs);
  let s = 0;
  for (const x of xs) {
    const d = x - m;
    s += d * d;
  }
  return Math.sqrt(s / (xs.length - 1));
}

function histogram(xs: number[], binCount: number = 30): Histogram {
  if (xs.length === 0) return { bins: [], counts: [], binWidth: 0, total: 0 };
  let lo = xs[0], hi = xs[0];
  for (const x of xs) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  if (hi === lo) return { bins: [lo], counts: [xs.length], binWidth: 1, total: xs.length };
  const binWidth = (hi - lo) / binCount;
  const bins: number[] = [];
  const counts: number[] = new Array(binCount).fill(0);
  for (let i = 0; i < binCount; i++) bins.push(lo + i * binWidth);
  for (const x of xs) {
    let idx = Math.floor((x - lo) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  return { bins, counts, binWidth, total: xs.length };
}

function detectTimestampStep(timestamps: number[]): number {
  if (timestamps.length < 2) return 100;
  const diffs: number[] = [];
  const n = Math.min(timestamps.length - 1, 50);
  for (let i = 1; i <= n; i++) {
    const d = timestamps[i] - timestamps[i - 1];
    if (d > 0) diffs.push(d);
  }
  if (diffs.length === 0) return 100;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

function linearFit(ys: number[]): { slope: number; intercept: number; residStd: number } {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, residStd: 0 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += ys[i];
    sxx += i * i;
    sxy += i * ys[i];
  }
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * i;
    const r = ys[i] - pred;
    sse += r * r;
  }
  const residStd = Math.sqrt(sse / Math.max(1, n - 2));
  return { slope, intercept, residStd };
}

function lag1Autocorrelation(xs: number[]): number {
  if (xs.length < 3) return 0;
  const mu = mean(xs);
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i] - mu;
    den += d * d;
  }
  for (let i = 1; i < xs.length; i++) {
    num += (xs[i] - mu) * (xs[i - 1] - mu);
  }
  return den === 0 ? 0 : num / den;
}

function extractLevelProfile(
  rows: ActivityRow[],
  side: "bid" | "ask",
  level: 1 | 2 | 3
): LevelProfile {
  const priceKey = `${side}Price${level}` as keyof ActivityRow;
  const volKey = `${side}Volume${level}` as keyof ActivityRow;
  const offsets: number[] = [];
  const volumes: number[] = [];
  let present = 0;
  let validRows = 0;

  for (const r of rows) {
    if (r.bidPrice1 === null || r.askPrice1 === null) continue;
    validRows++;
    const p = r[priceKey] as number | null;
    const v = r[volKey] as number | null;
    const mid = r.midPrice;
    if (p === null || v === null || mid === null) continue;
    present++;
    const offset = side === "bid" ? mid - p : p - mid;
    offsets.push(offset);
    volumes.push(v);
  }

  return {
    presenceRate: validRows === 0 ? 0 : present / validRows,
    offsetMean: mean(offsets),
    offsetStd: std(offsets),
    offsetSamples: offsets,
    volumeMean: mean(volumes),
    volumeStd: std(volumes),
    volumeSamples: volumes,
  };
}

function extractBookProfile(rows: ActivityRow[]): BookProfile {
  const bid: [LevelProfile, LevelProfile, LevelProfile] = [
    extractLevelProfile(rows, "bid", 1),
    extractLevelProfile(rows, "bid", 2),
    extractLevelProfile(rows, "bid", 3),
  ];
  const ask: [LevelProfile, LevelProfile, LevelProfile] = [
    extractLevelProfile(rows, "ask", 1),
    extractLevelProfile(rows, "ask", 2),
    extractLevelProfile(rows, "ask", 3),
  ];
  const spreads: number[] = [];
  for (const r of rows) {
    if (r.bidPrice1 !== null && r.askPrice1 !== null) {
      spreads.push(r.askPrice1 - r.bidPrice1);
    }
  }
  return {
    bid,
    ask,
    spreadHist: histogram(spreads, 20),
    spreadMean: mean(spreads),
    spreadStd: std(spreads),
  };
}

function extractMidProcess(rows: ActivityRow[]): MidProcess {
  const validMids: number[] = [];
  let totalCount = 0;
  let oneSidedCount = 0;

  for (const r of rows) {
    if (r.midPrice === null) continue;
    totalCount++;
    if (r.bidPrice1 === null || r.askPrice1 === null) {
      oneSidedCount++;
      continue;
    }
    validMids.push(r.midPrice);
  }

  const validCount = validMids.length;
  const oneSidedRate = totalCount === 0 ? 0 : oneSidedCount / totalCount;

  if (validCount === 0) {
    return {
      mean: 0, std: 0, min: 0, max: 0, lastValue: 0,
      fairPrice: 0, noiseStd: 0,
      slopePerStep: 0, intercept: 0, trendNoiseStd: 0,
      suggestedMode: "meanRevert",
      validSnapshotCount: 0, totalSnapshotCount: totalCount,
      oneSidedRate,
      lag1Autocorr: 0, suggestedSmoothing: 0.05,
    };
  }

  const mu = mean(validMids);
  const sd = std(validMids, mu);
  let lo = validMids[0], hi = validMids[0];
  for (const m of validMids) { if (m < lo) lo = m; if (m > hi) hi = m; }

  const fit = linearFit(validMids);
  const trendImprovement = sd > 0 ? 1 - fit.residStd / sd : 0;
  const suggestedMode: SimMode = trendImprovement > 0.5 ? "linearTrend" : "meanRevert";

  const autocorr = lag1Autocorrelation(validMids);
  const clampedAuto = Math.max(0, Math.min(1, autocorr));
  const suggestedSmoothing = Math.max(0.005, Math.min(0.5, 1 - clampedAuto));

  return {
    mean: mu,
    std: sd,
    min: lo,
    max: hi,
    lastValue: validMids[validMids.length - 1],
    fairPrice: mu,
    noiseStd: sd,
    slopePerStep: fit.slope,
    intercept: fit.intercept,
    trendNoiseStd: fit.residStd,
    suggestedMode,
    validSnapshotCount: validCount,
    totalSnapshotCount: totalCount,
    oneSidedRate,
    lag1Autocorr: autocorr,
    suggestedSmoothing,
  };
}

function extractTradeStats(
  trades: Trade[],
  rows: ActivityRow[],
  timestampStep: number,
  snapshotCount: number
): TradeStats {
  if (trades.length === 0) {
    return {
      count: 0, perTimestepRate: 0,
      interArrivalMean: 0, interArrivalStd: 0,
      sizeMean: 0, sizeStd: 0, sizeSamples: [],
      buyAggressorRate: 0, sellAggressorRate: 0, midbookRate: 0,
      priceVsMidMean: 0, priceVsMidStd: 0,
    };
  }
  const rowTs = rows.map((r) => r.timestamp);
  function findRowAt(ts: number): ActivityRow | null {
    if (rowTs.length === 0) return null;
    let lo = 0, hi = rowTs.length - 1, ans = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (rowTs[m] <= ts) { ans = m; lo = m + 1; } else hi = m - 1;
    }
    if (ans < 0) return rows[0];
    return rows[ans];
  }
  const sizes: number[] = [];
  const interArrivals: number[] = [];
  const priceVsMid: number[] = [];
  let buyAgg = 0, sellAgg = 0, mid = 0, classified = 0;
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    sizes.push(t.quantity);
    if (i > 0) interArrivals.push(t.timestamp - trades[i - 1].timestamp);
    const row = findRowAt(t.timestamp);
    if (row && row.midPrice !== null && row.bidPrice1 !== null && row.askPrice1 !== null) {
      priceVsMid.push(t.price - row.midPrice);
      const ask1 = row.askPrice1;
      const bid1 = row.bidPrice1;
      if (t.price >= ask1) { buyAgg++; classified++; }
      else if (t.price <= bid1) { sellAgg++; classified++; }
      else { mid++; classified++; }
    }
  }
  const totalTimespan = snapshotCount * timestampStep;
  return {
    count: trades.length,
    perTimestepRate: totalTimespan > 0 ? (trades.length * timestampStep) / totalTimespan : 0,
    interArrivalMean: mean(interArrivals),
    interArrivalStd: std(interArrivals),
    sizeMean: mean(sizes),
    sizeStd: std(sizes),
    sizeSamples: sizes,
    buyAggressorRate: classified === 0 ? 0 : buyAgg / classified,
    sellAggressorRate: classified === 0 ? 0 : sellAgg / classified,
    midbookRate: classified === 0 ? 0 : mid / classified,
    priceVsMidMean: mean(priceVsMid),
    priceVsMidStd: std(priceVsMid),
  };
}

export function extractProductFeatures(
  product: string,
  rows: ActivityRow[],
  trades: Trade[]
): ProductFeatures {
  const productRows = rows.filter((r) => r.product === product);
  const productTrades = trades.filter((t) => t.symbol === product);
  const timestamps = productRows.map((r) => r.timestamp);
  const step = detectTimestampStep(timestamps);
  return {
    product,
    snapshotCount: productRows.length,
    timestampStep: step,
    mid: extractMidProcess(productRows),
    book: extractBookProfile(productRows),
    trades: extractTradeStats(productTrades, productRows, step, productRows.length),
  };
}

export function extractFeatures(
  rows: ActivityRow[],
  trades: Trade[],
  source: { round: number; days: number[] }
): FeatureSet {
  const productSet = new Set<string>();
  for (const r of rows) productSet.add(r.product);
  const products: Record<string, ProductFeatures> = {};
  for (const p of productSet) products[p] = extractProductFeatures(p, rows, trades);
  let firstTs = 0, lastTs = 0;
  if (rows.length > 0) {
    firstTs = rows[0].timestamp;
    lastTs = rows[0].timestamp;
    for (const r of rows) {
      if (r.timestamp < firstTs) firstTs = r.timestamp;
      if (r.timestamp > lastTs) lastTs = r.timestamp;
    }
  }
  return {
    products,
    dayRange: { firstTs, lastTs },
    generatedAt: new Date().toISOString(),
    source,
  };
}

export function stripSamples(features: FeatureSet): FeatureSet {
  const out: FeatureSet = { ...features, products: {} };
  for (const [k, p] of Object.entries(features.products)) {
    out.products[k] = {
      ...p,
      book: {
        ...p.book,
        bid: p.book.bid.map((l) => ({ ...l, offsetSamples: [], volumeSamples: [] })) as BookProfile["bid"],
        ask: p.book.ask.map((l) => ({ ...l, offsetSamples: [], volumeSamples: [] })) as BookProfile["ask"],
      },
      trades: { ...p.trades, sizeSamples: [] },
    };
  }
  return out;
}
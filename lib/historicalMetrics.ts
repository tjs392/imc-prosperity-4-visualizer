import { ActivityRow } from "@/lib/types";

export type MetricPoint = { time: number; value: number };

export function computeSpread(rows: ActivityRow[]): MetricPoint[] {
  const out: MetricPoint[] = [];
  for (const r of rows) {
    if (r.askPrice1 === null || r.bidPrice1 === null) continue;
    out.push({ time: r.timestamp, value: r.askPrice1 - r.bidPrice1 });
  }
  return out;
}

export function computeReturns(rows: ActivityRow[]): MetricPoint[] {
  const out: MetricPoint[] = [];
  let prev: number | null = null;
  let prevDay: number | undefined = undefined;
  for (const r of rows) {
    if (r.midPrice === null) continue;
    const sameDay = prevDay === undefined || r.day === undefined || r.day === prevDay;
    if (prev !== null && prev !== 0 && sameDay) {
      out.push({ time: r.timestamp, value: (r.midPrice - prev) / prev });
    }
    prev = r.midPrice;
    prevDay = r.day;
  }
  return out;
}

export function computeRollingVolatility(
  rows: ActivityRow[],
  window: number
): MetricPoint[] {
  const returns = computeReturns(rows);
  if (returns.length < window) return [];
  const out: MetricPoint[] = [];
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < returns.length; i++) {
    const v = returns[i].value;
    sum += v;
    sumSq += v * v;
    if (i >= window) {
      const drop = returns[i - window].value;
      sum -= drop;
      sumSq -= drop * drop;
    }
    if (i >= window - 1) {
      const mean = sum / window;
      const variance = sumSq / window - mean * mean;
      const stdev = Math.sqrt(Math.max(variance, 0));
      out.push({ time: returns[i].time, value: stdev });
    }
  }
  return out;
}

function getMids(rows: ActivityRow[]): MetricPoint[] {
  const out: MetricPoint[] = [];
  for (const r of rows) {
    if (r.midPrice === null) continue;
    out.push({ time: r.timestamp, value: r.midPrice });
  }
  return out;
}

function linearFit(
  mids: MetricPoint[]
): { slope: number; intercept: number } | null {
  const n = mids.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const m of mids) {
    sumX += m.time;
    sumY += m.value;
    sumXY += m.time * m.value;
    sumXX += m.time * m.time;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const denom = sumXX - n * meanX * meanX;
  if (denom === 0) return null;
  const slope = (sumXY - n * meanX * meanY) / denom;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

function getDetrendedMids(rows: ActivityRow[]): number[] {
  const mids = getMids(rows);
  const fit = linearFit(mids);
  if (!fit) return mids.map((m) => m.value);
  return mids.map((m) => m.value - (fit.slope * m.time + fit.intercept));
}

export function computeTrendSlope(rows: ActivityRow[]): number | null {
  const mids = getMids(rows);
  const fit = linearFit(mids);
  if (!fit) return null;
  return fit.slope;
}

export function computeTrendStrength(rows: ActivityRow[]): number | null {
  const mids = getMids(rows);
  if (mids.length < 2) return null;
  const fit = linearFit(mids);
  if (!fit) return null;
  const predicted = mids.map((m) => fit.slope * m.time + fit.intercept);
  let ssRes = 0;
  let ssTot = 0;
  let meanY = 0;
  for (const m of mids) meanY += m.value;
  meanY /= mids.length;
  for (let i = 0; i < mids.length; i++) {
    const resid = mids[i].value - predicted[i];
    ssRes += resid * resid;
    ssTot += (mids[i].value - meanY) * (mids[i].value - meanY);
  }
  if (ssTot === 0) return null;
  return 1 - ssRes / ssTot;
}

export function computeRollingZScore(
  rows: ActivityRow[],
  window: number
): MetricPoint[] {
  const mids = getMids(rows);
  if (mids.length < window) return [];
  const out: MetricPoint[] = [];
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < mids.length; i++) {
    const v = mids[i].value;
    sum += v;
    sumSq += v * v;
    if (i >= window) {
      const drop = mids[i - window].value;
      sum -= drop;
      sumSq -= drop * drop;
    }
    if (i >= window - 1) {
      const mean = sum / window;
      const variance = sumSq / window - mean * mean;
      const stdev = Math.sqrt(Math.max(variance, 0));
      const z = stdev === 0 ? 0 : (v - mean) / stdev;
      out.push({ time: mids[i].time, value: z });
    }
  }
  return out;
}

export function computeGlobalZScore(rows: ActivityRow[]): MetricPoint[] {
  const mids = getMids(rows);
  if (mids.length === 0) return [];
  let sum = 0;
  let sumSq = 0;
  for (const m of mids) {
    sum += m.value;
    sumSq += m.value * m.value;
  }
  const n = mids.length;
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const stdev = Math.sqrt(Math.max(variance, 0));
  if (stdev === 0) return mids.map((m) => ({ time: m.time, value: 0 }));
  return mids.map((m) => ({ time: m.time, value: (m.value - mean) / stdev }));
}

export function computeDetrendedZScore(rows: ActivityRow[]): MetricPoint[] {
  const mids = getMids(rows);
  const n = mids.length;
  if (n < 2) return [];
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = mids[i].time;
    const y = mids[i].value;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const denom = sumXX - n * meanX * meanX;
  const slope = denom === 0 ? 0 : (sumXY - n * meanX * meanY) / denom;
  const intercept = meanY - slope * meanX;

  const residuals: number[] = [];
  for (const m of mids) {
    residuals.push(m.value - (slope * m.time + intercept));
  }
  let rSum = 0;
  let rSumSq = 0;
  for (const r of residuals) {
    rSum += r;
    rSumSq += r * r;
  }
  const rMean = rSum / n;
  const rVar = rSumSq / n - rMean * rMean;
  const rStd = Math.sqrt(Math.max(rVar, 0));
  if (rStd === 0) return mids.map((m) => ({ time: m.time, value: 0 }));
  return mids.map((m, i) => ({
    time: m.time,
    value: (residuals[i] - rMean) / rStd,
  }));
}

export const ACF_BUCKET_SIZE = 5;

function getMidsResampled(
  rows: ActivityRow[],
  bucketSize: number
): MetricPoint[] {
  if (bucketSize <= 1) return getMids(rows);
  const mids = getMids(rows);
  const out: MetricPoint[] = [];
  for (let i = bucketSize - 1; i < mids.length; i += bucketSize) {
    out.push(mids[i]);
  }
  return out;
}

function getResampledReturns(
  rows: ActivityRow[],
  bucketSize: number
): number[] {
  const mids = getMidsResampled(rows, bucketSize);
  const out: number[] = [];
  let prev: number | null = null;
  let prevDay: number | undefined = undefined;

  const rowDayAtTs = new Map<number, number | undefined>();
  for (const r of rows) rowDayAtTs.set(r.timestamp, r.day);

  for (const m of mids) {
    const day = rowDayAtTs.get(m.time);
    const sameDay =
      prevDay === undefined || day === undefined || day === prevDay;
    if (prev !== null && prev !== 0 && sameDay) {
      out.push((m.value - prev) / prev);
    }
    prev = m.value;
    prevDay = day;
  }
  return out;
}

export function computeACF(
  rows: ActivityRow[],
  maxLag: number,
  bucketSize: number = ACF_BUCKET_SIZE
): MetricPoint[] {
  const returns = getResampledReturns(rows, bucketSize);
  const n = returns.length;
  if (n < maxLag + 2) return [];
  let mean = 0;
  for (const r of returns) mean += r;
  mean /= n;
  let variance = 0;
  for (const r of returns) variance += (r - mean) * (r - mean);
  variance /= n;
  if (variance === 0) return [];
  const out: MetricPoint[] = [];
  for (let k = 1; k <= maxLag; k++) {
    let cov = 0;
    for (let i = k; i < n; i++) {
      cov += (returns[i] - mean) * (returns[i - k] - mean);
    }
    cov /= n;
    out.push({ time: k * bucketSize * 100, value: cov / variance });
  }
  return out;
}

export function computeACFConfidenceBand(
  rows: ActivityRow[],
  bucketSize: number = ACF_BUCKET_SIZE
): number {
  const n = getResampledReturns(rows, bucketSize).length;
  if (n === 0) return 0;
  return 1.96 / Math.sqrt(n);
}

export function computeHalfLife(rows: ActivityRow[]): number | null {
  const detrended = getDetrendedMids(rows);
  const bucket = 5;
  const resampled: number[] = [];
  for (let i = bucket - 1; i < detrended.length; i += bucket) {
    resampled.push(detrended[i]);
  }
  const n = resampled.length;
  if (n < 3) return null;
  const y: number[] = [];
  const x: number[] = [];
  for (let i = 1; i < n; i++) {
    y.push(resampled[i] - resampled[i - 1]);
    x.push(resampled[i - 1]);
  }
  const m = y.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < m; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumXX += x[i] * x[i];
  }
  const meanX = sumX / m;
  const meanY = sumY / m;
  const denom = sumXX - m * meanX * meanX;
  if (denom === 0) return null;
  const phi = (sumXY - m * meanX * meanY) / denom;
  if (phi >= 0) return null;
  const halfLifeBars = -Math.log(2) / Math.log(1 + phi);
  if (!Number.isFinite(halfLifeBars) || halfLifeBars <= 0) return null;
  return halfLifeBars * bucket * 100;
}

export function computeHurst(rows: ActivityRow[]): number | null {
  const detrended = getDetrendedMids(rows);
  const n = detrended.length;
  if (n < 100) return null;

  const q = 4;
  const longHorizon = q;

  const diffs1: number[] = [];
  for (let i = 1; i < n; i++) {
    diffs1.push(detrended[i] - detrended[i - 1]);
  }
  if (diffs1.length < q + 1) return null;

  const diffsQ: number[] = [];
  for (let i = longHorizon; i < n; i++) {
    diffsQ.push(detrended[i] - detrended[i - longHorizon]);
  }
  if (diffsQ.length === 0) return null;

  let mean1 = 0;
  for (const d of diffs1) mean1 += d;
  mean1 /= diffs1.length;
  let var1 = 0;
  for (const d of diffs1) var1 += (d - mean1) * (d - mean1);
  var1 /= diffs1.length;

  let meanQ = 0;
  for (const d of diffsQ) meanQ += d;
  meanQ /= diffsQ.length;
  let varQ = 0;
  for (const d of diffsQ) varQ += (d - meanQ) * (d - meanQ);
  varQ /= diffsQ.length;

  if (var1 === 0) return null;
  const vr = varQ / (q * var1);
  return vr;
}

export function computeUnconditionalVolatility(
  rows: ActivityRow[]
): number | null {
  const returns = computeReturns(rows).map((r) => r.value);
  const n = returns.length;
  if (n < 2) return null;
  let mean = 0;
  for (const r of returns) mean += r;
  mean /= n;
  let variance = 0;
  for (const r of returns) variance += (r - mean) * (r - mean);
  variance /= n;
  return Math.sqrt(variance);
}

export function computeAverageSpread(rows: ActivityRow[]): number | null {
  const spreads = computeSpread(rows).map((s) => s.value);
  if (spreads.length === 0) return null;
  let sum = 0;
  for (const s of spreads) sum += s;
  return sum / spreads.length;
}

export type ProductMetrics = {
  product: string;
  hurst: number | null;
  halfLife: number | null;
  trendR2: number | null;
  trendSlope: number | null;
  volatility: number | null;
  avgSpread: number | null;
  ticks: number;
};

export function computeProductMetrics(
  product: string,
  rows: ActivityRow[]
): ProductMetrics {
  return {
    product,
    hurst: computeHurst(rows),
    halfLife: computeHalfLife(rows),
    trendR2: computeTrendStrength(rows),
    trendSlope: computeTrendSlope(rows),
    volatility: computeUnconditionalVolatility(rows),
    avgSpread: computeAverageSpread(rows),
    ticks: rows.length,
  };
}

export function computePairBeta(
  aRows: ActivityRow[],
  bRows: ActivityRow[]
): { beta: number; alpha: number } | null {
  const aByTs = new Map<number, number>();
  for (const r of aRows) {
    if (r.midPrice !== null) aByTs.set(r.timestamp, r.midPrice);
  }
  const pairs: [number, number][] = [];
  for (const r of bRows) {
    if (r.midPrice === null) continue;
    const a = aByTs.get(r.timestamp);
    if (a !== undefined) pairs.push([a, r.midPrice]);
  }
  const n = pairs.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const [b, a] of pairs) {
    sumX += b;
    sumY += a;
    sumXY += b * a;
    sumXX += b * b;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const denom = sumXX - n * meanX * meanX;
  if (denom === 0) return null;
  const beta = (sumXY - n * meanX * meanY) / denom;
  const alpha = meanY - beta * meanX;
  return { beta, alpha };
}

export function computePairSpread(
  aRows: ActivityRow[],
  bRows: ActivityRow[]
): { series: MetricPoint[]; mean: number; stdev: number; beta: number } | null {
  const fit = computePairBeta(aRows, bRows);
  if (!fit) return null;
  const { beta, alpha } = fit;

  const bByTs = new Map<number, number>();
  for (const r of bRows) {
    if (r.midPrice !== null) bByTs.set(r.timestamp, r.midPrice);
  }

  const series: MetricPoint[] = [];
  for (const r of aRows) {
    if (r.midPrice === null) continue;
    const b = bByTs.get(r.timestamp);
    if (b === undefined) continue;
    const spread = r.midPrice - (beta * b + alpha);
    series.push({ time: r.timestamp, value: spread });
  }

  if (series.length === 0) return null;
  let sum = 0;
  let sumSq = 0;
  for (const p of series) {
    sum += p.value;
    sumSq += p.value * p.value;
  }
  const n = series.length;
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const stdev = Math.sqrt(Math.max(variance, 0));
  return { series, mean, stdev, beta };
}

export function computePairCorrelation(
  aRows: ActivityRow[],
  bRows: ActivityRow[]
): number | null {
  const aReturns = new Map<number, number>();
  let prev: number | null = null;
  let prevDay: number | undefined = undefined;
  for (const r of aRows) {
    if (r.midPrice === null) continue;
    const sameDay = prevDay === undefined || r.day === undefined || r.day === prevDay;
    if (prev !== null && prev !== 0 && sameDay) {
      aReturns.set(r.timestamp, (r.midPrice - prev) / prev);
    }
    prev = r.midPrice;
    prevDay = r.day;
  }
  prev = null;
  prevDay = undefined;
  const bReturns = new Map<number, number>();
  for (const r of bRows) {
    if (r.midPrice === null) continue;
    const sameDay = prevDay === undefined || r.day === undefined || r.day === prevDay;
    if (prev !== null && prev !== 0 && sameDay) {
      bReturns.set(r.timestamp, (r.midPrice - prev) / prev);
    }
    prev = r.midPrice;
    prevDay = r.day;
  }
  const pairs: [number, number][] = [];
  for (const [ts, a] of aReturns) {
    const b = bReturns.get(ts);
    if (b !== undefined) pairs.push([a, b]);
  }
  const n = pairs.length;
  if (n < 2) return null;
  let sumA = 0;
  let sumB = 0;
  for (const [a, b] of pairs) {
    sumA += a;
    sumB += b;
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (const [a, b] of pairs) {
    cov += (a - meanA) * (b - meanB);
    varA += (a - meanA) * (a - meanA);
    varB += (b - meanB) * (b - meanB);
  }
  const denom = Math.sqrt(varA * varB);
  if (denom === 0) return null;
  return cov / denom;
}

export function computeSpreadHalfLife(
  aRows: ActivityRow[],
  bRows: ActivityRow[]
): number | null {
  const pair = computePairSpread(aRows, bRows);
  if (!pair) return null;
  const vals = pair.series.map((p) => p.value);
  const n = vals.length;
  if (n < 3) return null;
  const y: number[] = [];
  const x: number[] = [];
  for (let i = 1; i < n; i++) {
    y.push(vals[i] - vals[i - 1]);
    x.push(vals[i - 1]);
  }
  const m = y.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < m; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumXX += x[i] * x[i];
  }
  const meanX = sumX / m;
  const meanY = sumY / m;
  const denom = sumXX - m * meanX * meanX;
  if (denom === 0) return null;
  const phi = (sumXY - m * meanX * meanY) / denom;
  if (phi >= 0) return null;
  const hl = -Math.log(2) / Math.log(1 + phi);
  if (!Number.isFinite(hl) || hl <= 0) return null;
  return hl * 100;
}

export type PairMetrics = {
  productA: string;
  productB: string;
  correlation: number | null;
  beta: number | null;
  spreadHalfLife: number | null;
  currentSpreadZ: number | null;
};

export function computePairMetrics(
  productA: string,
  productB: string,
  aRows: ActivityRow[],
  bRows: ActivityRow[]
): PairMetrics {
  const pair = computePairSpread(aRows, bRows);
  const correlation = computePairCorrelation(aRows, bRows);
  const spreadHalfLife = computeSpreadHalfLife(aRows, bRows);
  let currentSpreadZ: number | null = null;
  if (pair && pair.stdev > 0 && pair.series.length > 0) {
    const latest = pair.series[pair.series.length - 1].value;
    currentSpreadZ = (latest - pair.mean) / pair.stdev;
  }
  return {
    productA,
    productB,
    correlation,
    beta: pair?.beta ?? null,
    spreadHalfLife,
    currentSpreadZ,
  };
}
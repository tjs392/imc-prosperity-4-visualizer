import { ActivityRow, Trade } from "./types";

export function pickWall(
  prices: (number | null)[],
  volumes: (number | null)[]
): number | null {
  let bestPrice: number | null = null;
  let bestVol = -1;
  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    const v = volumes[i];
    if (p === null || p === undefined || v === null || v === undefined) continue;
    if (v > bestVol) {
      bestVol = v;
      bestPrice = p;
    }
  }
  return bestPrice;
}

function sortedUniqueRows(rows: ActivityRow[]): ActivityRow[] {
  const byTime = new Map<number, ActivityRow>();
  for (const r of rows) byTime.set(r.timestamp, r);
  const sortedTimes = Array.from(byTime.keys()).sort((a, b) => a - b);
  return sortedTimes.map((t) => byTime.get(t)!);
}

export function computeWallMidSeries(rows: ActivityRow[]): (number | null)[] {
  const sorted = sortedUniqueRows(rows);
  const out: (number | null)[] = [];
  let last: number | null = null;
  for (const r of sorted) {
    const bidWall = pickWall(
      [r.bidPrice1, r.bidPrice2, r.bidPrice3],
      [r.bidVolume1, r.bidVolume2, r.bidVolume3]
    );
    const askWall = pickWall(
      [r.askPrice1, r.askPrice2, r.askPrice3],
      [r.askVolume1, r.askVolume2, r.askVolume3]
    );
    let v: number | null = null;
    if (bidWall !== null && askWall !== null) v = (bidWall + askWall) / 2;
    else if (bidWall !== null) v = bidWall;
    else if (askWall !== null) v = askWall;
    if (v !== null) last = v;
    out.push(v !== null ? v : last);
  }
  return out;
}

export type SpreadType = "absolute" | "wall";

export function computeSpreadSeries(
  rows: ActivityRow[],
  kind: SpreadType
): { time: number; value: number }[] {
  const sorted = sortedUniqueRows(rows);
  const out: { time: number; value: number }[] = [];
  for (const r of sorted) {
    let v: number | null = null;
    if (kind === "absolute") {
      if (r.bidPrice1 !== null && r.askPrice1 !== null) {
        v = r.askPrice1 - r.bidPrice1;
      }
    } else {
      const bidWall = pickWall(
        [r.bidPrice1, r.bidPrice2, r.bidPrice3],
        [r.bidVolume1, r.bidVolume2, r.bidVolume3]
      );
      const askWall = pickWall(
        [r.askPrice1, r.askPrice2, r.askPrice3],
        [r.askVolume1, r.askVolume2, r.askVolume3]
      );
      if (bidWall !== null && askWall !== null) v = askWall - bidWall;
    }
    if (v !== null && Number.isFinite(v)) {
      out.push({ time: r.timestamp, value: v });
    }
  }
  return out;
}

export type VolumeType =
  | "obi"
  | "totalDepth"
  | "ownTrade"
  | "signedDepth"
  | "topOfBook";

export type VolumeSeriesResult =
  | { kind: "single"; data: { time: number; value: number }[] }
  | {
      kind: "dual";
      data: { time: number; bids: number; asks: number }[];
    };

function sumVol(vs: (number | null)[]): number {
  let s = 0;
  for (const v of vs) if (v !== null && v !== undefined) s += v;
  return s;
}

export function computeVolumeSeries(
  rows: ActivityRow[],
  trades: Trade[],
  product: string,
  type: VolumeType
): VolumeSeriesResult {
  const sorted = sortedUniqueRows(rows);

  if (type === "ownTrade") {
    const byTs = new Map<number, number>();
    for (const t of trades) {
      if (t.symbol !== product) continue;
      if (t.buyer !== "SUBMISSION" && t.seller !== "SUBMISSION") continue;
      const cur = byTs.get(t.timestamp) ?? 0;
      byTs.set(t.timestamp, cur + Math.abs(t.quantity));
    }
    const data: { time: number; value: number }[] = [];
    for (const r of sorted) {
      data.push({ time: r.timestamp, value: byTs.get(r.timestamp) ?? 0 });
    }
    return { kind: "single", data };
  }

  if (type === "obi") {
    const data: { time: number; value: number }[] = [];
    for (const r of sorted) {
      const bidSum = sumVol([r.bidVolume1, r.bidVolume2, r.bidVolume3]);
      const askSum = sumVol([r.askVolume1, r.askVolume2, r.askVolume3]);
      const total = bidSum + askSum;
      if (total <= 0) continue;
      data.push({ time: r.timestamp, value: (bidSum - askSum) / total });
    }
    return { kind: "single", data };
  }

  if (type === "totalDepth") {
    const data: { time: number; value: number }[] = [];
    for (const r of sorted) {
      const v =
        sumVol([r.bidVolume1, r.bidVolume2, r.bidVolume3]) +
        sumVol([r.askVolume1, r.askVolume2, r.askVolume3]);
      if (v > 0) data.push({ time: r.timestamp, value: v });
    }
    return { kind: "single", data };
  }

  if (type === "signedDepth") {
    const data: { time: number; bids: number; asks: number }[] = [];
    for (const r of sorted) {
      const b = sumVol([r.bidVolume1, r.bidVolume2, r.bidVolume3]);
      const a = sumVol([r.askVolume1, r.askVolume2, r.askVolume3]);
      data.push({ time: r.timestamp, bids: b, asks: -a });
    }
    return { kind: "dual", data };
  }

  const data: { time: number; bids: number; asks: number }[] = [];
  for (const r of sorted) {
    const b = r.bidVolume1 ?? 0;
    const a = r.askVolume1 ?? 0;
    data.push({ time: r.timestamp, bids: b, asks: -a });
  }
  return { kind: "dual", data };
}
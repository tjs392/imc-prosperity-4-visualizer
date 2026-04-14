import { ActivityRow, Trade, HistoricalDay } from "@/lib/types";

function toNum(v: string): number | null {
  if (v === "" || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseHistoricalPrices(raw: string): ActivityRow[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(";");
  const idx = (name: string) => header.indexOf(name);
  const iDay = idx("day");
  const iTs = idx("timestamp");
  const iProd = idx("product");
  const iBp1 = idx("bid_price_1");
  const iBv1 = idx("bid_volume_1");
  const iBp2 = idx("bid_price_2");
  const iBv2 = idx("bid_volume_2");
  const iBp3 = idx("bid_price_3");
  const iBv3 = idx("bid_volume_3");
  const iAp1 = idx("ask_price_1");
  const iAv1 = idx("ask_volume_1");
  const iAp2 = idx("ask_price_2");
  const iAv2 = idx("ask_volume_2");
  const iAp3 = idx("ask_price_3");
  const iAv3 = idx("ask_volume_3");
  const iMid = idx("mid_price");
  const iPnl = idx("profit_and_loss");

  const rows: ActivityRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(";");
    const ts = toNum(parts[iTs]);
    const product = parts[iProd];
    if (ts === null || !product) continue;
    const day = iDay >= 0 ? toNum(parts[iDay]) : null;
    const bp1 = toNum(parts[iBp1]);
    const bp2 = toNum(parts[iBp2]);
    const bp3 = toNum(parts[iBp3]);
    const ap1 = toNum(parts[iAp1]);
    const ap2 = toNum(parts[iAp2]);
    const ap3 = toNum(parts[iAp3]);
    const allEmpty =
      bp1 === null &&
      bp2 === null &&
      bp3 === null &&
      ap1 === null &&
      ap2 === null &&
      ap3 === null;
    if (allEmpty) continue;
    rows.push({
      timestamp: ts,
      product,
      day: day ?? undefined,
      bidPrice1: bp1,
      bidVolume1: toNum(parts[iBv1]),
      bidPrice2: bp2,
      bidVolume2: toNum(parts[iBv2]),
      bidPrice3: bp3,
      bidVolume3: toNum(parts[iBv3]),
      askPrice1: ap1,
      askVolume1: toNum(parts[iAv1]),
      askPrice2: ap2,
      askVolume2: toNum(parts[iAv2]),
      askPrice3: ap3,
      askVolume3: toNum(parts[iAv3]),
      midPrice: toNum(parts[iMid]),
      pnl: toNum(parts[iPnl]) ?? 0,
    });
  }
  rows.sort((a, b) => a.timestamp - b.timestamp);
  return rows;
}

export function parseHistoricalTrades(raw: string): Trade[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(";");
  const idx = (name: string) => header.indexOf(name);
  const iTs = idx("timestamp");
  const iBuyer = idx("buyer");
  const iSeller = idx("seller");
  const iSym = idx("symbol");
  const iCur = idx("currency");
  const iPrice = idx("price");
  const iQty = idx("quantity");

  const trades: Trade[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(";");
    const ts = toNum(parts[iTs]);
    const symbol = parts[iSym];
    const price = toNum(parts[iPrice]);
    const quantity = toNum(parts[iQty]);
    if (ts === null || !symbol || price === null || quantity === null) continue;
    trades.push({
      timestamp: ts,
      buyer: parts[iBuyer] ?? "",
      seller: parts[iSeller] ?? "",
      symbol,
      currency: parts[iCur] ?? "",
      price,
      quantity,
    });
  }
  trades.sort((a, b) => a.timestamp - b.timestamp);
  return trades;
}

export function buildHistoricalDay(
  day: number,
  pricesRaw: string,
  tradesRaw: string
): HistoricalDay {
  const activities = parseHistoricalPrices(pricesRaw);
  for (const r of activities) r.day = day;
  const trades = parseHistoricalTrades(tradesRaw);
  const productSet = new Set<string>();
  for (const r of activities) productSet.add(r.product);
  const products = Array.from(productSet).sort();
  return { day, activities, trades, products };
}

export const DAY_WIDTH = 1_000_000;

export type MergedHistorical = {
  activities: ActivityRow[];
  trades: Trade[];
  products: string[];
  dayBoundaries: { day: number; start: number }[];
};

export function mergeHistoricalDays(days: HistoricalDay[]): MergedHistorical {
  if (days.length === 0) {
    return { activities: [], trades: [], products: [], dayBoundaries: [] };
  }
  const sorted = [...days].sort((a, b) => a.day - b.day);
  const firstDay = sorted[0].day;
  const activities: ActivityRow[] = [];
  const trades: Trade[] = [];
  const productSet = new Set<string>();
  const dayBoundaries: { day: number; start: number }[] = [];

  for (const d of sorted) {
    const offset = (d.day - firstDay) * DAY_WIDTH;
    dayBoundaries.push({ day: d.day, start: offset });
    for (const r of d.activities) {
      activities.push({
        ...r,
        timestamp: r.timestamp + offset,
        day: d.day,
      });
      productSet.add(r.product);
    }
    for (const t of d.trades) {
      trades.push({
        ...t,
        timestamp: t.timestamp + offset,
      });
    }
  }
  activities.sort((a, b) => a.timestamp - b.timestamp);
  trades.sort((a, b) => a.timestamp - b.timestamp);
  return {
    activities,
    trades,
    products: Array.from(productSet).sort(),
    dayBoundaries,
  };
}
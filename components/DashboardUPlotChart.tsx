"use client";

import { useEffect, useMemo, useRef } from "react";
import uPlot, { AlignedData, Options, Series } from "uplot";
import "uplot/dist/uPlot.min.css";
import { ActivityRow, Trade, SandboxEntry } from "@/lib/types";
import { wheelZoomPlugin, resetUPlotX, scaleSyncPlugin, registerScaleSync, unregisterScaleSync } from "@/lib/uplotPlugins";

export type Normalizer = "none" | "wallMid";
export type QtyFilter = { min: number; max: number };

type Props = {
  rows: ActivityRow[];
  trades: Trade[];
  sandbox: SandboxEntry[];
  product: string;
  label: string;
  minHeight?: number;
  visibleLevels: {
    bid1: boolean;
    bid2: boolean;
    bid3: boolean;
    ask1: boolean;
    ask2: boolean;
    ask3: boolean;
    mid: boolean;
  };
  visibleTrades: {
    botMaker: boolean;
    botTaker: boolean;
    myBuy: boolean;
    mySell: boolean;
  };
  visibleOrders: {
    ownOrders: boolean;
  };
  normalizer?: Normalizer;
  qtyFilter?: QtyFilter;
  syncKey?: string;
  resetSignal?: number;
  onResetRequest?: () => void;
  onHoverTime?: (time: number | null) => void;
};

const BID_COLORS = {
  bid1: "rgba(59, 130, 246, 1)",
  bid2: "rgba(59, 130, 246, 0.65)",
  bid3: "rgba(59, 130, 246, 0.35)",
};

const ASK_COLORS = {
  ask1: "rgba(239, 68, 68, 1)",
  ask2: "rgba(239, 68, 68, 0.65)",
  ask3: "rgba(239, 68, 68, 0.35)",
};

const MID_COLOR = "rgba(212, 212, 212, 0.5)";
const BOT_MAKER_COLOR = "#a3a3a3";
const BOT_TAKER_COLOR = "#22d3ee";
const MY_BUY_COLOR = "#fbbf24";
const MY_SELL_COLOR = "#fbbf24";
const OWN_ORDER_BID_COLOR = "#86efac";
const OWN_ORDER_ASK_COLOR = "#fca5a5";

type DedupedBook = {
  xs: number[];
  bid1: (number | null)[];
  bid2: (number | null)[];
  bid3: (number | null)[];
  ask1: (number | null)[];
  ask2: (number | null)[];
  ask3: (number | null)[];
  mid: (number | null)[];
};

function dedupeRows(rows: ActivityRow[]): DedupedBook {
  const byTime = new Map<number, ActivityRow>();
  for (const r of rows) byTime.set(r.timestamp, r);
  const sortedTimes = Array.from(byTime.keys()).sort((a, b) => a - b);
  const xs: number[] = [];
  const bid1: (number | null)[] = [];
  const bid2: (number | null)[] = [];
  const bid3: (number | null)[] = [];
  const ask1: (number | null)[] = [];
  const ask2: (number | null)[] = [];
  const ask3: (number | null)[] = [];
  const mid: (number | null)[] = [];
  let lastMid: number | null = null;
  for (const t of sortedTimes) {
    const r = byTime.get(t)!;
    xs.push(t);
    bid1.push(r.bidPrice1);
    bid2.push(r.bidPrice2);
    bid3.push(r.bidPrice3);
    ask1.push(r.askPrice1);
    ask2.push(r.askPrice2);
    ask3.push(r.askPrice3);
    const raw = r.midPrice;
    if (raw !== null && raw !== undefined && raw !== 0) {
      lastMid = raw;
      mid.push(raw);
    } else {
      mid.push(lastMid);
    }
  }
  return { xs, bid1, bid2, bid3, ask1, ask2, ask3, mid };
}

function pickWall(
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

function computeWallMidSeries(rows: ActivityRow[]): (number | null)[] {
  const byTime = new Map<number, ActivityRow>();
  for (const r of rows) byTime.set(r.timestamp, r);
  const sortedTimes = Array.from(byTime.keys()).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let last: number | null = null;
  for (const t of sortedTimes) {
    const r = byTime.get(t)!;
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

function applyNormalization(
  series: (number | null)[],
  normalizer: (number | null)[]
): (number | null)[] {
  const out: (number | null)[] = new Array(series.length);
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    const n = normalizer[i];
    if (v === null || v === undefined || n === null || n === undefined) {
      out[i] = null;
    } else {
      out[i] = v - n;
    }
  }
  return out;
}

function buildNormalizerLookup(
  xs: number[],
  values: (number | null)[]
): Map<number, number | null> {
  const m = new Map<number, number | null>();
  for (let i = 0; i < xs.length; i++) m.set(xs[i], values[i]);
  return m;
}

type TradeEvent = {
  t: number;
  p: number;
  q: number;
  buyer: string;
  seller: string;
};

type OwnOrderEvent = {
  t: number;
  p: number;
  q: number;
};

type CategorizedTrades = {
  botMaker: TradeEvent[];
  botTakerBuy: TradeEvent[];
  botTakerSell: TradeEvent[];
  myBuy: TradeEvent[];
  mySell: TradeEvent[];
};

type CategorizedOrders = {
  bids: OwnOrderEvent[];
  asks: OwnOrderEvent[];
};

function categorizeOrders(
  sandbox: SandboxEntry[],
  product: string
): CategorizedOrders {
  const bids: OwnOrderEvent[] = [];
  const asks: OwnOrderEvent[] = [];
  for (const entry of sandbox) {
    const list = entry.orders[product];
    if (!list) continue;
    for (const o of list) {
      if (o.symbol !== product) continue;
      const event: OwnOrderEvent = {
        t: entry.timestamp,
        p: o.price,
        q: Math.abs(o.quantity),
      };
      if (o.quantity > 0) bids.push(event);
      else if (o.quantity < 0) asks.push(event);
    }
  }
  return { bids, asks };
}

function categorizeTrades(
  trades: Trade[],
  rows: ActivityRow[],
  product: string
): CategorizedTrades {
  const botMaker: TradeEvent[] = [];
  const botTakerBuy: TradeEvent[] = [];
  const botTakerSell: TradeEvent[] = [];
  const myBuy: TradeEvent[] = [];
  const mySell: TradeEvent[] = [];

  const bookAtTs = new Map<number, { bid1: number | null; ask1: number | null }>();
  for (const r of rows) {
    if (r.product !== product) continue;
    bookAtTs.set(r.timestamp, { bid1: r.bidPrice1, ask1: r.askPrice1 });
  }

  for (const t of trades) {
    if (t.symbol !== product) continue;
    const entry: TradeEvent = {
      t: t.timestamp,
      p: t.price,
      q: t.quantity,
      buyer: t.buyer ?? "",
      seller: t.seller ?? "",
    };
    const buyerIsMe = t.buyer === "SUBMISSION";
    const sellerIsMe = t.seller === "SUBMISSION";
    if (buyerIsMe && !sellerIsMe) {
      myBuy.push(entry);
      continue;
    }
    if (sellerIsMe && !buyerIsMe) {
      mySell.push(entry);
      continue;
    }
    const book = bookAtTs.get(t.timestamp);
    const atAsk = book && book.ask1 !== null && t.price === book.ask1;
    const atBid = book && book.bid1 !== null && t.price === book.bid1;
    if (atAsk) {
      botTakerBuy.push(entry);
    } else if (atBid) {
      botTakerSell.push(entry);
    } else {
      botMaker.push(entry);
    }
  }
  return { botMaker, botTakerBuy, botTakerSell, myBuy, mySell };
}

function firstIdxAtOrAfter(arr: TradeEvent[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function buildByTs(arr: TradeEvent[]): Map<number, TradeEvent[]> {
  const m = new Map<number, TradeEvent[]>();
  for (const ev of arr) {
    const bucket = m.get(ev.t);
    if (bucket) bucket.push(ev);
    else m.set(ev.t, [ev]);
  }
  return m;
}

type TradeIndex = {
  byTs: Map<number, TradeEvent[]>;
};

type TradeIndexes = {
  botMaker: TradeIndex;
  botTakerBuy: TradeIndex;
  botTakerSell: TradeIndex;
  myBuy: TradeIndex;
  mySell: TradeIndex;
};

function buildIndexes(c: CategorizedTrades): TradeIndexes {
  return {
    botMaker: { byTs: buildByTs(c.botMaker) },
    botTakerBuy: { byTs: buildByTs(c.botTakerBuy) },
    botTakerSell: { byTs: buildByTs(c.botTakerSell) },
    myBuy: { byTs: buildByTs(c.myBuy) },
    mySell: { byTs: buildByTs(c.mySell) },
  };
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke: string
) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x - size, y + size);
  ctx.lineTo(x + size, y + size);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTriangleDown(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke: string
) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + size);
  ctx.lineTo(x - size, y - size);
  ctx.lineTo(x + size, y - size);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSquare(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke: string
) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x - size, y - size, size * 2, size * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export default function DashboardUPlotChart({
  rows,
  trades,
  sandbox,
  product,
  label,
  minHeight = 240,
  visibleLevels,
  visibleTrades,
  visibleOrders,
  normalizer = "none",
  qtyFilter,
  syncKey = "dashboard",
  resetSignal = 0,
  onResetRequest,
  onHoverTime,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tradesRef = useRef<CategorizedTrades>({
    botMaker: [],
    botTakerBuy: [],
    botTakerSell: [],
    myBuy: [],
    mySell: [],
  });
  const ordersRef = useRef<CategorizedOrders>({ bids: [], asks: [] });
  const visibleTradesRef = useRef(visibleTrades);
  visibleTradesRef.current = visibleTrades;
  const visibleLevelsRef = useRef(visibleLevels);
  visibleLevelsRef.current = visibleLevels;
  const visibleOrdersRef = useRef(visibleOrders);
  visibleOrdersRef.current = visibleOrders;
  const onHoverTimeRef = useRef(onHoverTime);
  onHoverTimeRef.current = onHoverTime;
  const normalizerRef = useRef(normalizer);
  normalizerRef.current = normalizer;
  const qtyFilterRef = useRef<QtyFilter | undefined>(qtyFilter);
  qtyFilterRef.current = qtyFilter;

  const book = useMemo(() => dedupeRows(rows), [rows]);

  const normalizerSeries = useMemo<(number | null)[]>(() => {
    if (normalizer === "wallMid") return computeWallMidSeries(rows);
    return new Array(book.xs.length).fill(null);
  }, [normalizer, rows, book.xs.length]);

  const normalizerLookupRef = useRef<Map<number, number | null>>(new Map());
  normalizerLookupRef.current = useMemo(
    () => buildNormalizerLookup(book.xs, normalizerSeries),
    [book.xs, normalizerSeries]
  );

  const displayBook = useMemo(() => {
    if (normalizer === "none") return book;
    return {
      xs: book.xs,
      bid1: applyNormalization(book.bid1, normalizerSeries),
      bid2: applyNormalization(book.bid2, normalizerSeries),
      bid3: applyNormalization(book.bid3, normalizerSeries),
      ask1: applyNormalization(book.ask1, normalizerSeries),
      ask2: applyNormalization(book.ask2, normalizerSeries),
      ask3: applyNormalization(book.ask3, normalizerSeries),
      mid: applyNormalization(book.mid, normalizerSeries),
    };
  }, [book, normalizer, normalizerSeries]);

  const categorized = useMemo(
    () => categorizeTrades(trades, rows, product),
    [trades, rows, product]
  );
  tradesRef.current = categorized;

  const tradeIndexes = useMemo(() => buildIndexes(categorized), [categorized]);
  const tradeIndexesRef = useRef<TradeIndexes>(tradeIndexes);
  tradeIndexesRef.current = tradeIndexes;

  const categorizedOrders = useMemo(
    () => categorizeOrders(sandbox, product),
    [sandbox, product]
  );
  ordersRef.current = categorizedOrders;

  const alignedData = useMemo<AlignedData>(() => {
    return [
      displayBook.xs,
      displayBook.bid1,
      displayBook.bid2,
      displayBook.bid3,
      displayBook.ask1,
      displayBook.ask2,
      displayBook.ask3,
      displayBook.mid,
    ] as AlignedData;
  }, [displayBook]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (alignedData[0].length === 0) return;

    const stepRight = uPlot.paths.stepped!({ align: 1 });

    const series: Series[] = [
      {},
      {
        label: "Bid 1",
        stroke: BID_COLORS.bid1,
        width: 2,
        paths: stepRight,
        points: { show: false },
        spanGaps: true,
        show: visibleLevels.bid1,
      },
      {
        label: "Bid 2",
        stroke: BID_COLORS.bid2,
        width: 1.5,
        paths: stepRight,
        points: { show: false },
        spanGaps: true,
        show: visibleLevels.bid2,
      },
      {
        label: "Bid 3",
        stroke: BID_COLORS.bid3,
        width: 1,
        paths: stepRight,
        points: { show: false },
        spanGaps: true,
        show: visibleLevels.bid3,
      },
      {
        label: "Ask 1",
        stroke: ASK_COLORS.ask1,
        width: 2,
        paths: stepRight,
        points: { show: false },
        spanGaps: true,
        show: visibleLevels.ask1,
      },
      {
        label: "Ask 2",
        stroke: ASK_COLORS.ask2,
        width: 1.5,
        paths: stepRight,
        points: { show: false },
        spanGaps: true,
        show: visibleLevels.ask2,
      },
      {
        label: "Ask 3",
        stroke: ASK_COLORS.ask3,
        width: 1,
        paths: stepRight,
        points: { show: false },
        spanGaps: true,
        show: visibleLevels.ask3,
      },
      {
        label: "Mid",
        stroke: MID_COLOR,
        width: 1,
        points: { show: false },
        spanGaps: true,
        show: visibleLevels.mid,
      },
    ];

    const opts: Options = {
      width: containerRef.current.clientWidth,
      height: Math.max(minHeight, containerRef.current.clientHeight),
      plugins: [wheelZoomPlugin(0.75), scaleSyncPlugin(syncKey)],
      series,
      cursor: {
        show: true,
        x: true,
        y: false,
        drag: { x: true, y: false, uni: 20 },
        sync: {
          key: syncKey,
        },
        points: { show: false },
      },
      legend: { show: false },
      scales: {
        x: { time: false },
        y: { auto: true },
      },
      axes: [
        {
          stroke: "#a3a3a3",
          grid: { stroke: "#3a3d41", width: 1 },
          ticks: { stroke: "#525252", width: 1, size: 5 },
          values: (_u, splits) => splits.map((s) => String(s)),
          font: "11px sans-serif",
        },
        {
          stroke: "#a3a3a3",
          grid: { stroke: "#3a3d41", width: 1 },
          ticks: { stroke: "#525252", width: 1, size: 5 },
          values: (_u, splits) => splits.map((s) => String(s)),
          font: "11px sans-serif",
        },
      ],
      hooks: {
        draw: [
          (u) => {
            const ctx = u.ctx;
            const { botMaker, botTakerBuy, botTakerSell, myBuy, mySell } = tradesRef.current;
            const visT = visibleTradesRef.current;
            const plotLeft = u.bbox.left;
            const plotTop = u.bbox.top;
            const plotRight = plotLeft + u.bbox.width;
            const plotBottom = plotTop + u.bbox.height;
            const xMinVis = u.scales.x.min ?? -Infinity;
            const xMaxVis = u.scales.x.max ?? Infinity;

            const clip = () => {
              ctx.save();
              ctx.beginPath();
              ctx.rect(plotLeft, plotTop, u.bbox.width, u.bbox.height);
              ctx.clip();
            };
            const unclip = () => ctx.restore();

            const normLookup = normalizerLookupRef.current;
            const normActive = normalizerRef.current !== "none";
            const qtyF = qtyFilterRef.current;
            const qtyMin = qtyF ? qtyF.min : 0;
            const qtyMax = qtyF ? qtyF.max : Infinity;

            const drawBucket = (
              arr: TradeEvent[],
              fn: (
                c: CanvasRenderingContext2D,
                x: number,
                y: number
              ) => void
            ) => {
              const start = firstIdxAtOrAfter(arr, xMinVis);
              for (let i = start; i < arr.length; i++) {
                const ev = arr[i];
                if (ev.t > xMaxVis) break;
                const aq = Math.abs(ev.q);
                if (aq < qtyMin || aq > qtyMax) continue;
                let pVal = ev.p;
                if (normActive) {
                  const n = normLookup.get(ev.t);
                  if (n === null || n === undefined) continue;
                  pVal = ev.p - n;
                }
                const xPos = u.valToPos(ev.t, "x", true);
                const yPos = u.valToPos(pVal, "y", true);
                if (
                  yPos < plotTop ||
                  yPos > plotBottom ||
                  xPos < plotLeft ||
                  xPos > plotRight
                )
                  continue;
                fn(ctx, xPos, yPos);
              }
            };

            if (visT.botMaker) {
              clip();
              drawBucket(botMaker, (c, x, y) =>
                drawSquare(c, x, y, 6, BOT_MAKER_COLOR, "#2a2d31")
              );
              unclip();
            }

            if (visT.botTaker) {
              clip();
              drawBucket(botTakerBuy, (c, x, y) =>
                drawTriangle(c, x, y, 7, BOT_TAKER_COLOR, "#2a2d31")
              );
              drawBucket(botTakerSell, (c, x, y) =>
                drawTriangleDown(c, x, y, 7, BOT_TAKER_COLOR, "#2a2d31")
              );
              unclip();
            }

            if (visT.myBuy) {
              clip();
              drawBucket(myBuy, (c, x, y) =>
                drawTriangle(c, x, y, 8, MY_BUY_COLOR, "#2a2d31")
              );
              unclip();
            }

            if (visT.mySell) {
              clip();
              drawBucket(mySell, (c, x, y) =>
                drawTriangleDown(c, x, y, 8, MY_SELL_COLOR, "#2a2d31")
              );
              unclip();
            }

            if (normActive) {
              const zeroY = u.valToPos(0, "y", true);
              if (zeroY >= plotTop && zeroY <= plotBottom) {
                ctx.save();
                ctx.strokeStyle = "rgba(212, 212, 212, 0.5)";
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(plotLeft, zeroY);
                ctx.lineTo(plotRight, zeroY);
                ctx.stroke();
                ctx.restore();
              }
            }
          },
        ],
        setCursor: [
          (u) => {
            const tt = tooltipRef.current;
            const container = containerRef.current;

            const { idx, left, top } = u.cursor;
            const invalid =
              idx === null ||
              idx === undefined ||
              left === undefined ||
              top === undefined ||
              left < 0 ||
              top < 0;

            if (invalid) {
              if (tt) tt.style.display = "none";
              onHoverTimeRef.current?.(null);
              return;
            }
            if (!tt || !container) return;

            const xVal = u.data[0][idx];
            if (xVal === null || xVal === undefined) {
              tt.style.display = "none";
              onHoverTimeRef.current?.(null);
              return;
            }

            onHoverTimeRef.current?.(xVal as number);

            const visL = visibleLevelsRef.current;
            const visT = visibleTradesRef.current;

            const levelRows: string[] = [];
            const levelOrder: {
              key: "bid1" | "bid2" | "bid3" | "ask1" | "ask2" | "ask3" | "mid";
              label: string;
              color: string;
              seriesIdx: number;
            }[] = [
              { key: "ask3", label: "Ask 3", color: ASK_COLORS.ask3, seriesIdx: 6 },
              { key: "ask2", label: "Ask 2", color: ASK_COLORS.ask2, seriesIdx: 5 },
              { key: "ask1", label: "Ask 1", color: ASK_COLORS.ask1, seriesIdx: 4 },
              { key: "mid", label: "Mid", color: MID_COLOR, seriesIdx: 7 },
              { key: "bid1", label: "Bid 1", color: BID_COLORS.bid1, seriesIdx: 1 },
              { key: "bid2", label: "Bid 2", color: BID_COLORS.bid2, seriesIdx: 2 },
              { key: "bid3", label: "Bid 3", color: BID_COLORS.bid3, seriesIdx: 3 },
            ];

            const normActiveTt = normalizerRef.current !== "none";
            const normAtTs = normActiveTt
              ? normalizerLookupRef.current.get(xVal as number)
              : null;

            for (const l of levelOrder) {
              if (!visL[l.key]) continue;
              const v = u.data[l.seriesIdx][idx];
              if (v === null || v === undefined) continue;
              let valueHtml: string;
              if (normActiveTt && normAtTs !== null && normAtTs !== undefined) {
                const absV = (v as number) + normAtTs;
                valueHtml = `${(v as number).toFixed(1)} <span style="color:#737373">(${absV})</span>`;
              } else {
                valueHtml = `${v}`;
              }
              levelRows.push(
                `<div style="display:flex;align-items:center;gap:6px;font-size:11px;font-family:ui-monospace,monospace;color:#f5f5f5"><span style="display:inline-block;width:8px;height:8px;background:${l.color};flex:none"></span><span style="color:#a3a3a3;min-width:34px">${l.label}</span><span>${valueHtml}</span></div>`
              );
            }

            const tradeRows: string[] = [];
            const tIdx = tradeIndexesRef.current;
            const xTs = xVal as number;

            const fmtCounterparty = (ev: TradeEvent): string => {
              const b = ev.buyer && ev.buyer !== "SUBMISSION" ? ev.buyer : "";
              const s = ev.seller && ev.seller !== "SUBMISSION" ? ev.seller : "";
              if (b && s) return ` &nbsp;<span style="color:#737373">${s} &rarr; ${b}</span>`;
              if (b) return ` &nbsp;<span style="color:#737373">buyer: ${b}</span>`;
              if (s) return ` &nbsp;<span style="color:#737373">seller: ${s}</span>`;
              return "";
            };

            const fmtPrice = (p: number): string => {
              if (
                normActiveTt &&
                normAtTs !== null &&
                normAtTs !== undefined
              ) {
                const n = p - normAtTs;
                return `${n.toFixed(1)} <span style="color:#737373">(${p})</span>`;
              }
              return `${p}`;
            };

            const qtyFTt = qtyFilterRef.current;
            const qMin = qtyFTt ? qtyFTt.min : 0;
            const qMax = qtyFTt ? qtyFTt.max : Infinity;
            const passQ = (q: number) => {
              const a = Math.abs(q);
              return a >= qMin && a <= qMax;
            };

            if (visT.myBuy) {
              const hits = tIdx.myBuy.byTs.get(xTs);
              if (hits) {
                for (const ev of hits) {
                  if (!passQ(ev.q)) continue;
                  tradeRows.push(
                    `<div style="font-size:10px;font-family:ui-monospace,monospace;color:${MY_BUY_COLOR}">MY BUY ${ev.q} @ ${fmtPrice(ev.p)}${fmtCounterparty(ev)}</div>`
                  );
                }
              }
            }
            if (visT.mySell) {
              const hits = tIdx.mySell.byTs.get(xTs);
              if (hits) {
                for (const ev of hits) {
                  if (!passQ(ev.q)) continue;
                  tradeRows.push(
                    `<div style="font-size:10px;font-family:ui-monospace,monospace;color:${MY_SELL_COLOR}">MY SELL ${ev.q} @ ${fmtPrice(ev.p)}${fmtCounterparty(ev)}</div>`
                  );
                }
              }
            }
            if (visT.botTaker) {
              const hitsBuy = tIdx.botTakerBuy.byTs.get(xTs);
              if (hitsBuy) {
                for (const ev of hitsBuy) {
                  if (!passQ(ev.q)) continue;
                  tradeRows.push(
                    `<div style="font-size:10px;font-family:ui-monospace,monospace;color:${BOT_TAKER_COLOR}">TAKER BUY ${ev.q} @ ${fmtPrice(ev.p)}${fmtCounterparty(ev)}</div>`
                  );
                }
              }
              const hitsSell = tIdx.botTakerSell.byTs.get(xTs);
              if (hitsSell) {
                for (const ev of hitsSell) {
                  if (!passQ(ev.q)) continue;
                  tradeRows.push(
                    `<div style="font-size:10px;font-family:ui-monospace,monospace;color:${BOT_TAKER_COLOR}">TAKER SELL ${ev.q} @ ${fmtPrice(ev.p)}${fmtCounterparty(ev)}</div>`
                  );
                }
              }
            }
            if (visT.botMaker) {
              const hits = tIdx.botMaker.byTs.get(xTs);
              if (hits) {
                for (const ev of hits) {
                  if (!passQ(ev.q)) continue;
                  tradeRows.push(
                    `<div style="font-size:10px;font-family:ui-monospace,monospace;color:${BOT_MAKER_COLOR}">MAKER ${ev.q} @ ${fmtPrice(ev.p)}${fmtCounterparty(ev)}</div>`
                  );
                }
              }
            }

            const orderRows: string[] = [];
            const visO = visibleOrdersRef.current;
            const { bids: ownBids, asks: ownAsks } = ordersRef.current;
            if (visO.ownOrders) {
              for (const ev of ownBids) {
                if (ev.t === xTs) {
                  orderRows.push(
                    `<div style="font-size:10px;font-family:ui-monospace,monospace;color:${OWN_ORDER_BID_COLOR}">ORD BID ${ev.q} @ ${ev.p}</div>`
                  );
                }
              }
              for (const ev of ownAsks) {
                if (ev.t === xTs) {
                  orderRows.push(
                    `<div style="font-size:10px;font-family:ui-monospace,monospace;color:${OWN_ORDER_ASK_COLOR}">ORD ASK ${ev.q} @ ${ev.p}</div>`
                  );
                }
              }
            }

            if (
              levelRows.length === 0 &&
              tradeRows.length === 0 &&
              orderRows.length === 0
            ) {
              tt.style.display = "none";
              return;
            }

            const tradesBlock =
              tradeRows.length > 0
                ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #404040">${tradeRows.join(
                    ""
                  )}</div>`
                : "";
            const ordersBlock =
              orderRows.length > 0
                ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #404040">${orderRows.join(
                    ""
                  )}</div>`
                : "";

            tt.innerHTML = `
              <div style="font-size:10px;color:#737373;margin-bottom:3px">${xTs}</div>
              ${levelRows.join("")}
              ${tradesBlock}
              ${ordersBlock}
            `;
            tt.style.display = "block";

            const containerRect = container.getBoundingClientRect();
            const tooltipWidth = 160;
            let leftPx = left + 16;
            if (leftPx + tooltipWidth > containerRect.width) {
              leftPx = left - tooltipWidth - 16;
            }
            tt.style.left = `${leftPx}px`;
            tt.style.top = `${Math.max(4, top - 40)}px`;
          },
        ],
      },
    };

    const plot = new uPlot(opts, alignedData, containerRef.current);
    plotRef.current = plot;
    registerScaleSync(plot, syncKey);

    const leaveHandler = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
      onHoverTimeRef.current?.(null);
    };
    containerRef.current.addEventListener("mouseleave", leaveHandler);
    const localContainer = containerRef.current;

    let pendingSize: { width: number; height: number } | null = null;
    let sizeRaf = 0;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        pendingSize = {
          width: entry.contentRect.width,
          height: Math.max(minHeight, entry.contentRect.height),
        };
      }
      if (sizeRaf === 0) {
        sizeRaf = requestAnimationFrame(() => {
          sizeRaf = 0;
          if (pendingSize) {
            plot.setSize(pendingSize);
            pendingSize = null;
          }
        });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (sizeRaf !== 0) {
        cancelAnimationFrame(sizeRaf);
        sizeRaf = 0;
      }
      localContainer.removeEventListener("mouseleave", leaveHandler);
      unregisterScaleSync(plot);
      plot.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minHeight, syncKey]);

  const firstDataSkipRef = useRef(true);
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    if (firstDataSkipRef.current) {
      firstDataSkipRef.current = false;
      return;
    }
    plot.setData(alignedData);
  }, [alignedData]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    plot.setSeries(1, { show: visibleLevels.bid1 });
    plot.setSeries(2, { show: visibleLevels.bid2 });
    plot.setSeries(3, { show: visibleLevels.bid3 });
    plot.setSeries(4, { show: visibleLevels.ask1 });
    plot.setSeries(5, { show: visibleLevels.ask2 });
    plot.setSeries(6, { show: visibleLevels.ask3 });
    plot.setSeries(7, { show: visibleLevels.mid });
  }, [visibleLevels]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    plot.redraw(false);
  }, [visibleTrades, categorized, visibleOrders, categorizedOrders, qtyFilter, normalizer]);

  useEffect(() => {
    if (resetSignal === 0) return;
    resetUPlotX(plotRef.current);
  }, [resetSignal]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31] relative flex flex-col min-h-0 min-w-0">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5 flex-none">
        <span className="text-neutral-100 text-xs font-semibold">{label}</span>
        <button
          onClick={() => {
            resetUPlotX(plotRef.current);
            onResetRequest?.();
          }}
          className="text-[11px] text-neutral-400 hover:text-neutral-100 border border-neutral-600 px-1.5 py-0.5"
        >
          Reset
        </button>
      </div>
      <div
        ref={containerRef}
        style={{ width: "100%", minHeight }}
        className="relative flex-1"
      />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-[#1f2125] border border-neutral-600 px-2 py-1.5 z-10"
        style={{ display: "none", top: 0, left: 0, minWidth: 140 }}
      />
    </div>
  );
}
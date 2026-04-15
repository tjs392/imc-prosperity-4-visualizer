"use client";

import { useEffect, useMemo, useRef } from "react";
import uPlot, { AlignedData, Options } from "uplot";
import "uplot/dist/uPlot.min.css";
import { ActivityRow, Trade } from "@/lib/types";
import {
  wheelZoomPlugin,
  resetUPlotX,
  scaleSyncPlugin,
  registerScaleSync,
  unregisterScaleSync,
} from "@/lib/uplotPlugins";
import {
  makeXPlotLinesDrawHook,
  computeYRange,
  darkAxes,
  XPlotLine,
} from "@/lib/historicalUplotHelpers";

type Props = {
  rows: ActivityRow[];
  trades: Trade[];
  product: string;
  label: string;
  height?: number;
  xPlotLines?: XPlotLine[];
  syncKey?: string;
  resetSignal?: number;
};

const BID_COLORS = ["#16a34a", "#22c55e", "#4ade80"];
const ASK_COLORS = ["#dc2626", "#ef4444", "#f87171"];
const MID_COLOR = "rgba(163, 163, 163, 0.5)";

// Trade marker palette — buy = up green triangle, sell = down red triangle.
const BUY_FILL = "#22c55e";
const BUY_STROKE = "#16a34a";
const SELL_FILL = "#ef4444";
const SELL_STROKE = "#dc2626";
const NEUTRAL_FILL = "#a3a3a3";
const NEUTRAL_STROKE = "#737373";

const TRIANGLE_SIZE = 4;

const SERIES_LABELS = ["", "Bid 1", "Bid 2", "Bid 3", "Mid", "Ask 1", "Ask 2", "Ask 3"];
const SERIES_COLORS = [
  "",
  BID_COLORS[0],
  BID_COLORS[1],
  BID_COLORS[2],
  MID_COLOR,
  ASK_COLORS[0],
  ASK_COLORS[1],
  ASK_COLORS[2],
];

type TradeMark = {
  ts: number;
  price: number;
  qty: number;
  side: "buy" | "sell" | "neutral";
};

function drawTriangleUp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke: string
) {
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
}

function drawTriangleDown(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke: string
) {
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
}

export default function HistoricalPriceChart({
  rows,
  trades,
  product,
  label,
  height = 260,
  xPlotLines,
  syncKey = "historical",
  resetSignal = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const xPlotLinesRef = useRef(xPlotLines);
  xPlotLinesRef.current = xPlotLines;

  // Aligned book data (no trade column — trades are drawn as a hook overlay).
  const alignedData = useMemo<AlignedData>(() => {
    const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
    if (sorted.length === 0) {
      return [[], [], [], [], [], [], [], []] as unknown as AlignedData;
    }
    const xs: number[] = [];
    const bid1: (number | null)[] = [];
    const bid2: (number | null)[] = [];
    const bid3: (number | null)[] = [];
    const mid: (number | null)[] = [];
    const ask1: (number | null)[] = [];
    const ask2: (number | null)[] = [];
    const ask3: (number | null)[] = [];
    for (const r of sorted) {
      xs.push(r.timestamp);
      bid1.push(r.bidPrice1);
      bid2.push(r.bidPrice2);
      bid3.push(r.bidPrice3);
      mid.push(r.midPrice);
      ask1.push(r.askPrice1);
      ask2.push(r.askPrice2);
      ask3.push(r.askPrice3);
    }
    return [xs, bid1, bid2, bid3, mid, ask1, ask2, ask3] as unknown as AlignedData;
  }, [rows]);

  // Classify each trade as buy/sell/neutral by comparing price to mid at that ts.
  // No "SUBMISSION" concept in pure historical data, so this is the natural
  // aggressor-side proxy: above mid -> taker bought (up), below -> taker sold (down).
  const tradeMarks = useMemo<TradeMark[]>(() => {
    const midByTs = new Map<number, number>();
    for (const r of rows) {
      if (r.midPrice !== null) midByTs.set(r.timestamp, r.midPrice);
    }
    const out: TradeMark[] = [];
    for (const t of trades) {
      if (t.symbol !== product) continue;
      const m = midByTs.get(t.timestamp);
      let side: TradeMark["side"] = "neutral";
      if (m !== undefined) {
        if (t.price > m) side = "buy";
        else if (t.price < m) side = "sell";
      }
      out.push({ ts: t.timestamp, price: t.price, qty: t.quantity, side });
    }
    out.sort((a, b) => a.ts - b.ts);
    return out;
  }, [trades, rows, product]);

  // Per-ts index for tooltip lookups (multiple trades may share a ts).
  const tradesByTs = useMemo(() => {
    const m = new Map<number, TradeMark[]>();
    for (const t of tradeMarks) {
      const arr = m.get(t.ts);
      if (arr) arr.push(t);
      else m.set(t.ts, [t]);
    }
    return m;
  }, [tradeMarks]);

  const tradeMarksRef = useRef<TradeMark[]>(tradeMarks);
  tradeMarksRef.current = tradeMarks;
  const tradesByTsRef = useRef(tradesByTs);
  tradesByTsRef.current = tradesByTs;

  useEffect(() => {
    if (!containerRef.current) return;

    const drawXPlotLines = makeXPlotLinesDrawHook(() => xPlotLinesRef.current);

    // Trade-marker overlay: clipped to plot area, classifies by side.
    const drawTrades = (u: uPlot) => {
      const marks = tradeMarksRef.current;
      if (marks.length === 0) return;
      const xMin = u.scales.x.min ?? -Infinity;
      const xMax = u.scales.x.max ?? Infinity;
      const yMin = u.scales.y.min ?? -Infinity;
      const yMax = u.scales.y.max ?? Infinity;
      const ctx = u.ctx;
      const left = u.bbox.left;
      const top = u.bbox.top;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, u.bbox.width, u.bbox.height);
      ctx.clip();
      for (const m of marks) {
        if (m.ts < xMin || m.ts > xMax) continue;
        if (m.price < yMin || m.price > yMax) continue;
        const px = u.valToPos(m.ts, "x", true);
        const py = u.valToPos(m.price, "y", true);
        if (m.side === "buy") {
          drawTriangleUp(ctx, px, py, TRIANGLE_SIZE, BUY_FILL, BUY_STROKE);
        } else if (m.side === "sell") {
          drawTriangleDown(ctx, px, py, TRIANGLE_SIZE, SELL_FILL, SELL_STROKE);
        } else {
          drawTriangleUp(ctx, px, py, TRIANGLE_SIZE, NEUTRAL_FILL, NEUTRAL_STROKE);
        }
      }
      ctx.restore();
    };

    const opts: Options = {
      width: containerRef.current.clientWidth,
      height,
      plugins: [wheelZoomPlugin(0.75), scaleSyncPlugin(syncKey)],
      series: [
        {},
        { label: SERIES_LABELS[1], stroke: SERIES_COLORS[1], width: 1.25, points: { show: false }, spanGaps: false },
        { label: SERIES_LABELS[2], stroke: SERIES_COLORS[2], width: 1, points: { show: false }, spanGaps: false },
        { label: SERIES_LABELS[3], stroke: SERIES_COLORS[3], width: 1, points: { show: false }, spanGaps: false },
        { label: SERIES_LABELS[4], stroke: SERIES_COLORS[4], width: 1.5, points: { show: false }, spanGaps: false },
        { label: SERIES_LABELS[5], stroke: SERIES_COLORS[5], width: 1.25, points: { show: false }, spanGaps: false },
        { label: SERIES_LABELS[6], stroke: SERIES_COLORS[6], width: 1, points: { show: false }, spanGaps: false },
        { label: SERIES_LABELS[7], stroke: SERIES_COLORS[7], width: 1, points: { show: false }, spanGaps: false },
      ],
      cursor: {
        show: true,
        x: true,
        y: true,
        drag: { x: true, y: false, uni: 20 },
        sync: { key: syncKey },
        points: {
          show: true,
          size: 6,
          stroke: () => MID_COLOR,
          fill: () => MID_COLOR,
        },
      },
      legend: { show: false },
      scales: { x: { time: false }, y: { auto: true } },
      axes: darkAxes(),
      hooks: {
        // Order matters: book lines drawn first by uPlot; our hooks run after.
        // Trades sit on top of book lines, day boundaries on top of trades.
        draw: [drawTrades, drawXPlotLines],
        setCursor: [
          (u) => {
            const tt = tooltipRef.current;
            const container = containerRef.current;
            if (!tt || !container) return;
            const { idx } = u.cursor;
            if (idx === null || idx === undefined) {
              tt.style.display = "none";
              return;
            }
            const xVal = u.data[0][idx];
            if (xVal === null || xVal === undefined) {
              tt.style.display = "none";
              return;
            }
            const lines: string[] = [
              `<div style="font-size:10px;color:#737373">ts ${xVal}</div>`,
            ];
            for (let s = 1; s <= 7; s++) {
              const v = u.data[s]?.[idx];
              if (v === null || v === undefined) continue;
              lines.push(
                `<div style="font-size:11px;color:${SERIES_COLORS[s]};font-family:ui-monospace,monospace">${SERIES_LABELS[s]}: ${v}</div>`
              );
            }
            const tradesHere = tradesByTsRef.current.get(xVal as number);
            if (tradesHere && tradesHere.length > 0) {
              for (const tr of tradesHere) {
                const arrow = tr.side === "buy" ? "▲" : tr.side === "sell" ? "▼" : "◆";
                const color =
                  tr.side === "buy" ? BUY_FILL : tr.side === "sell" ? SELL_FILL : NEUTRAL_FILL;
                lines.push(
                  `<div style="font-size:11px;color:${color};font-family:ui-monospace,monospace">${arrow} ${tr.price} × ${tr.qty}</div>`
                );
              }
            }
            if (lines.length === 1) {
              tt.style.display = "none";
              return;
            }
            tt.style.display = "block";
            tt.innerHTML = lines.join("");
            const containerRect = container.getBoundingClientRect();
            const tooltipWidth = 180;
            const cursorLeft = u.cursor.left ?? 0;
            const cursorTop = u.cursor.top ?? 0;
            let left = cursorLeft + 12;
            if (left + tooltipWidth > containerRect.width) {
              left = cursorLeft - tooltipWidth - 12;
            }
            tt.style.left = `${left}px`;
            tt.style.top = `${Math.max(4, cursorTop - 30)}px`;
          },
        ],
      },
    };

    const plot = new uPlot(opts, alignedData, containerRef.current);
    plotRef.current = plot;
    registerScaleSync(plot, syncKey);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plot.setSize({ width: entry.contentRect.width, height });
      }
    });
    resizeObserver.observe(containerRef.current);

    const localContainer = containerRef.current;
    const leaveHandler = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
    };
    localContainer.addEventListener("mouseleave", leaveHandler);

    return () => {
      resizeObserver.disconnect();
      localContainer.removeEventListener("mouseleave", leaveHandler);
      unregisterScaleSync(plot);
      plot.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, syncKey]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    plot.setData(alignedData, false);
    const arrays: (number | null)[][] = [];
    for (let s = 1; s < alignedData.length; s++) {
      arrays.push(alignedData[s] as (number | null)[]);
    }
    const r = computeYRange(arrays);
    if (r) plot.setScale("y", { min: r.min, max: r.max });
    else plot.redraw();
  }, [alignedData]);

  // Re-render trade overlay when the trade set changes, even if book data didn't.
  useEffect(() => {
    plotRef.current?.redraw();
  }, [tradeMarks]);

  useEffect(() => {
    if (resetSignal === 0) return;
    resetUPlotX(plotRef.current);
  }, [resetSignal]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31] relative min-w-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
        <span className="text-neutral-100 text-xs font-semibold">{label}</span>
        <button
          onClick={() => resetUPlotX(plotRef.current)}
          className="text-[11px] text-neutral-400 hover:text-neutral-100 border border-neutral-600 px-1.5 py-0.5"
        >
          Reset
        </button>
      </div>
      <div
        ref={containerRef}
        style={{ width: "100%", height }}
        className="relative"
      />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-[#1f2125] border border-neutral-600 px-2 py-1 z-10"
        style={{ display: "none", top: 0, left: 0, minWidth: 140 }}
      />
    </div>
  );
}
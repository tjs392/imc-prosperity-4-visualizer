"use client";

import { useEffect, useMemo, useRef } from "react";
import uPlot, { AlignedData, Options, Series } from "uplot";
import "uplot/dist/uPlot.min.css";
import { ActivityRow, Trade } from "@/lib/types";
import { wheelZoomPlugin, resetUPlotX, scaleSyncPlugin, registerScaleSync, unregisterScaleSync } from "@/lib/uplotPlugins";

type Props = {
  rows: ActivityRow[];
  trades: Trade[];
  product: string;
  label: string;
  height?: number;
  visibleLevels: {
    bid1: boolean;
    bid2: boolean;
    bid3: boolean;
    ask1: boolean;
    ask2: boolean;
    ask3: boolean;
  };
  visibleTrades: {
    market: boolean;
    ownBuy: boolean;
    ownSell: boolean;
  };
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

const MARKET_TRADE_COLOR = "#fbbf24";
const OWN_BUY_COLOR = "#22c55e";
const OWN_SELL_COLOR = "#ef4444";

type DedupedBook = {
  xs: number[];
  bid1: (number | null)[];
  bid2: (number | null)[];
  bid3: (number | null)[];
  ask1: (number | null)[];
  ask2: (number | null)[];
  ask3: (number | null)[];
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
  for (const t of sortedTimes) {
    const r = byTime.get(t)!;
    xs.push(t);
    bid1.push(r.bidPrice1);
    bid2.push(r.bidPrice2);
    bid3.push(r.bidPrice3);
    ask1.push(r.askPrice1);
    ask2.push(r.askPrice2);
    ask3.push(r.askPrice3);
  }
  return { xs, bid1, bid2, bid3, ask1, ask2, ask3 };
}

type TradeEvent = {
  t: number;
  p: number;
  q: number;
  buyer: string;
  seller: string;
};

type CategorizedTrades = {
  market: TradeEvent[];
  ownBuy: TradeEvent[];
  ownSell: TradeEvent[];
};

function categorizeTrades(
  trades: Trade[],
  product: string
): CategorizedTrades {
  const market: TradeEvent[] = [];
  const ownBuy: TradeEvent[] = [];
  const ownSell: TradeEvent[] = [];
  for (const t of trades) {
    if (t.symbol !== product) continue;
    const entry: TradeEvent = {
      t: t.timestamp,
      p: t.price,
      q: t.quantity,
      buyer: t.buyer ?? "",
      seller: t.seller ?? "",
    };
    if (t.buyer === "SUBMISSION" && t.seller !== "SUBMISSION") {
      ownBuy.push(entry);
    } else if (t.seller === "SUBMISSION" && t.buyer !== "SUBMISSION") {
      ownSell.push(entry);
    } else {
      market.push(entry);
    }
  }
  return { market, ownBuy, ownSell };
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  shape: "triangle" | "diamond",
  size: number,
  fill: string,
  stroke?: string
) {
  ctx.save();
  ctx.fillStyle = fill;
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
  }
  ctx.beginPath();
  if (shape === "triangle") {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.lineTo(x + size, y + size);
    ctx.closePath();
  } else {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
  }
  ctx.fill();
  if (stroke) ctx.stroke();
  ctx.restore();
}

export default function DashboardUPlotChart({
  rows,
  trades,
  product,
  label,
  height = 520,
  visibleLevels,
  visibleTrades,
  syncKey = "dashboard",
  resetSignal = 0,
  onResetRequest,
  onHoverTime,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tradesRef = useRef<CategorizedTrades>({
    market: [],
    ownBuy: [],
    ownSell: [],
  });
  const visibleTradesRef = useRef(visibleTrades);
  visibleTradesRef.current = visibleTrades;
  const visibleLevelsRef = useRef(visibleLevels);
  visibleLevelsRef.current = visibleLevels;
  const onHoverTimeRef = useRef(onHoverTime);
  onHoverTimeRef.current = onHoverTime;

  const book = useMemo(() => dedupeRows(rows), [rows]);

  const categorized = useMemo(
    () => categorizeTrades(trades, product),
    [trades, product]
  );
  tradesRef.current = categorized;

  const alignedData = useMemo<AlignedData>(() => {
    return [
      book.xs,
      book.bid1,
      book.bid2,
      book.bid3,
      book.ask1,
      book.ask2,
      book.ask3,
    ] as AlignedData;
  }, [book]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (alignedData[0].length === 0) return;

    const stepLeft = uPlot.paths.stepped!({ align: -1 });

    const series: Series[] = [
      {},
      {
        label: "Bid 1",
        stroke: BID_COLORS.bid1,
        width: 2,
        paths: stepLeft,
        points: {
          show: true,
          size: 3,
          stroke: BID_COLORS.bid1,
          fill: BID_COLORS.bid1,
        },
        spanGaps: true,
        show: visibleLevels.bid1,
      },
      {
        label: "Bid 2",
        stroke: BID_COLORS.bid2,
        width: 1.5,
        paths: stepLeft,
        points: { show: false },
        spanGaps: true,
        show: visibleLevels.bid2,
      },
      {
        label: "Bid 3",
        stroke: BID_COLORS.bid3,
        width: 1,
        paths: stepLeft,
        points: { show: false },
        spanGaps: true,
        show: visibleLevels.bid3,
      },
      {
        label: "Ask 1",
        stroke: ASK_COLORS.ask1,
        width: 2,
        paths: stepLeft,
        points: {
          show: true,
          size: 3,
          stroke: ASK_COLORS.ask1,
          fill: ASK_COLORS.ask1,
        },
        spanGaps: true,
        show: visibleLevels.ask1,
      },
      {
        label: "Ask 2",
        stroke: ASK_COLORS.ask2,
        width: 1.5,
        paths: stepLeft,
        points: { show: false },
        spanGaps: true,
        show: visibleLevels.ask2,
      },
      {
        label: "Ask 3",
        stroke: ASK_COLORS.ask3,
        width: 1,
        paths: stepLeft,
        points: { show: false },
        spanGaps: true,
        show: visibleLevels.ask3,
      },
    ];

    const opts: Options = {
      width: containerRef.current.clientWidth,
      height,
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
            const { market, ownBuy, ownSell } = tradesRef.current;
            const visT = visibleTradesRef.current;
            const plotLeft = u.bbox.left;
            const plotTop = u.bbox.top;
            const plotRight = plotLeft + u.bbox.width;
            const plotBottom = plotTop + u.bbox.height;

            const clip = () => {
              ctx.save();
              ctx.beginPath();
              ctx.rect(plotLeft, plotTop, u.bbox.width, u.bbox.height);
              ctx.clip();
            };
            const unclip = () => ctx.restore();

            if (visT.market) {
              clip();
              for (const ev of market) {
                const xPos = u.valToPos(ev.t, "x", true);
                const yPos = u.valToPos(ev.p, "y", true);
                if (
                  xPos < plotLeft ||
                  xPos > plotRight ||
                  yPos < plotTop ||
                  yPos > plotBottom
                )
                  continue;
                drawMarker(
                  ctx,
                  xPos,
                  yPos,
                  "triangle",
                  3,
                  MARKET_TRADE_COLOR,
                  "#2a2d31"
                );
              }
              unclip();
            }

            if (visT.ownBuy) {
              clip();
              for (const ev of ownBuy) {
                const xPos = u.valToPos(ev.t, "x", true);
                const yPos = u.valToPos(ev.p, "y", true);
                if (
                  xPos < plotLeft ||
                  xPos > plotRight ||
                  yPos < plotTop ||
                  yPos > plotBottom
                )
                  continue;
                drawMarker(
                  ctx,
                  xPos,
                  yPos,
                  "diamond",
                  4.5,
                  OWN_BUY_COLOR,
                  "#f5f5f5"
                );
              }
              unclip();
            }

            if (visT.ownSell) {
              clip();
              for (const ev of ownSell) {
                const xPos = u.valToPos(ev.t, "x", true);
                const yPos = u.valToPos(ev.p, "y", true);
                if (
                  xPos < plotLeft ||
                  xPos > plotRight ||
                  yPos < plotTop ||
                  yPos > plotBottom
                )
                  continue;
                drawMarker(
                  ctx,
                  xPos,
                  yPos,
                  "diamond",
                  4.5,
                  OWN_SELL_COLOR,
                  "#f5f5f5"
                );
              }
              unclip();
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
              key: LevelKey;
              label: string;
              color: string;
              seriesIdx: number;
            }[] = [
              { key: "ask3", label: "Ask 3", color: ASK_COLORS.ask3, seriesIdx: 6 },
              { key: "ask2", label: "Ask 2", color: ASK_COLORS.ask2, seriesIdx: 5 },
              { key: "ask1", label: "Ask 1", color: ASK_COLORS.ask1, seriesIdx: 4 },
              { key: "bid1", label: "Bid 1", color: BID_COLORS.bid1, seriesIdx: 1 },
              { key: "bid2", label: "Bid 2", color: BID_COLORS.bid2, seriesIdx: 2 },
              { key: "bid3", label: "Bid 3", color: BID_COLORS.bid3, seriesIdx: 3 },
            ];

            for (const l of levelOrder) {
              if (!visL[l.key]) continue;
              const v = u.data[l.seriesIdx][idx];
              if (v === null || v === undefined) continue;
              levelRows.push(
                `<div style="display:flex;align-items:center;gap:6px;font-size:11px;font-family:ui-monospace,monospace;color:#f5f5f5"><span style="display:inline-block;width:8px;height:8px;background:${l.color};flex:none"></span><span style="color:#a3a3a3;min-width:34px">${l.label}</span><span>${v}</span></div>`
              );
            }

            const tradeRows: string[] = [];
            const { market, ownBuy, ownSell } = tradesRef.current;
            const xTs = xVal as number;

            const fmtCounterparty = (ev: TradeEvent): string => {
              const b = ev.buyer && ev.buyer !== "SUBMISSION" ? ev.buyer : "";
              const s = ev.seller && ev.seller !== "SUBMISSION" ? ev.seller : "";
              if (b && s) return ` &nbsp;<span style="color:#737373">${s} → ${b}</span>`;
              if (b) return ` &nbsp;<span style="color:#737373">buyer: ${b}</span>`;
              if (s) return ` &nbsp;<span style="color:#737373">seller: ${s}</span>`;
              return "";
            };

            if (visT.ownBuy) {
              for (const ev of ownBuy) {
                if (ev.t === xTs) {
                  tradeRows.push(
                    `<div style="font-size:10px;font-family:ui-monospace,monospace;color:${OWN_BUY_COLOR}">BUY ${ev.q} @ ${ev.p}${fmtCounterparty(ev)}</div>`
                  );
                }
              }
            }
            if (visT.ownSell) {
              for (const ev of ownSell) {
                if (ev.t === xTs) {
                  tradeRows.push(
                    `<div style="font-size:10px;font-family:ui-monospace,monospace;color:${OWN_SELL_COLOR}">SELL ${ev.q} @ ${ev.p}${fmtCounterparty(ev)}</div>`
                  );
                }
              }
            }
            if (visT.market) {
              for (const ev of market) {
                if (ev.t === xTs) {
                  tradeRows.push(
                    `<div style="font-size:10px;font-family:ui-monospace,monospace;color:${MARKET_TRADE_COLOR}">MKT ${ev.q} @ ${ev.p}${fmtCounterparty(ev)}</div>`
                  );
                }
              }
            }

            if (levelRows.length === 0 && tradeRows.length === 0) {
              tt.style.display = "none";
              return;
            }

            const tradesBlock =
              tradeRows.length > 0
                ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #404040">${tradeRows.join(
                    ""
                  )}</div>`
                : "";

            tt.innerHTML = `
              <div style="font-size:10px;color:#737373;margin-bottom:3px">${xTs}</div>
              ${levelRows.join("")}
              ${tradesBlock}
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

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plot.setSize({ width: entry.contentRect.width, height });
      }
    });
    resizeObserver.observe(containerRef.current);

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
  }, [visibleLevels]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    plot.redraw(false);
  }, [visibleTrades, categorized]);

  useEffect(() => {
    if (resetSignal === 0) return;
    resetUPlotX(plotRef.current);
  }, [resetSignal]);

  return (
    <div className="border border-neutral-600 bg-[#2a2d31] relative">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5">
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
      <div ref={containerRef} style={{ width: "100%", height }} className="relative" />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-[#1f2125] border border-neutral-600 px-2 py-1.5 z-10"
        style={{ display: "none", top: 0, left: 0, minWidth: 140 }}
      />
    </div>
  );
}
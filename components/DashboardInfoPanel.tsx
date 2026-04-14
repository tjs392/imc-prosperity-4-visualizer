"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function DashboardInfoPanel({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black transition-opacity duration-200 z-40 ${
          open ? "opacity-50 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      <aside
        className={`fixed top-0 right-0 h-full w-[420px] max-w-full bg-[#1f2125] border-l border-neutral-700 z-50 flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3 flex-none">
          <span className="text-neutral-100 text-sm font-semibold">
            Dashboard Reference
          </span>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-100 text-lg leading-none w-6 h-6 flex items-center justify-center"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-4 space-y-6 text-[12px] text-neutral-200 leading-relaxed">
          <Section
            title="WallMid"
            formula={`bidWall = bid level with max volume
askWall = ask level with max volume
WallMid = (bidWall + askWall) / 2`}
            description="A proxy for true price that uses the heaviest resting liquidity on each side of the book instead of just the best bid/ask. The intuition: traders reading the book interpret a large wall as a stronger signal of fair value than a thin quote at the top. When a large wall sits a few ticks back, WallMid anchors to it rather than chasing noisy best-bid-offer movement."
            example={`At timestamp 0 for INTARIAN_PEPPER_ROOT:
  bid1 = 11991 (vol 20)    <- heaviest bid
  ask1 = 12006 (vol 11)
  ask2 = 12009 (vol 20)    <- heaviest ask

  bidWall = 11991
  askWall = 12009
  WallMid = (11991 + 12009) / 2 = 12000

Compare to regular mid = (11991 + 12006) / 2 = 11998.5
WallMid sees the hidden weight at ask2 and anchors higher.`}
          />

          <Section
            title="Mid Price"
            formula={`mid = (bid1 + ask1) / 2`}
            description="The simple midpoint between the best bid and best ask, taken directly from the activity log. This is the canonical reference price and what most markets display as 'the price.' It can be noisy on thin books because a single small quote at the top level moves it just as much as a heavy one. When mid is missing (e.g. one side of the book is empty) the dashboard forward-fills the last valid value so the line stays continuous."
            example={`ASH_COATED_OSMIUM at timestamp 0:
  bid1 = 9992
  ask1 = 10011
  mid  = (9992 + 10011) / 2 = 10001.5`}
          />

          <Section
            title="Maker vs Taker"
            formula={`if trade.price == ask1(t): buyer crossed -> TAKER BUY
if trade.price == bid1(t): seller crossed -> TAKER SELL
otherwise:                                 -> MAKER`}
            description="Bot-to-bot trades in the log have no explicit maker/taker flag. The dashboard classifies them by comparing the print price to the best bid/ask at that timestamp. If the trade printed at the ask, somebody lifted the offer (buyer is the aggressor = taker). If at the bid, somebody hit the bid (seller is the taker). If the price matches neither, the trade happened inside the spread or at an anomalous level and is shown as a maker/ambiguous square. Your own trades (SUBMISSION) always go to the My Buys / My Sells buckets regardless of price."
            example={`Bot trade at ts 4200, price = 10009
  Activity row at ts 4200: bid1=10007, ask1=10009
  price == ask1 -> TAKER BUY (cyan triangle up)

Another bot trade at ts 4500, price = 10008
  bid1=10007, ask1=10009
  price matches neither -> MAKER (gray square)`}
          />

          <Section
            title="Position"
            formula={`position starts at 0
for each fill where SUBMISSION is involved:
  if we bought: position += quantity
  if we sold:   position -= quantity`}
            description="Running net inventory across the session, computed from the trade history. Only fills where SUBMISSION is on one side count. The Position sub-panel shows this as a step line so each horizontal segment represents the holding between fills. Positive means long, negative means short, zero is flat."
            example={`Trades:
  ts 1000: SUBMISSION buys 5  -> position = +5
  ts 1200: SUBMISSION buys 3  -> position = +8
  ts 1500: SUBMISSION sells 6 -> position = +2
  ts 2000: SUBMISSION sells 4 -> position = -2`}
          />

          <Section
            title="Profit and Loss"
            formula={`pnl is read directly from the activity log (column 17)`}
            description="The P&L series comes straight from the activity log as reported by the simulation engine. The dashboard does not recompute it from fills. It is typically mark-to-market: realized P&L from closed trades plus unrealized P&L on the current position valued at the current mid price. A jump in the line usually means a fill printed; a slope on a flat-position segment means the mark moved while you were holding inventory."
            example={`Activity row excerpt (last field is pnl):
  0;1300;ASH_COATED_OSMIUM;...;10001.0;6.11328125
  0;1400;ASH_COATED_OSMIUM;...;10001.0;5.51953125

PnL went from 6.11 to 5.52 over one tick while mid stayed
at 10001 -- a small mark-to-market tick on an open position.`}
          />
        </div>
      </aside>
    </>
  );
}

function Section({
  title,
  formula,
  description,
  example,
}: {
  title: string;
  formula: string;
  description: string;
  example: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-neutral-100 text-[13px] font-semibold">{title}</div>
      <pre className="bg-[#2a2d31] border border-neutral-700 px-3 py-2 text-[11px] text-neutral-200 font-mono whitespace-pre-wrap break-words leading-snug">
        {formula}
      </pre>
      <p className="text-neutral-300">{description}</p>
      <div className="text-neutral-500 text-[10px] uppercase tracking-wide pt-1">
        Example
      </div>
      <pre className="bg-[#2a2d31] border border-neutral-700 px-3 py-2 text-[11px] text-neutral-300 font-mono whitespace-pre-wrap break-words leading-snug">
        {example}
      </pre>
    </div>
  );
}
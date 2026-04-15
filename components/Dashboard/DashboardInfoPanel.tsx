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
            Glossary
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
            title="Normalization"
            formula={`normalized(v, t) = v - normalizer(t)
                    e.g. v - WallMid(t)`}
            description="When a normalizer is selected, every y-value on the main chart is replaced with its deviation from the normalizer at the same timestamp. The y-axis then shows how far each price sits above or below the reference, not the absolute level. A dashed zero line marks the normalizer itself. This makes mean reversion visually obvious: a mean-reverting product hugs the zero line and excursions show up as spikes regardless of whether the absolute price has drifted over the session. Trade markers are shifted the same way so their position on the chart still reflects where they printed relative to fair. The tooltip shows both the normalized value and the original absolute price in parentheses. Position and P&L panels stay in absolute units."
            example={`At ts 0, WallMid = 12000:
  Bid1 12006 -> normalized = +6
  Bid1 12003 -> normalized = +3
  Trade at 12009 -> shown at y=+9

At ts 50000, WallMid = 12015:
  Bid1 12006 -> normalized = -9

Same absolute price (12006) renders at different
y-positions because WallMid moved. That is the point:
the chart shows deviation, not level.`}
          />

          <Section
            title="Quantity Filter"
            formula={`show trade if qtyMin <= |trade.quantity| <= qtyMax`}
            description="Hides trade markers outside the specified quantity range. Both the main chart markers and the hover tooltip respect the filter; Position and P&L sub-panels do not (they always reflect the true fill history). The filter is per-product and resets when the product selector changes. Leaving the max input empty means no upper bound. This is most useful for focusing on large-size prints when the chart is crowded, or inspecting only small retail-sized bot activity, without having to touch the actual trade data."
            example={`qtyMin = 10, qtyMax = (empty)

Trade with qty 5   -> hidden (below min)
Trade with qty 12  -> shown
Trade with qty 40  -> shown
Own buy of qty 8   -> hidden (even though mine)

Position chart still reflects every fill including
the hidden qty 5 and qty 8 trades.`}
          />

          <Section
            title="Max Drawdown"
            formula={`peak(t)       = max of PnL up to time t
drawdown(t)   = peak(t) - PnL(t)
MaxDrawdown   = max of drawdown over session`}
            description="The largest peak-to-trough decline in the PnL curve over the session. It represents the worst unrealized loss you would have felt if you looked at the screen at the wrong moment, measured from the highest equity reached so far. A strategy with small average returns but large drawdowns is psychologically and practically riskier than one with the same average returns and small drawdowns. The Stats panel also shows the timestamp where max drawdown occurred so you can jump to that region of the chart and see what happened."
            example={`PnL curve: 0 -> 500 -> 200 -> 800 -> 100

peak:      0    500   500   800   800
drawdown:  0    0     300   0     700
MaxDrawdown = 700

Even though the session ended at +100 (positive),
there was a moment where the running loss was 700
below the best point. That is the drawdown you felt.`}
          />

          <Section
            title="Time in Drawdown"
            formula={`timeInDrawdown = (ticks where PnL < peak(t))
                 / total ticks`}
            description="The fraction of ticks during which the PnL was below its running high-water mark. A low percentage means the strategy was usually at or near its best equity point (it spent most of the session making new highs). A high percentage means the strategy made most of its money in short bursts and spent most of the time grinding back up from dips. Two sessions with the same final PnL can have very different Time in Drawdown values, and the lower one is usually the more robust strategy."
            example={`Session of 100 ticks, PnL hits new highs on
10 of them. The other 90 ticks are all below the
running peak.

timeInDrawdown = 90 / 100 = 90%

That's a strategy that makes money in bursts and
spends most of the time recovering.`}
          />

          <Section
            title="Calmar Ratio"
            formula={`Calmar = Final PnL / Max Drawdown`}
            description="A simple return-per-unit-of-pain metric. It asks: for every unit of drawdown the strategy made you sit through, how much did you walk away with? A Calmar of 3 means you earned three times your worst drawdown. A Calmar of 0.5 means your final PnL is half the size of your worst dip along the way. Negative Calmar means the session ended below zero. The dashboard shows a dash when Max Drawdown is 0 (no downside ever, divide-by-zero)."
            example={`Final PnL    = 800
MaxDrawdown  = 700
Calmar       = 800 / 700 = 1.14

Earned slightly more than the worst drawdown.
Not great for a single session; you felt almost as
much pain as the profit you ended with.

Final PnL    = 800
MaxDrawdown  = 100
Calmar       = 800 / 100 = 8.0

Much better: the session was a relatively
steady climb with small dips.`}
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
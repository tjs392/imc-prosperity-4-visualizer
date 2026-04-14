"use client";

import { useMemo } from "react";
import { SandboxEntry } from "@/lib/types";

type Props = {
  sandbox: SandboxEntry[];
  hoveredTime: number | null;
};

function findEntryAtOrBefore(
  sandbox: SandboxEntry[],
  time: number
): SandboxEntry | null {
  if (sandbox.length === 0) return null;
  let lo = 0;
  let hi = sandbox.length - 1;
  let best: SandboxEntry | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const entry = sandbox[mid];
    if (entry.timestamp <= time) {
      best = entry;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function prettyJson(raw: string): string {
  if (!raw || raw.trim() === "") return "";
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

export default function DashboardLogViewer({ sandbox, hoveredTime }: Props) {
  const entry = useMemo(() => {
    if (hoveredTime === null || hoveredTime === undefined) {
      return sandbox.length > 0 ? sandbox[sandbox.length - 1] : null;
    }
    return findEntryAtOrBefore(sandbox, hoveredTime);
  }, [sandbox, hoveredTime]);

  const traderDataPretty = useMemo(
    () => (entry ? prettyJson(entry.traderData) : ""),
    [entry]
  );

  const stdoutClean = useMemo(() => {
    if (!entry) return "";
    return entry.stdout.replace(/\\n/g, "\n").trimEnd();
  }, [entry]);

  const hasOrders = entry && Object.keys(entry.orders).length > 0;

  return (
    <div className="bg-[#2a2d31] h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between border-b border-neutral-600 px-3 py-1.5 flex-none">
        <span className="text-neutral-100 text-xs font-semibold">
          Log Viewer
        </span>
        <span className="text-neutral-500 text-[10px] font-mono">
          {entry ? `ts ${entry.timestamp}` : "-"}
          {hoveredTime !== null && hoveredTime !== undefined && (
            <span className="text-neutral-600 ml-2">
              (hover {hoveredTime})
            </span>
          )}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3 text-[11px] font-mono">
        {!entry && (
          <p className="text-neutral-500">No log entry at this time.</p>
        )}

        {entry && (
          <>
            <div>
              <div className="text-neutral-500 text-[10px] uppercase tracking-wide mb-1">
                Stdout
              </div>
              <pre className="text-neutral-200 whitespace-pre-wrap break-words leading-snug bg-[#1f2125] border border-neutral-700 p-2">
                {stdoutClean || <span className="text-neutral-600">(empty)</span>}
              </pre>
            </div>

            <div>
              <div className="text-neutral-500 text-[10px] uppercase tracking-wide mb-1">
                Trader State
              </div>
              <pre className="text-neutral-200 whitespace-pre-wrap break-words leading-snug bg-[#1f2125] border border-neutral-700 p-2">
                {traderDataPretty || <span className="text-neutral-600">(empty)</span>}
              </pre>
            </div>

            {hasOrders && (
              <div>
                <div className="text-neutral-500 text-[10px] uppercase tracking-wide mb-1">
                  Orders
                </div>
                <div className="bg-[#1f2125] border border-neutral-700 p-2 space-y-1">
                  {Object.entries(entry.orders).map(([symbol, orders]) => (
                    <div key={symbol}>
                      <div className="text-neutral-400">{symbol}</div>
                      {orders.map((o, i) => {
                        const side = o.quantity > 0 ? "BUY" : "SELL";
                        const sideColor =
                          o.quantity > 0 ? "#22c55e" : "#ef4444";
                        return (
                          <div
                            key={i}
                            className="text-neutral-200 pl-3"
                          >
                            <span style={{ color: sideColor }}>{side}</span>{" "}
                            {Math.abs(o.quantity)} @ {o.price}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
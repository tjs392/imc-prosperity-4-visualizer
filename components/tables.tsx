"use client";

import {
  ActivityRow,
  Listing,
  Order,
  SandboxEntry,
  Trade,
} from "@/lib/types";

function SimpleTable({
  label,
  columns,
  children,
  empty,
}: {
  label: string;
  columns: { header: string; align?: "left" | "right" | "center" }[];
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="border border-neutral-700 bg-[#2a2d31]">
      <div className="border-b border-neutral-700 px-3 py-1.5">
        <span className="text-neutral-100 text-xs font-semibold">{label}</span>
      </div>
      {empty ? (
        <div className="px-3 py-2 text-neutral-500 text-xs">No data.</div>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-neutral-400">
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={`border-b border-neutral-700 px-2 py-1 font-medium ${
                    c.align === "right"
                      ? "text-right"
                      : c.align === "center"
                      ? "text-center"
                      : "text-left"
                  }`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      )}
    </div>
  );
}

const BID_TINT = "rgba(74,222,128,0.10)";
const ASK_TINT = "rgba(248,113,113,0.10)";

export function ListingTable({
  listings,
  filterProducts,
}: {
  listings: Record<string, Listing>;
  filterProducts?: string[] | null;
}) {
  const entries = Object.values(listings)
    .filter(
      (l) => !filterProducts || filterProducts.length === 0 || filterProducts.includes(l.symbol)
    )
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  return (
    <SimpleTable
      label="Listings"
      columns={[
        { header: "Symbol" },
        { header: "Product" },
        { header: "Denomination" },
      ]}
      empty={entries.length === 0}
    >
      {entries.map((l) => (
        <tr key={l.symbol} className="text-neutral-200">
          <td className="border-b border-neutral-800 px-2 py-1">{l.symbol}</td>
          <td className="border-b border-neutral-800 px-2 py-1">{l.product}</td>
          <td className="border-b border-neutral-800 px-2 py-1">
            {l.denomination}
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

export function PositionTable({
  trades,
  upToTimestamp,
  filterProducts,
}: {
  trades: Trade[];
  upToTimestamp: number | null;
  filterProducts?: string[] | null;
}) {
  const positions: Record<string, number> = {};
  const ts = upToTimestamp ?? Infinity;
  const hasFilter = filterProducts && filterProducts.length > 0;
  for (const t of trades) {
    if (t.timestamp > ts) break;
    if (hasFilter && !filterProducts!.includes(t.symbol)) continue;
    if (t.buyer === "SUBMISSION" && t.seller !== "SUBMISSION") {
      positions[t.symbol] = (positions[t.symbol] ?? 0) + t.quantity;
    } else if (t.seller === "SUBMISSION" && t.buyer !== "SUBMISSION") {
      positions[t.symbol] = (positions[t.symbol] ?? 0) - t.quantity;
    }
  }
  const rows = Object.entries(positions)
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return (
    <SimpleTable
      label="Positions"
      columns={[{ header: "Product" }, { header: "Position", align: "right" }]}
      empty={rows.length === 0}
    >
      {rows.map(([product, pos]) => (
        <tr
          key={product}
          className="text-neutral-200"
          style={{ backgroundColor: pos > 0 ? BID_TINT : ASK_TINT }}
        >
          <td className="border-b border-neutral-800 px-2 py-1">{product}</td>
          <td className="border-b border-neutral-800 px-2 py-1 text-right">
            {pos}
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

export function ProfitLossTable({
  activities,
  timestamp,
  filterProducts,
}: {
  activities: ActivityRow[];
  timestamp: number | null;
  filterProducts?: string[] | null;
}) {
  const hasFilter = filterProducts && filterProducts.length > 0;
  const rows =
    timestamp === null
      ? []
      : activities
          .filter((r) => r.timestamp === timestamp)
          .filter((r) => !hasFilter || filterProducts!.includes(r.product))
          .sort((a, b) => a.product.localeCompare(b.product));
  return (
    <SimpleTable
      label="Profit / Loss"
      columns={[
        { header: "Product" },
        { header: "Profit / Loss", align: "right" },
      ]}
      empty={rows.length === 0}
    >
      {rows.map((r) => (
        <tr
          key={r.product}
          className="text-neutral-200"
          style={{
            backgroundColor:
              r.pnl > 0 ? BID_TINT : r.pnl < 0 ? ASK_TINT : undefined,
          }}
        >
          <td className="border-b border-neutral-800 px-2 py-1">{r.product}</td>
          <td className="border-b border-neutral-800 px-2 py-1 text-right font-mono">
            {r.pnl.toFixed(1)}
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

export function OrderDepthTable({
  activities,
  timestamp,
  product,
}: {
  activities: ActivityRow[];
  timestamp: number | null;
  product: string | null;
}) {
  const row =
    timestamp === null || product === null
      ? undefined
      : activities.find(
          (r) => r.timestamp === timestamp && r.product === product
        );

  type Level = { price: number; volume: number };
  const asks: Level[] = [];
  const bids: Level[] = [];

  if (row) {
    const askEntries: [number | null, number | null][] = [
      [row.askPrice1, row.askVolume1],
      [row.askPrice2, row.askVolume2],
      [row.askPrice3, row.askVolume3],
    ];
    const bidEntries: [number | null, number | null][] = [
      [row.bidPrice1, row.bidVolume1],
      [row.bidPrice2, row.bidVolume2],
      [row.bidPrice3, row.bidVolume3],
    ];
    for (const [p, v] of askEntries) {
      if (p !== null && v !== null) asks.push({ price: p, volume: v });
    }
    for (const [p, v] of bidEntries) {
      if (p !== null && v !== null) bids.push({ price: p, volume: v });
    }
    asks.sort((a, b) => b.price - a.price);
    bids.sort((a, b) => b.price - a.price);
  }

  const hasData = asks.length > 0 || bids.length > 0;
  const spread =
    asks.length > 0 && bids.length > 0
      ? asks[asks.length - 1].price - bids[0].price
      : null;

  return (
    <SimpleTable
      label={product ? `Order Depth (${product})` : "Order Depth"}
      columns={[
        { header: "Bid Vol", align: "right" },
        { header: "Price", align: "center" },
        { header: "Ask Vol", align: "left" },
      ]}
      empty={!hasData}
    >
      {asks.map((a) => (
        <tr key={`ask-${a.price}`} className="text-neutral-200">
          <td className="border-b border-neutral-800 px-2 py-1"></td>
          <td className="border-b border-neutral-800 px-2 py-1 text-center font-mono">
            {a.price}
          </td>
          <td
            className="border-b border-neutral-800 px-2 py-1 font-mono"
            style={{ backgroundColor: ASK_TINT }}
          >
            {a.volume}
          </td>
        </tr>
      ))}
      {spread !== null && (
        <tr className="text-neutral-500">
          <td className="border-b border-neutral-800 px-2 py-1"></td>
          <td className="border-b border-neutral-800 px-2 py-1 text-center text-[11px]">
            {"\u2191"} {spread} {"\u2193"}
          </td>
          <td className="border-b border-neutral-800 px-2 py-1"></td>
        </tr>
      )}
      {bids.map((b) => (
        <tr key={`bid-${b.price}`} className="text-neutral-200">
          <td
            className="border-b border-neutral-800 px-2 py-1 text-right font-mono"
            style={{ backgroundColor: BID_TINT }}
          >
            {b.volume}
          </td>
          <td className="border-b border-neutral-800 px-2 py-1 text-center font-mono">
            {b.price}
          </td>
          <td className="border-b border-neutral-800 px-2 py-1"></td>
        </tr>
      ))}
    </SimpleTable>
  );
}

export function OrderTable({
  sandbox,
  timestamp,
  filterProducts,
}: {
  sandbox: SandboxEntry[];
  timestamp: number | null;
  filterProducts?: string[] | null;
}) {
  const entry =
    timestamp === null ? undefined : sandbox.find((s) => s.timestamp === timestamp);
  const rows: { key: string; order: Order }[] = [];
  const hasFilter = filterProducts && filterProducts.length > 0;
  if (entry) {
    for (const symbol of Object.keys(entry.orders).sort()) {
      if (hasFilter && !filterProducts!.includes(symbol)) continue;
      entry.orders[symbol].forEach((o, i) => {
        rows.push({ key: `${symbol}-${i}`, order: o });
      });
    }
  }
  return (
    <SimpleTable
      label="Orders"
      columns={[
        { header: "Symbol" },
        { header: "Type" },
        { header: "Price", align: "right" },
        { header: "Quantity", align: "right" },
      ]}
      empty={rows.length === 0}
    >
      {rows.map(({ key, order }) => {
        const isBuy = order.quantity > 0;
        return (
          <tr
            key={key}
            className="text-neutral-200"
            style={{ backgroundColor: isBuy ? BID_TINT : ASK_TINT }}
          >
            <td className="border-b border-neutral-800 px-2 py-1">
              {order.symbol}
            </td>
            <td className="border-b border-neutral-800 px-2 py-1">
              {isBuy ? "Buy" : "Sell"}
            </td>
            <td className="border-b border-neutral-800 px-2 py-1 text-right font-mono">
              {order.price}
            </td>
            <td className="border-b border-neutral-800 px-2 py-1 text-right font-mono">
              {Math.abs(order.quantity)}
            </td>
          </tr>
        );
      })}
    </SimpleTable>
  );
}

export function TradeTable({
  trades,
  timestamp,
  windowSize = 15,
  filterProducts,
}: {
  trades: Trade[];
  timestamp: number | null;
  windowSize?: number;
  filterProducts?: string[] | null;
}) {
  const ts = timestamp ?? Infinity;
  const hasFilter = filterProducts && filterProducts.length > 0;
  const upTo = trades
    .filter((t) => t.timestamp <= ts)
    .filter((t) => !hasFilter || filterProducts!.includes(t.symbol));
  const recent = upTo.slice(-windowSize).reverse();
  return (
    <SimpleTable
      label={`Recent Trades (last ${windowSize})`}
      columns={[
        { header: "Symbol" },
        { header: "Buyer" },
        { header: "Seller" },
        { header: "Price", align: "right" },
        { header: "Qty", align: "right" },
        { header: "ts", align: "right" },
      ]}
      empty={recent.length === 0}
    >
      {recent.map((t, i) => {
        let bg: string | undefined;
        if (t.buyer === "SUBMISSION") bg = BID_TINT;
        else if (t.seller === "SUBMISSION") bg = ASK_TINT;
        return (
          <tr
            key={i}
            className="text-neutral-200"
            style={bg ? { backgroundColor: bg } : undefined}
          >
            <td className="border-b border-neutral-800 px-2 py-1">{t.symbol}</td>
            <td className="border-b border-neutral-800 px-2 py-1 text-neutral-400">
              {t.buyer || "-"}
            </td>
            <td className="border-b border-neutral-800 px-2 py-1 text-neutral-400">
              {t.seller || "-"}
            </td>
            <td className="border-b border-neutral-800 px-2 py-1 text-right font-mono">
              {t.price}
            </td>
            <td className="border-b border-neutral-800 px-2 py-1 text-right font-mono">
              {t.quantity}
            </td>
            <td className="border-b border-neutral-800 px-2 py-1 text-right font-mono text-neutral-500">
              {t.timestamp}
            </td>
          </tr>
        );
      })}
    </SimpleTable>
  );
}
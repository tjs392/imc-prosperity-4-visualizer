import {
  ActivityRow,
  Listing,
  Order,
  ParsedLog,
  ProductSeries,
  ProductSeriesRow,
  SandboxEntry,
  Trade,
} from "./types";

function parseNumOrNull(s: string): number | null {
  if (s === "" || s === undefined) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function parseActivitiesSection(section: string): ActivityRow[] {
  const lines = section.trim().split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const rows: ActivityRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(";");
    if (parts.length < 17) continue;
    rows.push({
      timestamp: Number(parts[1]),
      product: parts[2],
      bidPrice1: parseNumOrNull(parts[3]),
      bidVolume1: parseNumOrNull(parts[4]),
      bidPrice2: parseNumOrNull(parts[5]),
      bidVolume2: parseNumOrNull(parts[6]),
      bidPrice3: parseNumOrNull(parts[7]),
      bidVolume3: parseNumOrNull(parts[8]),
      askPrice1: parseNumOrNull(parts[9]),
      askVolume1: parseNumOrNull(parts[10]),
      askPrice2: parseNumOrNull(parts[11]),
      askVolume2: parseNumOrNull(parts[12]),
      askPrice3: parseNumOrNull(parts[13]),
      askVolume3: parseNumOrNull(parts[14]),
      midPrice: parseNumOrNull(parts[15]),
      pnl: Number(parts[16]) || 0,
    });
  }
  return rows;
}

function parseTradesSection(section: string): Trade[] {
  const trimmed = section.trim();
  if (!trimmed) return [];
  const cleaned = trimmed.replace(/,(\s*[\]}])/g, "$1");
  try {
    const parsed = JSON.parse(cleaned) as Trade[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (t) =>
          typeof t.timestamp === "number" &&
          typeof t.price === "number" &&
          typeof t.quantity === "number"
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch (err) {
    console.error("Failed to parse trade history:", err);
    return [];
  }
}

function parseSandboxSection(section: string): SandboxEntry[] {
  const trimmed = section.trim();
  if (!trimmed) return [];
  const entries: SandboxEntry[] = [];

  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(trimmed.slice(start, i + 1));
        start = -1;
      }
    }
  }

  for (const raw of objects) {
    try {
      const outer = JSON.parse(raw) as {
        lambdaLog: string;
        timestamp: number;
      };
      if (typeof outer.lambdaLog !== "string") continue;
      const inner = JSON.parse(outer.lambdaLog) as unknown;
      if (!Array.isArray(inner) || inner.length < 2) continue;

      const tradingState = inner[0];
      const ordersRaw = inner[1];

      const listings: Record<string, Listing> = {};
      if (Array.isArray(tradingState) && Array.isArray(tradingState[2])) {
        for (const entry of tradingState[2]) {
          if (Array.isArray(entry) && entry.length >= 3) {
            const symbol = String(entry[0]);
            listings[symbol] = {
              symbol,
              product: String(entry[1]),
              denomination: String(entry[2]),
            };
          }
        }
      }

      const orders: Record<string, Order[]> = {};
      if (Array.isArray(ordersRaw)) {
        for (const o of ordersRaw) {
          if (Array.isArray(o) && o.length >= 3) {
            const symbol = String(o[0]);
            const order: Order = {
              symbol,
              price: Number(o[1]),
              quantity: Number(o[2]),
            };
            if (!orders[symbol]) orders[symbol] = [];
            orders[symbol].push(order);
          }
        }
      }

      entries.push({
        timestamp: outer.timestamp,
        listings,
        orders,
      });
    } catch {
      continue;
    }
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);
  return entries;
}

function extractSection(raw: string, header: string, nextHeaders: string[]): string {
  const start = raw.indexOf(header);
  if (start === -1) return "";
  const afterHeader = start + header.length;
  let end = raw.length;
  for (const h of nextHeaders) {
    const idx = raw.indexOf(h, afterHeader);
    if (idx !== -1 && idx < end) end = idx;
  }
  return raw.slice(afterHeader, end);
}

function buildProductSeries(activities: ActivityRow[]): ProductSeries[] {
  const byProduct = new Map<string, ProductSeriesRow[]>();

  for (const row of activities) {
    const bidVolume =
      (row.bidVolume1 ?? 0) + (row.bidVolume2 ?? 0) + (row.bidVolume3 ?? 0);
    const askVolume =
      (row.askVolume1 ?? 0) + (row.askVolume2 ?? 0) + (row.askVolume3 ?? 0);

    const seriesRow: ProductSeriesRow = {
      timestamp: row.timestamp,
      midPrice: row.midPrice,
      pnl: row.pnl,
      bidVolume,
      askVolume,
      totalVolume: bidVolume + askVolume,
    };

    if (!byProduct.has(row.product)) byProduct.set(row.product, []);
    byProduct.get(row.product)!.push(seriesRow);
  }

  const result: ProductSeries[] = [];
  for (const [product, rows] of byProduct.entries()) {
    rows.sort((a, b) => a.timestamp - b.timestamp);
    result.push({ product, rows });
  }
  result.sort((a, b) => a.product.localeCompare(b.product));
  return result;
}

type JsonLogFormat = {
  submissionId?: string;
  activitiesLog?: string;
  logs?: Array<{ sandboxLog?: string; lambdaLog?: string; timestamp?: number }>;
  tradeHistory?: Trade[];
};

function tryParseJsonLog(raw: string): JsonLogFormat | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      ("activitiesLog" in parsed ||
        "logs" in parsed ||
        "tradeHistory" in parsed)
    ) {
      return parsed as JsonLogFormat;
    }
    return null;
  } catch {
    return null;
  }
}

function parseSandboxFromLogsArray(
  logsArray: NonNullable<JsonLogFormat["logs"]>
): SandboxEntry[] {
  const entries: SandboxEntry[] = [];
  for (const outer of logsArray) {
    try {
      if (typeof outer.lambdaLog !== "string") continue;
      const inner = JSON.parse(outer.lambdaLog) as unknown;
      if (!Array.isArray(inner) || inner.length < 2) continue;

      const tradingState = inner[0];
      const ordersRaw = inner[1];

      const listings: Record<string, Listing> = {};
      if (Array.isArray(tradingState) && Array.isArray(tradingState[2])) {
        for (const entry of tradingState[2]) {
          if (Array.isArray(entry) && entry.length >= 3) {
            const symbol = String(entry[0]);
            listings[symbol] = {
              symbol,
              product: String(entry[1]),
              denomination: String(entry[2]),
            };
          }
        }
      }

      const orders: Record<string, Order[]> = {};
      if (Array.isArray(ordersRaw)) {
        for (const o of ordersRaw) {
          if (Array.isArray(o) && o.length >= 3) {
            const symbol = String(o[0]);
            const order: Order = {
              symbol,
              price: Number(o[1]),
              quantity: Number(o[2]),
            };
            if (!orders[symbol]) orders[symbol] = [];
            orders[symbol].push(order);
          }
        }
      }

      entries.push({
        timestamp: Number(outer.timestamp ?? 0),
        listings,
        orders,
      });
    } catch {
      continue;
    }
  }
  entries.sort((a, b) => a.timestamp - b.timestamp);
  return entries;
}

export function parseLog(raw: string): ParsedLog {
  const jsonLog = tryParseJsonLog(raw);

  if (jsonLog) {
    const activities = parseActivitiesSection(jsonLog.activitiesLog ?? "");
    const trades = Array.isArray(jsonLog.tradeHistory)
      ? jsonLog.tradeHistory
          .filter(
            (t): t is Trade =>
              typeof t.timestamp === "number" &&
              typeof t.price === "number" &&
              typeof t.quantity === "number"
          )
          .sort((a, b) => a.timestamp - b.timestamp)
      : [];
    const sandbox = Array.isArray(jsonLog.logs)
      ? parseSandboxFromLogsArray(jsonLog.logs)
      : [];
    const products = buildProductSeries(activities);
    const listings: Record<string, Listing> = {};
    for (const entry of sandbox) {
      for (const [symbol, listing] of Object.entries(entry.listings)) {
        if (!listings[symbol]) listings[symbol] = listing;
      }
    }
    return { products, activities, trades, sandbox, listings };
  }

  const activitiesSection = extractSection(raw, "Activities log:", [
    "Trade History:",
    "Sandbox logs:",
  ]);
  const tradesSection = extractSection(raw, "Trade History:", [
    "Activities log:",
    "Sandbox logs:",
  ]);
  const sandboxSection = extractSection(raw, "Sandbox logs:", [
    "Activities log:",
    "Trade History:",
  ]);
  const activities = parseActivitiesSection(activitiesSection);
  const trades = parseTradesSection(tradesSection);
  const sandbox = parseSandboxSection(sandboxSection);
  const products = buildProductSeries(activities);

  const listings: Record<string, Listing> = {};
  for (const entry of sandbox) {
    for (const [symbol, listing] of Object.entries(entry.listings)) {
      if (!listings[symbol]) listings[symbol] = listing;
    }
  }

  return { products, activities, trades, sandbox, listings };
}
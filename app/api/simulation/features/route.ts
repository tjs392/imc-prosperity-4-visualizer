import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseHistoricalPrices, parseHistoricalTrades } from "@/lib/parseHistorical";
import { extractFeatures, stripSamples } from "@/lib/simulation/extractFeatures";

export const runtime = "nodejs";

type ReqBody = {
  round?: number;
  days?: number[];
  includeSamples?: boolean;
  persist?: boolean;
};

export async function POST(req: NextRequest) {
  let body: ReqBody = {};
  try {
    body = await req.json();
  } catch {}

  const round = body.round ?? 1;
  const roundDir = path.join(process.cwd(), "public", "historical", `round${round}`);

  if (!fs.existsSync(roundDir)) {
    return NextResponse.json(
      { error: `round directory not found: public/historical/round${round}` },
      { status: 400 }
    );
  }

  let days = body.days;
  if (!days || days.length === 0) {
    const re = new RegExp(`^prices_round_${round}_day_(-?\\d+)\\.csv$`);
    const found = new Set<number>();
    for (const f of fs.readdirSync(roundDir)) {
      const m = f.match(re);
      if (m) found.add(Number(m[1]));
    }
    days = Array.from(found).sort((a, b) => a - b);
  }

  if (days.length === 0) {
    return NextResponse.json(
      { error: `no historical files found for round ${round}` },
      { status: 400 }
    );
  }

  const allActivities = [];
  const allTrades = [];
  const loaded: { day: number; rows: number; trades: number }[] = [];

  for (const day of days) {
    const pricesPath = path.join(roundDir, `prices_round_${round}_day_${day}.csv`);
    const tradesPath = path.join(roundDir, `trades_round_${round}_day_${day}.csv`);
    if (!fs.existsSync(pricesPath)) {
      return NextResponse.json(
        { error: `missing file: ${pricesPath}` },
        { status: 400 }
      );
    }
    const pricesRaw = fs.readFileSync(pricesPath, "utf8");
    const tradesRaw = fs.existsSync(tradesPath) ? fs.readFileSync(tradesPath, "utf8") : "";
    const activities = parseHistoricalPrices(pricesRaw);
    for (const r of activities) r.day = day;
    const trades = parseHistoricalTrades(tradesRaw);
    allActivities.push(...activities);
    allTrades.push(...trades);
    loaded.push({ day, rows: activities.length, trades: trades.length });
  }

  const features = extractFeatures(allActivities, allTrades, { round, days });

  if (body.persist) {
    const outDir = path.join(process.cwd(), "public", "simulation", `round${round}`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "features.full.json"), JSON.stringify(features));
    fs.writeFileSync(
      path.join(outDir, "features.json"),
      JSON.stringify(stripSamples(features))
    );
  }

  const payload = body.includeSamples ? features : stripSamples(features);
  return NextResponse.json({ features: payload, loaded });
}
import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateDay, activitiesToCSV, tradesToCSV } from "@/lib/simulation/generateSimulation";
import type { FeatureSet, SimMode } from "@/lib/simulation/extractFeatures";

export const runtime = "nodejs";

type ReqBody = {
  round: number;
  day?: number;
  durationTimestamps?: number;
  step?: number;
  seed?: number;
  productModes?: Record<string, { mode: SimMode; smoothing?: number }>;
};

function nextDayFor(round: number): number {
  const histDir = path.join(process.cwd(), "public", "historical", `round${round}`);
  if (!fs.existsSync(histDir)) return 1;
  const re = new RegExp(`^prices_round_${round}_day_(-?\\d+)\\.csv$`);
  let maxDay = -Infinity;
  for (const f of fs.readdirSync(histDir)) {
    const m = f.match(re);
    if (m) {
      const d = Number(m[1]);
      if (d > maxDay) maxDay = d;
    }
  }
  return Number.isFinite(maxDay) ? maxDay + 1 : 1;
}

function loadFeatures(round: number): FeatureSet | null {
  const featuresPath = path.join(
    process.cwd(),
    "public",
    "simulation",
    `round${round}`,
    "features.full.json"
  );
  if (!fs.existsSync(featuresPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(featuresPath, "utf8"));
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const roundParam = url.searchParams.get("round");
  if (roundParam === null) {
    return NextResponse.json({ error: "round is required" }, { status: 400 });
  }
  const round = Number(roundParam);
  if (!Number.isFinite(round)) {
    return NextResponse.json({ error: "round must be a number" }, { status: 400 });
  }

  const features = loadFeatures(round);
  const products: Record<
    string,
    {
      suggestedMode: SimMode;
      suggestedSmoothing: number;
      fairPrice: number;
      slopePerStep: number;
      intercept: number;
      lag1Autocorr: number;
      oneSidedRate: number;
    }
  > = {};
  if (features) {
    for (const [name, pf] of Object.entries(features.products)) {
      products[name] = {
        suggestedMode: pf.mid.suggestedMode,
        suggestedSmoothing: pf.mid.suggestedSmoothing,
        fairPrice: pf.mid.fairPrice,
        slopePerStep: pf.mid.slopePerStep,
        intercept: pf.mid.intercept,
        lag1Autocorr: pf.mid.lag1Autocorr,
        oneSidedRate: pf.mid.oneSidedRate,
      };
    }
  }

  return NextResponse.json({
    nextDay: nextDayFor(round),
    products,
    hasFeatures: features !== null,
  });
}

export async function POST(req: NextRequest) {
  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (typeof body.round !== "number") {
    return NextResponse.json({ error: "round is required" }, { status: 400 });
  }

  const round = body.round;
  const day = typeof body.day === "number" ? body.day : nextDayFor(round);

  const features = loadFeatures(round);
  if (!features) {
    return NextResponse.json(
      {
        error: `features file not found for round ${round}. Run feature extraction with "Save to disk" enabled first.`,
      },
      { status: 400 }
    );
  }

  const params = {
    durationTimestamps: body.durationTimestamps ?? 1_000_000,
    step: body.step ?? 100,
    seed: body.seed,
    startDay: day,
    productModes: body.productModes,
  };

  const { activities, trades } = generateDay(features, params);

  const outDir = path.join(process.cwd(), "public", "simulation", `round${round}`, "generated");
  fs.mkdirSync(outDir, { recursive: true });

  const pricesFile = `prices_round_${round}_day_${day}.csv`;
  const tradesFile = `trades_round_${round}_day_${day}.csv`;
  const pricesPath = path.join(outDir, pricesFile);
  const tradesPath = path.join(outDir, tradesFile);

  fs.writeFileSync(pricesPath, activitiesToCSV(activities, day));
  fs.writeFileSync(tradesPath, tradesToCSV(trades));

  return NextResponse.json({
    ok: true,
    day,
    pricesPath: `public/simulation/round${round}/generated/${pricesFile}`,
    tradesPath: `public/simulation/round${round}/generated/${tradesFile}`,
    stats: {
      products: Object.keys(features.products).length,
      snapshots: Math.floor(params.durationTimestamps / params.step),
      activityRows: activities.length,
      trades: trades.length,
    },
  });
}
import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

function dirForSource(round: number, source: string): string {
  if (source === "simulated") {
    return path.join(process.cwd(), "public", "simulation", `round${round}`, "generated");
  }
  return path.join(process.cwd(), "public", "historical", `round${round}`);
}

export async function GET(req: NextRequest) {
  try {
    const histDir = path.join(process.cwd(), "public", "historical");
    const url = new URL(req.url);
    const roundParam = url.searchParams.get("round");
    const source = url.searchParams.get("source") ?? "historical";

    if (roundParam === null) {
      const entries = await readdir(histDir, { withFileTypes: true });
      const roundRe = /^round(\d+)$/;
      const rounds: number[] = [];
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const m = e.name.match(roundRe);
        if (m) rounds.push(Number(m[1]));
      }
      rounds.sort((a, b) => a - b);
      return NextResponse.json({ rounds });
    }

    const round = Number(roundParam);
    if (!Number.isFinite(round)) {
      return NextResponse.json({ error: "round must be a number" }, { status: 400 });
    }
    const targetDir = dirForSource(round, source);
    let files: string[];
    try {
      files = await readdir(targetDir);
    } catch {
      return NextResponse.json([]);
    }
    const pricesRe = new RegExp(`^prices_round_${round}_day_(-?\\d+)\\.csv$`);
    const tradesRe = new RegExp(`^trades_round_${round}_day_(-?\\d+)\\.csv$`);
    const priceDays = new Set<number>();
    const tradeDays = new Set<number>();
    for (const f of files) {
      const pm = f.match(pricesRe);
      if (pm) priceDays.add(Number(pm[1]));
      const tm = f.match(tradesRe);
      if (tm) tradeDays.add(Number(tm[1]));
    }
    const days = Array.from(priceDays)
      .filter((d) => tradeDays.has(d))
      .sort((a, b) => a - b);
    return NextResponse.json(days);
  } catch (err) {
    console.error("historical API failed:", err);
    return NextResponse.json([], { status: 200 });
  }
}
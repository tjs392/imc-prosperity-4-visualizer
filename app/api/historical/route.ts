import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

const VALID_PROSPERITY = new Set(["p3", "p4"]);
const DEFAULT_PROSPERITY = "p4";

function normalizeProsperity(raw: string | null): string {
  if (raw && VALID_PROSPERITY.has(raw)) return raw;
  return DEFAULT_PROSPERITY;
}

function dirForSource(round: number, source: string, prosperity: string): string {
  if (source === "simulated") {
    return path.join(process.cwd(), "public", "simulation", `round${round}`, "generated");
  }
  return path.join(process.cwd(), "public", "historical", prosperity, `round${round}`);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const roundParam = url.searchParams.get("round");
    const source = url.searchParams.get("source") ?? "historical";
    const prosperity = normalizeProsperity(url.searchParams.get("prosperity"));
    const histDir = path.join(process.cwd(), "public", "historical", prosperity);

    if (roundParam === null) {
      let entries;
      try {
        entries = await readdir(histDir, { withFileTypes: true });
      } catch {
        return NextResponse.json({ rounds: [] });
      }
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
    const targetDir = dirForSource(round, source, prosperity);
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
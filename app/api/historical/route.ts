import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "historical");
    const files = await readdir(dir);
    const pricesRe = /^prices_round_1_day_(-?\d+)\.csv$/;
    const tradesRe = /^trades_round_1_day_(-?\d+)\.csv$/;
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
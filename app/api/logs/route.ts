import { readdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export async function GET() {
  const dir = path.join(process.cwd(), "public", "logs");
  const files = await readdir(dir);
  return NextResponse.json(files.filter((f) => f.endsWith(".log")));
}
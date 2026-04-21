import { NextResponse } from "next/server";
import { listHistory, addHistoryEntry, clearHistory } from "@/lib/workspace";
import type { HistoryEntry } from "@/lib/types";

export async function GET() {
  const entries = await listHistory();
  return NextResponse.json(entries);
}

export async function POST(req: Request) {
  const entry: HistoryEntry = await req.json();
  await addHistoryEntry(entry);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearHistory();
  return NextResponse.json({ ok: true });
}

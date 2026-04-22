import { NextRequest, NextResponse } from "next/server";
import { saveCollectionOrder } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  const { collections } = await req.json();
  if (!Array.isArray(collections)) {
    return NextResponse.json({ error: "collections must be an array" }, { status: 400 });
  }
  await saveCollectionOrder(collections);
  return NextResponse.json({ ok: true });
}

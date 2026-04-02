import { NextResponse } from "next/server";
import { consumePendingResult } from "@/lib/oauth2-pending";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");

  if (!state) {
    return NextResponse.json({ error: "Missing state" }, { status: 400 });
  }

  const result = consumePendingResult(state);
  if (!result) {
    return NextResponse.json({ pending: true });
  }

  if (result.error) {
    return NextResponse.json({ error: result.error });
  }

  return NextResponse.json({ code: result.code });
}

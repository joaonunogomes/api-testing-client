import { NextResponse } from "next/server";
import {
  startMockServer,
  stopMockServer,
  reloadMockServer,
  getMockServerStatuses,
  getMockServerStatus,
  getMockServerLogs,
} from "@/lib/mock-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/mock-server — Get status of all running mock servers
 * GET /api/mock-server?collectionId=xxx — Get status + logs for a specific server
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const collectionId = url.searchParams.get("collectionId");

  if (collectionId) {
    const status = getMockServerStatus(collectionId);
    const logs = getMockServerLogs(collectionId);
    return NextResponse.json({ status, logs });
  }

  return NextResponse.json(getMockServerStatuses());
}

/**
 * POST /api/mock-server — Start a mock server
 * Body: { collectionId: string, port?: number }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { collectionId, port } = body;

  if (!collectionId) {
    return NextResponse.json(
      { error: "collectionId is required" },
      { status: 400 },
    );
  }

  try {
    const status = await startMockServer(collectionId, port);
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to start mock server" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/mock-server — Stop a mock server
 * Body: { collectionId: string }
 */
export async function DELETE(request: Request) {
  const body = await request.json();
  const { collectionId } = body;

  if (!collectionId) {
    return NextResponse.json(
      { error: "collectionId is required" },
      { status: 400 },
    );
  }

  await stopMockServer(collectionId);
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/mock-server — Reload routes for a running mock server
 * Body: { collectionId: string }
 */
export async function PATCH(request: Request) {
  const body = await request.json();
  const { collectionId } = body;

  if (!collectionId) {
    return NextResponse.json(
      { error: "collectionId is required" },
      { status: 400 },
    );
  }

  await reloadMockServer(collectionId);
  const status = getMockServerStatus(collectionId);
  return NextResponse.json(status);
}

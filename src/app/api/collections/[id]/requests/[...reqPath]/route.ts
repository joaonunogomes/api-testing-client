import { NextResponse } from "next/server";
import { getRequest, saveRequest, deleteRequest } from "@/lib/workspace";

type Params = { params: Promise<{ id: string; reqPath: string[] }> };

export async function GET(_request: Request, { params }: Params) {
  const { id, reqPath } = await params;
  const requestId = reqPath.join("/");
  const req = await getRequest(id, requestId);
  if (!req) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(req);
}

export async function PUT(request: Request, { params }: Params) {
  const { id, reqPath } = await params;
  const requestId = reqPath.join("/");
  const body = await request.json();
  await saveRequest(id, requestId, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, reqPath } = await params;
  const requestId = reqPath.join("/");
  await deleteRequest(id, requestId);
  return NextResponse.json({ ok: true });
}

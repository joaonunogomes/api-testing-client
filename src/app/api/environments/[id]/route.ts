import { NextResponse } from "next/server";
import {
  getEnvironment,
  updateEnvironment,
  deleteEnvironment,
} from "@/lib/workspace";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const env = await getEnvironment(id);
  if (!env) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(env);
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const env = await updateEnvironment(id, body);
  if (!env) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(env);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  await deleteEnvironment(id);
  return NextResponse.json({ ok: true });
}

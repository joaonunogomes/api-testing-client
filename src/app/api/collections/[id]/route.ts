import { NextResponse } from "next/server";
import { getCollection, deleteCollection, saveCollection } from "@/lib/workspace";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const collection = await getCollection(id);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(collection);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  await saveCollection(id, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteCollection(id);
  return NextResponse.json({ ok: true });
}

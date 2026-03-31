import { NextResponse } from "next/server";
import { listCollections, createCollection } from "@/lib/workspace";

export async function GET() {
  const collections = await listCollections();
  return NextResponse.json(collections);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name } = body;
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const collection = await createCollection(name);
  return NextResponse.json(collection, { status: 201 });
}

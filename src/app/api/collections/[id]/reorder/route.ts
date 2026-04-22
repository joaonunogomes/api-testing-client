import { NextRequest, NextResponse } from "next/server";
import { reorderItems, moveItem } from "@/lib/workspace";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: collectionId } = await params;
  const body = await req.json();

  if (body.action === "move") {
    const { sourcePath, destParentPath } = body;
    await moveItem(collectionId, sourcePath, destParentPath);
    return NextResponse.json({ ok: true });
  }

  // Default: reorder
  const { parentPath = "", children } = body;
  if (!Array.isArray(children)) {
    return NextResponse.json({ error: "children must be an array" }, { status: 400 });
  }

  await reorderItems(collectionId, parentPath, children);
  return NextResponse.json({ ok: true });
}

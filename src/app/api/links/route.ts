import { NextResponse } from "next/server";
import { listLinks, addLink, removeLink, copyAndLink } from "@/lib/workspace";

export async function GET() {
  const links = await listLinks();
  return NextResponse.json(links);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { id, path: folderPath, copyFrom } = body;

  if (!id || !folderPath) {
    return NextResponse.json(
      { error: "id and path are required" },
      { status: 400 },
    );
  }

  try {
    if (copyFrom) {
      // Copy existing collection files into the target folder, then link
      await copyAndLink(copyFrom, folderPath);
    } else {
      // Just link — the folder already has the files
      await addLink(id, folderPath);
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Link failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await removeLink(id);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import {
  listLinks,
  addLink,
  removeLink,
  copyAndLink,
  listEnvLinks,
  addEnvLink,
  removeEnvLink,
  copyAndLinkEnvironment,
} from "@/lib/workspace";

export async function GET() {
  const links = await listLinks();
  const envLinks = await listEnvLinks();
  return NextResponse.json({ links, envLinks });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { id, path: folderPath, copyFrom, type } = body;

  if (!id || !folderPath) {
    return NextResponse.json(
      { error: "id and path are required" },
      { status: 400 },
    );
  }

  try {
    if (type === "environment") {
      if (copyFrom) {
        await copyAndLinkEnvironment(copyFrom, folderPath);
      } else {
        await addEnvLink(id, folderPath);
      }
    } else {
      if (copyFrom) {
        await copyAndLink(copyFrom, folderPath);
      } else {
        await addLink(id, folderPath);
      }
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
  const { id, type } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (type === "environment") {
    await removeEnvLink(id);
  } else {
    await removeLink(id);
  }
  return NextResponse.json({ ok: true });
}

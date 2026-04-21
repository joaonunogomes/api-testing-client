import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import YAML from "yaml";
import { parseAndConvertOpenApi } from "@/lib/openapi-converter";
import { getWorkspaceDir } from "@/lib/workspace";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let specContent: string;

    if (contentType.includes("application/json")) {
      const json = await request.json();
      if (json.url && typeof json.url === "string") {
        // Fetch remote spec
        const res = await fetch(json.url);
        if (!res.ok) {
          return NextResponse.json(
            { error: `Failed to fetch spec from URL: ${res.status} ${res.statusText}` },
            { status: 400 },
          );
        }
        specContent = await res.text();
      } else {
        // JSON body is the spec itself
        specContent = JSON.stringify(json);
      }
    } else {
      // Raw text body (JSON or YAML spec)
      specContent = await request.text();
    }

    if (!specContent.trim()) {
      return NextResponse.json({ error: "Empty spec content" }, { status: 400 });
    }

    const result = await parseAndConvertOpenApi(specContent);

    const collectionsDir = path.join(getWorkspaceDir(), "collections");
    const collectionDir = path.join(collectionsDir, result.collectionId);

    await fs.mkdir(collectionDir, { recursive: true });

    // Write collection.yaml
    await fs.writeFile(
      path.join(collectionDir, "collection.yaml"),
      YAML.stringify(result.collectionFile, { lineWidth: 0 }),
      "utf-8",
    );

    // Write request files
    for (const req of result.requests) {
      const filePath = path.join(collectionDir, `${req.path}.yaml`);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        YAML.stringify(req.file, { lineWidth: 0 }),
        "utf-8",
      );
    }

    return NextResponse.json({
      type: "collection",
      id: result.collectionId,
      name: result.collectionFile.meta.name,
      requestCount: result.requests.length,
      warnings: result.warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to import OpenAPI spec";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

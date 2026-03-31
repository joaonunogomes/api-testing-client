import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import YAML from "yaml";
import {
  convertPostmanCollection,
  convertPostmanEnvironment,
  detectPostmanType,
} from "@/lib/postman-converter";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || "./workspace-example";

function getWorkspaceDir(): string {
  return path.resolve(WORKSPACE_DIR);
}

export async function POST(request: Request) {
  const json = await request.json();

  const type = detectPostmanType(json);

  if (type === "collection") {
    return importCollection(json);
  } else if (type === "environment") {
    return importEnvironment(json);
  } else {
    return NextResponse.json(
      {
        error:
          "Unrecognized format. Expected a Postman Collection v2.1 or Environment JSON.",
      },
      { status: 400 },
    );
  }
}

async function importCollection(
  json: Record<string, unknown>,
): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = convertPostmanCollection(json as any);

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
}

async function importEnvironment(
  json: Record<string, unknown>,
): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = convertPostmanEnvironment(json as any);

  const envsDir = path.join(getWorkspaceDir(), "environments");
  await fs.mkdir(envsDir, { recursive: true });

  const filePath = path.join(envsDir, `${result.id}.env.yaml`);
  await fs.writeFile(
    filePath,
    YAML.stringify(result.file, { lineWidth: 0 }),
    "utf-8",
  );

  return NextResponse.json({
    type: "environment",
    id: result.id,
    name: result.file.meta.name,
    variableCount: Object.keys(result.file.variables || {}).length,
    warnings: result.warnings,
  });
}

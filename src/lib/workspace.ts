import fs from "fs/promises";
import os from "os";
import path from "path";
import YAML from "yaml";
import type {
  Collection,
  CollectionFile,
  Environment,
  EnvironmentFile,
  RequestFile,
  TreeNode,
} from "./types";

function getDefaultWorkspaceDir(): string {
  const platform = process.platform;
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "api-testing-client", "workspace");
  } else if (platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "api-testing-client", "workspace");
  }
  return path.join(os.homedir(), ".local", "share", "api-testing-client", "workspace");
}

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || getDefaultWorkspaceDir();

function getWorkspaceDir(): string {
  return path.resolve(WORKSPACE_DIR);
}

function getCollectionsDir(): string {
  return path.join(getWorkspaceDir(), "collections");
}

function getEnvironmentsDir(): string {
  return path.join(getWorkspaceDir(), "environments");
}

async function readYaml<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf-8");
  return YAML.parse(content) as T;
}

async function writeYaml(filePath: string, data: unknown): Promise<void> {
  const content = YAML.stringify(data, { lineWidth: 0 });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

// ---- Links: collection ID -> local folder path ----

interface LinksFile {
  links: { id: string; path: string }[];
  envLinks?: { id: string; path: string }[];
}

/** Resolve a link path — relative paths are resolved against the workspace dir */
function resolveLinkPath(linkPath: string): string {
  if (path.isAbsolute(linkPath)) return linkPath;
  return path.resolve(getWorkspaceDir(), linkPath);
}

async function getLinks(): Promise<LinksFile> {
  const linksPath = path.join(getWorkspaceDir(), "links.yaml");
  try {
    return await readYaml<LinksFile>(linksPath);
  } catch {
    return { links: [] };
  }
}

async function saveLinks(links: LinksFile): Promise<void> {
  const linksPath = path.join(getWorkspaceDir(), "links.yaml");
  await writeYaml(linksPath, links);
}

export async function addLink(id: string, folderPath: string): Promise<void> {
  const links = await getLinks();
  links.links = links.links.filter((l) => l.id !== id);
  links.links.push({ id, path: folderPath });
  await saveLinks(links);
}

export async function removeLink(id: string): Promise<void> {
  const links = await getLinks();
  links.links = links.links.filter((l) => l.id !== id);
  await saveLinks(links);
}

/**
 * Copy all files from a local collection into a target folder, then link to that folder.
 * The target folder becomes the source of truth. The original local copy is deleted.
 */
export async function copyAndLink(
  collectionId: string,
  targetPath: string,
): Promise<void> {
  const sourceDir = path.join(getCollectionsDir(), collectionId);
  const resolvedTarget = resolveLinkPath(targetPath);

  // Ensure target exists
  await fs.mkdir(resolvedTarget, { recursive: true });

  // Recursively copy all files from source to target
  async function copyDir(src: string, dest: string) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  // Only copy if source exists and is different from target
  const resolvedSource = path.resolve(sourceDir);
  if (resolvedSource !== resolvedTarget) {
    try {
      await fs.access(sourceDir);
      await copyDir(sourceDir, resolvedTarget);
      // Remove the original local copy
      await fs.rm(sourceDir, { recursive: true, force: true });
    } catch {
      // Source doesn't exist — target folder may already have files, that's fine
    }
  }

  // Create the link — store the original path (may be relative)
  await addLink(collectionId, targetPath);
}

export async function listLinks(): Promise<{ id: string; path: string }[]> {
  const links = await getLinks();
  return links.links;
}

// ---- Environment Links ----

export async function addEnvLink(
  id: string,
  folderPath: string,
): Promise<void> {
  const links = await getLinks();
  const envLinks = (links.envLinks || []).filter((l) => l.id !== id);
  envLinks.push({ id, path: folderPath });
  links.envLinks = envLinks;
  await saveLinks(links);
}

export async function removeEnvLink(id: string): Promise<void> {
  const links = await getLinks();
  links.envLinks = (links.envLinks || []).filter((l) => l.id !== id);
  await saveLinks(links);
}

/**
 * Copy environment files into a target folder, then link to that folder.
 * The target folder becomes the source of truth. The original local copies are deleted.
 */
export async function copyAndLinkEnvironment(
  envId: string,
  targetPath: string,
): Promise<void> {
  const envDir = getEnvironmentsDir();
  const resolvedTarget = resolveLinkPath(targetPath);

  // Ensure target exists
  await fs.mkdir(resolvedTarget, { recursive: true });

  const resolvedSource = path.resolve(envDir);

  if (resolvedSource !== resolvedTarget) {
    // Copy env file
    const envFile = path.join(envDir, `${envId}.env.yaml`);
    try {
      await fs.access(envFile);
      await fs.copyFile(
        envFile,
        path.join(resolvedTarget, `${envId}.env.yaml`),
      );
      await fs.unlink(envFile);
    } catch {
      // Source doesn't exist — target may already have files
    }

    // Copy secrets file if it exists
    const secretsFile = path.join(envDir, `${envId}.env.secrets.yaml`);
    try {
      await fs.access(secretsFile);
      await fs.copyFile(
        secretsFile,
        path.join(resolvedTarget, `${envId}.env.secrets.yaml`),
      );
      await fs.unlink(secretsFile);
    } catch {
      // No secrets file, that's fine
    }
  }

  // Store the original path (may be relative)
  await addEnvLink(envId, targetPath);
}

export async function listEnvLinks(): Promise<
  { id: string; path: string }[]
> {
  const links = await getLinks();
  return links.envLinks || [];
}

/** Resolve the actual directory for environment files — checks envLinks first, then local environments/ */
async function resolveEnvironmentDir(id: string): Promise<string> {
  const links = await getLinks();
  const link = (links.envLinks || []).find((l) => l.id === id);
  if (link) {
    const resolved = resolveLinkPath(link.path);
    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      // linked path doesn't exist, fall through
    }
  }
  return getEnvironmentsDir();
}

/** Resolve the actual directory for a collection — checks links first, then local collections/ */
async function resolveCollectionDir(id: string): Promise<string | null> {
  const links = await getLinks();
  const link = links.links.find((l) => l.id === id);
  if (link) {
    const resolved = resolveLinkPath(link.path);
    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      // linked path doesn't exist, fall through
    }
  }
  const local = path.join(getCollectionsDir(), id);
  try {
    await fs.access(local);
    return local;
  } catch {
    return null;
  }
}

// ---- Tree builder ----

async function buildTree(
  dirPath: string,
  collectionId: string,
  relativePath: string = "",
): Promise<TreeNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nodes: TreeNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dirPath, entry.name);
    const relPath = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      const children = await buildTree(fullPath, collectionId, relPath);
      if (children.length > 0) {
        nodes.push({
          id: `${collectionId}/${relPath}`,
          name: entry.name,
          type: "folder",
          children,
        });
      }
    } else if (
      entry.name.endsWith(".yaml") &&
      entry.name !== "collection.yaml"
    ) {
      try {
        const req = await readYaml<RequestFile>(fullPath);
        const baseName = entry.name.replace(/\.yaml$/, "");
        const requestId = relativePath
          ? `${relativePath}/${baseName}`
          : baseName;
        nodes.push({
          id: `${collectionId}/${requestId}`,
          name: req.meta?.name || baseName,
          type: "request",
          method: req.request?.method || "GET",
          seq: req.meta?.seq,
        });
      } catch {
        // Skip invalid YAML files
      }
    }
  }

  nodes.sort((a, b) => {
    if (a.type === "folder" && b.type !== "folder") return -1;
    if (a.type !== "folder" && b.type === "folder") return 1;
    if (a.seq !== undefined && b.seq !== undefined) return a.seq - b.seq;
    if (a.seq !== undefined) return -1;
    if (b.seq !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

// ---- Collections ----

async function loadCollectionFromDir(
  collectionDir: string,
  collectionId: string,
  linkedPath?: string,
): Promise<Collection> {
  let collectionFile: CollectionFile = {
    meta: { name: collectionId },
  };

  const collectionYaml = path.join(collectionDir, "collection.yaml");
  try {
    collectionFile = await readYaml<CollectionFile>(collectionYaml);
  } catch {
    // Use defaults
  }

  const children = await buildTree(collectionDir, collectionId);

  return {
    id: collectionId,
    meta: collectionFile.meta,
    defaults: collectionFile.defaults,
    variables: collectionFile.variables,
    scripts: collectionFile.scripts,
    linkedPath,
    tree: {
      id: collectionId,
      name: collectionFile.meta?.name || collectionId,
      type: "collection",
      children,
    },
  };
}

export async function listCollections(): Promise<Collection[]> {
  const collections: Collection[] = [];
  const seenIds = new Set<string>();

  // 1. Load linked collections first
  const links = await getLinks();
  for (const link of links.links) {
    try {
      const resolved = resolveLinkPath(link.path);
      await fs.access(resolved);
      const col = await loadCollectionFromDir(resolved, link.id, resolved);
      collections.push(col);
      seenIds.add(link.id);
    } catch {
      // linked path unavailable, skip
    }
  }

  // 2. Load local collections
  const collectionsDir = getCollectionsDir();
  try {
    await fs.access(collectionsDir);
  } catch {
    return collections;
  }

  const entries = await fs.readdir(collectionsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (seenIds.has(entry.name)) continue;

    const collectionDir = path.join(collectionsDir, entry.name);
    const col = await loadCollectionFromDir(collectionDir, entry.name);
    collections.push(col);
  }

  return collections;
}

export async function getCollection(id: string): Promise<Collection | null> {
  const collections = await listCollections();
  return collections.find((c) => c.id === id) || null;
}

export async function createCollection(name: string): Promise<Collection> {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const collectionDir = path.join(getCollectionsDir(), id);
  await fs.mkdir(collectionDir, { recursive: true });

  const collectionFile: CollectionFile = {
    meta: { name, version: 1 },
    defaults: {},
    variables: {},
  };

  await writeYaml(path.join(collectionDir, "collection.yaml"), collectionFile);

  return {
    id,
    meta: collectionFile.meta,
    defaults: collectionFile.defaults,
    variables: collectionFile.variables,
    tree: { id, name, type: "collection", children: [] },
  };
}

export async function saveCollection(
  id: string,
  data: CollectionFile,
): Promise<void> {
  const dir = await resolveCollectionDir(id);
  if (!dir) return;
  await writeYaml(path.join(dir, "collection.yaml"), data);
}

export async function deleteCollection(id: string): Promise<void> {
  // Only delete local collections, not linked ones
  const links = await getLinks();
  const isLinked = links.links.some((l) => l.id === id);
  if (isLinked) {
    await removeLink(id);
    return;
  }
  const collectionDir = path.join(getCollectionsDir(), id);
  await fs.rm(collectionDir, { recursive: true, force: true });
}

export async function getRequest(
  collectionId: string,
  requestId: string,
): Promise<RequestFile | null> {
  const dir = await resolveCollectionDir(collectionId);
  if (!dir) return null;
  try {
    return await readYaml<RequestFile>(path.join(dir, `${requestId}.yaml`));
  } catch {
    return null;
  }
}

export async function saveRequest(
  collectionId: string,
  requestId: string,
  data: RequestFile,
): Promise<void> {
  const dir = await resolveCollectionDir(collectionId);
  if (!dir) return;
  const filePath = path.join(dir, `${requestId}.yaml`);
  await writeYaml(filePath, data);
}

export async function deleteRequest(
  collectionId: string,
  requestId: string,
): Promise<void> {
  const dir = await resolveCollectionDir(collectionId);
  if (!dir) return;
  await fs.unlink(path.join(dir, `${requestId}.yaml`));
}

// ---- Environments ----

export async function listEnvironments(): Promise<Environment[]> {
  const environments: Environment[] = [];
  const seenIds = new Set<string>();

  // 1. Load linked environments first
  const links = await getLinks();
  for (const envLink of links.envLinks || []) {
    try {
      const resolved = resolveLinkPath(envLink.path);
      await fs.access(resolved);
      const filePath = path.join(resolved, `${envLink.id}.env.yaml`);
      const envFile = await readYaml<EnvironmentFile>(filePath);

      let secrets: Record<string, string> = {};
      const secretsPath = path.join(
        resolved,
        `${envLink.id}.env.secrets.yaml`,
      );
      try {
        const secretsFile = await readYaml<EnvironmentFile>(secretsPath);
        secrets = secretsFile.secrets || {};
      } catch {
        // No secrets file
      }

      environments.push({
        id: envLink.id,
        meta: envFile.meta || { name: envLink.id },
        variables: envFile.variables || {},
        secrets: { ...(envFile.secrets || {}), ...secrets },
        linkedPath: resolved,
      });
      seenIds.add(envLink.id);
    } catch {
      // linked path or file unavailable, skip
    }
  }

  // 2. Load local environments
  const envDir = getEnvironmentsDir();
  try {
    await fs.access(envDir);
  } catch {
    return environments;
  }

  const entries = await fs.readdir(envDir);

  for (const entry of entries) {
    if (!entry.endsWith(".env.yaml") || entry.endsWith(".secrets.yaml"))
      continue;

    const id = entry.replace(/\.env\.yaml$/, "");
    if (seenIds.has(id)) continue;

    const filePath = path.join(envDir, entry);
    const envFile = await readYaml<EnvironmentFile>(filePath);

    let secrets: Record<string, string> = {};
    const secretsPath = path.join(envDir, `${id}.env.secrets.yaml`);
    try {
      const secretsFile = await readYaml<EnvironmentFile>(secretsPath);
      secrets = secretsFile.secrets || {};
    } catch {
      // No secrets file
    }

    environments.push({
      id,
      meta: envFile.meta || { name: id },
      variables: envFile.variables || {},
      secrets: { ...(envFile.secrets || {}), ...secrets },
    });
  }

  return environments;
}

export async function getEnvironment(id: string): Promise<Environment | null> {
  const environments = await listEnvironments();
  return environments.find((e) => e.id === id) || null;
}

export async function createEnvironment(
  name: string,
  variables?: Record<string, string>,
): Promise<Environment> {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const filePath = path.join(getEnvironmentsDir(), `${id}.env.yaml`);

  const envFile: EnvironmentFile = {
    meta: { name },
    variables: variables || {},
    secrets: {},
  };

  await writeYaml(filePath, envFile);

  return {
    id,
    meta: envFile.meta,
    variables: envFile.variables || {},
    secrets: {},
  };
}

export async function updateEnvironment(
  id: string,
  data: Partial<EnvironmentFile>,
): Promise<Environment | null> {
  const dir = await resolveEnvironmentDir(id);
  const filePath = path.join(dir, `${id}.env.yaml`);
  try {
    const existing = await readYaml<EnvironmentFile>(filePath);
    const updated = { ...existing, ...data };
    await writeYaml(filePath, updated);
    return {
      id,
      meta: updated.meta || { name: id },
      variables: updated.variables || {},
      secrets: updated.secrets || {},
    };
  } catch {
    return null;
  }
}

export async function deleteEnvironment(id: string): Promise<void> {
  // If linked, just remove the link (don't delete files in external folder)
  const links = await getLinks();
  const isLinked = (links.envLinks || []).some((l) => l.id === id);
  if (isLinked) {
    await removeEnvLink(id);
    return;
  }

  const filePath = path.join(getEnvironmentsDir(), `${id}.env.yaml`);
  await fs.unlink(filePath);
  try {
    await fs.unlink(
      path.join(getEnvironmentsDir(), `${id}.env.secrets.yaml`),
    );
  } catch {
    // Ignore
  }
}

export { getWorkspaceDir };

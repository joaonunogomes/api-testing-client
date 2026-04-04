import { watch, type FSWatcher } from "chokidar";
import { getWorkspaceDir } from "./workspace";
import { getMockServerStatuses, reloadMockServer } from "./mock-server";

type ChangeCallback = (event: string, path: string) => void;

let watcher: FSWatcher | null = null;
const listeners = new Set<ChangeCallback>();

export function startWatcher(): void {
  if (watcher) return;

  const workspaceDir = getWorkspaceDir();

  watcher = watch(workspaceDir, {
    ignoreInitial: true,
    ignored: [/(^|[/\\])\../, /node_modules/],
    persistent: true,
  });

  watcher.on("all", (event, filePath) => {
    if (!filePath.endsWith(".yaml")) return;
    for (const listener of listeners) {
      listener(event, filePath);
    }

    // Auto-reload running mock servers when collection files change
    const servers = getMockServerStatuses();
    for (const server of servers) {
      reloadMockServer(server.collectionId);
    }
  });
}

export function addChangeListener(callback: ChangeCallback): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function stopWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

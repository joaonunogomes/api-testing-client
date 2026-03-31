import { watch, type FSWatcher } from "chokidar";
import { getWorkspaceDir } from "./workspace";

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

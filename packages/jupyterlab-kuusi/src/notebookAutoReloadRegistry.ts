import { Signal } from "@lumino/signaling";

type AutoReloadListener = {
  syncPolling: () => void;
  refreshLastModified: () => void;
};

const enabledByPath = new Map<string, boolean>();
const listenersByPath = new Map<string, Set<AutoReloadListener>>();

export const notebookAutoReloadChanged = new Signal<
  unknown,
  { path: string; enabled: boolean }
>({});

export const getNotebookAutoReloadEnabled = (path: string): boolean =>
  enabledByPath.get(path) ?? true;

export const setNotebookAutoReloadEnabled = (
  path: string,
  enabled: boolean,
): void => {
  const previous = getNotebookAutoReloadEnabled(path);

  if (previous === enabled) {
    return;
  }

  enabledByPath.set(path, enabled);

  for (const listener of listenersByPath.get(path) ?? []) {
    listener.syncPolling();
  }

  notebookAutoReloadChanged.emit({ path, enabled });
};

/** After a local save, every open view for the path must bump its disk clock. */
const syncingPaths = new Set<string>();

export const syncNotebookAutoReloadLastModified = (path: string): void => {
  // A listener's refresh reports back through onLastModified, which lands here
  // again; without the guard every refresh re-enters the loop forever.
  if (syncingPaths.has(path)) {
    return;
  }

  syncingPaths.add(path);

  try {
    for (const listener of listenersByPath.get(path) ?? []) {
      listener.refreshLastModified();
    }
  } finally {
    syncingPaths.delete(path);
  }
};

export const registerNotebookAutoReloadListener = (
  path: string,
  listener: AutoReloadListener,
): (() => void) => {
  let bucket = listenersByPath.get(path);

  if (!bucket) {
    bucket = new Set();
    listenersByPath.set(path, bucket);
  }

  bucket.add(listener);

  return () => {
    bucket?.delete(listener);

    if (bucket?.size === 0) {
      listenersByPath.delete(path);
    }
  };
};

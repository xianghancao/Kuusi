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

/** Kuusi Settings → Notebook: what a file without its own switch starts as. */
let defaultEnabled = true;

export const getNotebookAutoReloadEnabled = (path: string): boolean =>
  enabledByPath.get(path) ?? defaultEnabled;

export const getNotebookAutoReloadDefault = (): boolean => defaultEnabled;

/**
 * Change the default for files the user has not switched themselves (the
 * per-file switch in the … menu always wins). Open views follow at once.
 */
export const setNotebookAutoReloadDefault = (enabled: boolean): void => {
  if (defaultEnabled === enabled) {
    return;
  }

  defaultEnabled = enabled;

  for (const [path, listeners] of listenersByPath) {
    if (enabledByPath.has(path)) {
      continue;
    }

    for (const listener of listeners) {
      listener.syncPolling();
    }

    notebookAutoReloadChanged.emit({ path, enabled });
  }
};

export const setNotebookAutoReloadEnabled = (
  path: string,
  enabled: boolean,
): void => {
  const previous = getNotebookAutoReloadEnabled(path);

  // Remember an explicit choice even when it equals the default, so a later
  // change of the default does not override it.
  enabledByPath.set(path, enabled);

  if (previous === enabled) {
    return;
  }

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

import type { DocumentRegistry } from "@jupyterlab/docregistry";
import type { Contents } from "@jupyterlab/services";

import { KUUSI_DISK_POLL_INTERVAL_MS } from "./diskPollInterval";

export type DiskAutoReloadOptions = {
  getEnabled: () => boolean;
  onLastModified?: (lastModified: string) => void;
  onReverted?: () => void;
  /**
   * When true (notebooks), ignore fileChanged-driven revert briefly after local
   * saves so the active cell / viewport are not reset. Poll still picks up
   * external writes.
   */
  suppressFileChangedRevert?: boolean;
  /**
   * Called before a revert; the returned function runs after it, to put the
   * caret / selection / scroll position back (a revert rebuilds the editors).
   */
  captureViewState?: () => (() => void) | null;
};

/** JSON with sorted keys, so key order never decides whether two models match. */
const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_key, val: unknown) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : val,
  );

export type DiskAutoReloadHandle = {
  syncPolling: () => void;
  refreshLastModified: () => void;
  dispose: () => void;
};

/**
 * Shared on-disk auto-reload for any DocumentRegistry context (notebook,
 * markdown preview, …). Editor “live sync while typing” stays separate.
 */
export const attachDiskAutoReload = (
  context: DocumentRegistry.IContext<DocumentRegistry.IModel>,
  contents: Contents.IManager,
  options: DiskAutoReloadOptions,
): DiskAutoReloadHandle => {
  let pollTimer: number | null = null;
  let lastModified = context.contentsModel?.last_modified ?? "";
  let suppressRevertUntil = 0;
  const suppressFileChanged = options.suppressFileChangedRevert === true;

  const isDirty = (): boolean => {
    const model = context.model as { dirty?: boolean } | null;
    return Boolean(model && model.dirty);
  };

  const refreshLastModified = (): void => {
    lastModified = context.contentsModel?.last_modified ?? lastModified;
    options.onLastModified?.(lastModified);
  };

  /**
   * A changed timestamp is not a changed file: sync clients, indexers and
   * backups touch files after a local save. Reverting then rebuilt the editors
   * and sent the caret back to the first line, so compare the content first.
   */
  const diskMatchesModel = async (): Promise<boolean> => {
    try {
      const disk = await contents.get(context.path, { content: true });
      const model = context.model as unknown as {
        toJSON?: () => unknown;
        toString?: () => string;
      };

      if (disk.format === "json" && typeof model.toJSON === "function") {
        return stableStringify(disk.content) === stableStringify(model.toJSON());
      }

      if (typeof disk.content === "string" && typeof model.toString === "function") {
        return disk.content === model.toString();
      }
    } catch {
      // Unreadable right now: fall through to a normal revert.
    }

    return false;
  };

  const reloadFromDisk = async (): Promise<void> => {
    if (
      performance.now() < suppressRevertUntil ||
      !options.getEnabled() ||
      context.isDisposed ||
      !context.isReady ||
      isDirty()
    ) {
      return;
    }

    if (await diskMatchesModel()) {
      refreshLastModified();
      return;
    }

    const restoreView = options.captureViewState?.() ?? null;

    try {
      await context.revert();
      refreshLastModified();
      options.onReverted?.();
      restoreView?.();
    } catch {
      // Ignore transient errors while the file is being rewritten.
    }
  };

  const poll = async (): Promise<void> => {
    if (!options.getEnabled() || context.isDisposed || !context.isReady) {
      return;
    }

    if (isDirty()) {
      return;
    }

    try {
      const model = await contents.get(context.path, { content: false });

      if (model.last_modified && model.last_modified !== lastModified) {
        lastModified = model.last_modified;
        await reloadFromDisk();
      }
    } catch {
      // Ignore transient polling errors.
    }
  };

  const startPolling = (): void => {
    if (pollTimer !== null) {
      return;
    }

    pollTimer = window.setInterval(() => {
      void poll();
    }, KUUSI_DISK_POLL_INTERVAL_MS);
  };

  const stopPolling = (): void => {
    if (pollTimer === null) {
      return;
    }

    window.clearInterval(pollTimer);
    pollTimer = null;
  };

  const syncPolling = (): void => {
    if (options.getEnabled()) {
      startPolling();
    } else {
      stopPolling();
    }
  };

  const onFileChanged = (): void => {
    refreshLastModified();
    if (suppressFileChanged) {
      // Jupyter emits fileChanged after local saves too; external edits come
      // through the poll loop.
      suppressRevertUntil = performance.now() + 3000;
      return;
    }

    void reloadFromDisk();
  };

  context.fileChanged.connect(onFileChanged);

  void context.ready.then(() => {
    if (context.isDisposed) {
      return;
    }

    refreshLastModified();
    syncPolling();
  });

  return {
    syncPolling,
    refreshLastModified,
    dispose: () => {
      stopPolling();
      context.fileChanged.disconnect(onFileChanged);
    },
  };
};

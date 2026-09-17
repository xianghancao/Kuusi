import type { DocumentRegistry } from "@jupyterlab/docregistry";
import type { INotebookModel } from "@jupyterlab/notebook";
import type { Contents } from "@jupyterlab/services";

import { KUUSI_DISK_POLL_INTERVAL_MS } from "./diskPollInterval";

export type NotebookAutoReloadOptions = {
  getEnabled: () => boolean;
  onLastModified: (lastModified: string) => void;
  onReverted?: () => void;
};

export type NotebookAutoReloadHandle = {
  syncPolling: () => void;
  refreshLastModified: () => void;
  dispose: () => void;
};

export const attachNotebookAutoReload = (
  context: DocumentRegistry.IContext<INotebookModel>,
  contents: Contents.IManager,
  options: NotebookAutoReloadOptions,
): NotebookAutoReloadHandle => {
  let pollTimer: number | null = null;
  let lastModified = context.contentsModel?.last_modified ?? "";

  const refreshLastModified = (): void => {
    lastModified = context.contentsModel?.last_modified ?? lastModified;
    options.onLastModified(lastModified);
  };

  const reloadFromDisk = async (): Promise<void> => {
    if (
      !options.getEnabled() ||
      context.isDisposed ||
      !context.isReady ||
      context.model.dirty
    ) {
      return;
    }

    try {
      await context.revert();
      refreshLastModified();
      options.onReverted?.();
    } catch {
      // Ignore transient errors while the file is being rewritten.
    }
  };

  const poll = async (): Promise<void> => {
    if (!options.getEnabled() || context.isDisposed || !context.isReady) {
      return;
    }

    if (context.model.dirty) {
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
    if (!options.getEnabled()) {
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

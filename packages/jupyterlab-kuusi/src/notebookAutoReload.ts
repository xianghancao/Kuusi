import type { DocumentRegistry } from "@jupyterlab/docregistry";
import type { INotebookModel } from "@jupyterlab/notebook";
import type { Contents } from "@jupyterlab/services";

import {
  attachDiskAutoReload,
  type DiskAutoReloadHandle,
  type DiskAutoReloadOptions,
} from "./diskAutoReload";
import { syncNotebookAutoReloadLastModified } from "./notebookAutoReloadRegistry";

export type NotebookAutoReloadOptions = {
  getEnabled: () => boolean;
  onLastModified: (lastModified: string) => void;
  onReverted?: () => void;
  captureViewState?: () => (() => void) | null;
};

export type NotebookAutoReloadHandle = DiskAutoReloadHandle;

export const attachNotebookAutoReload = (
  context: DocumentRegistry.IContext<INotebookModel>,
  contents: Contents.IManager,
  options: NotebookAutoReloadOptions,
): NotebookAutoReloadHandle => {
  const diskOptions: DiskAutoReloadOptions = {
    getEnabled: options.getEnabled,
    onLastModified: (lastModified) => {
      options.onLastModified(lastModified);
      syncNotebookAutoReloadLastModified(context.path);
    },
    onReverted: options.onReverted,
    captureViewState: options.captureViewState,
    suppressFileChangedRevert: true,
  };

  return attachDiskAutoReload(
    context as DocumentRegistry.IContext<DocumentRegistry.IModel>,
    contents,
    diskOptions,
  );
};

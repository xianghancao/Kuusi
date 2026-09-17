import type { IToolbarWidgetRegistry } from "@jupyterlab/apputils";
import { NotebookPanel } from "@jupyterlab/notebook";

import { createAutoReloadSwitch } from "./markdownPreview/autoReloadSwitch";
import {
  getNotebookAutoReloadEnabled,
  notebookAutoReloadChanged,
  setNotebookAutoReloadEnabled,
} from "./notebookAutoReloadRegistry";
import {
  NotebookMindMapDocumentWidget,
  NotebookMindMapWidgetFactory,
} from "./notebookMindMapWidget";

const NOTEBOOK_AUTO_RELOAD_TITLE =
  "Reload the notebook when the .ipynb file changes on disk (skipped while unsaved)";

const registerFactory = (
  toolbarRegistry: IToolbarWidgetRegistry,
  factoryName: string,
): void => {
  toolbarRegistry.addFactory(
    factoryName,
    "kuusi-notebook-auto-reload",
    (widget: NotebookPanel | NotebookMindMapDocumentWidget) => {
      const path = widget.context.path;
      const switchWidget = createAutoReloadSwitch(
        getNotebookAutoReloadEnabled(path),
        "jp-KuusiNotebook-autoReload",
        NOTEBOOK_AUTO_RELOAD_TITLE,
        (enabled) => {
          setNotebookAutoReloadEnabled(path, enabled);
        },
      );

      const onRegistryChanged = (
        _: unknown,
        change: { path: string; enabled: boolean },
      ): void => {
        if (change.path === path) {
          switchWidget.setEnabled(change.enabled);
        }
      };

      notebookAutoReloadChanged.connect(onRegistryChanged);
      widget.disposed.connect(() => {
        notebookAutoReloadChanged.disconnect(onRegistryChanged);
      });

      return switchWidget;
    },
  );
};

export const registerNotebookAutoReloadToolbarFactories = (
  toolbarRegistry: IToolbarWidgetRegistry,
): void => {
  registerFactory(toolbarRegistry, "Notebook");
  registerFactory(toolbarRegistry, NotebookMindMapWidgetFactory.NAME);
};

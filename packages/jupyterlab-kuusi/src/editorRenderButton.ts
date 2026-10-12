import type { JupyterFrontEnd } from "@jupyterlab/application";
import type { IToolbarWidgetRegistry } from "@jupyterlab/apputils";
import { ToolbarButton } from "@jupyterlab/ui-components";
import type { IDocumentManager } from "@jupyterlab/docmanager";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import type { FileEditor } from "@jupyterlab/fileeditor";
import type { NotebookPanel } from "@jupyterlab/notebook";
import type { Widget } from "@lumino/widgets";

import { FACTORY_EDITOR, FACTORY_NOTEBOOK } from "./defaultOpeners/constants";
import { createKuusiTranslator } from "./kuusiI18n";
import { getWorkspaceKind } from "./kuusiRenderViews";
import { openKuusiSplitWorkspace } from "./kuusiSplitWorkspace";

export const KUUSI_EDITOR_RENDER_TOOLBAR_ITEM = "kuusi-open-render";

const KUUSI_BUTTON_CLASS = "jp-KuusiNotebookOpenButton";

export const createKuusiEditorRenderButton = (
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  getPath: () => string,
): ToolbarButton => {
  const t = createKuusiTranslator();

  const button: ToolbarButton = new ToolbarButton({
    className: KUUSI_BUTTON_CLASS,
    label: t.view(),
    tooltip: t.openRenderViewBesideEditor(),
    onClick: () => {
      const path = getPath();

      // Lab marks a clicked toolbar button as pressed (it then looks sunken);
      // this one is an action, not a toggle.
      window.setTimeout(() => {
        button.pressed = false;
      }, 0);

      if (!path || !getWorkspaceKind(path)) {
        return;
      }

      openKuusiSplitWorkspace(app, docManager, path);
    },
  });

  return button;
};

const bindEditorButtonVisibility = (
  widget: IDocumentWidget<FileEditor>,
  item: Widget,
): void => {
  const updateVisibility = (): void => {
    const kind = getWorkspaceKind(widget.context.path);
    item.setHidden(kind !== "markdown");
  };

  updateVisibility();
  widget.context.pathChanged.connect(updateVisibility);
  item.disposed.connect(() => {
    widget.context.pathChanged.disconnect(updateVisibility);
  });
};

export const registerKuusiEditorRenderToolbars = (
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  toolbarRegistry: IToolbarWidgetRegistry,
): void => {
  toolbarRegistry.addFactory<NotebookPanel>(
    FACTORY_NOTEBOOK,
    "open-mindmap",
    (panel) =>
      createKuusiEditorRenderButton(app, docManager, () => panel.context.path),
  );

  toolbarRegistry.addFactory<IDocumentWidget<FileEditor>>(
    FACTORY_EDITOR,
    KUUSI_EDITOR_RENDER_TOOLBAR_ITEM,
    (widget) => {
      const button = createKuusiEditorRenderButton(
        app,
        docManager,
        () => widget.context.path,
      );
      bindEditorButtonVisibility(widget, button);
      return button;
    },
  );
};

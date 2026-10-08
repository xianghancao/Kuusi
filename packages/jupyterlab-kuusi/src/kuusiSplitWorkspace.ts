import type { JupyterFrontEnd } from "@jupyterlab/application";
import type { IDocumentManager } from "@jupyterlab/docmanager";
import type { DocumentRegistry, IDocumentWidget } from "@jupyterlab/docregistry";
import type { IEditorTracker } from "@jupyterlab/fileeditor";
import { type INotebookTracker } from "@jupyterlab/notebook";
import { Widget } from "@lumino/widgets";

import {
  OPEN_KUUSI_SPLIT_WORKSPACE_COMMAND,
  SWITCH_KUUSI_RENDER_VIEW_COMMAND,
} from "./kuusiCommands";
import { scheduleDocumentToolbarRelayout } from "./documentToolbarLayout";
import {
  documentPathForRenderView,
  getWorkspaceKind,
  getWorkspaceSpec,
  getWorkspaceSpecForPath,
  type KuusiRenderViewId,
  type KuusiRenderViewSpec,
  type KuusiWorkspaceKind,
} from "./kuusiRenderViews";
import { ensureKuusiRenderToolbarChrome } from "./renderExportButton";

export {
  OPEN_KUUSI_SPLIT_WORKSPACE_COMMAND,
  SWITCH_KUUSI_RENDER_VIEW_COMMAND,
} from "./kuusiCommands";

type WorkspaceCommandArgs = {
  path?: string;
  viewId?: KuusiRenderViewId;
};

type OpenRenderViewOptions = {
  /** When false, keep the Jupyter editor focused so its menu/toolbar stay live. */
  activateRender?: boolean;
};

const isDocumentWidget = (widget: Widget): widget is IDocumentWidget =>
  "toolbar" in widget && Boolean((widget as IDocumentWidget).toolbar);

/** Paths currently opening a split workspace (dedupe launcher + auto-open). */
const splittingPaths = new Set<string>();

const splitRightOf = (
  editor: Widget,
  activate: boolean,
): DocumentRegistry.IOpenOptions => ({
  mode: "split-right",
  ref: editor.id,
  activate,
});

const closeRenderWidget = async (widget: Widget | null): Promise<void> => {
  if (!widget || widget.isDisposed) {
    return;
  }

  await widget.close();
};

const closeOtherRenderViews = async (
  docManager: IDocumentManager,
  workspacePath: string,
  keepView: KuusiRenderViewSpec,
): Promise<void> => {
  const spec = getWorkspaceSpecForPath(workspacePath);

  if (!spec) {
    return;
  }

  const keepPath = documentPathForRenderView(workspacePath, keepView);

  await Promise.all(
    spec.renderViews.map(async (view) => {
      if (view.factory === keepView.factory) {
        return;
      }

      const widget = docManager.findWidget(
        documentPathForRenderView(workspacePath, view),
        view.factory,
      );

      if (!widget || widget.isDisposed) {
        return;
      }

      if (
        widget.context.path === keepPath &&
        view.factory === keepView.factory
      ) {
        return;
      }

      await closeRenderWidget(widget);
    }),
  );
};

const hasOpenRenderView = (
  docManager: IDocumentManager,
  path: string,
): boolean => {
  const spec = getWorkspaceSpecForPath(path);

  if (!spec) {
    return false;
  }

  return spec.renderViews.some((view) => {
    const widget = docManager.findWidget(
      documentPathForRenderView(path, view),
      view.factory,
    );
    return Boolean(widget && !widget.isDisposed && widget.isAttached);
  });
};

const shouldAutoSplitPath = (_path: string): boolean => {
  // Markdown / notebooks open the editor alone; Kuusi View is toolbar-driven.
  // TeX + Live PDF moved to academic-toolkit.
  return false;
};

export const ensureKuusiEditorPane = (
  docManager: IDocumentManager,
  path: string,
  kind: KuusiWorkspaceKind,
  activate = true,
): Widget | null => {
  const { editorFactory } = getWorkspaceSpec(kind);

  return (
    docManager.openOrReveal(path, editorFactory, undefined, {
      activate,
    }) ?? null
  );
};

export const openKuusiRenderView = async (
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  path: string,
  viewId: KuusiRenderViewId,
  editorWidget?: Widget | null,
  options?: OpenRenderViewOptions,
): Promise<IDocumentWidget | null> => {
  const kind = getWorkspaceKind(path);

  if (!kind) {
    return null;
  }

  const spec = getWorkspaceSpec(kind);
  const view = spec.renderViews.find((entry) => entry.id === viewId);

  if (!view) {
    return null;
  }

  const editor =
    editorWidget ??
    docManager.findWidget(path, spec.editorFactory) ??
    ensureKuusiEditorPane(docManager, path, kind, false);

  if (!editor) {
    return null;
  }

  const activateRender = options?.activateRender !== false;
  const openOptions = splitRightOf(editor, activateRender);

  const documentPath = documentPathForRenderView(path, view);
  const existing = docManager.findWidget(documentPath, view.factory);
  const wasAttached = Boolean(existing?.isAttached);

  const renderWidget = docManager.openOrReveal(
    documentPath,
    view.factory,
    undefined,
    openOptions,
  ) as IDocumentWidget | null;

  if (renderWidget && !editor.isDisposed && wasAttached) {
    app.shell.add(renderWidget, "main", openOptions);
  }

  await closeOtherRenderViews(docManager, path, view);

  app.commands.notifyCommandChanged(SWITCH_KUUSI_RENDER_VIEW_COMMAND);

  if (renderWidget && !renderWidget.isDisposed) {
    // One chrome settle after dock — no 0/450/900 pin storm.
    ensureKuusiRenderToolbarChrome(app, renderWidget, view.factory);
  }

  if (isDocumentWidget(editor) && !editor.isDisposed) {
    scheduleDocumentToolbarRelayout(editor);
    if (!activateRender) {
      app.shell.activateById(editor.id);
    }
  }

  return renderWidget;
};

export const openKuusiSplitWorkspace = (
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  path: string,
  viewId?: KuusiRenderViewId,
): void => {
  const spec = getWorkspaceSpecForPath(path);

  if (!spec) {
    return;
  }

  if (splittingPaths.has(path)) {
    return;
  }

  splittingPaths.add(path);

  try {
    const editor = ensureKuusiEditorPane(docManager, path, spec.kind, true);

    if (!editor) {
      splittingPaths.delete(path);
      return;
    }

    const renderId =
      viewId && spec.renderViews.some((view) => view.id === viewId)
        ? viewId
        : spec.defaultRenderId;

    void openKuusiRenderView(app, docManager, path, renderId, editor, {
      activateRender: false,
    }).finally(
      () => {
        splittingPaths.delete(path);
      },
    );
  } catch (error) {
    splittingPaths.delete(path);
    throw error;
  }
};

/**
 * Markdown and notebooks stay editor-only until the user clicks Kuusi View.
 * (TeX auto-split lived here before Live PDF / TeX moved to academic-toolkit.)
 */
export const bindKuusiSplitWorkspaceOnOpen = (
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  notebookTracker: INotebookTracker,
  editorTracker: IEditorTracker | null,
): void => {
  const maybeSplit = (path: string | null | undefined): void => {
    if (!path || !shouldAutoSplitPath(path)) {
      return;
    }

    if (splittingPaths.has(path) || hasOpenRenderView(docManager, path)) {
      return;
    }

    // Defer so the editor finishes attaching before split-right refs it.
    requestAnimationFrame(() => {
      if (splittingPaths.has(path) || hasOpenRenderView(docManager, path)) {
        return;
      }

      if (!shouldAutoSplitPath(path)) {
        return;
      }

      openKuusiSplitWorkspace(app, docManager, path);
    });
  };

  notebookTracker.widgetAdded.connect((_, panel) => {
    // Skip render-only notebook factories (Article pane).
    if (panel.hasClass("jp-KuusiNotebookArticle")) {
      return;
    }

    maybeSplit(panel.context.path);
  });

  editorTracker?.widgetAdded.connect((_, widget) => {
    maybeSplit(widget.context.path);
  });
};

export const registerKuusiSplitWorkspaceCommands = (
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
): void => {
  app.commands.addCommand(OPEN_KUUSI_SPLIT_WORKSPACE_COMMAND, {
    label: "Kuusi",
    caption: "Open the source editor on the left and a render view on the right",
    execute: (args: WorkspaceCommandArgs) => {
      const path = args.path;

      if (!path || !getWorkspaceKind(path)) {
        return;
      }

      openKuusiSplitWorkspace(app, docManager, path);
    },
  });

  app.commands.addCommand(SWITCH_KUUSI_RENDER_VIEW_COMMAND, {
    label: "Switch render view",
    execute: (args: WorkspaceCommandArgs) => {
      const path = args.path;
      const viewId = args.viewId;

      if (!path || !viewId) {
        return;
      }

      return openKuusiRenderView(app, docManager, path, viewId);
    },
  });
};

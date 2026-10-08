import type { IMarkdownCellModel } from "@jupyterlab/cells";
import { CodeCell, MarkdownCell } from "@jupyterlab/cells";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import type { FileEditor } from "@jupyterlab/fileeditor";
import type { NotebookPanel } from "@jupyterlab/notebook";
import { PathExt } from "@jupyterlab/coreutils";

import {
  closeKuusiDropdownMenus,
  createFormatToolbar,
  type FormatToolbarHandle,
} from "./formatToolbar";
import { createKuusiTranslator } from "./kuusiI18n";
import { kuusiIcon } from "./kuusiIcon";

const EDITOR_FORMAT_HOST_CLASS = "jp-KuusiEditorFormatHost";
const EDITOR_FORMAT_OVERLAY_CLASS = "jp-KuusiEditorFormatOverlay";
const EDITOR_FORMAT_CLUSTER_CLASS = "jp-KuusiEditorFormatCluster";
const EDITOR_FORMAT_PEEK_CLASS = "jp-KuusiEditorFormatCluster-peek";
const EDITOR_FORMAT_BODY_CLASS = "jp-KuusiEditorFormatCluster-body";

type FileEditorFormatBinding = {
  overlay: HTMLElement;
  formatToolbar: FormatToolbarHandle;
  editorRoot: HTMLElement;
  onPathChanged: () => void;
  onModelChanged: () => void;
  onEditorInteraction: () => void;
};

type NotebookFormatBinding = {
  overlay: HTMLElement;
  formatToolbar: FormatToolbarHandle;
  onActiveCellChanged: () => void;
  onStateChanged: () => void;
  onEditorInteraction: () => void;
};

const fileEditorBindings = new WeakMap<
  IDocumentWidget<FileEditor>,
  FileEditorFormatBinding
>();

const notebookBindings = new WeakMap<NotebookPanel, NotebookFormatBinding>();

export const isMarkdownEditorPath = (path: string | null | undefined): boolean =>
  Boolean(path && PathExt.extname(path).toLowerCase() === ".md");

export const isTexEditorPath = (path: string | null | undefined): boolean =>
  Boolean(path && PathExt.extname(path).toLowerCase() === ".tex");

export const isKuusiEditorFormatPath = (
  path: string | null | undefined,
): boolean => isMarkdownEditorPath(path) || isTexEditorPath(path);

const isClassicNotebookPanel = (panel: NotebookPanel): boolean =>
  !panel.node.classList.contains("jp-KuusiNotebookMindMapDocument") &&
  !panel.node.classList.contains("jp-KuusiNotebookArticle") &&
  !panel.node.classList.contains("jp-KuusiMarkdownMindMapDocument");

const createFormatPeek = (label: string): HTMLElement => {
  const peek = document.createElement("button");
  peek.type = "button";
  peek.className = EDITOR_FORMAT_PEEK_CLASS;
  peek.title = label;
  peek.setAttribute("aria-label", label);
  peek.tabIndex = -1;
  // Keep editor focus / scroll; expand is hover-driven.
  peek.addEventListener("pointerdown", (event) => {
    event.preventDefault();
  });
  peek.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  const mark = document.createElement("span");
  mark.className = "jp-KuusiLogo-mark";
  mark.setAttribute("aria-hidden", "true");
  kuusiIcon.render(mark);
  peek.appendChild(mark);
  return peek;
};

const createFormatCluster = (
  toolbar: FormatToolbarHandle,
  ariaLabel: string,
): HTMLElement => {
  const cluster = document.createElement("div");
  cluster.className = `jp-KuusiToolbarCluster jp-KuusiToolbarCluster--format ${EDITOR_FORMAT_CLUSTER_CLASS}`;
  cluster.setAttribute("role", "toolbar");
  cluster.setAttribute("aria-label", ariaLabel);

  const peek = createFormatPeek(ariaLabel);
  const body = document.createElement("div");
  body.className = EDITOR_FORMAT_BODY_CLASS;
  body.appendChild(toolbar.node);

  cluster.append(peek, body);
  return cluster;
};

const createOverlay = (cluster: HTMLElement): HTMLElement => {
  const overlay = document.createElement("div");
  overlay.className = EDITOR_FORMAT_OVERLAY_CLASS;
  overlay.appendChild(cluster);
  return overlay;
};

const shouldShowFileEditorBar = (
  widget: IDocumentWidget<FileEditor>,
): boolean => isKuusiEditorFormatPath(widget.context.path) && !widget.isDisposed;

const syncFileEditorVisibility = (
  widget: IDocumentWidget<FileEditor>,
  overlay: HTMLElement,
): void => {
  const show = shouldShowFileEditorBar(widget);
  overlay.hidden = !show;
  widget.node.classList.toggle("jp-KuusiMarkdownEditorDocument", show);
  widget.content.node.classList.toggle(EDITOR_FORMAT_HOST_CLASS, show);
  widget.content.node.classList.toggle("jp-KuusiMarkdownEditor", show);
};

export const attachFileEditorFormatBar = (
  widget: IDocumentWidget<FileEditor>,
): void => {
  if (fileEditorBindings.has(widget) || widget.isDisposed) {
    return;
  }

  const t = createKuusiTranslator();
  const formatToolbar = createFormatToolbar({
    getEditor: () => widget.content.editor,
    getActiveMarkdownCell: () => null,
    isEnabled: () => shouldShowFileEditorBar(widget),
    toolbarClassName:
      "jp-KuusiNotebookMindMap-format-toolbar jp-KuusiEditorFormat-toolbar",
  });
  const overlay = createOverlay(
    createFormatCluster(formatToolbar, t.markdownFormatting()),
  );
  const host = widget.content.node;
  host.classList.add(EDITOR_FORMAT_HOST_CLASS);
  host.appendChild(overlay);

  const onPathChanged = (): void => {
    syncFileEditorVisibility(widget, overlay);
    formatToolbar.syncEnabled();
    formatToolbar.syncActiveStates();
  };

  const onModelChanged = (): void => {
    formatToolbar.syncActiveStates();
  };

  const onEditorInteraction = (): void => {
    formatToolbar.syncActiveStates();
  };

  const editorRoot = widget.content.node;
  editorRoot.addEventListener("keyup", onEditorInteraction);
  editorRoot.addEventListener("mouseup", onEditorInteraction);
  editorRoot.addEventListener("focusin", onEditorInteraction, true);

  widget.context.pathChanged.connect(onPathChanged);
  widget.content.editor.model.sharedModel.changed.connect(onModelChanged);

  syncFileEditorVisibility(widget, overlay);
  formatToolbar.syncEnabled();
  formatToolbar.syncActiveStates();

  fileEditorBindings.set(widget, {
    overlay,
    formatToolbar,
    editorRoot,
    onPathChanged,
    onModelChanged,
    onEditorInteraction,
  });

  widget.disposed.connect(() => {
    const binding = fileEditorBindings.get(widget);

    if (!binding) {
      return;
    }

    widget.context.pathChanged.disconnect(binding.onPathChanged);
    widget.content.editor.model.sharedModel.changed.disconnect(
      binding.onModelChanged,
    );
    binding.editorRoot.removeEventListener(
      "keyup",
      binding.onEditorInteraction,
    );
    binding.editorRoot.removeEventListener(
      "mouseup",
      binding.onEditorInteraction,
    );
    binding.editorRoot.removeEventListener(
      "focusin",
      binding.onEditorInteraction,
      true,
    );
    closeKuusiDropdownMenus(binding.overlay);
    binding.overlay.remove();
    widget.node.classList.remove("jp-KuusiMarkdownEditorDocument");
    widget.content.node.classList.remove(EDITOR_FORMAT_HOST_CLASS);
    widget.content.node.classList.remove("jp-KuusiMarkdownEditor");
    fileEditorBindings.delete(widget);
  });
};

export const bindFileEditorFormatBars = (
  widget: IDocumentWidget<FileEditor>,
): void => {
  void widget.context.ready.then(() => {
    if (widget.isDisposed || !isKuusiEditorFormatPath(widget.context.path)) {
      return;
    }

    attachFileEditorFormatBar(widget);
  });
};

/** @deprecated Prefer {@link bindFileEditorFormatBars}. */
export const bindMarkdownEditorFormatBars = bindFileEditorFormatBars;

/** @deprecated Prefer {@link attachFileEditorFormatBar}. */
export const attachMarkdownEditorFormatBar = attachFileEditorFormatBar;

export const attachNotebookEditorFormatBar = (panel: NotebookPanel): void => {
  if (
    notebookBindings.has(panel) ||
    panel.isDisposed ||
    !isClassicNotebookPanel(panel)
  ) {
    return;
  }

  const t = createKuusiTranslator();

  const getActiveMarkdownCell = (): IMarkdownCellModel | null => {
    const cell = panel.content.activeCell;
    return cell instanceof MarkdownCell ? cell.model : null;
  };

  const isEnabled = (): boolean => {
    const cell = panel.content.activeCell;
    return (
      panel.content.mode === "edit" &&
      panel.content.activeCellIndex >= 0 &&
      cell instanceof MarkdownCell
    );
  };

  const getDisabledReason = (): string | null => {
    const cell = panel.content.activeCell;

    if (panel.content.mode !== "edit" || panel.content.activeCellIndex < 0) {
      return t.editModeHint();
    }

    if (cell instanceof CodeCell) {
      return t.formatNotesCodeCell();
    }

    return null;
  };

  const formatToolbar = createFormatToolbar({
    getEditor: () => panel.content.activeCell?.editor ?? null,
    getActiveMarkdownCell,
    isEnabled,
    getDisabledReason,
    toolbarClassName:
      "jp-KuusiNotebookMindMap-format-toolbar jp-KuusiEditorFormat-toolbar",
  });

  const overlay = createOverlay(
    createFormatCluster(formatToolbar, t.markdownFormatting()),
  );
  const host = panel.content.node;
  host.classList.add(EDITOR_FORMAT_HOST_CLASS);
  host.insertBefore(overlay, host.firstChild);
  panel.node.classList.add(EDITOR_FORMAT_HOST_CLASS);

  const sync = (): void => {
    formatToolbar.syncEnabled();
    formatToolbar.syncActiveStates();
  };

  const onActiveCellChanged = (): void => {
    sync();
  };

  const onStateChanged = (): void => {
    sync();
  };

  const onEditorInteraction = (): void => {
    formatToolbar.syncActiveStates();
  };

  panel.content.activeCellChanged.connect(onActiveCellChanged);
  panel.content.stateChanged.connect(onStateChanged);
  panel.node.addEventListener("keyup", onEditorInteraction);
  panel.node.addEventListener("mouseup", onEditorInteraction);
  panel.node.addEventListener("focusin", onEditorInteraction, true);

  sync();

  notebookBindings.set(panel, {
    overlay,
    formatToolbar,
    onActiveCellChanged,
    onStateChanged,
    onEditorInteraction,
  });

  panel.disposed.connect(() => {
    const binding = notebookBindings.get(panel);

    if (!binding) {
      return;
    }

    panel.content.activeCellChanged.disconnect(binding.onActiveCellChanged);
    panel.content.stateChanged.disconnect(binding.onStateChanged);
    panel.node.removeEventListener("keyup", binding.onEditorInteraction);
    panel.node.removeEventListener("mouseup", binding.onEditorInteraction);
    panel.node.removeEventListener(
      "focusin",
      binding.onEditorInteraction,
      true,
    );
    closeKuusiDropdownMenus(binding.overlay);
    binding.overlay.remove();
    panel.content.node.classList.remove(EDITOR_FORMAT_HOST_CLASS);
    panel.node.classList.remove(EDITOR_FORMAT_HOST_CLASS);
    notebookBindings.delete(panel);
  });
};

export const bindNotebookEditorFormatBars = (panel: NotebookPanel): void => {
  void panel.context.ready.then(() => {
    if (panel.isDisposed) {
      return;
    }

    attachNotebookEditorFormatBar(panel);
  });
};

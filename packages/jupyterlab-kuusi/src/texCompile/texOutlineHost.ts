import { highlightActiveLineGutter } from "@codemirror/view";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import type { FileEditor } from "@jupyterlab/fileeditor";
import { TexOutlineSidebar } from "./texOutlineSidebar";

const OUTLINE_UPDATE_DEBOUNCE_MS = 200;

export type TexOutlineHost = {
  sidebar: TexOutlineSidebar;
  toggleVisible: () => boolean;
  syncVisibility: (visible: boolean) => void;
};

const texOutlineHosts = new WeakMap<
  IDocumentWidget<FileEditor>,
  TexOutlineHost
>();

const isTexPath = (path: string | null | undefined): path is string =>
  Boolean(path && path.toLowerCase().endsWith(".tex"));

export const getTexOutlineHost = (
  widget: IDocumentWidget<FileEditor>,
): TexOutlineHost | undefined => texOutlineHosts.get(widget);

export const bindTexOutlineHost = (
  widget: IDocumentWidget<FileEditor>,
): TexOutlineHost | undefined => {
  if (!isTexPath(widget.context.path)) {
    return undefined;
  }

  let host = texOutlineHosts.get(widget);

  if (host) {
    return host;
  }

  const fileEditor = widget.content;
  const parent = fileEditor.node.parentElement;

  if (!parent) {
    return undefined;
  }

  const body = document.createElement("div");
  body.className = "jp-KuusiTexEditor-body";

  const sidebar = new TexOutlineSidebar({
    onSelectLine: (line) => {
      fileEditor.editor.setCursorPosition({ line: line - 1, column: 0 });
      fileEditor.editor.focus();
      sidebar.setCursorLine(line);
    },
  });

  parent.insertBefore(body, fileEditor.node);
  body.appendChild(sidebar.node);
  body.appendChild(fileEditor.node);

  fileEditor.editor.injectExtension(highlightActiveLineGutter());

  let updateTimer: number | null = null;

  const refreshOutline = (): void => {
    if (!isTexPath(widget.context.path)) {
      return;
    }

    sidebar.updateSource(widget.context.model.toString());
    sidebar.setCursorLine(fileEditor.editor.getCursorPosition().line + 1);
  };

  const scheduleRefresh = (): void => {
    if (updateTimer !== null) {
      window.clearTimeout(updateTimer);
    }

    updateTimer = window.setTimeout(() => {
      updateTimer = null;
      refreshOutline();
    }, OUTLINE_UPDATE_DEBOUNCE_MS);
  };

  const onPathChanged = (): void => {
    if (isTexPath(widget.context.path)) {
      refreshOutline();
      sidebar.setVisible(true);
      return;
    }

    sidebar.setVisible(false);
  };

  const syncCursorLine = (): void => {
    if (!isTexPath(widget.context.path)) {
      return;
    }

    sidebar.setCursorLine(fileEditor.editor.getCursorPosition().line + 1);
  };

  fileEditor.node.addEventListener("keyup", syncCursorLine);
  fileEditor.node.addEventListener("keydown", syncCursorLine);
  fileEditor.node.addEventListener("click", syncCursorLine);

  widget.context.model.contentChanged.connect(scheduleRefresh);
  widget.context.pathChanged.connect(onPathChanged);

  host = {
    sidebar,
    toggleVisible: () => sidebar.toggleVisible(),
    syncVisibility: (visible) => sidebar.setVisible(visible),
  };

  texOutlineHosts.set(widget, host);
  refreshOutline();

  widget.disposed.connect(() => {
    if (updateTimer !== null) {
      window.clearTimeout(updateTimer);
    }

    widget.context.model.contentChanged.disconnect(scheduleRefresh);
    widget.context.pathChanged.disconnect(onPathChanged);
    fileEditor.node.removeEventListener("keyup", syncCursorLine);
    fileEditor.node.removeEventListener("keydown", syncCursorLine);
    fileEditor.node.removeEventListener("click", syncCursorLine);

    if (fileEditor.node.parentElement === body) {
      parent.appendChild(fileEditor.node);
    }

    body.remove();
    texOutlineHosts.delete(widget);
  });

  return host;
};

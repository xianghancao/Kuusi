import type { IDocumentManager } from "@jupyterlab/docmanager";
import { MarkdownCell } from "@jupyterlab/cells";
import { NotebookPanel, type INotebookTracker } from "@jupyterlab/notebook";
import type { NotebookMindMapTracker } from "./tracker";

const NOTEBOOK_FACTORY = "Notebook";

const boundNotebookPanels = new WeakSet<NotebookPanel>();

const findNotebookPanel = (
  path: string,
  notebookTracker: INotebookTracker,
): NotebookPanel | null => {
  let panel: NotebookPanel | null = null;

  notebookTracker.forEach((candidate) => {
    if (!panel && candidate.context.path === path) {
      panel = candidate;
    }
  });

  return panel;
};

export const revealCellInNotebookEditor = async (
  path: string,
  cellIndex: number,
  notebookTracker: INotebookTracker,
  docManager: IDocumentManager,
): Promise<void> => {
  let panel = findNotebookPanel(path, notebookTracker);

  if (!panel) {
    const widget = await docManager.openOrReveal(path, NOTEBOOK_FACTORY);

    if (widget instanceof NotebookPanel) {
      panel = widget;
    }
  }

  if (!panel) {
    return;
  }

  await panel.revealed;
  panel.activate();

  if (cellIndex < 0 || cellIndex >= panel.content.widgets.length) {
    return;
  }

  panel.content.deselectAll();
  panel.content.activeCellIndex = cellIndex;
  panel.content.mode = "command";

  const cell = panel.content.widgets[cellIndex];

  if (cell instanceof MarkdownCell && !cell.rendered) {
    cell.rendered = true;
  }

  requestAnimationFrame(() => {
    cell?.node.scrollIntoView({ block: "center", behavior: "smooth" });
  });
};

/** Render a markdown cell in the classic notebook view for the same file. */
export const renderMarkdownCellInNotebookEditor = (
  path: string,
  cellIndex: number,
  notebookTracker: INotebookTracker,
): void => {
  const panel = findNotebookPanel(path, notebookTracker);

  if (!panel) {
    return;
  }

  if (cellIndex < 0 || cellIndex >= panel.content.widgets.length) {
    return;
  }

  const cell = panel.content.widgets[cellIndex];

  if (cell instanceof MarkdownCell && !cell.rendered) {
    cell.rendered = true;
  }

  if (
    panel.content.activeCellIndex === cellIndex &&
    panel.content.mode === "edit"
  ) {
    panel.content.mode = "command";
  }
};

export const bindNotebookToMindMapSync = (
  panel: NotebookPanel,
  mindMapTracker: NotebookMindMapTracker,
): void => {
  if (boundNotebookPanels.has(panel)) {
    return;
  }

  boundNotebookPanels.add(panel);

  const syncToMindMaps = () => {
    const cellIndex = panel.content.activeCellIndex;

    mindMapTracker.forEach((mindMapDoc) => {
      if (mindMapDoc.context.path === panel.context.path) {
        mindMapDoc.content.syncActiveCellFromNotebook(cellIndex);
      }
    });
  };

  panel.content.activeCellChanged.connect(syncToMindMaps);
};

export const syncNotebookPanelToMindMaps = (
  panel: NotebookPanel,
  mindMapTracker: NotebookMindMapTracker,
): void => {
  bindNotebookToMindMapSync(panel, mindMapTracker);

  const cellIndex = panel.content.activeCellIndex;

  mindMapTracker.forEach((mindMapDoc) => {
    if (mindMapDoc.context.path === panel.context.path) {
      mindMapDoc.content.syncActiveCellFromNotebook(cellIndex);
    }
  });
};

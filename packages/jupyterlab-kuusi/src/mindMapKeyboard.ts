import { Clipboard } from "@jupyterlab/apputils";
import type { INotebookModel } from "@jupyterlab/notebook";
import { CodeCell, MarkdownCell } from "@jupyterlab/cells";
import { NotebookActions, type Notebook } from "@jupyterlab/notebook";
import type { INotebookContent } from "@jupyterlab/nbformat";
import {
  buildNotebookOutline,
  collectOutlineSubtreeCellIndices,
  findOutlineNode,
  getInsertIndexAfterSubtree,
  getInsertIndexForChild,
  getMindMapRootNode,
  navigateOutlineNode,
  remapSubtreeCellsToRootLevel,
  type NotebookCell,
} from "kuusi-kernel";

/** JupyterLab notebook cell clipboard MIME type. */
const JUPYTER_CELL_MIME = "application/vnd.jupyter.cells";

const EMPTY_CELL_SOURCE = "";

const resolveSiblingHeadingLevel = (
  outline: ReturnType<typeof buildNotebookOutline>,
  nodeId: string,
): number | null => {
  const located = findOutlineNode(outline, nodeId);

  if (!located) {
    return 1;
  }

  return located.node.headingLevel;
};

const resolveChildHeadingLevel = (
  outline: ReturnType<typeof buildNotebookOutline>,
  nodeId: string,
): number => {
  const located = findOutlineNode(outline, nodeId);

  if (!located) {
    return 1;
  }

  if (located.node.headingLevel !== null) {
    return Math.min(6, located.node.headingLevel + 1);
  }

  if (located.parent.headingLevel !== null) {
    return Math.min(6, located.parent.headingLevel + 1);
  }

  return 1;
};

const insertMarkdownCell = (
  notebook: Notebook,
  model: INotebookModel,
  index: number,
  headingLevel?: number,
): void => {
  model.sharedModel.insertCell(index, {
    cell_type: "markdown",
    metadata:
      headingLevel !== undefined
        ? { kuusi: { headingLevel } }
        : {},
    source: EMPTY_CELL_SOURCE,
  });
  notebook.activeCellIndex = index;
  notebook.deselectAll();
  notebook.mode = "command";
};

const getNotebookCells = (model: INotebookModel): NotebookCell[] =>
  ((model.toJSON() as INotebookContent).cells ?? []) as NotebookCell[];

export const commitActiveMindMapCell = (notebook: Notebook): void => {
  const cell = notebook.activeCell;

  if (cell instanceof CodeCell) {
    void NotebookActions.run(notebook);
  } else if (cell instanceof MarkdownCell && !cell.rendered) {
    cell.rendered = true;
  }

  notebook.mode = "command";
};

export const insertMindMapSibling = (
  notebook: Notebook,
  model: INotebookModel,
): void => {
  if (notebook.activeCellIndex < 0) {
    insertMarkdownCell(notebook, model, model.cells.length, 1);
    return;
  }

  const outline = buildNotebookOutline(getNotebookCells(model));
  const nodeId = `cell-${notebook.activeCellIndex}`;
  const located = findOutlineNode(outline, nodeId);

  // Enter on a map root (H1 under the virtual outline root) would create
  // another H1 forest with no parent edge — looks like a floating orphan.
  // Treat Enter as insert-child in that case (same as Tab).
  if (
    located &&
    located.parent.id === "root" &&
    located.node.headingLevel === 1
  ) {
    insertMindMapChild(notebook, model);
    return;
  }

  const insertIndex = getInsertIndexAfterSubtree(
    outline,
    nodeId,
    model.cells.length,
  );
  const level = resolveSiblingHeadingLevel(outline, nodeId);

  if (level !== null) {
    insertMarkdownCell(notebook, model, insertIndex, level);
    return;
  }

  insertMarkdownCell(notebook, model, insertIndex);
};

export const insertMindMapChild = (
  notebook: Notebook,
  model: INotebookModel,
): void => {
  const insertIndex =
    notebook.activeCellIndex < 0
      ? model.cells.length
      : getInsertIndexForChild(
          buildNotebookOutline(getNotebookCells(model)),
          `cell-${notebook.activeCellIndex}`,
          model.cells.length,
        );

  if (notebook.activeCellIndex < 0) {
    insertMarkdownCell(notebook, model, insertIndex, 1);
    return;
  }

  const outline = buildNotebookOutline(getNotebookCells(model));
  const level = resolveChildHeadingLevel(
    outline,
    `cell-${notebook.activeCellIndex}`,
  );

  insertMarkdownCell(notebook, model, insertIndex, level);
};

export const selectMindMapCell = (
  notebook: Notebook,
  cellIndex: number,
): void => {
  if (cellIndex < 0 || cellIndex >= notebook.widgets.length) {
    return;
  }

  notebook.deselectAll();
  notebook.activeCellIndex = cellIndex;
  notebook.mode = "command";
};

export const selectRootMindMapCell = (
  notebook: Notebook,
  model: INotebookModel,
): void => {
  const outline = buildNotebookOutline(getNotebookCells(model));
  const rootNode = getMindMapRootNode(outline);

  if (rootNode?.cellIndex !== null && rootNode?.cellIndex !== undefined) {
    selectMindMapCell(notebook, rootNode.cellIndex);
  }
};

/**
 * Select the active mind-map topic and every descendant cell under it.
 * Falls back to the active cell when it is not in the outline.
 */
export const selectMindMapSubtreeCells = (
  notebook: Notebook,
  model: INotebookModel,
): number[] => {
  const activeIndex = notebook.activeCellIndex;

  if (activeIndex < 0) {
    return [];
  }

  const outline = buildNotebookOutline(getNotebookCells(model));
  const located = findOutlineNode(outline, `cell-${activeIndex}`);
  const indices = (
    located
      ? collectOutlineSubtreeCellIndices(located.node)
      : [activeIndex]
  )
    .filter((index) => index >= 0 && index < notebook.widgets.length)
    .sort((left, right) => left - right);

  if (indices.length === 0) {
    return [];
  }

  notebook.deselectAll();
  notebook.activeCellIndex = indices[0]!;
  notebook.mode = "command";

  indices.forEach((index) => {
    const cell = notebook.widgets[index];

    if (cell) {
      notebook.select(cell);
    }
  });

  return indices;
};

/**
 * Delete the active mind-map topic and every descendant cell under it.
 * Falls back to deleting the active cell when it is not in the outline.
 */
export const deleteMindMapSubtree = (
  notebook: Notebook,
  model: INotebookModel,
): void => {
  if (selectMindMapSubtreeCells(notebook, model).length === 0) {
    return;
  }

  NotebookActions.deleteCells(notebook);
};

/**
 * Copy the active mind-map topic and its entire subtree to the clipboard.
 */
export const copyMindMapSubtree = (
  notebook: Notebook,
  model: INotebookModel,
): void => {
  const activeIndex = notebook.activeCellIndex;

  if (selectMindMapSubtreeCells(notebook, model).length === 0) {
    return;
  }

  void NotebookActions.copy(notebook);

  if (activeIndex >= 0 && activeIndex < notebook.widgets.length) {
    notebook.activeCellIndex = activeIndex;
  }
};

/**
 * Cut the active mind-map topic and its entire subtree to the clipboard.
 */
export const cutMindMapSubtree = (
  notebook: Notebook,
  model: INotebookModel,
): void => {
  if (selectMindMapSubtreeCells(notebook, model).length === 0) {
    return;
  }

  NotebookActions.cut(notebook);
};

/**
 * Paste a copied subtree as a sibling after the active topic's branch,
 * remapping heading levels so hierarchy is preserved under the paste target.
 */
export const pasteMindMapSubtree = (
  notebook: Notebook,
  model: INotebookModel,
): void => {
  const clipboard = Clipboard.getInstance();

  if (!clipboard.hasData(JUPYTER_CELL_MIME)) {
    return;
  }

  const raw = clipboard.getData(JUPYTER_CELL_MIME) as NotebookCell[] | null;

  if (!raw || raw.length === 0) {
    return;
  }

  const activeIndex = notebook.activeCellIndex;
  const outline = buildNotebookOutline(getNotebookCells(model));
  let insertIndex = model.cells.length;
  let targetLevel: number | null = null;

  if (activeIndex >= 0) {
    const nodeId = `cell-${activeIndex}`;
    insertIndex = getInsertIndexAfterSubtree(
      outline,
      nodeId,
      model.cells.length,
    );
    targetLevel = resolveSiblingHeadingLevel(outline, nodeId);
  }

  const prepared =
    targetLevel !== null
      ? remapSubtreeCellsToRootLevel(raw, targetLevel)
      : (JSON.parse(JSON.stringify(raw)) as NotebookCell[]);

  notebook.mode = "command";
  model.sharedModel.transact(() => {
    model.sharedModel.insertCells(
      insertIndex,
      prepared.map((cell) => {
        const next = { ...cell } as Record<string, unknown>;
        delete next.id;
        return next;
      }) as Parameters<typeof model.sharedModel.insertCells>[1],
    );
  });

  notebook.activeCellIndex = insertIndex;
  notebook.deselectAll();
};

/** Split external clipboard text into one topic title per non-empty line. */
export const splitClipboardTextIntoTopics = (text: string): string[] =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      return heading?.[2]?.trim() ? heading[2].trim() : line;
    });

/**
 * Paste plain text as child topics under the active node (one node per line).
 * Returns the index of the first inserted cell, or null if nothing was pasted.
 */
export const pasteTextAsMindMapChildren = (
  notebook: Notebook,
  model: INotebookModel,
  text: string,
): number | null => {
  const topics = splitClipboardTextIntoTopics(text);

  if (topics.length === 0) {
    return null;
  }

  const activeIndex = notebook.activeCellIndex;
  const outline = buildNotebookOutline(getNotebookCells(model));
  let insertIndex = model.cells.length;
  let level = 1;

  if (activeIndex >= 0) {
    const nodeId = `cell-${activeIndex}`;
    insertIndex = getInsertIndexForChild(
      outline,
      nodeId,
      model.cells.length,
    );
    level = resolveChildHeadingLevel(outline, nodeId);
  }

  const hashes = "#".repeat(level);
  const cells = topics.map((title) => ({
    cell_type: "markdown" as const,
    source: `${hashes} ${title}`,
    metadata: { kuusi: { headingLevel: level } },
  }));

  notebook.mode = "command";
  model.sharedModel.transact(() => {
    model.sharedModel.insertCells(
      insertIndex,
      cells as Parameters<typeof model.sharedModel.insertCells>[1],
    );
  });

  notebook.activeCellIndex = insertIndex;
  notebook.deselectAll();
  return insertIndex;
};

/**
 * Paste Jupyter cell clipboard as a subtree when present; otherwise paste
 * system text as child topics under the selection.
 */
export const pasteMindMapClipboard = async (
  notebook: Notebook,
  model: INotebookModel,
): Promise<"subtree" | "text" | false> => {
  const clipboard = Clipboard.getInstance();

  if (clipboard.hasData(JUPYTER_CELL_MIME)) {
    pasteMindMapSubtree(notebook, model);
    return "subtree";
  }

  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    return false;
  }

  try {
    const text = await navigator.clipboard.readText();

    if (!text.trim()) {
      return false;
    }

    const index = pasteTextAsMindMapChildren(notebook, model, text);
    return index === null ? false : "text";
  } catch {
    return false;
  }
};

export const navigateMindMapSelection = (
  notebook: Notebook,
  model: INotebookModel,
  direction: "up" | "down" | "left" | "right",
  visibleIds: ReadonlySet<string>,
  collapsedIds: ReadonlySet<string>,
): boolean => {
  if (notebook.activeCellIndex < 0) {
    selectRootMindMapCell(notebook, model);
    return true;
  }

  const outline = buildNotebookOutline(getNotebookCells(model));
  const currentNodeId = `cell-${notebook.activeCellIndex}`;
  const target = navigateOutlineNode(
    outline,
    currentNodeId,
    direction,
    visibleIds,
    collapsedIds,
  );

  if (!target) {
    return false;
  }

  selectMindMapCell(notebook, target.cellIndex);
  return true;
};

export const isMindMapEditingText = (notebook: Notebook): boolean => {
  if (notebook.mode !== "edit") {
    return false;
  }

  const active = document.activeElement;

  if (!(active instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    active.closest(".jp-CodeMirrorEditor") ||
      active.closest(".jp-InputArea-editor") ||
      active.isContentEditable,
  );
};

export type MindMapShortcutResult =
  | false
  | "default"
  | "insert-edit-child"
  | "insert-edit-sibling"
  | "commit-stay"
  | "paste";

export const handleMindMapShortcut = (
  notebook: Notebook,
  model: INotebookModel,
  event: KeyboardEvent,
  visibleIds: ReadonlySet<string>,
  collapsedIds: ReadonlySet<string>,
): MindMapShortcutResult => {
  const mod = event.metaKey || event.ctrlKey;

  if (isMindMapEditingText(notebook)) {
    if (event.key === "Escape") {
      commitActiveMindMapCell(notebook);
      event.preventDefault();
      return "default";
    }

    if (event.key === "Enter" && event.shiftKey && !mod) {
      commitActiveMindMapCell(notebook);
      insertMindMapSibling(notebook, model);
      event.preventDefault();
      return "insert-edit-sibling";
    }

    if (event.key === "Enter" && mod && !event.shiftKey) {
      commitActiveMindMapCell(notebook);
      event.preventDefault();
      return "commit-stay";
    }

    return false;
  }

  if (mod && event.key.toLowerCase() === "z" && !event.shiftKey) {
    NotebookActions.undo(notebook);
    event.preventDefault();
    return "default";
  }

  if (
    mod &&
    (event.key.toLowerCase() === "y" ||
      (event.key.toLowerCase() === "z" && event.shiftKey))
  ) {
    NotebookActions.redo(notebook);
    event.preventDefault();
    return "default";
  }

  if (mod && event.key.toLowerCase() === "c") {
    copyMindMapSubtree(notebook, model);
    event.preventDefault();
    return "default";
  }

  if (mod && event.key.toLowerCase() === "x") {
    cutMindMapSubtree(notebook, model);
    event.preventDefault();
    return "default";
  }

  if (mod && event.key.toLowerCase() === "v") {
    event.preventDefault();
    return "paste";
  }

  if (mod && event.key === "Home") {
    selectRootMindMapCell(notebook, model);
    event.preventDefault();
    return "default";
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    deleteMindMapSubtree(notebook, model);
    event.preventDefault();
    return "default";
  }

  if (event.key === "Enter" && !event.shiftKey && !mod) {
    insertMindMapSibling(notebook, model);
    event.preventDefault();
    return "insert-edit-sibling";
  }

  if (event.key === "Tab" && !event.shiftKey && !mod) {
    insertMindMapChild(notebook, model);
    event.preventDefault();
    return "insert-edit-child";
  }

  if (event.key === "Escape") {
    notebook.mode = "command";
    event.preventDefault();
    return "default";
  }

  if (
    event.key === "ArrowUp" ||
    event.key === "ArrowDown" ||
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight"
  ) {
    const direction =
      event.key === "ArrowUp"
        ? "up"
        : event.key === "ArrowDown"
          ? "down"
          : event.key === "ArrowLeft"
            ? "left"
            : "right";

    if (
      navigateMindMapSelection(
        notebook,
        model,
        direction,
        visibleIds,
        collapsedIds,
      )
    ) {
      event.preventDefault();
      return "default";
    }
  }

  return false;
};

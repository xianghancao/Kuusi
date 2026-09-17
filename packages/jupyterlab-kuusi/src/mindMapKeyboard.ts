import { Clipboard, SystemClipboard } from "@jupyterlab/apputils";
import type { INotebookModel } from "@jupyterlab/notebook";
import { CodeCell, MarkdownCell } from "@jupyterlab/cells";
import { NotebookActions, type Notebook } from "@jupyterlab/notebook";
import {
  buildNotebookOutline,
  collectOutlineSubtreeCellIndices,
  findOutlineNode,
  getInsertIndexAfterSubtree,
  getInsertIndexForChild,
  getMindMapRootNode,
  MAX_OUTLINE_DEPTH,
  navigateOutlineNode,
  parseClipboardMarkdownOutline,
  remapClipboardTopicsUnderBase,
  remapSubtreeCellsToBody,
  remapSubtreeCellsToRootLevel,
  resolveFocusAfterDelete,
  type NotebookCell,
  type OutlineNode,
} from "kuusi-kernel";
import { snapshotNotebookCells } from "./notebookCells";
import { MIND_MAP_ROOT_CELL_SOURCE } from "./mindMapNotebook";

/** JupyterLab notebook cell clipboard MIME type. */
const JUPYTER_CELL_MIME = "application/vnd.jupyter.cells";

const EMPTY_CELL_SOURCE = "";

/** True when system-clipboard text is a Jupyter cell JSON payload. */
const tryParseNotebookCells = (text: string): NotebookCell[] | null => {
  const trimmed = text.trim();

  if (!trimmed.startsWith("[")) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    const cells = parsed as unknown[];

    if (
      !cells.every(
        (cell) =>
          Boolean(cell) &&
          typeof cell === "object" &&
          typeof (cell as { cell_type?: unknown }).cell_type === "string",
      )
    ) {
      return null;
    }

    return cells as NotebookCell[];
  } catch {
    return null;
  }
};

const mirrorCellsToSystemClipboard = (cells: NotebookCell[]): void => {
  void SystemClipboard.getInstance().setData(JUPYTER_CELL_MIME, cells);
};

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
): number | null => {
  const located = findOutlineNode(outline, nodeId);

  if (!located) {
    return 1;
  }

  if (located.node.headingLevel !== null) {
    const next = located.node.headingLevel + 1;
    return next > MAX_OUTLINE_DEPTH ? null : next;
  }

  // Body node: inherit nesting from the nearest ancestor frame (skip Body parents).
  let ancestor: OutlineNode | null = located.parent;

  while (ancestor) {
    if (ancestor.headingLevel !== null) {
      const next = ancestor.headingLevel + 1;
      return next > MAX_OUTLINE_DEPTH ? null : next;
    }

    if (ancestor.id === "root") {
      break;
    }

    const up = findOutlineNode(outline, ancestor.id);
    ancestor = up?.parent ?? null;
  }

  // No frame above (should be rare on a visible map) — insert as H1.
  return 1;
};

const insertMarkdownCell = (
  notebook: Notebook,
  model: INotebookModel,
  index: number,
  headingLevel?: number,
  source: string = EMPTY_CELL_SOURCE,
): void => {
  const meta =
    headingLevel !== undefined
      ? {
          kuusi: {
            outlineLevel: headingLevel,
            headingLevel,
          },
        }
      : {};
  model.sharedModel.insertCell(index, {
    cell_type: "markdown",
    metadata: meta,
    source,
  });
  notebook.activeCellIndex = index;
  notebook.deselectAll();
  notebook.mode = "command";
};

/**
 * Kuusi only lays out cells under an H1. Empty / untitled notebooks ship with
 * a blank code cell and therefore show nothing — seed an H1 root when needed.
 * Returns true when the notebook was mutated.
 */
export const ensureMindMapRoot = (
  notebook: Notebook,
  model: INotebookModel,
): boolean => {
  const outline = buildNotebookOutline(getNotebookCells(model));

  if (outline.children.length > 0) {
    return false;
  }

  if (model.cells.length === 0) {
    insertMarkdownCell(notebook, model, 0, 1, MIND_MAP_ROOT_CELL_SOURCE);
    return true;
  }

  const first = model.cells.get(0);
  const firstSource = first?.sharedModel.getSource().trim() ?? "";

  // Default Jupyter untitled notebook: one empty code cell → promote to H1.
  if (model.cells.length === 1 && firstSource === "" && first) {
    notebook.activeCellIndex = 0;
    notebook.deselectAll();

    if (first.type !== "markdown") {
      NotebookActions.changeCellType(notebook, "markdown");
    }

    const markdown = model.cells.get(0);

    if (markdown?.type === "markdown") {
      markdown.sharedModel.setSource(MIND_MAP_ROOT_CELL_SOURCE);
    }

    notebook.mode = "command";
    return true;
  }

  // Non-empty cells but no H1 yet — prepend a map root.
  insertMarkdownCell(notebook, model, 0, 1, MIND_MAP_ROOT_CELL_SOURCE);
  return true;
};

const getNotebookCells = (model: INotebookModel): NotebookCell[] =>
  snapshotNotebookCells(model);

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

  insertMarkdownCell(
    notebook,
    model,
    insertIndex,
    level === null ? undefined : level,
  );
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
 * Focus moves to the next sibling, previous sibling, or parent.
 */
export const deleteMindMapSubtree = (
  notebook: Notebook,
  model: INotebookModel,
  visibleIds?: ReadonlySet<string>,
): void => {
  const activeIndex = notebook.activeCellIndex;
  const indices = selectMindMapSubtreeCells(notebook, model);

  if (indices.length === 0) {
    return;
  }

  let focusModelId: string | null = null;

  if (activeIndex >= 0) {
    const outline = buildNotebookOutline(getNotebookCells(model));
    const deletedNodeId = `cell-${activeIndex}`;
    const collectNodeIds = (nodes: OutlineNode[]): string[] =>
      nodes.flatMap((node) => [node.id, ...collectNodeIds(node.children)]);
    const ids =
      visibleIds ?? new Set(collectNodeIds(outline.children));
    const focusTarget = resolveFocusAfterDelete(
      outline,
      deletedNodeId,
      ids,
    );

    if (focusTarget) {
      const cell = model.cells.get(focusTarget.cellIndex);
      focusModelId = cell?.id ?? null;
    }
  }

  NotebookActions.deleteCells(notebook);

  if (focusModelId) {
    for (let index = 0; index < model.cells.length; index++) {
      if (model.cells.get(index)?.id === focusModelId) {
        selectMindMapCell(notebook, index);
        return;
      }
    }
  }

  if (model.cells.length === 0) {
    ensureMindMapRoot(notebook, model);
    return;
  }

  selectRootMindMapCell(notebook, model);
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

  // In-app MimeData + system clipboard JSON so paste can prefer OS text when the
  // user later copies from outside Kuusi (stale MimeData must not win).
  void NotebookActions.copy(notebook);

  const cells = Clipboard.getInstance().getData(JUPYTER_CELL_MIME) as
    | NotebookCell[]
    | null;

  if (cells && cells.length > 0) {
    mirrorCellsToSystemClipboard(cells);
  }

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

  void NotebookActions.cut(notebook);

  const cells = Clipboard.getInstance().getData(JUPYTER_CELL_MIME) as
    | NotebookCell[]
    | null;

  if (cells && cells.length > 0) {
    mirrorCellsToSystemClipboard(cells);
  }
};

/**
 * Paste notebook cells as a child subtree under the active topic.
 */
export const pasteMindMapSubtreeFromCells = (
  notebook: Notebook,
  model: INotebookModel,
  raw: NotebookCell[],
): void => {
  if (raw.length === 0) {
    return;
  }

  const activeIndex = notebook.activeCellIndex;
  const outline = buildNotebookOutline(getNotebookCells(model));
  let insertIndex = model.cells.length;
  let targetLevel: number | null = null;

  if (activeIndex >= 0) {
    const nodeId = `cell-${activeIndex}`;
    insertIndex = getInsertIndexForChild(
      outline,
      nodeId,
      model.cells.length,
    );
    targetLevel = resolveChildHeadingLevel(outline, nodeId);
  }

  const prepared =
    targetLevel !== null
      ? remapSubtreeCellsToRootLevel(raw, targetLevel)
      : activeIndex >= 0
        ? remapSubtreeCellsToBody(raw)
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

/**
 * Paste a copied subtree as a child under the active topic,
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

  pasteMindMapSubtreeFromCells(notebook, model, raw);
};

/** @deprecated Prefer parseClipboardMarkdownOutline for hierarchical paste. */
export const splitClipboardTextIntoTopics = (text: string): string[] =>
  parseClipboardMarkdownOutline(text).map((topic) => topic.title);

/**
 * Paste clipboard Markdown as a child outline under the active node.
 * ATX headings preserve relative hierarchy (remapped under the target);
 * consecutive list items stay in one Body cell; other plain lines become
 * Body (or heading-level topics when the paste has no headings).
 * Returns the first inserted cell index, or null.
 */
export const pasteTextAsMindMapChildren = (
  notebook: Notebook,
  model: INotebookModel,
  text: string,
): number | null => {
  const parsed = parseClipboardMarkdownOutline(text);

  if (parsed.length === 0) {
    return null;
  }

  const activeIndex = notebook.activeCellIndex;
  const outline = buildNotebookOutline(getNotebookCells(model));
  let insertIndex = model.cells.length;
  let baseLevel: number | null = 1;

  if (activeIndex >= 0) {
    const nodeId = `cell-${activeIndex}`;
    insertIndex = getInsertIndexForChild(
      outline,
      nodeId,
      model.cells.length,
    );
    baseLevel = resolveChildHeadingLevel(outline, nodeId);
  }

  const topics = remapClipboardTopicsUnderBase(parsed, baseLevel);

  const cells = topics.map((topic) =>
    topic.level === null
      ? {
          cell_type: "markdown" as const,
          source: topic.title,
          metadata: {},
        }
      : {
          cell_type: "markdown" as const,
          source: `${"#".repeat(topic.level)} ${topic.title}`,
          metadata: { kuusi: { headingLevel: topic.level } },
        },
  );

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
 * Prefer the OS clipboard so external text wins over stale in-app cell data.
 * Cell JSON on the system clipboard pastes as a subtree; plain text becomes
 * child topics. Falls back to Jupyter MimeData when the OS clipboard is empty
 * or unreadable.
 */
export const pasteMindMapClipboard = async (
  notebook: Notebook,
  model: INotebookModel,
): Promise<"subtree" | "text" | false> => {
  let systemText: string | null = null;

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      systemText = await navigator.clipboard.readText();
    }
  } catch {
    systemText = null;
  }

  if (systemText !== null && systemText.trim()) {
    const cells = tryParseNotebookCells(systemText);

    if (cells) {
      pasteMindMapSubtreeFromCells(notebook, model, cells);
      return "subtree";
    }

    const index = pasteTextAsMindMapChildren(notebook, model, systemText);
    return index === null ? false : "text";
  }

  const clipboard = Clipboard.getInstance();

  if (clipboard.hasData(JUPYTER_CELL_MIME)) {
    pasteMindMapSubtree(notebook, model);
    return "subtree";
  }

  return false;
};

export type SpatialNavigateFn = (
  direction: "up" | "down" | "left" | "right",
) => number | null;

export const navigateMindMapSelection = (
  notebook: Notebook,
  model: INotebookModel,
  direction: "up" | "down" | "left" | "right",
  visibleIds: ReadonlySet<string>,
  collapsedIds: ReadonlySet<string>,
  spatialNavigate?: SpatialNavigateFn,
): boolean => {
  if (notebook.activeCellIndex < 0) {
    selectRootMindMapCell(notebook, model);
    return true;
  }

  const spatialIndex = spatialNavigate?.(direction);

  if (spatialIndex !== null && spatialIndex !== undefined && spatialIndex >= 0) {
    selectMindMapCell(notebook, spatialIndex);
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
  spatialNavigate?: SpatialNavigateFn,
): MindMapShortcutResult => {
  const mod = event.metaKey || event.ctrlKey;

  if (isMindMapEditingText(notebook)) {
    if (event.key === "Escape") {
      commitActiveMindMapCell(notebook);
      event.preventDefault();
      return "default";
    }

    // Tab while editing: commit and insert a child (same as command-mode Tab).
    // Otherwise the auto-edit after the first Tab makes the shortcut feel broken.
    if (event.key === "Tab" && !event.shiftKey && !mod) {
      commitActiveMindMapCell(notebook);
      insertMindMapChild(notebook, model);
      event.preventDefault();
      event.stopPropagation();
      return "insert-edit-child";
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
    deleteMindMapSubtree(notebook, model, visibleIds);
    event.preventDefault();
    return "default";
  }

  if (event.key === "Enter" && !event.shiftKey && !mod) {
    insertMindMapSibling(notebook, model);
    event.preventDefault();
    return "insert-edit-sibling";
  }

  if (event.key === "Tab" && !event.shiftKey && !mod) {
    if (notebook.mode === "edit") {
      commitActiveMindMapCell(notebook);
    }

    insertMindMapChild(notebook, model);
    event.preventDefault();
    event.stopPropagation();
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
        spatialNavigate,
      )
    ) {
      event.preventDefault();
      return "default";
    }
  }

  return false;
};

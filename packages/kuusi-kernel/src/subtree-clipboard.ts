import {
  getCellHeadingLevel,
  parseMarkdownHeading,
} from "./notebook-outline";
import { getKuusiNodeMetadata } from "./node-frame";
import {
  clearMarkdownHeadingSource,
  updateMarkdownHeadingSource,
} from "./notebook-tree";
import {
  clampOutlineDepth,
  MAX_OUTLINE_DEPTH,
  MAX_OUTLINE_HEADING_LEVEL,
  type NotebookCell,
} from "./types";

const joinCellSource = (source: string | string[]) =>
  Array.isArray(source) ? source.join("") : source;

const cloneCells = (cells: NotebookCell[]): NotebookCell[] =>
  JSON.parse(JSON.stringify(cells)) as NotebookCell[];

const writeOutlineLevelMeta = (
  cell: NotebookCell,
  level: number | null,
): void => {
  const meta = { ...(getKuusiNodeMetadata(cell) ?? {}) };

  if (level === null) {
    delete meta.outlineLevel;
    delete meta.headingLevel;
  } else {
    const clamped = clampOutlineDepth(level);
    meta.outlineLevel = clamped;
    // Keep headingLevel in sync for older Kuusi builds / tools.
    meta.headingLevel = clamped;
  }

  cell.metadata = {
    ...(cell.metadata ?? {}),
    kuusi: meta,
  };
};

const applyOutlineLevelToCell = (cell: NotebookCell, level: number): void => {
  const clamped = clampOutlineDepth(level);

  if (cell.cell_type === "markdown") {
    const source = joinCellSource(cell.source);

    if (clamped <= MAX_OUTLINE_HEADING_LEVEL) {
      if (parseMarkdownHeading(source.trim())) {
        cell.source = updateMarkdownHeadingSource(source, clamped);
      }
    } else if (parseMarkdownHeading(source.trim())) {
      cell.source = clearMarkdownHeadingSource(source);
    }
  }

  writeOutlineLevelMeta(cell, clamped);
};

const clearHeadingFromCell = (cell: NotebookCell): void => {
  if (cell.cell_type === "markdown") {
    const source = joinCellSource(cell.source);

    if (parseMarkdownHeading(source.trim())) {
      cell.source = clearMarkdownHeadingSource(source);
    }
  }

  writeOutlineLevelMeta(cell, null);
};

/** Clear outline levels so every pasted cell is plain Body text. */
export const remapSubtreeCellsToBody = (
  cells: NotebookCell[],
): NotebookCell[] => {
  const cloned = cloneCells(cells);
  cloned.forEach(clearHeadingFromCell);
  return cloned;
};

/**
 * Remap a copied subtree so its shallowest structural level matches
 * `targetRootLevel`, preserving relative depth within the branch.
 * Levels beyond {@link MAX_OUTLINE_DEPTH} become plain Body.
 */
export const remapSubtreeCellsToRootLevel = (
  cells: NotebookCell[],
  targetRootLevel: number,
): NotebookCell[] => {
  if (targetRootLevel > MAX_OUTLINE_DEPTH) {
    return remapSubtreeCellsToBody(cells);
  }

  const clampedTarget = clampOutlineDepth(targetRootLevel);
  const cloned = cloneCells(cells);
  const levels = cloned
    .map((cell) => getCellHeadingLevel(cell))
    .filter((level): level is number => level !== null);

  if (levels.length === 0) {
    const firstMarkdown = cloned.find((cell) => cell.cell_type === "markdown");
    if (firstMarkdown) {
      writeOutlineLevelMeta(firstMarkdown, clampedTarget);
    }
    return cloned;
  }

  const minLevel = Math.min(...levels);

  cloned.forEach((cell) => {
    const current = getCellHeadingLevel(cell);

    if (current === null) {
      return;
    }

    const next = clampedTarget + (current - minLevel);

    if (next > MAX_OUTLINE_DEPTH) {
      clearHeadingFromCell(cell);
      return;
    }

    applyOutlineLevelToCell(cell, next);
  });

  return cloned;
};

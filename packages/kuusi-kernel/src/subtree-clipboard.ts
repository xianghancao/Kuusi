import {
  getCellHeadingLevel,
  parseMarkdownHeading,
  resolveCellHeading,
} from "./notebook-outline";
import { getKuusiNodeMetadata } from "./node-frame";
import { updateMarkdownHeadingSource } from "./notebook-tree";
import type { NotebookCell } from "./types";

const joinCellSource = (source: string | string[]) =>
  Array.isArray(source) ? source.join("") : source;

const cloneCells = (cells: NotebookCell[]): NotebookCell[] =>
  JSON.parse(JSON.stringify(cells)) as NotebookCell[];

const applyHeadingLevelToCell = (cell: NotebookCell, level: number): void => {
  const clamped = Math.min(6, Math.max(1, level));

  if (cell.cell_type === "markdown") {
    const source = joinCellSource(cell.source);

    if (parseMarkdownHeading(source.trim())) {
      cell.source = updateMarkdownHeadingSource(source, clamped);
    }
  }

  const meta = getKuusiNodeMetadata(cell);

  if (meta && typeof meta.headingLevel === "number") {
    cell.metadata = {
      ...(cell.metadata ?? {}),
      kuusi: { ...meta, headingLevel: clamped },
    };
  }
};

const stampMetadataHeadingLevel = (
  cell: NotebookCell,
  level: number,
): void => {
  const meta = getKuusiNodeMetadata(cell) ?? {};
  cell.metadata = {
    ...(cell.metadata ?? {}),
    kuusi: { ...meta, headingLevel: Math.min(6, Math.max(1, level)) },
  };
};

/**
 * Remap a copied subtree so its shallowest heading matches `targetRootLevel`,
 * preserving relative depth within the branch.
 */
export const remapSubtreeCellsToRootLevel = (
  cells: NotebookCell[],
  targetRootLevel: number,
): NotebookCell[] => {
  const clampedTarget = Math.min(6, Math.max(1, targetRootLevel));
  const cloned = cloneCells(cells);

  let minLevel: number | null = null;

  cloned.forEach((cell) => {
    const level = getCellHeadingLevel(cell);

    if (level !== null && (minLevel === null || level < minLevel)) {
      minLevel = level;
    }
  });

  if (minLevel === null) {
    const firstMarkdown = cloned.find((cell) => cell.cell_type === "markdown");

    if (firstMarkdown) {
      stampMetadataHeadingLevel(firstMarkdown, clampedTarget);
    }

    return cloned;
  }

  const delta = clampedTarget - minLevel;

  if (delta === 0) {
    return cloned;
  }

  cloned.forEach((cell) => {
    const heading = resolveCellHeading(cell);

    if (!heading) {
      return;
    }

    applyHeadingLevelToCell(cell, heading.level + delta);
  });

  return cloned;
};

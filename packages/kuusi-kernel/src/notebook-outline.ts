import type { NotebookCell, OutlineNode } from "./types";
import {
  clampOutlineDepth,
  MAX_OUTLINE_DEPTH,
  MAX_OUTLINE_HEADING_LEVEL,
} from "./types";
import { getKuusiNodeMetadata } from "./node-frame";

const joinCellSource = (source: string | string[]) =>
  Array.isArray(source) ? source.join("") : source;

export const parseMarkdownHeading = (source: string) => {
  const firstLine =
    source.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
  const match = firstLine.match(/^(#{1,6})(?:\s+(.*))?$/);

  if (!match?.[1]) {
    return null;
  }

  return {
    level: match[1].length,
    title: (match[2] ?? "").trim(),
  };
};

const cellTitle = (cell: NotebookCell, cellIndex: number) => {
  const source = joinCellSource(cell.source).trim();
  const heading =
    cell.cell_type === "markdown" ? parseMarkdownHeading(source) : null;

  if (heading) {
    return heading.title;
  }

  const firstLine = source.split("\n").find((line) => line.trim())?.trim();
  return firstLine ?? "";
};

/**
 * Read structural outline depth (1…{@MAX_OUTLINE_DEPTH}) for a cell.
 * - ATX `#`…`######` map to levels 1–6 (4–6 nest but paint as Body).
 * - `metadata.kuusi.outlineLevel` or legacy `headingLevel` for 1–20.
 */
export const resolveCellOutlineLevel = (
  cell: NotebookCell,
): { level: number; title: string } | null => {
  const source = joinCellSource(cell.source);
  const title = cellTitle(cell, 0);
  const markdownHeading =
    cell.cell_type === "markdown" ? parseMarkdownHeading(source.trim()) : null;
  const meta = getKuusiNodeMetadata(cell);
  const metaLevel =
    typeof meta?.outlineLevel === "number"
      ? meta.outlineLevel
      : typeof meta?.headingLevel === "number"
        ? meta.headingLevel
        : null;

  // ATX is the source of truth when present (including ####–###### as depth 4–6).
  if (markdownHeading) {
    return {
      level: clampOutlineDepth(markdownHeading.level),
      title: markdownHeading.title || title,
    };
  }

  if (
    typeof metaLevel === "number" &&
    metaLevel >= 1 &&
    metaLevel <= MAX_OUTLINE_DEPTH
  ) {
    return { level: clampOutlineDepth(metaLevel), title };
  }

  return null;
};

/** @deprecated Prefer {@link resolveCellOutlineLevel}. */
export const resolveCellHeading = resolveCellOutlineLevel;

/** Structural outline depth for a cell, or null for plain Body content. */
export const getCellHeadingLevel = (cell: NotebookCell): number | null =>
  resolveCellOutlineLevel(cell)?.level ?? null;

type OutlineFrame = {
  level: number;
  node: OutlineNode;
};

/**
 * Build a tree from notebook cells using outline depth.
 *
 * - Level 1 → mind-map roots under the virtual root
 * - Levels 2…{@MAX_OUTLINE_DEPTH} → nest under the nearest shallower frame
 * - Plain Body (no level) → hang under the current frame (no new frame)
 * - Content before the first level-1 node is skipped
 */
export const buildNotebookOutline = (cells: NotebookCell[]): OutlineNode => {
  const root: OutlineNode = {
    id: "root",
    cellIndex: null,
    headingLevel: null,
    title: "",
    children: [],
  };
  const stack: OutlineFrame[] = [];

  cells.forEach((cell, cellIndex) => {
    const outline = resolveCellOutlineLevel(cell);

    if (outline) {
      while (
        stack.length > 0 &&
        stack[stack.length - 1]!.level >= outline.level
      ) {
        stack.pop();
      }
    }

    let parent: OutlineNode | null = null;

    if (outline) {
      parent =
        outline.level === 1 ? root : (stack[stack.length - 1]?.node ?? null);
    } else {
      parent = stack[stack.length - 1]?.node ?? null;
    }

    if (!parent) {
      return;
    }

    const node: OutlineNode = {
      id: `cell-${cellIndex}`,
      cellIndex,
      headingLevel: outline?.level ?? null,
      title: cellTitle(cell, cellIndex),
      children: [],
    };

    parent.children.push(node);

    if (outline) {
      stack.push({ level: outline.level, node });
    }
  });

  return root;
};

/** True when a structural level should use H1–H3 chrome (not Body). */
export const isVisualOutlineHeading = (level: number | null): boolean =>
  typeof level === "number" &&
  level >= 1 &&
  level <= MAX_OUTLINE_HEADING_LEVEL;

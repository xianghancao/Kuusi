import { parseMarkdownHeading } from "./notebook-outline";
import type { NotebookCell } from "./types";
import { MIND_MAP_ROOT_MARKDOWN } from "./markdown-cells-constants";

const joinSource = (source: string | string[]): string =>
  Array.isArray(source) ? source.join("") : source;

const ATX_HEADING = /^(#{1,6})(?:\s+(.*))?$/;

/** True when `line` is an ATX markdown heading. */
export const isAtxHeadingLine = (line: string): boolean =>
  ATX_HEADING.test(line.trim());

/**
 * Split markdown into notebook cells (Jupytext-style `split_at_heading`):
 * a heading starts a new cell when it is at the document start or preceded by
 * a blank line.
 */
export const splitMarkdownIntoCells = (markdown: string): NotebookCell[] => {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const cells: NotebookCell[] = [];
  let buffer: string[] = [];
  let inFence = false;
  let fenceMarker = "";

  const flush = (): void => {
    if (buffer.length === 0) {
      return;
    }

    const text = buffer.join("\n");

    if (text.trim().length > 0) {
      cells.push({ cell_type: "markdown", source: text });
    }

    buffer = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);

    if (fenceMatch?.[1]) {
      const marker = fenceMatch[1];

      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker[0] === fenceMarker[0] && marker.length >= fenceMarker.length) {
        inFence = false;
        fenceMarker = "";
      }
    }

    const prevBlank =
      index === 0 || (lines[index - 1] ?? "").trim().length === 0;
    const isHeading = !inFence && isAtxHeadingLine(line);

    if (isHeading && prevBlank && buffer.length > 0) {
      flush();
    }

    buffer.push(line);
  }

  flush();
  return cells;
};

/**
 * Root added only for the outline; not part of the file until the user edits
 * it, so documents without a leading H1 (e.g. front matter) round-trip intact.
 */
const syntheticRootCell = (): NotebookCell => ({
  cell_type: "markdown",
  metadata: { kuusi: { syntheticRoot: true } },
  source: MIND_MAP_ROOT_MARKDOWN,
});

const isUneditedSyntheticRoot = (cell: NotebookCell): boolean => {
  const kuusi = cell.metadata?.kuusi as { syntheticRoot?: unknown } | undefined;

  return (
    kuusi?.syntheticRoot === true &&
    joinSource(cell.source).trim() === MIND_MAP_ROOT_MARKDOWN.trim()
  );
};

/** Ensure at least one H1 root exists for Kuusi outline (matches new mind maps). */
export const ensureMarkdownMindMapRoot = (
  cells: NotebookCell[],
): NotebookCell[] => {
  if (cells.length === 0) {
    return [{ cell_type: "markdown", source: MIND_MAP_ROOT_MARKDOWN }];
  }

  const first = cells[0];

  if (first?.cell_type !== "markdown") {
    return [syntheticRootCell(), ...cells];
  }

  const heading = parseMarkdownHeading(joinSource(first.source));

  if (!heading || heading.level !== 1) {
    return [syntheticRootCell(), ...cells];
  }

  return cells;
};

/** Parse a `.md` file into Kuusi notebook cells. */
export const markdownDocumentToCells = (markdown: string): NotebookCell[] =>
  ensureMarkdownMindMapRoot(splitMarkdownIntoCells(markdown));

/**
 * 0-based source line where each mind-map cell starts. A synthetic root cell
 * (not present in the file) starts at the previous cell's line, i.e. 0.
 */
export const markdownCellStartLines = (source: string): number[] => {
  const normalized = source.replace(/\r\n/g, "\n");
  const cells = markdownDocumentToCells(normalized);
  const starts: number[] = [];
  let searchFrom = 0;

  for (const cell of cells) {
    const text = joinSource(cell.source).replace(/\s+$/u, "");

    if (!text) {
      starts.push(starts[starts.length - 1] ?? 0);
      continue;
    }

    const idx = normalized.indexOf(text, searchFrom);
    const startLine =
      idx >= 0
        ? normalized.slice(0, idx).split("\n").length - 1
        : (starts[starts.length - 1] ?? 0);

    starts.push(Math.max(0, startLine));
    searchFrom = idx >= 0 ? idx + text.length : searchFrom;
  }

  return starts;
};

/** 0-based source line of a mind-map cell for the same markdown. */
export const markdownCellIndexToLine = (
  source: string,
  cellIndex: number,
): number => {
  const starts = markdownCellStartLines(source);

  if (starts.length === 0) {
    return 0;
  }

  return starts[Math.max(0, Math.min(cellIndex, starts.length - 1))] ?? 0;
};

/** Map a 0-based source line to a mind-map cell index for the same markdown. */
export const markdownLineToCellIndex = (
  source: string,
  line: number,
): number => {
  const starts = markdownCellStartLines(source);

  if (starts.length === 0) {
    return 0;
  }

  const target = Math.max(0, line);
  let activeIndex = 0;

  for (let index = 0; index < starts.length; index += 1) {
    if (starts[index]! <= target) {
      activeIndex = index;
    }
  }

  return activeIndex;
};

/** Serialize mind-map markdown cells back to a `.md` file. */
export const cellsToMarkdownDocument = (cells: NotebookCell[]): string => {
  const parts = cells
    .filter(
      (cell) => cell.cell_type === "markdown" && !isUneditedSyntheticRoot(cell),
    )
    .map((cell) => joinSource(cell.source).replace(/\s+$/u, ""))
    .filter((text) => text.length > 0);

  if (parts.length === 0) {
    return MIND_MAP_ROOT_MARKDOWN;
  }

  return `${parts.join("\n\n")}\n`;
};

import {
  ARTICLE_PAGE_BREAK_CLASS,
  ARTICLE_PAGE_SHEET_CLASS,
} from "./articlePaged";

/** A top-level markdown block: lines [start, end) of the source. */
export type SourceBlock = {
  start: number;
  end: number;
  heading: string | null;
};

/** A rendered top-level element and the source lines it came from. */
export type ArticleBlockEntry = {
  element: HTMLElement;
  start: number;
  end: number;
};

type BlockKind = "heading" | "list" | "quote" | "fence" | "other";

const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})/;
const ATX_HEADING = /^\s{0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const LIST_ITEM = /^\s{0,3}(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
const MATH_FENCE = /^\s*\$\$/;
const DIRECTIVE_OPEN = /^\s*:{3,}\s*\S/;
const DIRECTIVE_CLOSE = /^\s*:{3,}\s*$/;
const COMMENT_LINE = /^\s*<!--.*-->\s*$/;
const HEADING_TAG = /^H[1-6]$/;

const normalizeHeading = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 48);

/**
 * Approximate CommonMark block boundaries without a full parser: enough to
 * pair source lines with the renderer's top-level elements.
 */
export const scanMarkdownBlocks = (source: string): SourceBlock[] => {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: SourceBlock[] = [];
  let current: (SourceBlock & { kind: BlockKind }) | null = null;
  let fence: string | null = null;
  let inMath = false;
  let directiveDepth = 0;
  let sawBlank = false;

  const close = (): void => {
    if (current) {
      blocks.push({
        start: current.start,
        end: current.end,
        heading: current.heading,
      });
      current = null;
    }
  };

  const open = (index: number, kind: BlockKind, heading: string | null) => {
    close();
    current = { start: index, end: index + 1, heading, kind };
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const extend = (): void => {
      if (current) {
        current.end = index + 1;
      }
    };

    if (fence) {
      extend();
      const closing = line.trim().match(/^(`{3,}|~{3,})\s*$/);
      if (
        closing?.[1] &&
        closing[1][0] === fence[0] &&
        closing[1].length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }

    if (inMath) {
      extend();
      if (/\$\$\s*$/.test(line)) {
        inMath = false;
      }
      continue;
    }

    if (directiveDepth > 0) {
      extend();
      if (DIRECTIVE_CLOSE.test(line)) {
        directiveDepth -= 1;
      } else if (DIRECTIVE_OPEN.test(line)) {
        directiveDepth += 1;
      }
      continue;
    }

    if (!line.trim()) {
      sawBlank = current !== null;
      continue;
    }

    if (COMMENT_LINE.test(line)) {
      continue;
    }

    const headingMatch = line.match(ATX_HEADING);
    const fenceMatch = line.match(FENCE_OPEN);
    const isList = LIST_ITEM.test(line);
    const isQuote = /^\s{0,3}>/.test(line);
    const kind: BlockKind = headingMatch
      ? "heading"
      : fenceMatch
        ? "fence"
        : isList
          ? "list"
          : isQuote
            ? "quote"
            : "other";
    const prev = current as (SourceBlock & { kind: BlockKind }) | null;
    const continuesList =
      prev?.kind === "list" && (isList || /^\s{2,}\S/.test(line));
    const startsNew =
      !prev ||
      kind === "heading" ||
      kind === "fence" ||
      prev.kind === "heading" ||
      prev.kind === "fence" ||
      (sawBlank && !continuesList) ||
      (!sawBlank && kind === "list" && prev.kind !== "list") ||
      (!sawBlank && kind === "quote" && prev.kind !== "quote");

    if (startsNew) {
      open(index, kind, headingMatch ? (headingMatch[2] ?? "") : null);
    } else {
      extend();
    }

    sawBlank = false;

    if (fenceMatch?.[1]) {
      fence = fenceMatch[1];
    } else if (MATH_FENCE.test(line) && !/^\s*\$\$.*\$\$\s*$/.test(line)) {
      inMath = true;
    } else if (DIRECTIVE_OPEN.test(line) && !DIRECTIVE_CLOSE.test(line)) {
      directiveDepth = 1;
    }
  }

  close();
  return blocks;
};

const isPagedChrome = (el: Element): boolean =>
  el.classList.contains(ARTICLE_PAGE_SHEET_CLASS) ||
  el.classList.contains(ARTICLE_PAGE_BREAK_CLASS);

const isFlowElement = (child: Element): child is HTMLElement =>
  child instanceof HTMLElement &&
  !["SCRIPT", "STYLE", "TEMPLATE"].includes(child.tagName) &&
  !isPagedChrome(child);

/** Top-level rendered blocks (descends through wrappers and page sheets). */
export const renderedFlowBlocks = (root: HTMLElement): HTMLElement[] => {
  let flow: Element = root;

  for (;;) {
    const raw = Array.from(flow.children);
    const sheets = raw.filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        child.classList.contains(ARTICLE_PAGE_SHEET_CLASS),
    );
    const nonChrome = raw.filter(isFlowElement);

    // Paged layout: flatten blocks from every sheet in reading order so
    // head/cont fragments still map to source (sync stays live).
    if (sheets.length > 0 && nonChrome.length === 0) {
      return sheets.flatMap((sheet) =>
        Array.from(sheet.children).filter(isFlowElement),
      );
    }

    if (nonChrome.length === 1) {
      flow = nonChrome[0];
      continue;
    }

    return nonChrome;
  }
};

const headingText = (el: HTMLElement): string =>
  (el.textContent ?? "").replace(/¶\s*$/u, "");

/** Pair `n` elements with `m` blocks: 1:1 when equal, else proportionally. */
const pairSegment = (
  elements: HTMLElement[],
  blocks: SourceBlock[],
  fallbackLine: number,
  out: ArticleBlockEntry[],
): void => {
  if (elements.length === 0) {
    return;
  }

  if (blocks.length === 0) {
    elements.forEach((element) =>
      out.push({ element, start: fallbackLine, end: fallbackLine + 1 }),
    );
    return;
  }

  const n = elements.length;
  const m = blocks.length;

  elements.forEach((element, j) => {
    const from = Math.min(m - 1, Math.floor((j * m) / n));
    const to = Math.max(from, Math.min(m - 1, Math.ceil(((j + 1) * m) / n) - 1));
    out.push({ element, start: blocks[from].start, end: blocks[to].end });
  });
};

/**
 * Map rendered top-level elements to source line ranges. Headings are matched
 * by text and used as anchors; blocks in between are paired in order.
 */
export const buildArticleBlockMap = (
  source: string,
  root: HTMLElement,
): ArticleBlockEntry[] => {
  const blocks = scanMarkdownBlocks(source);
  const elements = renderedFlowBlocks(root);

  if (blocks.length === 0 || elements.length === 0) {
    return [];
  }

  const anchors: Array<{ block: number; element: number }> = [];
  let searchFrom = 0;

  blocks.forEach((block, blockIndex) => {
    if (block.heading === null) {
      return;
    }

    const wanted = normalizeHeading(block.heading);

    for (let i = searchFrom; i < elements.length; i += 1) {
      const el = elements[i];

      if (
        HEADING_TAG.test(el.tagName) &&
        normalizeHeading(headingText(el)) === wanted
      ) {
        anchors.push({ block: blockIndex, element: i });
        searchFrom = i + 1;
        return;
      }
    }
  });

  const entries: ArticleBlockEntry[] = [];
  let prevBlock = 0;
  let prevElement = 0;

  for (const anchor of anchors) {
    pairSegment(
      elements.slice(prevElement, anchor.element),
      blocks.slice(prevBlock, anchor.block),
      blocks[prevBlock]?.start ?? 0,
      entries,
    );
    const block = blocks[anchor.block];
    entries.push({
      element: elements[anchor.element],
      start: block.start,
      end: block.end,
    });
    prevBlock = anchor.block + 1;
    prevElement = anchor.element + 1;
  }

  pairSegment(
    elements.slice(prevElement),
    blocks.slice(prevBlock),
    blocks[blocks.length - 1]?.start ?? 0,
    entries,
  );

  return entries;
};

/** Nearest scrollable ancestor (the Article's scroll container). */
export const findArticleScrollHost = (node: HTMLElement): HTMLElement => {
  for (
    let current: HTMLElement | null = node;
    current;
    current = current.parentElement
  ) {
    const overflowY = getComputedStyle(current).overflowY;

    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight + 1
    ) {
      return current;
    }
  }

  return node;
};

const entryForLine = (
  entries: ArticleBlockEntry[],
  line: number,
): ArticleBlockEntry | null => {
  let best: ArticleBlockEntry | null = null;

  for (const entry of entries) {
    if (entry.start <= line) {
      if (!best || entry.start >= best.start) {
        best = entry;
      }
      if (line < entry.end) {
        return entry;
      }
    }
  }

  return best ?? entries[0] ?? null;
};

const VISIBLE_MARGIN_RATIO = 0.12;
const TARGET_RATIO = 0.3;

/**
 * Scroll the Article so `line` is on screen. Leaves the view alone when the
 * target is already comfortably visible, so clicks and small cursor moves
 * never make it jump.
 */
export const revealArticleLine = (
  root: HTMLElement,
  source: string,
  line: number,
): boolean => {
  const entry = entryForLine(buildArticleBlockMap(source, root), line);

  if (!entry) {
    return false;
  }

  const host = findArticleScrollHost(root);
  const hostRect = host.getBoundingClientRect();
  const rect = entry.element.getBoundingClientRect();
  const span = Math.max(1, entry.end - entry.start);
  const fraction = Math.min(1, Math.max(0, (line - entry.start) / span));
  const y = rect.top - hostRect.top + rect.height * fraction;
  const margin = host.clientHeight * VISIBLE_MARGIN_RATIO;

  if (y >= margin && y <= host.clientHeight - margin) {
    return true;
  }

  host.scrollTop += y - host.clientHeight * TARGET_RATIO;
  return true;
};

/** Source line under a click in the Article (null when nothing maps). */
export const articleLineAtPoint = (
  root: HTMLElement,
  source: string,
  target: Element,
  clientY: number,
): number | null => {
  const entries = buildArticleBlockMap(source, root);

  if (entries.length === 0) {
    return null;
  }

  let entry =
    entries.find(
      (candidate) =>
        candidate.element === target || candidate.element.contains(target),
    ) ?? null;

  if (!entry) {
    let bestDistance = Infinity;

    for (const candidate of entries) {
      const rect = candidate.element.getBoundingClientRect();
      const distance =
        clientY < rect.top
          ? rect.top - clientY
          : clientY > rect.bottom
            ? clientY - rect.bottom
            : 0;

      if (distance < bestDistance) {
        bestDistance = distance;
        entry = candidate;
      }
    }
  }

  if (!entry) {
    return null;
  }

  const rect = entry.element.getBoundingClientRect();
  const span = Math.max(1, entry.end - entry.start);
  const fraction =
    rect.height > 0
      ? Math.min(0.999, Math.max(0, (clientY - rect.top) / rect.height))
      : 0;

  return entry.start + Math.floor(fraction * span);
};

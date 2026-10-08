/**
 * Split a Markdown document into slide sources.
 *
 * Default outline (auto / headings):
 *   # / ## / ### → each starts a new slide (# is the title layout)
 *   --- → optional forced page break (auto only); continuation keeps the
 *         current slide heading
 *
 * Legacy:
 *   rules → split only on --- lines (Marp style)
 */

export const stripYamlFrontMatter = (
  source: string,
): { body: string; bodyStartLine: number } => {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) {
    return { body: source, bodyStartLine: 0 };
  }

  const bodyStartLine = (match[0].match(/\n/g) ?? []).length;
  return { body: source.slice(match[0].length), bodyStartLine };
};

const isFenceOpen = (line: string): string | null => {
  const match = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
  if (!match) {
    return null;
  }
  return match[2];
};

const isFenceClose = (line: string, openMarker: string): boolean => {
  const match = line.match(/^(\s*)(`{3,}|~{3,})\s*$/);
  if (!match) {
    return false;
  }
  const close = match[2];
  return close[0] === openMarker[0] && close.length >= openMarker.length;
};

const ATX_HEADING = /^(#{1,6})\s+(.*)$/;

export const parseAtxHeadingLine = (
  line: string,
): { level: number; text: string } | null => {
  const match = line.trim().match(ATX_HEADING);
  if (!match) {
    return null;
  }
  return { level: match[1].length, text: match[2] ?? "" };
};

type SplitSlides = {
  slides: string[];
  /** 0-based line (within the split input) where each slide's content starts. */
  starts: number[];
};

/** Collects slide texts plus the line of each slide's first non-blank line. */
const createSlideCollector = () => {
  const slides: string[] = [];
  const starts: number[] = [];
  let current: string[] = [];
  let start: number | null = null;
  let fallbackStart = 0;

  return {
    push(line: string, index: number): void {
      current.push(line);
      if (start === null && line.trim()) {
        start = index;
      }
    },
    /** Lines carried over (sticky heading) do not move the slide's start. */
    carry(lines: string[]): void {
      current.push(...lines);
    },
    flush(nextIndex: number): void {
      const text = current.join("\n").trim();
      if (text) {
        slides.push(text);
        starts.push(start ?? fallbackStart);
      }
      current = [];
      start = null;
      fallbackStart = nextIndex;
    },
    result(): SplitSlides {
      return { slides, starts };
    },
  };
};

const splitByHorizontalRules = (source: string): SplitSlides => {
  const lines = source.split(/\r?\n/);
  const collector = createSlideCollector();
  let fence: string | null = null;

  lines.forEach((line, index) => {
    if (fence === null) {
      const open = isFenceOpen(line);
      if (open) {
        fence = open;
        collector.push(line, index);
        return;
      }

      if (/^\s*---\s*$/.test(line)) {
        collector.flush(index + 1);
        return;
      }

      collector.push(line, index);
      return;
    }

    collector.push(line, index);
    if (isFenceClose(line, fence)) {
      fence = null;
    }
  });

  collector.flush(lines.length);
  return collector.result();
};

/**
 * Outline split: H1 / H2 / H3 each start a slide (H1 → title layout later).
 * When `honorRules`, a bare `---` forces a break and copies the sticky heading.
 */
const splitByOutlineHeadings = (
  source: string,
  honorRules: boolean,
): SplitSlides => {
  const lines = source.split(/\r?\n/);
  const collector = createSlideCollector();
  let stickyHeading: string | null = null;
  let fence: string | null = null;
  let containerDepth = 0;

  lines.forEach((line, index) => {
    if (fence !== null) {
      collector.push(line, index);
      if (isFenceClose(line, fence)) {
        fence = null;
      }
      return;
    }

    const open = isFenceOpen(line);
    if (open) {
      fence = open;
      collector.push(line, index);
      return;
    }

    const trimmed = line.trim();
    if (/^:::\s*(block|alert|example|columns|column)\b/i.test(trimmed)) {
      containerDepth += 1;
      collector.push(line, index);
      return;
    }
    if (containerDepth > 0 && /^:::\s*$/.test(trimmed)) {
      containerDepth -= 1;
      collector.push(line, index);
      return;
    }
    if (containerDepth > 0) {
      collector.push(line, index);
      return;
    }

    if (honorRules && /^\s*---\s*$/.test(line)) {
      collector.flush(index + 1);
      if (stickyHeading) {
        collector.carry([stickyHeading, ""]);
      }
      return;
    }

    const heading = parseAtxHeadingLine(line);
    if (heading && heading.level >= 1 && heading.level <= 3) {
      collector.flush(index);
      stickyHeading = line.trim();
      collector.push(line, index);
      return;
    }

    collector.push(line, index);
  });

  collector.flush(lines.length);
  return collector.result();
};

export type MarkdownSlideSplitMode = "auto" | "rules" | "headings";

/**
 * Split into slides and report each slide's 0-based start line in `source`
 * (front matter and leading blank lines included in the numbering).
 */
export const splitMarkdownIntoSlidesWithLines = (
  source: string,
  mode: MarkdownSlideSplitMode = "auto",
): SplitSlides => {
  const { body: rawBody, bodyStartLine } = stripYamlFrontMatter(source);
  const body = rawBody.trim();

  if (!body) {
    return { slides: [""], starts: [bodyStartLine] };
  }

  const leading = rawBody.slice(0, rawBody.length - rawBody.trimStart().length);
  const offset = bodyStartLine + (leading.match(/\n/g) ?? []).length;
  // auto: outline headings; --- is an optional forced break
  const split =
    mode === "rules"
      ? splitByHorizontalRules(body)
      : splitByOutlineHeadings(body, mode === "auto");

  if (split.slides.length === 0) {
    return { slides: [body], starts: [offset] };
  }

  return {
    slides: split.slides,
    starts: split.starts.map((start) => start + offset),
  };
};

export const splitMarkdownIntoSlides = (
  source: string,
  mode: MarkdownSlideSplitMode = "auto",
): string[] => splitMarkdownIntoSlidesWithLines(source, mode).slides;

/** True when the slide's first ATX heading is a single `#` (title page). */
export const slideStartsWithH1 = (source: string): boolean => {
  const lines = source.split(/\r?\n/);
  let fence: string | null = null;

  for (const line of lines) {
    if (fence !== null) {
      if (isFenceClose(line, fence)) {
        fence = null;
      }
      continue;
    }
    const open = isFenceOpen(line);
    if (open) {
      fence = open;
      continue;
    }
    if (!line.trim()) {
      continue;
    }
    if (/^<!--/.test(line.trim())) {
      continue;
    }
    const heading = parseAtxHeadingLine(line);
    return Boolean(heading && heading.level === 1);
  }
  return false;
};

/** 0-based slide index that contains the given 0-based source line. */
export const slideIndexForSourceLine = (
  source: string,
  line: number,
  mode: MarkdownSlideSplitMode = "auto",
): number => {
  const { starts } = splitMarkdownIntoSlidesWithLines(source, mode);
  let index = 0;

  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] <= line) {
      index = i;
    }
  }

  return index;
};

/** 0-based source line where the given slide (split index) starts. */
export const sourceLineForSlideIndex = (
  source: string,
  index: number,
  mode: MarkdownSlideSplitMode = "auto",
): number => {
  const { starts } = splitMarkdownIntoSlidesWithLines(source, mode);
  return starts[Math.max(0, Math.min(index, starts.length - 1))] ?? 0;
};

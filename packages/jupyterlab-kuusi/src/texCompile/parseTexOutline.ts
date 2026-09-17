export type TexOutlineEntry = {
  title: string;
  line: number;
  level: number;
  items: TexOutlineEntry[];
};

const HEADING_LEVEL: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};

/** Longest names first so `\subsection` is not parsed as `\section`. */
const HEADING_COMMANDS =
  "subsubsection|subsection|subparagraph|paragraph|section|chapter|part";

const HEADING_START_PATTERN = new RegExp(
  `^\\s*\\\\(${HEADING_COMMANDS})(\\*)?(?:\\[[^\\]]*\\])?\\{`,
);

const SKIP_ENVIRONMENTS = new Set([
  "comment",
  "lstlisting",
  "minted",
  "raw",
  "verbatim",
  "Verbatim",
]);

const stripLineComment = (line: string): string => {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "%") {
      continue;
    }

    if (index === 0 || line[index - 1] !== "\\") {
      return line.slice(0, index);
    }
  }

  return line;
};

type DocumentBodySlice = {
  body: string;
  /** Added to body line index to get 1-based source line numbers. */
  lineOffset: number;
};

const locateDocumentBody = (source: string): DocumentBodySlice => {
  const lines = source.split("\n");
  let beginLine = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (
      /^\s*\\begin\s*\{document\}(?:\[[^\]]*\])?/i.test(
        stripLineComment(lines[index] ?? ""),
      )
    ) {
      beginLine = index;
      break;
    }
  }

  if (beginLine < 0) {
    return { body: source, lineOffset: 0 };
  }

  let endLine = lines.length;

  for (let index = beginLine + 1; index < lines.length; index += 1) {
    if (
      /^\s*\\end\s*\{document\}/i.test(stripLineComment(lines[index] ?? ""))
    ) {
      endLine = index;
      break;
    }
  }

  return {
    body: lines.slice(beginLine + 1, endLine).join("\n"),
    lineOffset: beginLine + 1,
  };
};

type LineRange = {
  start: number;
  end: number;
};

const collectSkippedLineRanges = (source: string): LineRange[] => {
  const ranges: LineRange[] = [];
  const lines = source.split("\n");
  const stack: Array<{ env: string; startLine: number }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripLineComment(lines[index] ?? "");

    for (const match of line.matchAll(
      /\\begin\s*\{([A-Za-z*@]+)\}(?:\[[^\]]*\])?/g,
    )) {
      const env = match[1] ?? "";

      if (SKIP_ENVIRONMENTS.has(env)) {
        stack.push({ env, startLine: index });
      }
    }

    for (const match of line.matchAll(/\\end\s*\{([A-Za-z*@]+)\}/g)) {
      const env = match[1] ?? "";

      for (let stackIndex = stack.length - 1; stackIndex >= 0; stackIndex -= 1) {
        const frame = stack[stackIndex]!;

        if (frame.env !== env) {
          continue;
        }

        ranges.push({ start: frame.startLine, end: index });
        stack.splice(stackIndex, 1);
        break;
      }
    }
  }

  return ranges;
};

const isLineInRanges = (lineIndex: number, ranges: LineRange[]): boolean =>
  ranges.some((range) => lineIndex >= range.start && lineIndex <= range.end);

const extractBalancedBraces = (
  line: string,
  openBraceIndex: number,
): string | null => {
  if (line[openBraceIndex] !== "{") {
    return null;
  }

  let depth = 0;

  for (let index = openBraceIndex; index < line.length; index += 1) {
    const char = line[index];
    const prev = index > 0 ? line[index - 1] : "";

    if (char === "{" && prev !== "\\") {
      depth += 1;
    } else if (char === "}" && prev !== "\\") {
      depth -= 1;

      if (depth === 0) {
        return line.slice(openBraceIndex + 1, index);
      }
    }
  }

  return null;
};

const unescapeTexTitle = (value: string): string =>
  value
    .replace(/\\{/g, "{")
    .replace(/\\}/g, "}")
    .replace(/\\#/g, "#")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\&/g, "&")
    .replace(/\\$/g, "$")
    .replace(/\s+/g, " ")
    .trim();

/** Reduce `\textbf{Title}` / `\texttt{path}` to plain text for the outline label. */
const simplifyTexOutlineTitle = (value: string): string => {
  let title = unescapeTexTitle(value);

  for (let pass = 0; pass < 8; pass += 1) {
    const next = title
      .replace(
        /\\(?:text|emph|textbf|textit|textrm|texttt|underline|mbox|hbox)\s*\{([^{}]*)\}/g,
        "$1",
      )
      .replace(/\$([^$]*)\$/g, "$1")
      .replace(/~+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (next === title) {
      break;
    }

    title = next;
  }

  return title.replace(/\s+/g, " ").trim();
};

const buildOutlineTree = (
  flat: Array<{ title: string; line: number; level: number }>,
): TexOutlineEntry[] => {
  const root: TexOutlineEntry[] = [];
  const stack: TexOutlineEntry[] = [];

  for (const item of flat) {
    const entry: TexOutlineEntry = {
      title: item.title,
      line: item.line,
      level: item.level,
      items: [],
    };

    while (stack.length > 0 && stack[stack.length - 1]!.level >= item.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(entry);
    } else {
      stack[stack.length - 1]!.items.push(entry);
    }

    stack.push(entry);
  }

  return root;
};

const parseHeadingLine = (
  line: string,
): { command: string; title: string } | null => {
  const match = line.match(HEADING_START_PATTERN);

  if (!match) {
    return null;
  }

  const command = match[1] ?? "";
  const level = HEADING_LEVEL[command];

  if (level === undefined) {
    return null;
  }

  const openBraceIndex = line.indexOf("{", match.index ?? 0);

  if (openBraceIndex < 0) {
    return null;
  }

  const rawTitle = extractBalancedBraces(line, openBraceIndex);

  if (rawTitle === null) {
    return null;
  }

  return {
    command,
    title: simplifyTexOutlineTitle(rawTitle) || command,
  };
};

export const parseTexOutline = (source: string): TexOutlineEntry[] => {
  const { body, lineOffset } = locateDocumentBody(source);
  const skippedRanges = collectSkippedLineRanges(body);
  const flat: Array<{ title: string; line: number; level: number }> = [];
  const lines = body.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    if (isLineInRanges(index, skippedRanges)) {
      continue;
    }

    const parsed = parseHeadingLine(stripLineComment(lines[index] ?? ""));

    if (!parsed) {
      continue;
    }

    const level = HEADING_LEVEL[parsed.command];

    if (level === undefined) {
      continue;
    }

    flat.push({
      title: parsed.title,
      line: index + lineOffset + 1,
      level,
    });
  }

  return buildOutlineTree(flat);
};

/** Outline entry whose heading line is at or above the cursor line. */
export const findActiveOutlineLine = (
  entries: TexOutlineEntry[],
  line: number,
): number => {
  let activeLine = -1;

  const walk = (nodes: TexOutlineEntry[]): void => {
    for (const entry of nodes) {
      if (entry.line <= line) {
        activeLine = entry.line;
      }

      if (entry.items.length > 0) {
        walk(entry.items);
      }
    }
  };

  walk(entries);
  return activeLine;
};

/**
 * Auto-paginate a single outline slide when its body exceeds the stage.
 * Continuation pages keep the slide's leading # / ## / ### heading.
 */

import { parseAtxHeadingLine } from "./splitMarkdownSlides";

export type SlideBodyBlock =
  | { kind: "heading"; line: string }
  | { kind: "content"; text: string }
  | { kind: "break" };

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

const isListLine = (line: string): boolean =>
  /^\s*([-*+]|\d+\.)\s+/.test(line) || /^\s{2,}\S/.test(line);

/** Split one slide's markdown into atomic blocks for packing. */
export const splitSlideIntoBlocks = (source: string): SlideBodyBlock[] => {
  const lines = source.split(/\r?\n/);
  const blocks: SlideBodyBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^\s*---\s*$/.test(line)) {
      blocks.push({ kind: "break" });
      i += 1;
      continue;
    }

    const heading = parseAtxHeadingLine(line);
    if (heading && heading.level >= 1 && heading.level <= 3) {
      blocks.push({ kind: "heading", line: trimmed });
      i += 1;
      continue;
    }
    if (heading) {
      blocks.push({ kind: "content", text: trimmed });
      i += 1;
      continue;
    }

    const fence = isFenceOpen(line);
    if (fence) {
      const chunk = [line];
      i += 1;
      while (i < lines.length) {
        chunk.push(lines[i] ?? "");
        if (isFenceClose(lines[i] ?? "", fence)) {
          i += 1;
          break;
        }
        i += 1;
      }
      blocks.push({ kind: "content", text: chunk.join("\n") });
      continue;
    }

    // MyST `:::{figure} src` / `:::{image} src`: options, a blank line and the
    // caption all belong to one block, so the page break never falls inside.
    const mystOpen = trimmed.match(/^(:{3,})\s*\{(?:figure|image)\}/i);
    if (mystOpen) {
      const chunk = [line];
      i += 1;
      while (i < lines.length) {
        const cur = lines[i] ?? "";
        chunk.push(cur);
        i += 1;
        if (new RegExp(`^:{${mystOpen[1].length},}\\s*$`).test(cur.trim())) {
          break;
        }
      }
      blocks.push({ kind: "content", text: chunk.join("\n") });
      continue;
    }

    if (/^:::\s*(block|alert|example|columns|column)\b/i.test(trimmed)) {
      const chunk = [line];
      let depth = 1;
      i += 1;
      let nestedFence: string | null = null;
      while (i < lines.length && depth > 0) {
        const cur = lines[i] ?? "";
        chunk.push(cur);
        if (nestedFence === null) {
          const open = isFenceOpen(cur);
          if (open) {
            nestedFence = open;
          } else if (
            /^:::\s*(block|alert|example|columns|column)\b/i.test(cur.trim())
          ) {
            depth += 1;
          } else if (/^:::\s*$/.test(cur.trim())) {
            depth -= 1;
          }
        } else if (isFenceClose(cur, nestedFence)) {
          nestedFence = null;
        }
        i += 1;
      }
      blocks.push({ kind: "content", text: chunk.join("\n") });
      continue;
    }

    if (isListLine(line)) {
      const chunk = [line];
      i += 1;
      while (i < lines.length) {
        const cur = lines[i] ?? "";
        if (!cur.trim()) {
          break;
        }
        if (
          parseAtxHeadingLine(cur) ||
          /^\s*---\s*$/.test(cur) ||
          isFenceOpen(cur) ||
          /^:::\s*/.test(cur.trim())
        ) {
          break;
        }
        if (!isListLine(cur) && !/^\s{2,}\S/.test(cur)) {
          break;
        }
        chunk.push(cur);
        i += 1;
      }
      blocks.push({ kind: "content", text: chunk.join("\n") });
      continue;
    }

    const chunk = [line];
    i += 1;
    while (i < lines.length) {
      const cur = lines[i] ?? "";
      if (!cur.trim()) {
        break;
      }
      if (
        parseAtxHeadingLine(cur) ||
        /^\s*---\s*$/.test(cur) ||
        isFenceOpen(cur) ||
        /^:::\s*/.test(cur.trim())
      ) {
        break;
      }
      chunk.push(cur);
      i += 1;
    }
    blocks.push({ kind: "content", text: chunk.join("\n") });
  }

  return blocks;
};

export const composeSlidePage = (
  heading: string | null,
  body: string[],
  leadingDirectives = "",
): string => {
  const parts: string[] = [];
  if (leadingDirectives.trim()) {
    parts.push(leadingDirectives.trim(), "");
  }
  if (heading) {
    parts.push(heading, "");
  }
  for (const block of body) {
    if (parts.length > 0 && parts[parts.length - 1] !== "") {
      parts.push("");
    }
    parts.push(block);
  }
  return parts.join("\n").trim();
};

const extractLeadingDirectives = (
  source: string,
): { directives: string; body: string } => {
  const lines = source.split(/\r?\n/);
  const directiveLines: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }
    if (/^<!--\s*_?(class|layout|footer|paginate)\s*:/i.test(trimmed)) {
      directiveLines.push(trimmed);
      index += 1;
      continue;
    }
    break;
  }

  while (index < lines.length && !(lines[index] ?? "").trim()) {
    index += 1;
  }

  return {
    directives: directiveLines.join("\n"),
    body: lines.slice(index).join("\n"),
  };
};

/**
 * Split one content block by lines when it alone overflows the stage.
 * Prefers keeping multi-line chunks; falls back to one line per page.
 */
const splitOversizedBlock = async (
  text: string,
  heading: string | null,
  directives: string,
  fits: (markdown: string) => Promise<boolean>,
): Promise<string[]> => {
  const alone = composeSlidePage(heading, [text], directives);
  if (await fits(alone)) {
    return [text];
  }

  const lines = text.split(/\r?\n/);
  if (lines.length <= 1) {
    return [text];
  }

  const chunks: string[] = [];
  let current: string[] = [];

  const flushCurrent = (): void => {
    if (current.length === 0) {
      return;
    }
    chunks.push(current.join("\n"));
    current = [];
  };

  for (const line of lines) {
    const tryLines = [...current, line];
    const candidate = composeSlidePage(
      heading,
      [tryLines.join("\n")],
      directives,
    );
    if (current.length > 0 && !(await fits(candidate))) {
      flushCurrent();
      const solo = composeSlidePage(heading, [line], directives);
      if (!(await fits(solo))) {
        chunks.push(line);
        continue;
      }
      current = [line];
      continue;
    }
    current = tryLines;
  }

  flushCurrent();
  return chunks.length > 0 ? chunks : [text];
};

/**
 * Pack a slide into one or more pages that each pass `fits`.
 * `fits` should return true when rendered content does not overflow the stage.
 */
export const paginateSlideByFit = async (
  source: string,
  fits: (markdown: string) => Promise<boolean>,
): Promise<string[]> => {
  const { directives, body } = extractLeadingDirectives(source);
  const blocks = splitSlideIntoBlocks(body);

  if (blocks.length === 0) {
    return [source.trim() || ""];
  }

  if (await fits(source.trim())) {
    return [source.trim()];
  }

  let heading: string | null = null;
  let bodyParts: string[] = [];
  const pages: string[] = [];

  const flush = (): void => {
    const page = composeSlidePage(heading, bodyParts, directives);
    if (page) {
      pages.push(page);
    }
    bodyParts = [];
  };

  const takeContentParts = async (text: string): Promise<void> => {
    const parts = await splitOversizedBlock(text, heading, directives, fits);
    for (let i = 0; i < parts.length; i += 1) {
      if (i > 0) {
        flush();
      }
      bodyParts = [parts[i]];
    }
  };

  for (const block of blocks) {
    if (block.kind === "break") {
      if (bodyParts.length > 0 || pages.length === 0) {
        flush();
      }
      continue;
    }

    if (block.kind === "heading") {
      if (bodyParts.length > 0) {
        flush();
      }
      heading = block.line;
      continue;
    }

    const tryBody = [...bodyParts, block.text];
    const candidate = composeSlidePage(heading, tryBody, directives);
    if (bodyParts.length > 0 && !(await fits(candidate))) {
      flush();
      await takeContentParts(block.text);
      continue;
    }
    if (bodyParts.length === 0 && !(await fits(candidate))) {
      await takeContentParts(block.text);
      continue;
    }
    bodyParts = tryBody;
  }

  flush();
  return pages.length > 0 ? pages : [source.trim()];
};

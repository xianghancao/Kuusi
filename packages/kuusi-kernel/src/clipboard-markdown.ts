import { clampOutlineDepth, MAX_OUTLINE_DEPTH } from "./types";

/** One outline topic parsed from external clipboard Markdown. */
export type ClipboardMarkdownTopic = {
  title: string;
  /** Absolute ATX heading level (1–6), or null for body / plain text. */
  level: number | null;
};

/** True when the line is a Markdown list item (bullet, number, check, dash). */
export const isMarkdownListItemLine = (line: string): boolean => {
  const trimmed = line.trimStart();

  if (!trimmed) {
    return false;
  }

  return (
    /^[-*+]\s+\[[ xX]\]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^–\s+/.test(trimmed) ||
    /^[-*+]\s+/.test(trimmed)
  );
};

const isListTopicTitle = (title: string): boolean => {
  const first =
    title.split("\n").find((line) => line.trim().length > 0) ?? "";
  return isMarkdownListItemLine(first);
};

/**
 * Parse clipboard text into outline topics.
 * ATX headings (`#`–`######`) keep their level; consecutive list items are
 * merged into one Body topic; other non-empty lines are Body.
 */
export const parseClipboardMarkdownOutline = (
  text: string,
): ClipboardMarkdownTopic[] => {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const topics: ClipboardMarkdownTopic[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})(?:\s+(.*))?$/);

    if (heading?.[1]) {
      const title = (heading[2] ?? "").trim();

      if (title) {
        topics.push({ title, level: heading[1].length });
      }

      index += 1;
      continue;
    }

    if (isMarkdownListItemLine(line)) {
      const block: string[] = [];

      while (index < lines.length) {
        const current = lines[index]!;
        const currentTrimmed = current.trim();

        if (!currentTrimmed) {
          // Keep blank lines inside a loose list; stop if the list ends.
          const next = lines[index + 1];

          if (next === undefined || !isMarkdownListItemLine(next)) {
            break;
          }

          block.push("");
          index += 1;
          continue;
        }

        if (!isMarkdownListItemLine(current)) {
          break;
        }

        block.push(current.replace(/\s+$/, ""));
        index += 1;
      }

      if (block.length > 0) {
        topics.push({ title: block.join("\n"), level: null });
      }

      continue;
    }

    topics.push({ title: trimmed, level: null });
    index += 1;
  }

  return topics;
};

/**
 * Remap clipboard topics so the shallowest heading matches `baseLevel`
 * (child level under the paste target). Levels beyond
 * {@link MAX_OUTLINE_DEPTH} become Body; levels 4–20 nest with Body chrome.
 * When there are no headings, plain lines become topics at `baseLevel`
 * (or Body when `baseLevel` is null). List blocks always stay Body.
 */
export const remapClipboardTopicsUnderBase = (
  topics: ClipboardMarkdownTopic[],
  baseLevel: number | null,
): ClipboardMarkdownTopic[] => {
  if (topics.length === 0) {
    return [];
  }

  if (baseLevel === null) {
    return topics.map((topic) => ({ title: topic.title, level: null }));
  }

  const clampedBase = clampOutlineDepth(baseLevel);

  const headingLevels = topics
    .map((topic) => topic.level)
    .filter((level): level is number => level !== null);

  if (headingLevels.length === 0) {
    return topics.map((topic) => ({
      title: topic.title,
      // Lists stay Body so multi-line Markdown is not prefixed with `#`.
      level: isListTopicTitle(topic.title) ? null : clampedBase,
    }));
  }

  const minLevel = Math.min(...headingLevels);
  const delta = clampedBase - minLevel;

  return topics.map((topic) => {
    if (topic.level === null) {
      return { title: topic.title, level: null };
    }

    const next = topic.level + delta;

    if (next > MAX_OUTLINE_DEPTH) {
      return { title: topic.title, level: null };
    }

    return {
      title: topic.title,
      level: Math.max(1, next),
    };
  });
};

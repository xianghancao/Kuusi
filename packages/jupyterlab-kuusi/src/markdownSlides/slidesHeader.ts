import { parseAtxHeadingLine } from "./splitMarkdownSlides";

/** Where the in-stage slide header title comes from. */
export type SlidesHeaderSource = "h1" | "h2" | "h3" | "custom";

export const SLIDES_HEADER_SOURCES: SlidesHeaderSource[] = [
  "h1",
  "h2",
  "h3",
  "custom",
];

export const isSlidesHeaderSource = (
  value: unknown,
): value is SlidesHeaderSource =>
  value === "h1" || value === "h2" || value === "h3" || value === "custom";

const levelForSource = (source: Exclude<SlidesHeaderSource, "custom">): number =>
  source === "h1" ? 1 : source === "h2" ? 2 : 3;

/** First ATX heading of `level` in a slide's markdown (empty → null). */
export const headingTextInSource = (
  source: string,
  level: number,
): string | null => {
  for (const line of source.split(/\r?\n/)) {
    const heading = parseAtxHeadingLine(line);
    if (heading?.level === level) {
      const text = heading.text.trim();
      if (text) {
        return text;
      }
    }
  }
  return null;
};

/**
 * Resolve the stage header label for the current page.
 *
 * Heading modes use the nearest H1/H2/H3 at or before `index` (running section
 * title). Custom mode uses the user string as-is (trimmed).
 */
export const resolveSlideHeaderText = (
  headerSource: SlidesHeaderSource,
  headerCustomText: string,
  slideSources: readonly string[],
  index: number,
): string => {
  if (headerSource === "custom") {
    return headerCustomText.trim();
  }

  const level = levelForSource(headerSource);
  const end = Math.max(0, Math.min(index, slideSources.length - 1));

  for (let i = end; i >= 0; i -= 1) {
    const text = headingTextInSource(slideSources[i] ?? "", level);
    if (text) {
      return text;
    }
  }

  return "";
};

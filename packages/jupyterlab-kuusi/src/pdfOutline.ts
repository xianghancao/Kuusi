/**
 * PDF bookmarks (the outline pane in a PDF viewer) from document headings.
 * The exported PDF is made of page images, so it has no text to build an
 * outline from; headings are located on the rendered page instead.
 */

export type OutlineHeading = {
  /** 1–6. */
  level: number;
  title: string;
  /** Top of the heading, in the same units as {@link OutlinePage}. */
  y: number;
};

export type OutlinePage = { y: number; height: number };

export type OutlineEntry = {
  level: number;
  title: string;
  /** 1-based PDF page number. */
  page: number;
};

/** Visible text of a heading: link anchors and extra whitespace removed. */
export const headingTitle = (text: string): string =>
  text.replace(/¶\s*$/u, "").replace(/\s+/g, " ").trim();

/**
 * Pages are sorted top to bottom (a two-column page is one page, not two). A
 * heading belongs to the page whose range contains it; one that falls in a gap
 * between pages goes to the next page.
 */
export const pageIndexAt = (
  pages: readonly OutlinePage[],
  y: number,
): number => {
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]!;

    if (y < page.y + page.height) {
      return i;
    }
  }

  return Math.max(0, pages.length - 1);
};

export const buildPdfOutline = (
  headings: readonly OutlineHeading[],
  pages: readonly OutlinePage[],
): OutlineEntry[] => {
  if (pages.length === 0) {
    return [];
  }

  return headings
    .filter((heading) => heading.title !== "")
    .map((heading) => ({
      level: heading.level,
      title: heading.title,
      // +0.5 so a heading sitting exactly on a page edge counts for that page.
      page: pageIndexAt(pages, heading.y + 0.5) + 1,
    }));
};

/**
 * Index of each entry's parent (the nearest earlier entry with a smaller
 * level), or -1 for top-level entries. Skipped levels (H1 → H3) just attach to
 * the closest shallower heading.
 */
export const outlineParents = (
  entries: readonly Pick<OutlineEntry, "level">[],
): number[] => {
  const parents: number[] = [];
  const stack: number[] = [];

  entries.forEach((entry, index) => {
    while (
      stack.length > 0 &&
      entries[stack[stack.length - 1]!]!.level >= entry.level
    ) {
      stack.pop();
    }

    parents.push(stack.length > 0 ? stack[stack.length - 1]! : -1);
    stack.push(index);
  });

  return parents;
};

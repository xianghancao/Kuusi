/**
 * How many lines of a block stay on the current page.
 *
 * - `"all"` — everything fits
 * - `"push"` — moving the whole block avoids an orphan or widow
 * - a number — keep that many lines, split the rest
 */
export type PageLineKeep = "all" | "push" | number;

/** At least this many lines on each side of a split (CSS orphans / widows). */
export const ARTICLE_ORPHAN_LINES = 2;

export const linesToKeepOnPage = (
  lineCount: number,
  fitting: number,
  minKeep: number = ARTICLE_ORPHAN_LINES,
): PageLineKeep => {
  if (lineCount <= 0) {
    return "all";
  }

  if (fitting >= lineCount) {
    return "all";
  }

  if (lineCount <= minKeep || fitting < minKeep) {
    return "push";
  }

  const leftover = lineCount - fitting;

  if (leftover < minKeep) {
    const keep = lineCount - minKeep;
    return keep < minKeep ? "push" : keep;
  }

  return fitting;
};

/**
 * After measuring how many lines fit, decide the split when the block may
 * already sit at the top of a page (pushing would not gain space).
 */
export const resolvePageSplit = (
  lineCount: number,
  fitting: number,
  atPageStart: boolean,
  minKeep: number = ARTICLE_ORPHAN_LINES,
): PageLineKeep => {
  const keep = linesToKeepOnPage(lineCount, fitting, minKeep);

  if (keep !== "push" || !atPageStart) {
    return keep;
  }

  return fitting > 0 ? fitting : "push";
};

/** Floor for the layout loop's safety cap (steps = placements + retries). */
export const ARTICLE_LAYOUT_MIN_STEPS = 4000;

/**
 * Safety cap for the page-layout loop. Each block can take a few steps (place,
 * push-and-retry, split) and splits add blocks, so the cap scales with the
 * document instead of silently cutting long articles short.
 */
export const articleLayoutStepLimit = (blockCount: number): number =>
  Math.max(
    ARTICLE_LAYOUT_MIN_STEPS,
    Math.ceil(Math.max(0, blockCount) * 8) + 200,
  );

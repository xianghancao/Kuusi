/** Where printed / on-stage page numbers begin. */
export type PageNumberStart = "first" | "second";

export const isPageNumberStart = (value: unknown): value is PageNumberStart =>
  value === "first" || value === "second";

export type PageNumberDisplay = {
  /** False on the first sheet when numbering starts on the second. */
  show: boolean;
  /** 1-based label for the current sheet (meaningful when show). */
  page: number;
  /** Total used in “3 / 12” (excludes the skipped first sheet when start is second). */
  pages: number;
};

/**
 * Map a 0-based physical sheet index to the user-facing page label.
 *
 * - `first`: sheet 0 → 1 / N
 * - `second`: sheet 0 hidden; sheet 1 → 1 / (N−1)
 */
export const resolvePageNumberDisplay = (
  physicalIndex: number,
  physicalTotal: number,
  start: PageNumberStart = "first",
): PageNumberDisplay => {
  const total = Math.max(0, physicalTotal);
  const index = Math.max(0, physicalIndex);

  if (start === "first") {
    const pages = Math.max(1, total);
    return {
      show: total > 0,
      page: Math.min(index + 1, pages),
      pages,
    };
  }

  const pages = Math.max(0, total - 1);
  if (index === 0 || pages === 0) {
    return { show: false, page: 0, pages: Math.max(1, pages) };
  }

  return {
    show: true,
    page: Math.min(index, pages),
    pages: Math.max(1, pages),
  };
};

/** “3”, “3 / 12”, or “3 – 12”; empty when the sheet is unnumbered. */
export type PageNumberFormatStyle = "page" | "page-of-total" | "dash";

export const formatPageNumberLabel = (
  physicalIndex: number,
  physicalTotal: number,
  start: PageNumberStart,
  /** `true` = page-of-total; `false` = page only; or an explicit style. */
  style: boolean | PageNumberFormatStyle = "page-of-total",
): string => {
  const { show, page, pages } = resolvePageNumberDisplay(
    physicalIndex,
    physicalTotal,
    start,
  );
  if (!show) {
    return "";
  }
  const resolved: PageNumberFormatStyle =
    style === true
      ? "page-of-total"
      : style === false
        ? "page"
        : style;
  if (resolved === "dash") {
    return `${page} – ${pages}`;
  }
  if (resolved === "page-of-total") {
    return `${page} / ${pages}`;
  }
  return String(page);
};

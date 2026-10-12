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

const ROMAN_PAGE_NUMERALS: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** 1 → I, 4 → IV, 14 → XIV (digits for 0 or past 3999). */
export const romanNumeral = (n: number): string => {
  let rest = Math.max(0, Math.floor(n));

  if (rest === 0 || rest >= 4000) {
    return String(rest);
  }

  let out = "";
  for (const [value, symbol] of ROMAN_PAGE_NUMERALS) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }

  return out;
};

/** How a printed page number is written (Article Page → Page numbers). */
export type PageNumberStyle =
  | "page"
  | "page-of-total"
  | "dashes"
  | "bracket"
  | "word"
  | "word-of-total"
  | "roman-lower"
  | "roman-upper";

export const PAGE_NUMBER_STYLES: readonly PageNumberStyle[] = [
  "page",
  "page-of-total",
  "dashes",
  "bracket",
  "word",
  "word-of-total",
  "roman-lower",
  "roman-upper",
];

export const isPageNumberStyle = (value: unknown): value is PageNumberStyle =>
  typeof value === "string" &&
  (PAGE_NUMBER_STYLES as readonly string[]).includes(value);

/** “3”, “3 / 12”, “– 3 –”, “[3]”, “Page 3”, “Page 3 of 12”, “iii” or “III”. */
export const formatPageNumberText = (
  style: PageNumberStyle,
  page: number,
  pages: number,
): string => {
  switch (style) {
    case "page-of-total":
      return `${page} / ${pages}`;
    case "dashes":
      return `– ${page} –`;
    case "bracket":
      return `[${page}]`;
    case "word":
      return `Page ${page}`;
    case "word-of-total":
      return `Page ${page} of ${pages}`;
    case "roman-lower":
      return romanNumeral(page).toLowerCase();
    case "roman-upper":
      return romanNumeral(page);
    default:
      return String(page);
  }
};

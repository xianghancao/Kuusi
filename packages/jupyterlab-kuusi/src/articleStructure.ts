/**
 * Document structure for Article: heading numbers, the contents page, and
 * forced page breaks. The pure helpers are tested in Node; the DOM helpers
 * run inside `paginateArticle` so the paged and continuous layouts share them.
 */
import { resolvePageNumberDisplay, type PageNumberStart } from "./pageNumberStart";
import { pageIndexAt } from "./pdfOutline";

export type HeadingNumbering = "none" | "decimal" | "chinese";
export type ChapterBreak = "none" | "h1" | "h2";

export const HEADING_NUMBERINGS: readonly HeadingNumbering[] = [
  "none",
  "decimal",
  "chinese",
];
export const CHAPTER_BREAKS: readonly ChapterBreak[] = ["none", "h1", "h2"];
export const TOC_DEPTH_RANGE = { min: 1, max: 4 } as const;

export const isHeadingNumbering = (v: unknown): v is HeadingNumbering =>
  typeof v === "string" && (HEADING_NUMBERINGS as readonly string[]).includes(v);
export const isChapterBreak = (v: unknown): v is ChapterBreak =>
  typeof v === "string" && (CHAPTER_BREAKS as readonly string[]).includes(v);

export const NUMBER_ATTR = "data-kuusi-num";
export const PAGE_BREAK_ATTR = "data-kuusi-page-break";
export const TOC_CLASS = "jp-KuusiArticle-toc";

const DIGITS = "零一二三四五六七八九";

/** 1 → 一, 10 → 十, 21 → 二十一, 100 → 一百 (enough for chapter counters). */
export const chineseNumeral = (n: number): string => {
  const value = Math.max(0, Math.floor(n));

  if (value < 10) {
    return DIGITS[value];
  }

  if (value < 20) {
    return `十${value % 10 === 0 ? "" : DIGITS[value % 10]}`;
  }

  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return `${DIGITS[tens]}十${ones === 0 ? "" : DIGITS[ones]}`;
  }

  return String(value);
};

/**
 * Label per heading level list. Levels that never appear (h1 → h3) are
 * skipped in the dotted path; the shallowest level is the chapter level.
 */
export const headingNumberLabels = (
  levels: readonly number[],
  mode: HeadingNumbering,
): string[] => {
  if (mode === "none") {
    return levels.map(() => "");
  }

  const base = levels.length > 0 ? Math.min(...levels) : 1;
  const counters = [0, 0, 0, 0, 0, 0];

  return levels.map((level) => {
    const index = Math.min(6, Math.max(1, level)) - 1;
    counters[index] += 1;

    for (let deeper = index + 1; deeper < 6; deeper += 1) {
      counters[deeper] = 0;
    }

    const path = counters
      .slice(base - 1, index + 1)
      .filter((count, i, all) => count > 0 || i === all.length - 1);

    if (mode === "chinese" && path.length === 1) {
      return `第${chineseNumeral(path[0])}章`;
    }

    return path.join(".");
  });
};

export type TocEntry = {
  level: number;
  /** Visible number prefix ("1.2"), empty when numbering is off. */
  number: string;
  title: string;
  /** Index into the heading list the entry came from. */
  heading: number;
};

export const tocEntries = (
  headings: ReadonlyArray<{ level: number; title: string; number: string }>,
  depth: number,
): TocEntry[] => {
  const base = headings.length > 0 ? Math.min(...headings.map((h) => h.level)) : 1;

  return headings.flatMap((h, heading) =>
    h.title && h.level - base < depth
      ? [{ level: h.level, number: h.number, title: h.title, heading }]
      : [],
  );
};

export type StructureSettings = {
  headingNumbering: HeadingNumbering;
  chapterBreak: ChapterBreak;
  tocShow: boolean;
  tocDepth: number;
  tocTitle: string;
  pageNumberStart: PageNumberStart;
};

const HEADINGS = "h1, h2, h3, h4, h5, h6";

const contentHeadings = (rendered: HTMLElement): HTMLElement[] =>
  Array.from(rendered.querySelectorAll<HTMLElement>(HEADINGS)).filter(
    (h) => !h.closest(`.${TOC_CLASS}`),
  );

const headingText = (h: HTMLElement): string =>
  (h.textContent ?? "").replace(/¶\s*$/u, "").replace(/\s+/g, " ").trim();

/** Remove everything a previous structure pass left behind. */
export const clearStructure = (rendered: HTMLElement): void => {
  rendered.querySelectorAll(`.${TOC_CLASS}`).forEach((node) => node.remove());
  rendered
    .querySelectorAll(`[${NUMBER_ATTR}]`)
    .forEach((node) => node.removeAttribute(NUMBER_ATTR));
  rendered
    .querySelectorAll(`[${PAGE_BREAK_ATTR}]`)
    .forEach((node) => node.removeAttribute(PAGE_BREAK_ATTR));
};

const tocRow = (entry: TocEntry, base: number): HTMLElement => {
  const row = document.createElement("div");
  row.className = `${TOC_CLASS} ${TOC_CLASS}Row`;
  row.dataset.level = String(entry.level - base + 1);
  row.dataset.heading = String(entry.heading);

  const text = document.createElement("span");
  text.className = `${TOC_CLASS}Text`;
  text.textContent = entry.number ? `${entry.number}  ${entry.title}` : entry.title;

  const leader = document.createElement("span");
  leader.className = `${TOC_CLASS}Leader`;

  const page = document.createElement("span");
  page.className = `${TOC_CLASS}Page`;
  page.textContent = "00";

  row.append(text, leader, page);
  return row;
};

/**
 * Number headings, build the contents page, and mark forced page breaks.
 * Runs before layout; `fillTocPages` runs after it.
 */
export const applyStructure = (
  rendered: HTMLElement,
  flow: HTMLElement,
  settings: StructureSettings,
  fallbackTitle: string,
): void => {
  clearStructure(rendered);

  const headings = contentHeadings(rendered);
  const labels = headingNumberLabels(
    headings.map((h) => Number(h.tagName.slice(1))),
    settings.headingNumbering,
  );
  headings.forEach((h, i) => {
    if (labels[i]) {
      h.setAttribute(NUMBER_ATTR, labels[i]);
    }
  });

  const breakLevel =
    settings.chapterBreak === "h1" ? 1 : settings.chapterBreak === "h2" ? 2 : 0;
  headings.forEach((h, i) => {
    if (breakLevel > 0 && i >= 0 && Number(h.tagName.slice(1)) <= breakLevel) {
      h.setAttribute(PAGE_BREAK_ATTR, "1");
    }
  });

  if (!settings.tocShow || headings.length === 0) {
    return;
  }

  const entries = tocEntries(
    headings.map((h, i) => ({
      level: Number(h.tagName.slice(1)),
      title: headingText(h),
      number: labels[i],
    })),
    settings.tocDepth,
  );

  if (entries.length === 0) {
    return;
  }

  const base = Math.min(...entries.map((e) => e.level));
  // Title and rows are separate flow blocks (no wrapper) so a long contents
  // page paginates like any other content.
  const title = document.createElement("div");
  title.className = `${TOC_CLASS} ${TOC_CLASS}Title`;
  title.textContent = settings.tocTitle || fallbackTitle;
  const rows = entries.map((entry) => tocRow(entry, base));
  const before = flow.firstElementChild;
  [title, ...rows].forEach((node) => flow.insertBefore(node, before));

  // Content after the contents page starts on a fresh page.
  const after = rows[rows.length - 1].nextElementSibling;
  if (after instanceof HTMLElement) {
    after.setAttribute(PAGE_BREAK_ATTR, "1");
  }
};

/** Fill the page column once the sheets exist. */
export const fillTocPages = (
  rendered: HTMLElement,
  sheetClass: string,
  start: PageNumberStart,
): void => {
  const rows = Array.from(
    rendered.querySelectorAll<HTMLElement>(`.${TOC_CLASS}Row`),
  );

  if (rows.length === 0) {
    return;
  }

  const headings = contentHeadings(rendered);
  const sheets = Array.from(rendered.querySelectorAll<HTMLElement>(`.${sheetClass}`));
  const pageOf = (row: HTMLElement): HTMLElement | null =>
    row.querySelector<HTMLElement>(`.${TOC_CLASS}Page`);

  if (sheets.length === 0) {
    rows.forEach((row) => row.classList.add("is-unpaged"));
    return;
  }

  rows.forEach((row) => row.classList.remove("is-unpaged"));
  const regions = sheets.map((sheet) => {
    const rect = sheet.getBoundingClientRect();
    return { y: rect.top, height: rect.height };
  });

  rows.forEach((row) => {
    const heading = headings[Number(row.dataset.heading)];
    const target = pageOf(row);

    if (!heading || !target) {
      return;
    }

    const index = pageIndexAt(regions, heading.getBoundingClientRect().top + 0.5);
    const shown = resolvePageNumberDisplay(index, sheets.length, start);
    target.textContent = shown.show ? String(shown.page) : "";
  });
};

/**
 * Replace `{chapter}` in running headers/footers with the heading (shallowest
 * level) that is current on each sheet.
 */
export const fillChapterTokens = (
  rendered: HTMLElement,
  sheetClass: string,
): void => {
  const sheets = Array.from(rendered.querySelectorAll<HTMLElement>(`.${sheetClass}`));
  const headings = contentHeadings(rendered);

  if (sheets.length === 0 || headings.length === 0) {
    return;
  }

  const base = Math.min(...headings.map((h) => Number(h.tagName.slice(1))));
  const regions = sheets.map((sheet) => {
    const rect = sheet.getBoundingClientRect();
    return { y: rect.top, height: rect.height };
  });
  const chapters = headings
    .filter((h) => Number(h.tagName.slice(1)) === base)
    .map((h) => ({
      page: pageIndexAt(regions, h.getBoundingClientRect().top + 0.5),
      text:
        (h.getAttribute(NUMBER_ATTR) ? `${h.getAttribute(NUMBER_ATTR)} ` : "") +
        headingText(h),
    }));

  sheets.forEach((sheet, index) => {
    const current = [...chapters].reverse().find((c) => c.page <= index);
    const chapter = current?.text ?? "";

    sheet.querySelectorAll<HTMLElement>(".jp-KuusiArticle-pageSlot").forEach((slot) => {
      if (slot.textContent?.includes("{chapter}")) {
        slot.textContent = slot.textContent.replace(/\{chapter\}/g, chapter);
      }
    });
  });
};

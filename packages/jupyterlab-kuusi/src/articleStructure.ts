/**
 * Document structure for Article: heading numbers, the contents page, and
 * forced page breaks. The pure helpers are tested in Node; the DOM helpers
 * run inside `paginateArticle` so the paged and continuous layouts share them.
 */
import { resolvePageNumberDisplay, type PageNumberStart } from "./pageNumberStart";
import { pageIndexAt } from "./pdfOutline";

export type HeadingNumbering = "none" | "decimal" | "roman";
export type HeadingNumberDepth = "h1" | "h2" | "all";
export type ChapterBreak = "none" | "h1" | "h2";

export const HEADING_NUMBERINGS: readonly HeadingNumbering[] = [
  "none",
  "decimal",
  "roman",
];
export const CHAPTER_BREAKS: readonly ChapterBreak[] = ["none", "h1", "h2"];
export const TOC_DEPTH_RANGE = { min: 1, max: 4 } as const;

export const isHeadingNumbering = (v: unknown): v is HeadingNumbering =>
  typeof v === "string" && (HEADING_NUMBERINGS as readonly string[]).includes(v);
export const isHeadingNumberDepth = (v: unknown): v is HeadingNumberDepth =>
  v === "h1" || v === "h2" || v === "all";
export const isChapterBreak = (v: unknown): v is ChapterBreak =>
  typeof v === "string" && (CHAPTER_BREAKS as readonly string[]).includes(v);

export const NUMBER_ATTR = "data-kuusi-num";
export const PAGE_BREAK_ATTR = "data-kuusi-page-break";
export const TOC_CLASS = "jp-KuusiArticle-toc";

const ROMAN_NUMERALS: ReadonlyArray<readonly [number, string]> = [
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

/** 1 → I, 4 → IV, 14 → XIV (chapter counters; falls back to digits past 3999). */
export const romanNumeral = (n: number): string => {
  let rest = Math.max(0, Math.floor(n));

  if (rest === 0 || rest >= 4000) {
    return String(rest);
  }

  let out = "";
  for (const [value, symbol] of ROMAN_NUMERALS) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }

  return out;
};

/**
 * Label per heading level list. Levels that never appear (h1 → h3) are
 * skipped in the dotted path; the shallowest level is the chapter level.
 */
export const headingNumberLabels = (
  levels: readonly number[],
  mode: HeadingNumbering,
  depth: HeadingNumberDepth = "all",
): string[] => {
  if (mode === "none") {
    return levels.map(() => "");
  }

  const base = levels.length > 0 ? Math.min(...levels) : 1;
  const counters = [0, 0, 0, 0, 0, 0];
  const maxLevels = depth === "h1" ? 1 : depth === "h2" ? 2 : 6;

  return levels.map((level) => {
    const index = Math.min(6, Math.max(1, level)) - 1;
    counters[index] += 1;

    for (let deeper = index + 1; deeper < 6; deeper += 1) {
      counters[deeper] = 0;
    }

    const path = counters
      .slice(base - 1, index + 1)
      .filter((count, i, all) => count > 0 || i === all.length - 1);

    // Counters still advance for deeper headings; they just carry no number.
    if (path.length > maxLevels) {
      return "";
    }

    if (mode === "roman" && path.length === 1) {
      return romanNumeral(path[0]);
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

/** Localized words used by generated blocks (set once by the Article widget). */
export const structureLabels = {
  contents: "Contents",
  figure: "Figure",
  links: "Links",
};

export const setStructureLabels = (
  labels: Partial<typeof structureLabels>,
): void => {
  Object.assign(structureLabels, labels);
};

export type StructureSettings = {
  coverPage: boolean;
  coverTitle: string;
  coverAuthor: string;
  coverDate: string;
  linkFootnotes: boolean;
  imageCaptions: boolean;
  codeLineNumbers: boolean;
  headingNumbering: HeadingNumbering;
  headingNumberDepth: HeadingNumberDepth;
  chapterBreak: ChapterBreak;
  tocShow: boolean;
  tocDepth: number;
  tocTitle: string;
  tocShowTitle: boolean;
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
const originalCode = new WeakMap<HTMLElement, string>();

export const clearStructure = (rendered: HTMLElement): void => {
  rendered.querySelectorAll(`.${TOC_CLASS}`).forEach((node) => node.remove());
  rendered.querySelectorAll<HTMLElement>("[data-kuusi-lines]").forEach((code) => {
    const html = originalCode.get(code);

    if (html !== undefined) {
      code.innerHTML = html;
    }

    code.removeAttribute("data-kuusi-lines");
    originalCode.delete(code);
  });
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
  docTitle = "",
): void => {
  clearStructure(rendered);

  const headings = contentHeadings(rendered);
  const labels = headingNumberLabels(
    headings.map((h) => Number(h.tagName.slice(1))),
    settings.headingNumbering,
    settings.headingNumberDepth,
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

  if (settings.imageCaptions) {
    addImageCaptions(rendered);
  }

  if (settings.codeLineNumbers) {
    addCodeLineNumbers(rendered);
  }

  if (settings.linkFootnotes) {
    addLinkFootnotes(rendered, flow);
  }

  const finish = (): void => {
    if (settings.coverPage) {
      addCover(flow, settings, docTitle);
    }
  };

  if (!settings.tocShow || headings.length === 0) {
    finish();
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
    finish();
    return;
  }

  const base = Math.min(...entries.map((e) => e.level));
  // Title and rows are separate flow blocks (no wrapper) so a long contents
  // page paginates like any other content.
  const rows = entries.map((entry) => tocRow(entry, base));
  const titleNodes: HTMLElement[] = [];
  if (settings.tocShowTitle) {
    const title = document.createElement("div");
    title.className = `${TOC_CLASS} ${TOC_CLASS}Title`;
    title.textContent = settings.tocTitle || fallbackTitle;
    titleNodes.push(title);
  }
  const before = flow.firstElementChild;
  [...titleNodes, ...rows].forEach((node) => flow.insertBefore(node, before));

  // Content after the contents page starts on a fresh page.
  const after = rows[rows.length - 1].nextElementSibling;
  if (after instanceof HTMLElement) {
    after.setAttribute(PAGE_BREAK_ATTR, "1");
  }

  finish();
};

const generated = (el: HTMLElement, extra: string): HTMLElement => {
  el.className = `${TOC_CLASS} ${extra}`;
  return el;
};

const inGenerated = (el: Element): boolean =>
  Boolean(el.closest(`.${TOC_CLASS}, h1, h2, h3, h4, h5, h6`));

const addCover = (
  flow: HTMLElement,
  settings: Pick<StructureSettings, "coverTitle" | "coverAuthor" | "coverDate">,
  docTitle: string,
): void => {
  const cover = generated(document.createElement("div"), `${TOC_CLASS}Cover`);
  const title = document.createElement("div");
  title.className = `${TOC_CLASS}CoverTitle`;
  title.textContent = settings.coverTitle.trim() || docTitle;
  cover.append(title);

  const author = settings.coverAuthor.trim();
  if (author) {
    const authorLine = document.createElement("div");
    authorLine.className = `${TOC_CLASS}CoverAuthor`;
    authorLine.textContent = author;
    cover.append(authorLine);
  }

  const date = document.createElement("div");
  date.className = `${TOC_CLASS}CoverDate`;
  date.textContent =
    settings.coverDate.trim() || new Date().toLocaleDateString();
  cover.append(date);
  flow.insertBefore(cover, flow.firstElementChild);

  const after = cover.nextElementSibling;
  if (after instanceof HTMLElement) {
    after.setAttribute(PAGE_BREAK_ATTR, "1");
  }
};

const addImageCaptions = (rendered: HTMLElement): void => {
  let n = 0;

  rendered.querySelectorAll<HTMLImageElement>("img[alt]").forEach((img) => {
    const alt = (img.getAttribute("alt") ?? "").trim();

    if (!alt || inGenerated(img) || img.closest("table, pre")) {
      return;
    }

    n += 1;
    const caption = generated(
      document.createElement("span"),
      `${TOC_CLASS}Caption`,
    );
    caption.textContent = `${structureLabels.figure} ${n}. ${alt}`;
    (img.closest("a") ?? img).after(caption);
  });
};

/** Wrap every line of each code block so a gutter can number it. */
const addCodeLineNumbers = (rendered: HTMLElement): void => {
  rendered.querySelectorAll<HTMLElement>("pre").forEach((pre) => {
    if (inGenerated(pre)) {
      return;
    }

    const code = pre.querySelector<HTMLElement>(":scope > code") ?? pre;
    originalCode.set(code, code.innerHTML);
    code.setAttribute("data-kuusi-lines", "1");

    const lines: DocumentFragment[] = [];
    const range = document.createRange();

    for (;;) {
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      let found: { node: Text; index: number } | null = null;

      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = (node.nodeValue ?? "").indexOf("\n");

        if (index >= 0) {
          found = { node: node as Text, index };
          break;
        }
      }

      if (!found) {
        break;
      }

      range.setStart(code, 0);
      range.setEnd(found.node, found.index + 1);
      lines.push(range.extractContents());
    }

    if (code.childNodes.length > 0) {
      const tail = document.createDocumentFragment();
      while (code.firstChild) {
        tail.appendChild(code.firstChild);
      }
      lines.push(tail);
    }

    // A source ending in a newline leaves no content after the last break.
    lines.forEach((fragment, index) => {
      const line = document.createElement("span");
      line.className = "jp-KuusiArticle-codeLine";
      line.dataset.n = String(index + 1);
      line.appendChild(fragment);
      code.appendChild(line);
    });
  });
};

const addLinkFootnotes = (rendered: HTMLElement, flow: HTMLElement): void => {
  const numbers = new Map<string, number>();

  rendered.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
    const href = a.getAttribute("href") ?? "";

    if (!/^https?:\/\//i.test(href) || inGenerated(a)) {
      return;
    }

    if (!numbers.has(href)) {
      numbers.set(href, numbers.size + 1);
    }

    const ref = generated(document.createElement("sup"), `${TOC_CLASS}LinkRef`);
    ref.textContent = `[${numbers.get(href)}]`;
    a.after(ref);
  });

  if (numbers.size === 0) {
    return;
  }

  const title = generated(document.createElement("div"), `${TOC_CLASS}Title`);
  title.textContent = structureLabels.links;
  flow.appendChild(title);

  numbers.forEach((n, href) => {
    const item = generated(document.createElement("div"), `${TOC_CLASS}LinkItem`);
    item.textContent = `[${n}] ${href}`;
    flow.appendChild(item);
  });
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

import type { Widget } from "@lumino/widgets";

import {
  articleLayoutStepLimit,
  linesToKeepOnPage,
  resolvePageSplit,
} from "./articlePagePack";
import type {
  ArticleHeaderAlign,
  ArticleSettings,
  ArticleSettingsManager,
} from "./articleSettings";
import { paperDimensions } from "./articlePaper";
import { resolvePageNumberDisplay } from "./pageNumberStart";
import {
  PAGE_BREAK_ATTR,
  TOC_CLASS,
  applyStructure,
  clearStructure,
  fillChapterTokens,
  fillTocPages,
} from "./articleStructure";

export const ARTICLE_PAGE_SHEET_CLASS = "jp-KuusiArticle-pageSheet";
export const ARTICLE_PAGE_BREAK_CLASS = "jp-KuusiArticle-pageBreak";
export const ARTICLE_PAGE_SPLIT_ATTR = "data-kuusi-split";
export const ARTICLE_COLUMN_STACK_CLASS = "jp-KuusiArticle-columnStack";
export const ARTICLE_COLUMN_PAGE_CLASS = "jp-KuusiArticle-columnPage";
export const ARTICLE_COLUMNS_FLOW_CLASS = "jp-KuusiArticle-columnsFlow";
export const ARTICLE_COLUMNS_FALLBACK_CLASS = "is-kuusi-article-columns-fallback";

const PAGE_GAP_PX = 28;
/** Pushes allowed for one block before the layout loop gives up on it. */
const MAX_RETRIES_PER_BLOCK = 4;
const MIN_CONTENT_HEIGHT_PX = 48;
const SNAP_PX = 1.5;
const RENDERED_SELECTOR = ":is(.jp-RenderedMarkdown, .jp-RenderedMySTMarkdown)";
const LAYOUT_ATTRIBUTES = [
  "data-kuusi-article-page-layout",
  "data-kuusi-article-paper-size",
  "data-kuusi-article-paper-orientation",
  "data-kuusi-article-table-repeat-header",
  "data-kuusi-article-columns",
  "data-kuusi-article-padding",
  "data-kuusi-article-font",
  "data-kuusi-article-font-size",
  "data-kuusi-article-image-width",
  "data-kuusi-article-image-align",
  "data-kuusi-article-image-wrap",
  "data-kuusi-article-image-border",
  "data-kuusi-article-page-scroll",
  "data-kuusi-article-fullscreen",
  "style",
];
const ATOMIC_SELECTORS = [
  "img",
  "svg",
  "canvas",
  "video",
  "mjx-container",
  ".MathJax",
  ".MathJax_Display",
  ".katex-display",
  ".jp-RenderedLatex",
];
const ATOMIC_SELECTOR = ATOMIC_SELECTORS.join(", ");
const ATOMIC_CHILD_SELECTOR = ATOMIC_SELECTORS.map(
  (selector) => `:scope > ${selector}`,
).join(", ");

const bound = new WeakSet<Widget>();

const RENDER_ZOOM_VAR = /--kuusi-render-zoom\s*:[^;]*;?/g;

/** An inline `style` with the view-zoom variable removed. */
const styleWithoutZoom = (style: string | null): string =>
  (style ?? "").replace(RENDER_ZOOM_VAR, "").replace(/\s+/g, "");
const splitHtml = new WeakMap<HTMLElement, string>();
const splitStart = new WeakMap<HTMLElement, string | null>();

const supportsColumnHeight = (): boolean =>
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("column-height", "100px");

const PAGINATION_OVERRIDE_KEY = "jupyterlab-kuusi:article-pagination";

/**
 * Single-column pages can be broken by the browser itself (the same
 * `column-height` path as dual-column) or by the JS paginator. Native is used
 * whenever the browser supports it; set `localStorage[
 * "jupyterlab-kuusi:article-pagination"]` to `"js"` to force the JS paginator
 * (or `"native"` to force native), e.g. for comparison.
 */
const useNativeSinglePages = (): boolean => {
  let override: unknown = (globalThis as { __KUUSI_ARTICLE_PAGINATION?: unknown })
    .__KUUSI_ARTICLE_PAGINATION;

  if (override === undefined) {
    try {
      override = window.localStorage.getItem(PAGINATION_OVERRIDE_KEY);
    } catch {
      override = null;
    }
  }

  if (override === "js") {
    return false;
  }

  return supportsColumnHeight();
};

type PageMetrics = {
  rendered: HTMLElement;
  stride: number;
  paperHeight: number;
  padTop: number;
  padBottom: number;
  contentHeight: number;
  scale: number;
};

const isPagedChrome = (node: Node): boolean => {
  if (!(node instanceof HTMLElement)) {
    return false;
  }

  return (
    node.classList.contains(TOC_CLASS) ||
    node.classList.contains(ARTICLE_PAGE_SHEET_CLASS) ||
    node.classList.contains(ARTICLE_PAGE_BREAK_CLASS) ||
    node.dataset.kuusiColumnsClone === "1" ||
    Boolean(
      node.closest(
        `.${ARTICLE_PAGE_SHEET_CLASS}, [data-kuusi-columns-clone="1"]`,
      ),
    )
  );
};

/**
 * Chrome test for a *direct child* of the flow container. Unlike
 * {@link isPagedChrome} it never walks ancestors (`closest`), which made the
 * layout loop quadratic: it ran for every child on every step.
 */
const isChromeChild = (node: Element): boolean =>
  node.classList.contains(ARTICLE_PAGE_SHEET_CLASS) ||
  node.classList.contains(ARTICLE_PAGE_BREAK_CLASS) ||
  (node as HTMLElement).dataset?.kuusiColumnsClone === "1";

const contentChildren = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !isChromeChild(child),
  );

const firstFlow = (container: HTMLElement): HTMLElement | null => {
  let current = container.firstElementChild;

  while (current) {
    if (current instanceof HTMLElement && !isChromeChild(current)) {
      return current;
    }
    current = current.nextElementSibling;
  }

  return null;
};

const nextFlow = (node: HTMLElement): HTMLElement | null => {
  let current = node.nextElementSibling;

  while (current) {
    if (current instanceof HTMLElement && !isChromeChild(current)) {
      return current;
    }
    current = current.nextElementSibling;
  }

  return null;
};

/** MyST wraps the document in nested single-child containers; page their blocks. */
const resolveFlowContainer = (rendered: HTMLElement): HTMLElement => {
  let container = rendered;

  for (;;) {
    const children = contentChildren(container);

    if (children.length !== 1 || children[0].children.length < 2) {
      return container;
    }

    container = children[0];
  }
};

const restoreSplits = (root: HTMLElement): void => {
  root
    .querySelectorAll<HTMLElement>(`[${ARTICLE_PAGE_SPLIT_ATTR}="cont"]`)
    .forEach((node) => node.remove());

  root
    .querySelectorAll<HTMLElement>(`[${ARTICLE_PAGE_SPLIT_ATTR}="head"]`)
    .forEach((node) => {
      const html = splitHtml.get(node);

      if (html !== undefined) {
        node.innerHTML = html;
      }

      const start = splitStart.get(node);

      if (start === null) {
        node.removeAttribute("start");
      } else if (start !== undefined) {
        node.setAttribute("start", start);
      }

      node.removeAttribute(ARTICLE_PAGE_SPLIT_ATTR);
      splitHtml.delete(node);
      splitStart.delete(node);
    });
};

const clearPagedLayout = (rendered: HTMLElement): void => {
  restoreSplits(rendered);

  // Unwrap dual-column fallback stack: keep the live flow's children.
  const stack = rendered.querySelector(`:scope > .${ARTICLE_COLUMN_STACK_CLASS}`);
  if (stack instanceof HTMLElement) {
    const live = stack.querySelector<HTMLElement>(
      `.${ARTICLE_COLUMNS_FLOW_CLASS}:not([data-kuusi-columns-clone="1"])`,
    );
    if (live) {
      while (live.firstChild) {
        rendered.insertBefore(live.firstChild, stack);
      }
    }
    stack.remove();
  }

  rendered
    .querySelectorAll(
      `.${ARTICLE_PAGE_SHEET_CLASS}, .${ARTICLE_PAGE_BREAK_CLASS}`,
    )
    .forEach((node) => node.remove());
  rendered.style.removeProperty("min-height");
  rendered.style.removeProperty("height");
  rendered.style.removeProperty("width");
  rendered.style.removeProperty("max-width");
  rendered.style.removeProperty("column-width");
  rendered.style.removeProperty("column-gap");
  rendered.style.removeProperty("column-fill");
  delete rendered.dataset.kuusiNativePages;
  rendered.style.removeProperty("--kuusi-article-page-content-h");
  rendered.style.removeProperty("--kuusi-article-page-row-gap");
  rendered.classList.remove(ARTICLE_COLUMNS_FALLBACK_CLASS);
  rendered.classList.remove("is-kuusi-article-page-scroll-x");

  const paper = rendered.closest(".jp-KuusiArticle-paper");
  if (paper instanceof HTMLElement) {
    paper.classList.remove(ARTICLE_COLUMNS_FALLBACK_CLASS);
  }
};

const measurePaperHeight = (rendered: HTMLElement): number => {
  const host = rendered.closest(
    ".jp-KuusiArticle-paper, .jp-KuusiMarkdownArticle",
  ) as HTMLElement | null;
  const paper = paperDimensions(
    host?.getAttribute("data-kuusi-article-paper-size"),
    host?.getAttribute("data-kuusi-article-paper-orientation"),
  );
  // height / width for the selected paper.
  const heightOverWidth = paper.heightMm / paper.widthMm;

  // Fixed physical width (mm/in via CSS). clientWidth is the mm→px conversion
  // and does not track the pane — only DPI / zoom of the browser chrome.
  const width = rendered.clientWidth;
  if (width > 0) {
    const height = width * heightOverWidth;
    if (height >= MIN_CONTENT_HEIGHT_PX) {
      if (host) {
        host.style.setProperty("--kuusi-article-paper-height", `${height}px`);
      }
      return height;
    }
  }

  // Fallback probe — size from the CSS max-width token, not the pane.
  const probe = document.createElement("div");
  probe.style.visibility = "hidden";
  probe.style.position = "absolute";
  probe.style.width = `${paper.widthMm}mm`;
  document.body.appendChild(probe);
  const probeWidth = probe.offsetWidth;
  probe.remove();
  const height =
    probeWidth > 0
      ? Math.max(MIN_CONTENT_HEIGHT_PX, probeWidth * heightOverWidth)
      : 0;
  if (host && height > 0) {
    host.style.setProperty("--kuusi-article-paper-height", `${height}px`);
  }
  return height;
};

const originTop = (metrics: PageMetrics): number =>
  metrics.rendered.getBoundingClientRect().top;

const topOf = (el: HTMLElement, metrics: PageMetrics): number =>
  (el.getBoundingClientRect().top - originTop(metrics)) / metrics.scale;

const heightOf = (el: HTMLElement, metrics: PageMetrics): number =>
  el.getBoundingClientRect().height / metrics.scale;

const pageIndex = (top: number, metrics: PageMetrics): number =>
  Math.floor(Math.max(0, top) / metrics.stride);

const pageContentBottom = (page: number, metrics: PageMetrics): number =>
  page * metrics.stride + metrics.paperHeight - metrics.padBottom;

const pageContentTop = (page: number, metrics: PageMetrics): number =>
  page * metrics.stride + metrics.padTop;

const atPageStart = (top: number, page: number, metrics: PageMetrics): boolean =>
  top <= pageContentTop(page, metrics) + SNAP_PX;

const insertSpacerBefore = (
  child: HTMLElement,
  target: number,
  metrics: PageMetrics,
): void => {
  const top = topOf(child, metrics);
  const spacer = document.createElement("div");
  spacer.className = ARTICLE_PAGE_BREAK_CLASS;
  spacer.setAttribute("aria-hidden", "true");
  spacer.style.height = `${Math.max(0, target - top)}px`;
  child.before(spacer);

  const drift = topOf(child, metrics) - target;

  if (Math.abs(drift) > 0.5) {
    spacer.style.height = `${Math.max(0, target - top - drift)}px`;
  }
};

const prevFlow = (node: HTMLElement): HTMLElement | null => {
  let current = node.previousElementSibling;

  while (current) {
    if (current instanceof HTMLElement && !isChromeChild(current)) {
      return current;
    }
    current = current.previousElementSibling;
  }

  return null;
};

/**
 * Earliest heading in the run of headings directly above `child` that sits on
 * the same page (and not at its very top). Moving the child to the next page
 * must take these along, or they end up stranded at the bottom.
 */
const headingsToKeepWith = (
  child: HTMLElement,
  page: number,
  metrics: PageMetrics,
): HTMLElement => {
  let anchor = child;
  let previous = prevFlow(anchor);

  while (previous && isHeading(previous)) {
    if (atPageStart(topOf(previous, metrics), page, metrics)) {
      break;
    }

    anchor = previous;
    previous = prevFlow(anchor);
  }

  return anchor;
};

const pushToNextPage = (child: HTMLElement, metrics: PageMetrics): boolean => {
  const top = topOf(child, metrics);
  const page = pageIndex(top, metrics);

  if (atPageStart(top, page, metrics)) {
    return false;
  }

  insertSpacerBefore(
    isHeading(child) ? child : headingsToKeepWith(child, page, metrics),
    pageContentTop(page + 1, metrics),
    metrics,
  );
  return true;
};

const markHead = (el: HTMLElement): void => {
  if (el.getAttribute(ARTICLE_PAGE_SPLIT_ATTR) === "head") {
    return;
  }

  if (!el.hasAttribute(ARTICLE_PAGE_SPLIT_ATTR)) {
    splitHtml.set(el, el.innerHTML);
    splitStart.set(el, el.getAttribute("start"));
    el.setAttribute(ARTICLE_PAGE_SPLIT_ATTR, "head");
  }
};

const markCont = (el: HTMLElement): void => {
  el.removeAttribute(ARTICLE_PAGE_SPLIT_ATTR);
  el.setAttribute(ARTICLE_PAGE_SPLIT_ATTR, "cont");
};

const cloneShell = (el: HTMLElement, deep: boolean): HTMLElement => {
  const clone = el.cloneNode(deep) as HTMLElement;
  clone.removeAttribute(ARTICLE_PAGE_SPLIT_ATTR);
  markCont(clone);
  return clone;
};

const placeContinuation = (
  head: HTMLElement,
  cont: HTMLElement,
  metrics: PageMetrics,
): void => {
  const top = topOf(head, metrics);
  const page = pageIndex(top, metrics);
  head.after(cont);
  insertSpacerBefore(cont, pageContentTop(page + 1, metrics), metrics);
};

const SLOT_ALIGNS: ArticleHeaderAlign[] = ["left", "center", "right"];

const fillPageTokens = (
  text: string,
  title: string,
  page: string,
  pages: string,
): string =>
  text
    .replace(/\{title\}/g, title)
    .replace(/\{date\}/g, new Date().toLocaleDateString())
    .replace(/\{pages\}/g, pages)
    .replace(/\{page\}/g, page);

const createBand = (
  edge: "header" | "footer",
  slots: Record<ArticleHeaderAlign, string[]>,
  height: number,
  padLeft: number,
  padRight: number,
  ruled = false,
): HTMLElement | null => {
  if (SLOT_ALIGNS.every((align) => slots[align].length === 0) && !ruled) {
    return null;
  }

  const band = document.createElement("div");
  band.className = `jp-KuusiArticle-pageBand jp-KuusiArticle-pageBand--${edge}`;
  band.style.height = `${height}px`;
  band.style.paddingLeft = `${padLeft}px`;
  band.style.paddingRight = `${padRight}px`;

  if (ruled) {
    band.classList.add("is-ruled");
    band.style.setProperty("--kuusi-band-pad-l", `${padLeft}px`);
    band.style.setProperty("--kuusi-band-pad-r", `${padRight}px`);
  }

  SLOT_ALIGNS.forEach((align) => {
    const slot = document.createElement("span");
    slot.className = `jp-KuusiArticle-pageSlot jp-KuusiArticle-pageSlot--${align}`;
    slot.textContent = slots[align].join(" · ");
    band.appendChild(slot);
  });

  return band;
};

const decorateSheet = (
  sheet: HTMLElement,
  settings: ArticleSettings,
  title: string,
  physicalIndex: number,
  physicalTotal: number,
  margins: { top: number; bottom: number; left: number; right: number },
): void => {
  const emptySlots = (): Record<ArticleHeaderAlign, string[]> => ({
    left: [],
    center: [],
    right: [],
  });
  const header = emptySlots();
  const footer = emptySlots();
  const numbered = resolvePageNumberDisplay(
    physicalIndex,
    physicalTotal,
    settings.pageNumberStart,
  );
  const pageToken = numbered.show ? String(numbered.page) : "";
  const pagesToken = String(numbered.pages);

  const headerText = fillPageTokens(
    settings.pageHeaderText,
    title,
    pageToken,
    pagesToken,
  ).trim();
  const showText = !(settings.pageFirstDifferent && physicalIndex === 0);

  if (headerText && showText) {
    header[settings.pageHeaderAlign].push(headerText);
  }

  const footerText = fillPageTokens(
    settings.pageFooterText,
    title,
    pageToken,
    pagesToken,
  ).trim();
  if (footerText && showText) {
    footer[settings.pageFooterAlign].push(footerText);
  }

  if (settings.pageNumber !== "none" && numbered.show) {
    const label =
      settings.pageNumber === "page-of-total"
        ? `${numbered.page} / ${numbered.pages}`
        : String(numbered.page);
    (settings.pageNumberPosition === "header" ? header : footer)[
      settings.pageNumberAlign
    ].push(label);
  }

  const bands = [
    createBand(
      "header",
      header,
      margins.top,
      margins.left,
      margins.right,
      settings.pageHeaderRule && showText,
    ),
    createBand(
      "footer",
      footer,
      margins.bottom,
      margins.left,
      margins.right,
      settings.pageFooterRule && showText,
    ),
  ].filter((band): band is HTMLElement => band !== null);

  sheet.append(...bands);
};

const isHeading = (el: HTMLElement): boolean => /^H[1-6]$/.test(el.tagName);

const isList = (el: HTMLElement): boolean =>
  el.tagName === "UL" || el.tagName === "OL";

const isTable = (el: HTMLElement): boolean => {
  if (el.tagName === "TABLE") {
    return true;
  }

  const table = el.querySelector(":scope > table");

  if (!table) {
    return false;
  }

  return Array.from(el.children).every(
    (child) =>
      child === table ||
      child.tagName === "CAPTION" ||
      child.tagName === "FIGCAPTION" ||
      child.classList.contains("caption"),
  );
};

const tableOf = (el: HTMLElement): HTMLTableElement | null =>
  el.tagName === "TABLE"
    ? (el as HTMLTableElement)
    : el.querySelector(":scope > table");

const isAtomic = (el: HTMLElement): boolean => {
  if (el.matches(ATOMIC_SELECTOR)) {
    return true;
  }

  if (el.querySelector(ATOMIC_CHILD_SELECTOR)) {
    return (el.textContent ?? "").replace(/\s+/g, "").length === 0;
  }

  if (el.tagName === "FIGURE" || el.tagName === "IMG") {
    return true;
  }

  return false;
};

const lineHeightOf = (el: HTMLElement, metrics: PageMetrics): number => {
  const style = getComputedStyle(el);
  const parsed = parseFloat(style.lineHeight);
  if (Number.isFinite(parsed) && style.lineHeight !== "normal") {
    return parsed / metrics.scale;
  }

  const font = parseFloat(style.fontSize) || 16;
  return (font * 1.6) / metrics.scale;
};

const mergeClientRects = (
  raw: Array<Pick<DOMRect, "top" | "bottom" | "height" | "width">>,
): Array<{ top: number; bottom: number }> => {
  const lines: Array<{ top: number; bottom: number }> = [];

  raw
    .filter((rect) => rect.height > 0.5 && rect.width > 0.5)
    .forEach((rect) => {
      const hit = lines.find(
        (line) =>
          Math.abs(line.top - rect.top) < 2 ||
          (rect.top < line.bottom - 1 && rect.bottom > line.top + 1),
      );

      if (hit) {
        hit.top = Math.min(hit.top, rect.top);
        hit.bottom = Math.max(hit.bottom, rect.bottom);
      } else {
        lines.push({ top: rect.top, bottom: rect.bottom });
      }
    });

  return lines.sort((a, b) => a.top - b.top);
};

const visualLineBoxes = (el: HTMLElement): Array<{ top: number; bottom: number }> => {
  const range = document.createRange();
  range.selectNodeContents(el);
  return mergeClientRects(Array.from(range.getClientRects()));
};

/** `<pre>` often reports one client rect; walk newline-delimited text instead. */
const newlineLineBoxes = (
  el: HTMLElement,
): Array<{ top: number; bottom: number }> => {
  const range = document.createRange();
  const lines: Array<{ top: number; bottom: number }> = [];
  let start: { node: Text; offset: number } | null = null;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);

  const flush = (end: { node: Text; offset: number }): void => {
    if (!start) {
      return;
    }

    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const rect = range.getBoundingClientRect();

    if (rect.height > 0.5) {
      lines.push({ top: rect.top, bottom: rect.bottom });
    } else if (lines.length > 0) {
      const prev = lines[lines.length - 1];
      const height = Math.max(12, prev.bottom - prev.top);
      lines.push({ top: prev.bottom, bottom: prev.bottom + height });
    }

    start = null;
  };

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;

    for (let offset = 0; offset < node.length; offset += 1) {
      start ??= { node, offset };

      if (node.data[offset] === "\n") {
        flush({ node, offset });
      }
    }
  }

  if (start) {
    flush({ node: start.node, offset: start.node.length });
  }

  return lines;
};

const isCodeBlock = (el: HTMLElement): boolean =>
  el.tagName === "PRE" || el.querySelector("pre") !== null;

const lineBoxes = (el: HTMLElement): Array<{ top: number; bottom: number }> => {
  const visual = visualLineBoxes(el);

  if (!isCodeBlock(el)) {
    return visual;
  }

  const byNewline = newlineLineBoxes(el);
  return byNewline.length > visual.length ? byNewline : visual;
};

const fittingLines = (
  el: HTMLElement,
  limit: number,
  metrics: PageMetrics,
): number => {
  const origin = originTop(metrics);
  return lineBoxes(el).filter(
    (line) => (line.bottom - origin) / metrics.scale <= limit + 0.5,
  ).length;
};

const firstPositionBelow = (
  el: HTMLElement,
  clientY: number,
): { node: Text; offset: number } | null => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const length = node.length;

    if (length === 0) {
      continue;
    }

    range.setStart(node, 0);
    range.setEnd(node, length);
    const wrap = range.getBoundingClientRect();

    if (wrap.bottom <= clientY + 0.5) {
      continue;
    }

    if (wrap.top >= clientY - 0.5) {
      return { node, offset: 0 };
    }

    let low = 0;
    let high = length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      range.setStart(node, mid);
      range.setEnd(node, Math.min(length, mid + 1));
      const rect = range.getBoundingClientRect();

      if (rect.top >= clientY - 0.5) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    if (low < length) {
      return { node, offset: low };
    }
  }

  return null;
};

const splitAfterLines = (
  el: HTMLElement,
  keepLines: number,
  metrics: PageMetrics,
): boolean => {
  const lines = lineBoxes(el);

  if (keepLines <= 0 || keepLines >= lines.length) {
    return false;
  }

  const splitAt = lines[keepLines - 1];
  const caret = firstPositionBelow(el, splitAt.bottom - 0.5);

  if (!caret || !el.lastChild) {
    return false;
  }

  markHead(el);
  const range = document.createRange();
  range.setStart(caret.node, caret.offset);
  range.setEndAfter(el.lastChild);
  const extracted = range.extractContents();

  if (!extracted.textContent?.replace(/\s+/g, "")) {
    el.append(extracted);
    return false;
  }

  const cont = cloneShell(el, false);
  cont.append(extracted);
  placeContinuation(el, cont, metrics);
  return true;
};

const headerRowsOf = (table: HTMLTableElement): HTMLTableRowElement[] => {
  const head = table.tHead;
  if (head && head.rows.length > 0) {
    return Array.from(head.rows);
  }

  const first = table.rows[0];
  if (
    first &&
    Array.from(first.cells).every((cell) => cell.tagName === "TH")
  ) {
    return [first];
  }

  return [];
};

const splitTable = (
  host: HTMLElement,
  metrics: PageMetrics,
): "next" | "retry" => {
  const table = tableOf(host);

  if (!table) {
    return pushToNextPage(host, metrics) ? "retry" : "next";
  }

  const top = topOf(host, metrics);
  const page = pageIndex(top, metrics);
  const limit = pageContentBottom(page, metrics);
  const origin = originTop(metrics);
  const headers = headerRowsOf(table);
  const headerSet = new Set(headers);
  const body = Array.from(table.rows).filter((row) => !headerSet.has(row));
  const rowBottom = (row: HTMLTableRowElement): number =>
    (row.getBoundingClientRect().bottom - origin) / metrics.scale;

  let keep = 0;
  while (keep < body.length && rowBottom(body[keep]) <= limit + 0.5) {
    keep += 1;
  }

  if (keep === body.length) {
    return "next";
  }

  if (keep === 0) {
    return pushToNextPage(host, metrics) ? "retry" : "next";
  }

  markHead(host);
  const cont = cloneShell(host, true);
  const contTable = tableOf(cont);

  if (!contTable) {
    cont.remove();
    return "next";
  }

  Array.from(table.rows)
    .filter((row) => !headerSet.has(row))
    .slice(keep)
    .forEach((row) => row.remove());

  const contHeaders = headerRowsOf(contTable);
  const contHeaderSet = new Set(contHeaders);

  if (
    metrics.rendered
      .closest(".jp-KuusiArticle-paper")
      ?.getAttribute("data-kuusi-article-table-repeat-header") === "0"
  ) {
    contHeaders.forEach((row) => row.remove());
  }

  Array.from(contTable.rows)
    .filter((row) => !contHeaderSet.has(row))
    .slice(0, keep)
    .forEach((row) => row.remove());

  placeContinuation(host, cont, metrics);
  return "next";
};

const listItems = (el: HTMLElement): HTMLElement[] =>
  Array.from(el.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.tagName === "LI",
  );

const splitList = (el: HTMLElement, metrics: PageMetrics): "next" | "retry" => {
  const items = listItems(el);
  const top = topOf(el, metrics);
  const page = pageIndex(top, metrics);
  const limit = pageContentBottom(page, metrics);
  const origin = originTop(metrics);
  const bottomOf = (item: HTMLElement): number =>
    (item.getBoundingClientRect().bottom - origin) / metrics.scale;

  let keep = 0;
  while (keep < items.length && bottomOf(items[keep]) <= limit + 0.5) {
    keep += 1;
  }

  if (keep === items.length) {
    return "next";
  }

  if (keep === 0) {
    if (
      atPageStart(top, page, metrics) &&
      heightOf(items[0], metrics) > metrics.contentHeight
    ) {
      return splitByLines(el, metrics);
    }

    return pushToNextPage(el, metrics) ? "retry" : "next";
  }

  markHead(el);
  const cont = cloneShell(el, false);
  items.slice(keep).forEach((item) => cont.append(item));

  if (el.tagName === "OL") {
    const start = Number.parseInt(el.getAttribute("start") ?? "1", 10);
    (cont as HTMLOListElement).start = start + keep;
  }

  placeContinuation(el, cont, metrics);
  return "next";
};

/** Padding + border below the last line of a boxed block, in layout px. */
const bottomChrome = (el: HTMLElement): number => {
  const box = el.tagName === "PRE" ? el : el.querySelector(":scope > pre") ?? el;
  const style = getComputedStyle(box as HTMLElement);

  return (
    (parseFloat(style.paddingBottom) || 0) +
    (parseFloat(style.borderBottomWidth) || 0)
  );
};

const splitByLines = (
  el: HTMLElement,
  metrics: PageMetrics,
): "next" | "retry" => {
  const top = topOf(el, metrics);
  const page = pageIndex(top, metrics);
  const limit = pageContentBottom(page, metrics);
  const lines = lineBoxes(el);
  // A boxed block (code) keeps its bottom padding and border on the head
  // fragment, so the last line must end that far above the page limit.
  const fitting = fittingLines(el, limit - bottomChrome(el), metrics);
  const keep = resolvePageSplit(
    lines.length,
    fitting,
    atPageStart(top, page, metrics),
  );

  if (keep === "all") {
    return "next";
  }

  if (keep === "push") {
    return pushToNextPage(el, metrics) ? "retry" : "next";
  }

  if (typeof keep === "number" && splitAfterLines(el, keep, metrics)) {
    return "next";
  }

  return pushToNextPage(el, metrics) ? "retry" : "next";
};

const minKeepWith = (el: HTMLElement, metrics: PageMetrics): number => {
  if (isAtomic(el)) {
    return heightOf(el, metrics);
  }

  if (isTable(el)) {
    const table = tableOf(el);
    const headers = table ? headerRowsOf(table) : [];
    const firstBody = table
      ? Array.from(table.rows).find((row) => !headers.includes(row))
      : null;
    const rows = [...headers, ...(firstBody ? [firstBody] : [])];
    return rows.reduce((sum, row) => sum + heightOf(row, metrics), 0);
  }

  if (isList(el)) {
    const first = listItems(el)[0];
    return first
      ? Math.min(heightOf(el, metrics), heightOf(first, metrics))
      : lineHeightOf(el, metrics);
  }

  return Math.min(heightOf(el, metrics), lineHeightOf(el, metrics) * 2);
};

const keepWithNextNeed = (
  heading: HTMLElement,
  metrics: PageMetrics,
): number => {
  let need = heightOf(heading, metrics);
  let current = heading;
  let following = nextFlow(current);

  while (following && isHeading(following)) {
    const gap = Math.max(0, topOf(following, metrics) - (topOf(current, metrics) + heightOf(current, metrics)));
    need += gap + heightOf(following, metrics);
    current = following;
    following = nextFlow(current);
  }

  if (following) {
    const gap = Math.max(
      0,
      topOf(following, metrics) - (topOf(current, metrics) + heightOf(current, metrics)),
    );
    need += gap + keepWithNextBlockNeed(heading, following, metrics);
  }

  return need;
};

/**
 * How much of the block after a heading must share the heading's page. For
 * plain text the orphan/widow rule may push the *whole* paragraph to the next
 * page (e.g. 3 lines with room for 2); the heading must then move with it, or
 * it is left stranded at the bottom of the page.
 */
const keepWithNextBlockNeed = (
  heading: HTMLElement,
  following: HTMLElement,
  metrics: PageMetrics,
): number => {
  const minimum = minKeepWith(following, metrics);

  if (isAtomic(following) || isTable(following) || isList(following)) {
    return minimum;
  }

  const page = pageIndex(topOf(heading, metrics), metrics);
  const limit = pageContentBottom(page, metrics);
  const lines = lineBoxes(following).length;
  const fitting = fittingLines(following, limit, metrics);

  return linesToKeepOnPage(lines, fitting) === "push"
    ? heightOf(following, metrics)
    : minimum;
};

const placeBlock = (
  child: HTMLElement,
  metrics: PageMetrics,
): "next" | "retry" => {
  if (child.getClientRects().length === 0) {
    return "next";
  }

  const top = topOf(child, metrics);
  const height = heightOf(child, metrics);
  const page = pageIndex(top, metrics);
  const limit = pageContentBottom(page, metrics);
  const remaining = limit - top;

  // Forced break (chapter start, content after the contents page): move to
  // the next sheet unless the block already opens one.
  if (
    child.hasAttribute(PAGE_BREAK_ATTR) &&
    !atPageStart(top, page, metrics) &&
    pushToNextPage(child, metrics)
  ) {
    return "retry";
  }

  if (isHeading(child)) {
    const need = keepWithNextNeed(child, metrics);

    if (need > remaining + SNAP_PX && need <= metrics.contentHeight + SNAP_PX) {
      return pushToNextPage(child, metrics) ? "retry" : "next";
    }
  }

  if (top >= limit - SNAP_PX) {
    return pushToNextPage(child, metrics) ? "retry" : "next";
  }

  if (height <= remaining + SNAP_PX) {
    return "next";
  }

  if (isAtomic(child)) {
    return pushToNextPage(child, metrics) ? "retry" : "next";
  }

  if (isTable(child)) {
    return splitTable(child, metrics);
  }

  if (isList(child)) {
    return splitList(child, metrics);
  }

  if (height <= metrics.contentHeight + SNAP_PX) {
    if (child.tagName === "P" || child.tagName === "PRE" || child.querySelector(":scope > pre")) {
      return splitByLines(child, metrics);
    }

    return pushToNextPage(child, metrics) ? "retry" : "next";
  }

  if (isList(child)) {
    return splitList(child, metrics);
  }

  return splitByLines(child, metrics);
};

const appendPageSheets = (
  rendered: HTMLElement,
  pages: number,
  metrics: PageMetrics,
  settings: ArticleSettings | null,
  title: string,
  style: CSSStyleDeclaration,
  axis: "vertical" | "horizontal" = "vertical",
  pageWidthPx?: number,
): void => {
  const margins = {
    top: metrics.padTop,
    bottom: metrics.padBottom,
    left: parseFloat(style.paddingLeft) || 0,
    right: parseFloat(style.paddingRight) || 0,
  };
  const sheets = document.createDocumentFragment();
  const paperWidth =
    pageWidthPx && pageWidthPx > 0
      ? pageWidthPx
      : rendered.clientWidth || metrics.rendered.clientWidth;

  for (let page = 0; page < pages; page += 1) {
    const sheet = document.createElement("div");
    sheet.className = ARTICLE_PAGE_SHEET_CLASS;
    sheet.setAttribute("aria-hidden", "true");
    sheet.style.height = `${metrics.paperHeight}px`;
    sheet.style.aspectRatio = "auto";
    if (axis === "horizontal") {
      sheet.style.top = "0";
      sheet.style.left = `${page * (paperWidth + PAGE_GAP_PX)}px`;
      sheet.style.width = `${paperWidth}px`;
      sheet.style.right = "auto";
    } else {
      sheet.style.top = `${page * metrics.stride}px`;
    }
    if (settings) {
      decorateSheet(sheet, settings, title, page, pages, margins);
    }
    sheets.appendChild(sheet);
  }

  rendered.prepend(sheets);
};

/** Fullscreen horizontal strip: CSS columns = pages, desk scrolls on X. */
const layoutHorizontalPages = (
  rendered: HTMLElement,
  metrics: PageMetrics,
  settings: ArticleSettings | null,
  title: string,
  style: CSSStyleDeclaration,
): void => {
  const paperWidth = rendered.clientWidth;
  if (paperWidth <= 0) {
    return;
  }

  rendered.classList.add("is-kuusi-article-page-scroll-x");
  rendered.style.height = `${metrics.paperHeight}px`;
  rendered.style.minHeight = "0";
  rendered.style.maxWidth = "none";
  rendered.style.columnWidth = `${paperWidth}px`;
  rendered.style.columnGap = `${PAGE_GAP_PX}px`;
  rendered.style.columnFill = "auto";
  // Let columns determine intrinsic width, then lock it for sheet placement.
  rendered.style.width = "max-content";
  void rendered.offsetHeight;

  const pages = Math.max(
    1,
    Math.ceil(rendered.scrollWidth / (paperWidth + PAGE_GAP_PX) - 0.001),
  );
  rendered.style.width = `${pages * paperWidth + (pages - 1) * PAGE_GAP_PX}px`;
  appendPageSheets(
    rendered,
    pages,
    metrics,
    settings,
    title,
    style,
    "horizontal",
    paperWidth,
  );
};

/**
 * Newspaper-style columns: fill left then right within one page height, then
 * the next page. Native `column-height` / `column-wrap` when available; otherwise
 * a clipped multi-page stack (live flow on page 0, inert clones after).
 */
const layoutDualColumnPages = (
  rendered: HTMLElement,
  metrics: PageMetrics,
  settings: ArticleSettings | null,
  title: string,
  style: CSSStyleDeclaration,
): void => {
  const rowGap = metrics.padBottom + PAGE_GAP_PX + metrics.padTop;
  rendered.style.setProperty(
    "--kuusi-article-page-content-h",
    `${metrics.contentHeight}px`,
  );
  rendered.style.setProperty("--kuusi-article-page-row-gap", `${rowGap}px`);

  if (supportsColumnHeight()) {
    // Force a layout with wrapped column rows, then count pages from height.
    void rendered.offsetHeight;
    const inner = Math.max(
      0,
      rendered.scrollHeight - metrics.padTop - metrics.padBottom,
    );
    const pages = Math.max(
      1,
      Math.ceil((inner + rowGap) / (metrics.contentHeight + rowGap) - 0.001),
    );
    rendered.style.minHeight = `${pages * metrics.stride - PAGE_GAP_PX}px`;
    appendPageSheets(rendered, pages, metrics, settings, title, style);
    return;
  }

  // Fallback: constrain height → overflow columns inline → stack clipped pages.
  const pageWidth = rendered.clientWidth;
  if (pageWidth <= 0) {
    return;
  }

  rendered.style.height = `${metrics.contentHeight}px`;
  rendered.style.columnFill = "auto";
  void rendered.offsetHeight;
  const scrollWidth = rendered.scrollWidth;
  rendered.style.removeProperty("height");
  rendered.style.removeProperty("column-fill");

  const pages = Math.max(1, Math.ceil(scrollWidth / pageWidth - 0.001));

  const flowChildren = contentChildren(rendered);
  const stack = document.createElement("div");
  stack.className = ARTICLE_COLUMN_STACK_CLASS;

  const liveFlow = document.createElement("div");
  liveFlow.className = ARTICLE_COLUMNS_FLOW_CLASS;
  liveFlow.style.width = `${pageWidth}px`;
  liveFlow.style.height = `${metrics.contentHeight}px`;
  for (const child of flowChildren) {
    liveFlow.appendChild(child);
  }

  for (let page = 0; page < pages; page += 1) {
    const viewport = document.createElement("div");
    viewport.className = ARTICLE_COLUMN_PAGE_CLASS;
    viewport.style.height = `${metrics.contentHeight}px`;
    viewport.style.width = `${pageWidth}px`;
    if (page < pages - 1) {
      viewport.style.marginBottom = `${rowGap}px`;
    }

    if (page === 0) {
      liveFlow.style.position = "absolute";
      liveFlow.style.left = "0";
      liveFlow.style.top = "0";
      viewport.appendChild(liveFlow);
    } else {
      const clone = liveFlow.cloneNode(true) as HTMLElement;
      clone.dataset.kuusiColumnsClone = "1";
      clone.setAttribute("aria-hidden", "true");
      clone.style.left = `${-page * pageWidth}px`;
      viewport.appendChild(clone);
    }

    stack.appendChild(viewport);
  }

  rendered.classList.add(ARTICLE_COLUMNS_FALLBACK_CLASS);
  const paper = rendered.closest(".jp-KuusiArticle-paper");
  if (paper instanceof HTMLElement) {
    paper.classList.add(ARTICLE_COLUMNS_FALLBACK_CLASS);
  }

  rendered.appendChild(stack);
  rendered.style.minHeight = `${pages * metrics.stride - PAGE_GAP_PX}px`;
  appendPageSheets(rendered, pages, metrics, settings, title, style);
};

const layoutPages = (
  rendered: HTMLElement,
  settings: ArticleSettings | null,
  title: string,
): void => {
  const paperHeight = measurePaperHeight(rendered);
  const style = getComputedStyle(rendered);
  const padTop = parseFloat(style.paddingTop) || 0;
  const padBottom = parseFloat(style.paddingBottom) || 0;
  const contentHeight = paperHeight - padTop - padBottom;
  const dualColumns = (settings?.columns ?? 1) >= 2;
  const pageGap = PAGE_GAP_PX;
  const paper =
    rendered.closest(".jp-KuusiArticle-paper") ??
    rendered.closest("[data-kuusi-article-page-layout]");
  const horizontalFullscreen =
    paper instanceof HTMLElement &&
    paper.dataset.kuusiArticleFullscreen === "1" &&
    paper.dataset.kuusiArticlePageScroll !== "vertical";

  if (contentHeight < MIN_CONTENT_HEIGHT_PX) {
    return;
  }

  const metrics: PageMetrics = {
    rendered,
    stride: paperHeight + pageGap,
    paperHeight,
    padTop,
    padBottom,
    contentHeight,
    scale:
      rendered.offsetHeight > 0
        ? rendered.getBoundingClientRect().height / rendered.offsetHeight || 1
        : 1,
  };

  // Fullscreen horizontal swipe: single-column strip (dual-column stays vertical).
  if (horizontalFullscreen && !dualColumns) {
    layoutHorizontalPages(rendered, metrics, settings, title, style);
    return;
  }

  if (dualColumns) {
    layoutDualColumnPages(rendered, metrics, settings, title, style);
    return;
  }

  if (useNativeSinglePages()) {
    // One column per page, wrapped into rows: the browser does the breaking
    // (orphans / widows, keep-with-next, table rows) and no JS measuring runs.
    rendered.dataset.kuusiNativePages = "1";
    layoutDualColumnPages(rendered, metrics, settings, title, style);
    return;
  }

  const container = resolveFlowContainer(rendered);
  const stepLimit = articleLayoutStepLimit(contentChildren(container).length);
  let steps = 0;
  // Walk the live sibling chain: a retry stays on the same block, "next" moves
  // on (past any spacer or continuation fragment inserted meanwhile).
  let child = firstFlow(container);
  let retries = 0;

  while (child && steps < stepLimit) {
    steps += 1;

    if (placeBlock(child, metrics) === "next") {
      child = nextFlow(child);
      retries = 0;
      continue;
    }

    // Every retry moves the block down a page, so a block that still does not
    // settle after a few tries cannot be placed (e.g. sub-pixel drift at a
    // page edge). Move on instead of looping until the step limit.
    retries += 1;

    if (retries > MAX_RETRIES_PER_BLOCK) {
      child = nextFlow(child);
      retries = 0;
    }
  }

  if (steps >= stepLimit) {
    // Better to say so than to leave the tail of a long article unpaged.
    console.warn(
      `jupyterlab-kuusi: Article pagination stopped after ${stepLimit} steps; later blocks may not be paged.`,
    );
  }

  const contentEnd = rendered.offsetHeight - padBottom;
  const pages = Math.max(
    1,
    Math.floor(Math.max(0, contentEnd - 1) / metrics.stride) + 1,
  );
  rendered.style.minHeight = `${pages * metrics.stride - pageGap}px`;
  appendPageSheets(rendered, pages, metrics, settings, title, style);
};

/**
 * One full pagination pass: undo any previous layout, then page the rendered
 * flow when the article is in paged layout. `bindArticlePagedLayout` calls
 * this on every change; the benchmark calls it directly.
 */
export const paginateArticle = (
  rendered: HTMLElement,
  settings: ArticleSettings | null,
  title: string,
  root: HTMLElement = rendered,
): void => {
  clearPagedLayout(rendered);

  if (settings) {
    applyStructure(
      rendered,
      resolveFlowContainer(rendered),
      settings,
      tocDefaultTitle,
    );
  } else {
    clearStructure(rendered);
  }

  // Layout attrs live on `.jp-KuusiArticle-paper` (MarkdownViewer), not the
  // DocumentWidget shell — gating on root.dataset never saw "paged".
  const paper =
    rendered.closest(".jp-KuusiArticle-paper") ??
    root.querySelector(".jp-KuusiArticle-paper");
  const pageLayout =
    paper instanceof HTMLElement
      ? paper.dataset.kuusiArticlePageLayout
      : root.dataset.kuusiArticlePageLayout;

  if (pageLayout === "paged" && rendered.offsetHeight > 0) {
    layoutPages(rendered, settings, title);
  }

  if (settings?.tocShow) {
    fillTocPages(rendered, ARTICLE_PAGE_SHEET_CLASS, settings.pageNumberStart);
  }

  if (
    settings &&
    (settings.pageHeaderText.includes("{chapter}") ||
      settings.pageFooterText.includes("{chapter}"))
  ) {
    fillChapterTokens(rendered, ARTICLE_PAGE_SHEET_CLASS);
  }
};

let tocDefaultTitle = "Contents";

/** Localized heading used when the user leaves the contents title empty. */
export const setTocDefaultTitle = (title: string): void => {
  tocDefaultTitle = title;
};

/**
 * Paged article layout: split the rendered flow into paper sheets with a desk
 * gap, keep headings with the next block, avoid orphan/widow lines, and split
 * tall code, tables, lists, and paragraphs across pages. Images and display
 * math stay intact. Each sheet carries the running header, footer, and page
 * number from the Article settings.
 */
export const bindArticlePagedLayout = (
  widget: Widget,
  manager?: ArticleSettingsManager,
  getTitle: () => string = () => "",
): void => {
  if (bound.has(widget) || widget.isDisposed) {
    return;
  }

  bound.add(widget);
  const root = widget.node;
  let frame = 0;
  let applying = false;

  const run = (): void => {
    frame = 0;
    const rendered = root.querySelector(RENDERED_SELECTOR) as HTMLElement | null;

    if (rendered) {
      applying = true;

      try {
        paginateArticle(rendered, manager?.settings ?? null, getTitle(), root);
        pagedWidth = rendered.clientWidth;
      } finally {
        applying = false;
        mutations.takeRecords();
      }
    }
  };

  const schedule = (): void => {
    if (!frame && !applying) {
      frame = requestAnimationFrame(run);
    }
  };

  const mutations = new MutationObserver((records) => {
    if (applying) {
      return;
    }

    const relevant = records.some((record) => {
      if (isPagedChrome(record.target)) {
        return false;
      }

      if (record.type === "attributes") {
        if (record.attributeName === "style" && record.target instanceof Element) {
          // Lumino rewrites the widget node's own inline geometry (left / top /
          // width / height) on every sash move; that never changes the paper.
          if (record.target === root) {
            return false;
          }

          // View zoom is a CSS transform: it moves nothing in layout, so a
          // style change that only touched the zoom variable needs no re-page.
          // (The sash drags this variable every frame.)
          return (
            styleWithoutZoom(record.oldValue) !==
            styleWithoutZoom(record.target.getAttribute("style"))
          );
        }

        return record.attributeName !== ARTICLE_PAGE_SPLIT_ATTR;
      }

      return [
        ...Array.from(record.addedNodes),
        ...Array.from(record.removedNodes),
      ].some((node) => !isPagedChrome(node));
    });

    if (relevant) {
      schedule();
    }
  });

  mutations.observe(root, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: LAYOUT_ATTRIBUTES,
    childList: true,
    characterData: true,
    subtree: true,
  });

  // Pages have a fixed physical width, so moving the split sash only changes
  // the desk around them. Re-page when the paper itself changed (or the view
  // just became visible); ignore pure pane resizes.
  let pagedWidth = -1;
  const onResize = (): void => {
    const rendered = root.querySelector(RENDERED_SELECTOR) as HTMLElement | null;

    if (rendered && pagedWidth > 0 && rendered.clientWidth === pagedWidth) {
      return;
    }

    schedule();
  };
  const resize =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
  resize?.observe(root);

  root.addEventListener("load", schedule, true);
  document.fonts?.addEventListener?.("loadingdone", schedule);
  const settingsConnection = manager?.changed.connect(schedule);
  schedule();

  widget.disposed.connect(() => {
    settingsConnection?.disconnect();
    if (frame) {
      cancelAnimationFrame(frame);
    }

    mutations.disconnect();
    resize?.disconnect();
    root.removeEventListener("load", schedule, true);
    document.fonts?.removeEventListener?.("loadingdone", schedule);
  });
};

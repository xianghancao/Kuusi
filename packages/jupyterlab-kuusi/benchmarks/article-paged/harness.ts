/**
 * Browser-side benchmark harness for the Article paged layout. It runs the
 * real `paginateArticle` on rendered Markdown and reports timing, DOM-read
 * counts, and layout invariants.
 */
import { marked } from "marked";

import {
  bindArticlePagedLayout,
  paginateArticle,
} from "../../src/articlePaged";
import articleSchema from "../../schema/article.json";
import bookSchema from "../../schema/book.json";
import slidesSchema from "../../schema/markdown-slides.json";
import { articleThemeChrome } from "../../src/articleSettings";
import {
  bookThemeChrome,
  DEFAULT_BOOK_SETTINGS,
} from "../../src/bookSettings";
import {
  DEFAULT_SLIDES_SETTINGS,
  slidesThemeChrome,
} from "../../src/markdownSlides/slidesSettings";
import * as legends from "../../src/optionLegends";
import { bindPaneAutoZoom } from "../../src/renderPaneZoom";
import { applyRenderViewCssZoom } from "../../src/renderViewChrome";
import {
  applyArticleAppearance,
  DEFAULT_ARTICLE_SETTINGS,
  type ArticleSettings,
} from "../../src/articleSettings";
import {
  renderedFlowBlocks,
  scanMarkdownBlocks,
  scanMarkdownBlocksHeuristic,
} from "../../src/articleSourceMap";

import "./base.css";
import "../../style/chrome.css";
import "../../style/article.css";
import "../../style/code.css";
import "../../style/tables.css";
import "../../style/elements.css";

const PAGE_GAP_PX = 28;

type Counters = { rects: number; ranges: number; readMs: number };

const counters: Counters = { rects: 0, ranges: 0, readMs: 0 };

const instrument = (): void => {
  const timed = <T>(fn: () => T, kind: "rects" | "ranges"): T => {
    const start = performance.now();
    const result = fn();
    counters.readMs += performance.now() - start;
    counters[kind] += 1;
    return result;
  };

  const element = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return timed(() => element.call(this), "rects");
  };

  const rangeRect = Range.prototype.getBoundingClientRect;
  Range.prototype.getBoundingClientRect = function (this: Range) {
    return timed(() => rangeRect.call(this), "ranges");
  };

  const rangeRects = Range.prototype.getClientRects;
  Range.prototype.getClientRects = function (this: Range) {
    return timed(() => rangeRects.call(this), "ranges");
  };
};

instrument();

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const squash = (text: string): string => text.replace(/\s+/g, "");

type Invariants = {
  pages: number;
  blocks: number;
  /** Blocks that cross a page boundary though they would fit on one page. */
  straddlers: number;
  /** Blocks that reach into the page margin zones. */
  marginOverflow: number;
  /** Headings left alone at the bottom of a page. */
  strandedHeadings: number;
  /** Text lost or duplicated by splitting. */
  textMatches: boolean;
  /** Average unused height at the bottom of a page (px): packing quality. */
  avgUnusedPx: number;
  /** First few offenders, for debugging. */
  samples: string[];
  /** Where the text first differs after pagination (empty when it matches). */
  textDiff: string;
};

const firstDifference = (before: string, after: string): string => {
  if (before === after) {
    return "";
  }

  let i = 0;

  while (i < before.length && i < after.length && before[i] === after[i]) {
    i += 1;
  }

  return `at ${i}/${before.length}→${after.length}: before="${before.slice(Math.max(0, i - 25), i + 40)}" after="${after.slice(Math.max(0, i - 25), i + 40)}"`;
};

const ATOMIC = "img, svg, canvas, video, figure, mjx-container, .katex-display, .MathJax_Display";

/**
 * Visual fragments of a block: line boxes for text, the box itself for
 * figures. Works the same whether a block was split by JS or by the browser.
 */
const fragmentsOf = (block: HTMLElement): Array<{ top: number; bottom: number }> => {
  if (block.matches(ATOMIC) || block.querySelector(`:scope > ${ATOMIC.split(", ").join(", :scope > ")}`)) {
    const rect = block.getBoundingClientRect();
    return rect.height > 0 ? [{ top: rect.top, bottom: rect.bottom }] : [];
  }

  const range = document.createRange();
  range.selectNodeContents(block);

  return Array.from(range.getClientRects())
    .filter((rect) => rect.height > 0.5 && rect.width > 0.5)
    .map((rect) => ({ top: rect.top, bottom: rect.bottom }));
};

const measureInvariants = (
  rendered: HTMLElement,
  textBefore: string,
): Invariants => {
  const paper = rendered.closest<HTMLElement>(".jp-KuusiArticle-paper")!;
  const paperHeight =
    Number.parseFloat(paper.style.getPropertyValue("--kuusi-article-paper-height")) ||
    0;
  const style = getComputedStyle(rendered);
  const padTop = Number.parseFloat(style.paddingTop) || 0;
  const padBottom = Number.parseFloat(style.paddingBottom) || 0;
  const stride = paperHeight + PAGE_GAP_PX;
  const origin = rendered.getBoundingClientRect().top;
  const blocks = renderedFlowBlocks(rendered);
  let straddlers = 0;
  let marginOverflow = 0;
  let strandedHeadings = 0;
  const samples: string[] = [];
  const perKind = new Map<string, number>();
  const note = (kind: string, block: HTMLElement, detail: string): void => {
    perKind.set(kind, (perKind.get(kind) ?? 0) + 1);

    if ((perKind.get(kind) ?? 0) <= 4) {
      samples.push(
        `${kind} <${block.tagName.toLowerCase()}${block.getAttribute("data-kuusi-split") ? ` split=${block.getAttribute("data-kuusi-split")}` : ""}> ${detail} "${(block.textContent ?? "").slice(0, 30).replace(/\s+/g, " ")}"`,
      );
    }
  };

  const pageOf = (y: number): number => Math.floor(Math.max(0, y) / stride);
  const first = (block: HTMLElement) => fragmentsOf(block)[0];
  const last = (block: HTMLElement) => fragmentsOf(block).slice(-1)[0];

  blocks.forEach((block, index) => {
    let crossed = false;
    let inMargin = false;

    fragmentsOf(block).forEach((fragment) => {
      const top = fragment.top - origin;
      const bottom = fragment.bottom - origin;
      const topPage = pageOf(top + 0.5);

      if (topPage !== pageOf(bottom - 0.5)) {
        crossed = true;
        return;
      }

      const contentTop = topPage * stride + padTop;
      const contentBottom = topPage * stride + paperHeight - padBottom;

      // 3px: the layout snaps within 1.5px and sub-pixel rounding adds a little.
      if (top < contentTop - 3 || bottom > contentBottom + 3) {
        inMargin = true;
      }
    });

    if (crossed) {
      straddlers += 1;
      note("crossing", block, `index=${index}`);
    }

    if (inMargin) {
      marginOverflow += 1;
      note("margin", block, `index=${index}`);
    }

    if (/^H[1-6]$/.test(block.tagName)) {
      const next = blocks[index + 1];
      const heading = last(block);
      const following = next ? first(next) : undefined;

      if (
        heading &&
        following &&
        pageOf(following.top - origin + 0.5) >
          pageOf(heading.bottom - origin - 0.5)
      ) {
        strandedHeadings += 1;
        note("stranded", block, `next=<${next!.tagName.toLowerCase()}>`);
      }
    }
  });

  const sheets = rendered.querySelectorAll(".jp-KuusiArticle-pageSheet").length;

  // Packing quality: how far down each page its content reaches.
  const lowest = new Map<number, number>();

  blocks.forEach((block) => {
    fragmentsOf(block).forEach((fragment) => {
      const bottom = fragment.bottom - origin;
      const page = pageOf(bottom - 0.5);
      lowest.set(page, Math.max(lowest.get(page) ?? 0, bottom - page * stride));
    });
  });

  const contentBottomOffset = paperHeight - padBottom;
  const unused = Array.from(lowest.entries())
    .filter(([page]) => page < sheets - 1)
    .map(([, bottom]) => Math.max(0, contentBottomOffset - bottom));
  const avgUnusedPx = unused.length
    ? Math.round(unused.reduce((a, b) => a + b, 0) / unused.length)
    : 0;

  // Split tables intentionally repeat their header on each page; that is
  // not duplication, so leave continuation headers out of the comparison.
  const contentText = (block: HTMLElement): string => {
    if (block.getAttribute("data-kuusi-split") !== "cont") {
      return block.textContent ?? "";
    }

    const copy = block.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("thead").forEach((head) => head.remove());
    return copy.textContent ?? "";
  };
  const textAfter = squash(blocks.map(contentText).join(""));

  return {
    pages: sheets,
    blocks: blocks.length,
    straddlers,
    marginOverflow,
    strandedHeadings,
    textMatches: textAfter === textBefore,
    avgUnusedPx,
    samples,
    textDiff: firstDifference(textBefore, textAfter),
  };
};

type ScenarioResult = {
  runsMs: number[];
  medianMs: number;
  rectCalls: number;
  rangeCalls: number;
  /** Time spent inside layout-reading calls (forced reflow shows up here). */
  readMs: number;
  invariants: Invariants;
};

const buildArticle = async (
  markdown: string,
  settings: ArticleSettings,
): Promise<{ rendered: HTMLElement; paper: HTMLElement }> => {
  document.body.replaceChildren();
  document.body.dataset.jpThemeLight = "true";
  document.body.className = "jp-ThemedContainer";

  // Same nesting as the real widget: document shell > MarkdownViewer (paper).
  const desk = document.createElement("div");
  desk.className = "jp-Document jp-KuusiMarkdownArticle";
  desk.style.cssText = "width:1200px;height:900px;position:relative";
  const paper = document.createElement("div");
  paper.className = "jp-MarkdownViewer";
  const rendered = document.createElement("div");
  rendered.className = "jp-RenderedHTMLCommon jp-RenderedMarkdown";
  rendered.innerHTML = await marked.parse(markdown);
  paper.appendChild(rendered);
  desk.appendChild(paper);
  document.body.appendChild(desk);
  applyArticleAppearance(paper, settings);

  await Promise.all(
    Array.from(rendered.querySelectorAll("img")).map((img) =>
      img.decode().catch(() => undefined),
    ),
  );
  await document.fonts?.ready;
  await nextFrame();

  return { rendered, paper };
};

const runScenario = async (
  markdown: string,
  settings: ArticleSettings,
  repeats: number,
  pagination?: "js" | "native",
): Promise<ScenarioResult> => {
  (globalThis as { __KUUSI_ARTICLE_PAGINATION?: string }).__KUUSI_ARTICLE_PAGINATION =
    pagination;
  const { rendered } = await buildArticle(markdown, settings);
  const textBefore = squash(
    renderedFlowBlocks(rendered)
      .map((b) => b.textContent ?? "")
      .join(""),
  );

  // Warm-up: fonts, image decode, JIT.
  paginateArticle(rendered, settings, "bench");

  counters.rects = 0;
  counters.ranges = 0;
  counters.readMs = 0;
  const runsMs: number[] = [];

  for (let i = 0; i < repeats; i += 1) {
    const start = performance.now();
    paginateArticle(rendered, settings, "bench");
    runsMs.push(performance.now() - start);
  }

  return {
    runsMs: runsMs.map((ms) => Math.round(ms * 10) / 10),
    medianMs: Math.round(median(runsMs) * 10) / 10,
    rectCalls: Math.round(counters.rects / repeats),
    rangeCalls: Math.round(counters.ranges / repeats),
    readMs: Math.round((counters.readMs / repeats) * 10) / 10,
    invariants: measureInvariants(rendered, textBefore),
  };
};

const pagedSettings = (overrides: Partial<ArticleSettings>): ArticleSettings => ({
  ...DEFAULT_ARTICLE_SETTINGS,
  pageLayout: "paged",
  paperSize: "a4",
  ...overrides,
});

/** Straddler count after each consecutive pagination: is the layout stable? */
const stability = async (markdown: string, runs: number): Promise<number[]> => {
  const settings = pagedSettings({ columns: 1 });
  const { rendered } = await buildArticle(markdown, settings);
  const textBefore = squash(
    renderedFlowBlocks(rendered)
      .map((b) => b.textContent ?? "")
      .join(""),
  );
  const counts: number[] = [];

  for (let i = 0; i < runs; i += 1) {
    paginateArticle(rendered, settings, "bench");
    counts.push(measureInvariants(rendered, textBefore).straddlers);
  }

  return counts;
};

const debugTrace = async (markdown: string): Promise<string[]> => {
  const settings = pagedSettings({ columns: 1 });
  const { rendered } = await buildArticle(markdown, settings);
  (globalThis as unknown as { __DBG: string[] }).__DBG = [];
  paginateArticle(rendered, settings, "bench");
  const out = (globalThis as unknown as { __DBG: string[] }).__DBG;
  (globalThis as unknown as { __DBG?: string[] }).__DBG = undefined;
  return out;
};

let prepared: { rendered: HTMLElement; settings: ArticleSettings } | null = null;

/** Build the article and warm up, so a profiler can wrap just one pass. */
const prepare = async (markdown: string, columns: 1 | 2): Promise<void> => {
  const settings = pagedSettings({ columns });
  const { rendered } = await buildArticle(markdown, settings);
  paginateArticle(rendered, settings, "bench");
  prepared = { rendered, settings };
};

const paginateOnce = (): number => {
  const start = performance.now();
  paginateArticle(prepared!.rendered, prepared!.settings, "bench");
  return performance.now() - start;
};

/** How well do scanned source blocks line up with the rendered elements? */
const mapAccuracy = async (
  markdown: string,
): Promise<Record<string, { blocks: number; elements: number; misaligned: number }>> => {
  const { rendered } = await buildArticle(markdown, pagedSettings({ columns: 1 }));
  const elements = renderedFlowBlocks(rendered);
  const norm = (text: string): string =>
    text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 48);

  const grade = (blocks: ReturnType<typeof scanMarkdownBlocks>) => {
    // When counts agree, every block must pair with the element at the same
    // index: headings must be headings with the same text.
    let misaligned = 0;

    blocks.forEach((block, index) => {
      const element = elements[index];

      if (!element) {
        misaligned += 1;
        return;
      }

      const isHeading = /^H[1-6]$/.test(element.tagName);

      if ((block.heading !== null) !== isHeading) {
        misaligned += 1;
      } else if (
        isHeading &&
        norm(block.heading ?? "") !== norm(element.textContent ?? "")
      ) {
        misaligned += 1;
      }
    });

    return { blocks: blocks.length, elements: elements.length, misaligned };
  };

  return {
    lexer: grade(scanMarkdownBlocks(markdown)),
    heuristic: grade(scanMarkdownBlocksHeuristic(markdown)),
  };
};

/** Native pagination with extra CSS, to see which break rule costs space. */
const experiment = async (
  markdown: string,
  extraCss: string,
): Promise<{ pages: number; unused: number; stranded: number }> => {
  (globalThis as { __KUUSI_ARTICLE_PAGINATION?: string }).__KUUSI_ARTICLE_PAGINATION =
    "native";
  const settings = pagedSettings({ columns: 1 });
  const { rendered } = await buildArticle(markdown, settings);
  const style = document.createElement("style");
  style.textContent = extraCss;
  document.head.appendChild(style);
  const textBefore = squash(
    renderedFlowBlocks(rendered)
      .map((b) => b.textContent ?? "")
      .join(""),
  );
  paginateArticle(rendered, settings, "bench");
  const inv = measureInvariants(rendered, textBefore);
  style.remove();

  return { pages: inv.pages, unused: inv.avgUnusedPx, stranded: inv.strandedHeadings };
};

/**
 * Drag the split sash: the desk narrows frame by frame while the pane-fit
 * zoom follows. Counts how often the paper is re-paged and how long frames take.
 */
const sashDrag = async (
  markdown: string,
  pagination: "js" | "native",
): Promise<{
  frames: number;
  repages: number;
  avgFrameMs: number;
  maxFrameMs: number;
  zoomSteps: number;
  finalZoom: number;
}> => {
  (globalThis as { __KUUSI_ARTICLE_PAGINATION?: string }).__KUUSI_ARTICLE_PAGINATION =
    pagination;
  const settings = pagedSettings({ columns: 1 });
  const { rendered, paper } = await buildArticle(markdown, settings);
  const desk = paper.parentElement as HTMLElement;
  let repages = 0;

  new MutationObserver((records) => {
    if (
      records.some((record) =>
        Array.from(record.addedNodes).some(
          (node) =>
            node instanceof HTMLElement &&
            node.classList.contains("jp-KuusiArticle-pageSheet"),
        ),
      )
    ) {
      repages += 1;
    }
  }).observe(rendered, { childList: true });

  bindArticlePagedLayout(
    {
      node: desk,
      isDisposed: false,
      disposed: { connect: () => undefined },
    } as never,
    undefined,
    () => "bench",
  );
  await nextFrame();
  await nextFrame();
  repages = 0;

  let zoom = 100;
  let zoomSteps = 0;
  const pane = bindPaneAutoZoom(
    desk,
    () => zoom,
    (next) => {
      zoom = next;
      zoomSteps += 1;
      applyRenderViewCssZoom(rendered, next, null, { inMotion: true });
    },
  );
  await nextFrame();

  const frames = 90;
  const durations: number[] = [];
  let last = performance.now();

  for (let i = 0; i < frames; i += 1) {
    // 1200px → ~480px wide, a typical sash drag across the pane.
    desk.style.width = `${1200 - Math.round((i / frames) * 720)}px`;
    await nextFrame();
    const now = performance.now();
    durations.push(now - last);
    last = now;
  }

  await nextFrame();
  await nextFrame();
  pane.dispose();

  return {
    frames,
    repages,
    avgFrameMs: Math.round((durations.reduce((a, b) => a + b, 0) / frames) * 10) / 10,
    maxFrameMs: Math.round(Math.max(...durations) * 10) / 10,
    zoomSteps,
    finalZoom: zoom,
  };
};

/** Every option legend in a grid, for a visual check. */
const legendGallery = (): void => {
  document.body.replaceChildren();
  document.body.dataset.jpThemeLight = "true";
  const groups: Array<[string, Array<[string, HTMLElement]>]> = [
    ["layout", ["scroll", "paged"].map((v) => [v, legends.legendPageLayout(v)] as [string, HTMLElement])],
    ["paper size", ["a4", "letter"].map((v) => [v, legends.legendPaperSize(v)] as [string, HTMLElement])],
    ["orientation", ["portrait", "landscape"].map((v) => [v, legends.legendPaperOrientation(v)] as [string, HTMLElement])],
    ["columns", ["1", "2"].map((v) => [v, legends.legendColumns(v)] as [string, HTMLElement])],
    ["number format", ["none", "page", "page-of-total"].map((v) => [v, legends.legendPageNumberFormat(v)] as [string, HTMLElement])],
    ["number start", ["first", "second"].map((v) => [v, legends.legendPageNumberStart(v)] as [string, HTMLElement])],
    ["number position", ["header", "footer"].map((v) => [v, legends.legendPageNumberPosition(v)] as [string, HTMLElement])],
    ["align", ["left", "center", "right", "justify"].map((v) => [v, legends.legendAlign(v)] as [string, HTMLElement])],
    ["image align", ["left", "center", "right"].map((v) => [v, legends.legendImageAlign(v)] as [string, HTMLElement])],
    ["image wrap", ["none", "left", "right"].map((v) => [v, legends.legendImageWrap(v)] as [string, HTMLElement])],
    ["image width", ["natural", "wide", "full"].map((v) => [v, legends.legendImageWidth(v)] as [string, HTMLElement])],
    ["image border", ["none", "solid", "dashed", "dotted", "double"].map((v) => [v, legends.legendImageBorder(v)] as [string, HTMLElement])],
    ["link", ["default", "underline", "accent"].map((v) => [v, legends.legendLinkStyle(v)] as [string, HTMLElement])],
    ["list", ["compact", "normal", "relaxed"].map((v) => [v, legends.legendListStyle(v)] as [string, HTMLElement])],
    ["table", ["plain", "grid", "lines", "banded", "booktabs", "ruled"].map((v) => [v, legends.legendTableStyle(v)] as [string, HTMLElement])],
    ["quote", ["light", "normal", "strong"].map((v) => [v, legends.legendRuleWeight("quote", v)] as [string, HTMLElement])],
    ["rule", ["light", "normal", "strong"].map((v) => [v, legends.legendRuleWeight("rule", v)] as [string, HTMLElement])],
  ];
  const root = document.createElement("div");
  root.style.cssText =
    "font:12px system-ui;padding:16px;display:grid;grid-template-columns:repeat(2,1fr);gap:10px 24px;width:1000px;color:#212121;background:#fff";

  groups.forEach(([name, items]) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:10px;border-bottom:1px solid #eee;padding:4px 0";
    const title = document.createElement("b");
    title.textContent = name;
    title.style.cssText = "width:110px";
    row.appendChild(title);
    items.forEach(([value, legend]) => {
      const cell = document.createElement("div");
      cell.style.cssText =
        "display:flex;flex-direction:column;align-items:center;gap:2px;min-width:54px;padding:4px;border:1px solid #ddd;border-radius:6px;color:#616161";
      cell.appendChild(legend);
      const text = document.createElement("span");
      text.textContent = value;
      text.style.cssText = "font-size:10px";
      cell.appendChild(text);
      row.appendChild(cell);
    });
    root.appendChild(row);
  });

  document.body.appendChild(root);
};

/**
 * Fresh settings must not look "customized": every default must equal what its
 * own theme preset would apply. Returns the keys where they differ.
 */
const defaultsVersusPresets = (): Record<string, string[]> => {
  const diff = (
    defaults: Record<string, unknown>,
    preset: Record<string, unknown>,
  ): string[] =>
    Object.keys(preset).filter(
      (key) => JSON.stringify(defaults[key]) !== JSON.stringify(preset[key]),
    );

  return {
    article: diff(
      DEFAULT_ARTICLE_SETTINGS as unknown as Record<string, unknown>,
      articleThemeChrome(DEFAULT_ARTICLE_SETTINGS.theme) as Record<string, unknown>,
    ),
    book: diff(
      DEFAULT_BOOK_SETTINGS as unknown as Record<string, unknown>,
      bookThemeChrome(DEFAULT_BOOK_SETTINGS.theme) as Record<string, unknown>,
    ),
    slides: diff(
      DEFAULT_SLIDES_SETTINGS as unknown as Record<string, unknown>,
      slidesThemeChrome(DEFAULT_SLIDES_SETTINGS.theme) as Record<string, unknown>,
    ),
  };
};

/**
 * JupyterLab builds a view's settings from the JSON schema defaults, while the
 * code falls back to its own DEFAULT_* constants. They must agree, or "default"
 * means two different things. Returns keys whose defaults differ.
 */
const defaultsVersusSchema = (): Record<string, string[]> => {
  const compare = (
    schema: { properties: Record<string, { default?: unknown }> },
    defaults: Record<string, unknown>,
  ): string[] =>
    Object.keys(defaults)
      // `codeFrame` is deliberately left unset in the schema ("follow the code
      // style"), so a missing default there is not a mismatch.
      .filter((key) => key in schema.properties && key !== "codeFrame")
      .filter(
        (key) =>
          JSON.stringify(schema.properties[key]!.default) !==
          JSON.stringify(defaults[key]),
      )
      .map(
        (key) =>
          `${key}: schema ${JSON.stringify(schema.properties[key]!.default)} vs code ${JSON.stringify(defaults[key])}`,
      );

  return {
    article: compare(articleSchema as never, DEFAULT_ARTICLE_SETTINGS as never),
    book: compare(bookSchema as never, DEFAULT_BOOK_SETTINGS as never),
    slides: compare(slidesSchema as never, DEFAULT_SLIDES_SETTINGS as never),
  };
};

(window as unknown as { __bench: unknown }).__bench = {
  defaultsVersusSchema,
  defaultsVersusPresets,
  legendGallery,
  sashDrag,
  experiment,
  mapAccuracy,
  prepare,
  paginateOnce,
  debugTrace,
  stability,
  async run(
    markdown: string,
    repeats: number,
  ): Promise<Record<string, ScenarioResult>> {
    return {
      single: await runScenario(markdown, pagedSettings({ columns: 1 }), repeats, "js"),
      native: await runScenario(markdown, pagedSettings({ columns: 1 }), repeats, "native"),
      dual: await runScenario(markdown, pagedSettings({ columns: 2 }), repeats),
    };
  },
};

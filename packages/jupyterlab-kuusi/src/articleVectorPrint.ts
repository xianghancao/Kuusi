import type { IDocumentWidget } from "@jupyterlab/docregistry";

import { PAGE_GAP_PX } from "./articlePaged";
import { contentHeadings } from "./articleStructure";
import type { PdfBookmark, PdfLinkRect, PdfPageLinks } from "./pdfBookmarks";

/** Classes the scoped Article selectors hang off (`.jp-Document.jp-KuusiMarkdownArticle …`). */
const SCOPE_CLASS = /^(jp-Kuusi|jp-Document$)/;
const PAGE_CLASS = "kuusi-vector-page";
const RENDERED = ":is(.jp-RenderedMarkdown, .jp-RenderedMySTMarkdown)";

type PagedArticle = {
  desk: HTMLElement;
  pages: HTMLElement;
  sheets: HTMLElement[];
};

const findPagedArticle = (widget: IDocumentWidget): PagedArticle | null => {
  const desk = widget.node.querySelector<HTMLElement>(
    ".jp-KuusiArticle-paper:not(.jp-KuusiArticle-pagerClone)",
  );
  const pages = desk?.querySelector<HTMLElement>(RENDERED);

  if (!desk || !pages) {
    return null;
  }

  const sheets = Array.from(
    pages.querySelectorAll<HTMLElement>(
      ":scope > .jp-KuusiArticle-pageSheet",
    ),
  );

  return sheets.length > 0 ? { desk, pages, sheets } : null;
};

/** True when the open view is a paged Article that can print page by page. */
/** The Article's headings as PDF bookmarks (titles with their heading numbers). */
export const collectArticleOutline = (
  widget: IDocumentWidget,
): PdfBookmark[] | null => {
  const article = findPagedArticle(widget);

  if (!article) {
    return null;
  }

  const headings = contentHeadings(article.pages);
  const levels = headings.map((h) => Number(h.tagName.slice(1)));
  const base = levels.length > 0 ? Math.min(...levels) : 1;

  return headings.flatMap((heading, index) => {
    const title = (heading.textContent ?? "")
      .replace(/¶\s*$/u, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!title) {
      return [];
    }

    const number = heading.getAttribute("data-kuusi-num");

    return [
      {
        title: number ? `${number}  ${title}` : title,
        level: levels[index] - base + 1,
        anchor: `kuusi-h-${index}`,
      },
    ];
  });
};

export const articleVectorPdfAvailable = (widget: IDocumentWidget): boolean =>
  findPagedArticle(widget) !== null;

/** Offset of `el` from `ancestor`'s padding box, in layout px (zoom-free). */
const offsetWithin = (
  el: HTMLElement,
  ancestor: HTMLElement,
): { x: number; y: number } => {
  let x = 0;
  let y = 0;

  for (
    let node: Element | null = el;
    node instanceof HTMLElement && node !== ancestor;
    node = node.offsetParent
  ) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }

  return { x, y };
};

const styleSheetsHtml = (): string =>
  Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return `<style>${Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n")}</style>`;
      } catch {
        // Cross-origin sheet: link it instead.
        return sheet.ownerNode instanceof Element
          ? sheet.ownerNode.outerHTML
          : "";
      }
    })
    .join("\n");

/**
 * Names for the Chinese fallback fonts. When a page falls back to a font by
 * itself, the system may pick one of its hidden fonts (names starting with a
 * dot), which the PDF writer cannot embed: the Han characters then print
 * blank. Naming a real font in the stack avoids that.
 */
const CJK_FALLBACK =
  '"PingFang SC", "Hiragino Sans GB", "Heiti SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC"';

/** Fonts a PDF can embed as real text (the system UI font cannot be). */
const PRINT_FONTS = `Arial, "Helvetica Neue", Helvetica, ${CJK_FALLBACK}, sans-serif`;

const addCjkFallbacks = (el: HTMLElement): void => {
  const names: string[] = [];
  for (let i = 0; i < el.style.length; i += 1) {
    const name = el.style[i];
    if (name.startsWith("--") && name.endsWith("font-family")) {
      names.push(name);
    }
  }

  names.forEach((name) => {
    const value = el.style.getPropertyValue(name).trim();
    if (value && !value.includes("PingFang SC")) {
      el.style.setProperty(name, `${value}, ${CJK_FALLBACK}`);
    }
  });
};

const escapeAttr = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * Pages are positioned on one tall flow, so each printed page is a clone of
 * the flow shifted up by a whole number of page strides and clipped to one
 * sheet. Blocks far from the page become empty boxes of the same size and
 * spacing, so a long document does not copy its text once per page while the
 * column fragmentation (and so every position) stays as on screen.
 */
/**
 * Make a cloned block's in-document jumps work in the PDF: contents rows
 * become real links to their heading's id (headings without one get one).
 */
const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";
const TOC_ROW = ".jp-KuusiArticle-tocRow";

const linkClone = (
  live: HTMLElement,
  clone: HTMLElement,
  anchors: Map<Element, string>,
  targets: string[],
  startsOnThisPage: (heading: HTMLElement) => boolean,
): Node => {
  const livePairs: HTMLElement[] = [
    ...(live.matches(HEADING_SELECTOR) ? [live] : []),
    ...Array.from(live.querySelectorAll<HTMLElement>(HEADING_SELECTOR)),
  ];
  const clonePairs: HTMLElement[] = [
    ...(clone.matches(HEADING_SELECTOR) ? [clone] : []),
    ...Array.from(clone.querySelectorAll<HTMLElement>(HEADING_SELECTOR)),
  ];
  // An empty inline marker at the start of each heading carries the
  // destination (inside the heading, so a forced page break before it cannot
  // leave the marker on the previous page; the heading keeps its own id).
  livePairs.forEach((heading, index) => {
    const anchor = anchors.get(heading);
    const copy = clonePairs[index];

    // One destination per heading: only the clone of the page it starts on
    // (a block that is copied into several page clones would repeat the id).
    if (!anchor || !copy || !startsOnThisPage(heading)) {
      return;
    }

    const marker = document.createElement("span");
    marker.id = anchor;
    marker.setAttribute("aria-hidden", "true");
    marker.style.cssText =
      "display:inline-block;width:0;height:0;overflow:hidden;vertical-align:top;";
    copy.insertBefore(marker, copy.firstChild);
  });

  const toLink = (row: HTMLElement): HTMLElement => {
    const anchor = targets[Number(row.dataset.heading)];
    if (!anchor) {
      return row;
    }

    const link = document.createElement("a");
    Array.from(row.attributes).forEach((attr) => {
      if (attr.name !== "role" && attr.name !== "tabindex") {
        link.setAttribute(attr.name, attr.value);
      }
    });
    link.setAttribute("href", `#${anchor}`);
    while (row.firstChild) {
      link.appendChild(row.firstChild);
    }
    return link;
  };

  if (clone.matches(TOC_ROW)) {
    return toLink(clone);
  }

  clone.querySelectorAll<HTMLElement>(TOC_ROW).forEach((row) => {
    row.replaceWith(toLink(row));
  });

  return clone;
};

const clonePageContent = (
  pages: HTMLElement,
  sheet: HTMLElement,
  pageTop: number,
  pageHeight: number,
  target: HTMLElement,
  anchors: Map<Element, string>,
  targets: string[],
): void => {
  const cs = getComputedStyle(pages);
  const singleColumn = cs.columnCount === "auto" || cs.columnCount === "1";
  const slack = 8;
  const origin = pages.getBoundingClientRect();
  const scale = origin.width / (pages.offsetWidth || 1) || 1;
  // Layout-px span of a block's fragments (offsetTop/Height only see the
  // first fragment of a block that continues on the next page).
  const spanOf = (el: HTMLElement): { top: number; bottom: number; pieces: number } => {
    const rects = Array.from(el.getClientRects());
    const first = rects[0] ?? el.getBoundingClientRect();
    const last = rects[rects.length - 1] ?? first;

    return {
      top: (first.top - origin.top) / scale,
      bottom: (last.bottom - origin.top) / scale,
      pieces: rects.length,
    };
  };
  const startsOnThisPage = (heading: HTMLElement): boolean => {
    const top = spanOf(heading).top;
    return top >= pageTop - 1 && top < pageTop + pageHeight;
  };

  for (const child of Array.from(pages.childNodes)) {
    if (!(child instanceof HTMLElement)) {
      target.appendChild(child.cloneNode(true));
      continue;
    }

    if (child.classList.contains("jp-KuusiArticle-pageSheet")) {
      if (child === sheet) {
        target.appendChild(child.cloneNode(true));
      }
      continue;
    }

    const style = getComputedStyle(child);
    const flows =
      singleColumn &&
      (style.position === "static" || style.position === "relative") &&
      style.display !== "none";

    if (!flows) {
      target.appendChild(
        linkClone(
          child,
          child.cloneNode(true) as HTMLElement,
          anchors,
          targets,
          startsOnThisPage,
        ),
      );
      continue;
    }

    const { top, bottom, pieces } = spanOf(child);
    const near =
      pieces > 1 ||
      (top < pageTop + pageHeight + slack && bottom > pageTop - slack);

    if (near) {
      target.appendChild(
        linkClone(
          child,
          child.cloneNode(true) as HTMLElement,
          anchors,
          targets,
          startsOnThisPage,
        ),
      );
    } else {
      // Same tag and classes, so the break rules (keep headings with the next
      // block, orphans, widows) fragment it as on screen; no content.
      const hollow = child.cloneNode(false) as HTMLElement;
      hollow.removeAttribute("id");
      hollow.setAttribute("aria-hidden", "true");
      hollow.style.cssText =
        "display:block;box-sizing:border-box;min-height:0;padding:0;border:0;" +
        `height:${child.offsetHeight}px;` +
        `margin:${style.marginTop} 0 ${style.marginBottom} 0;`;
      target.appendChild(hollow);
    }
  }
};

const buildPrintHtml = (
  article: PagedArticle,
  title: string,
): { html: string; width: number; height: number } | null => {
  const { desk, pages, sheets } = article;
  const first = sheets[0];
  const width = first.offsetWidth;
  const height = first.offsetHeight;

  if (width <= 0 || height <= 0) {
    return null;
  }

  const stride = height + PAGE_GAP_PX;
  // Anchor id per heading, in the order the contents rows count them.
  const anchors = new Map<Element, string>();
  const targets = contentHeadings(pages).map((heading, index) => {
    const id = `kuusi-h-${index}`;
    anchors.set(heading, id);
    return id;
  });
  const origin = offsetWithin(first, desk);
  const deskWidth = desk.clientWidth;
  const wrappers = [] as string[];

  // Ancestors above the desk only matter for their Kuusi classes.
  const outer: string[] = [];
  for (
    let node = desk.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const classes = Array.from(node.classList).filter((c) =>
      SCOPE_CLASS.test(c),
    );
    if (classes.length > 0) {
      outer.unshift(classes.join(" "));
    }
  }

  const chain: HTMLElement[] = [];
  for (let node: HTMLElement | null = pages; node; node = node.parentElement) {
    chain.unshift(node);
    if (node === desk) {
      break;
    }
  }

  sheets.forEach((sheet, index) => {
    const page = document.createElement("div");
    page.className = PAGE_CLASS;
    page.style.cssText =
      `width:${width}px;height:${height}px;overflow:hidden;position:relative;` +
      "flex:none;";

    let parent: HTMLElement = page;
    outer.forEach((classes) => {
      const wrapper = document.createElement("div");
      wrapper.className = classes;
      wrapper.style.cssText = `position:relative;width:${width}px;height:${height}px;`;
      parent.appendChild(wrapper);
      parent = wrapper;
    });

    const pageTop = sheet.offsetTop;
    chain.forEach((node, depth) => {
      const copy = node.cloneNode(false) as HTMLElement;
      copy.removeAttribute("id");

      if (depth === 0) {
        copy.dataset.kuusiArticleFullscreen = "0";
        copy.dataset.kuusiArticlePageScroll = "vertical";
        copy.style.cssText +=
          `;position:absolute;left:${-origin.x}px;` +
          `top:${-origin.y - index * stride}px;width:${deskWidth}px;` +
          "height:auto;overflow:visible;margin:0;transform:none;" +
          "display:block;contain:none;";
        addCjkFallbacks(copy);
      }

      parent.appendChild(copy);
      parent = copy;
    });

    parent.style.setProperty("transform", "none", "important");
    parent.style.setProperty("contain", "none", "important");
    parent.style.setProperty("--kuusi-render-zoom", "1");
    clonePageContent(pages, sheet, pageTop, height, parent, anchors, targets);
    wrappers.push(page.outerHTML);
  });

  const root = document.documentElement;
  const attrs = Array.from(root.attributes)
    .map((a) => `${a.name}="${escapeAttr(a.value)}"`)
    .join(" ");
  const html =
    `<!doctype html><html ${attrs}><head><meta charset="utf-8">` +
    `<title>${escapeAttr(title)}</title><base href="${escapeAttr(location.href)}">` +
    styleSheetsHtml() +
    "<style>" +
    "html,body{margin:0;height:auto!important;overflow:visible!important;" +
    "-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    "body{background:#e8e8e8!important;padding:24px 0}" +
    // macOS prints the system UI font (San Francisco) as outlines: no selectable
    // text and a larger file. Name embeddable fonts instead.
    `html,body{--jp-content-font-family:${PRINT_FONTS}!important;--jp-ui-font-family:${PRINT_FONTS}!important}` +
    `.${PAGE_CLASS}{margin:0 auto 24px!important;box-shadow:0 1px 6px rgb(0 0 0 / 25%)}` +
    `.${PAGE_CLASS} .jp-KuusiArticle-pageSheet{box-shadow:none!important;clip-path:none!important}` +
    `.${PAGE_CLASS} a.jp-KuusiArticle-tocRow,.${PAGE_CLASS} a.jp-KuusiArticle-tocRow *{color:inherit!important;text-decoration:none!important}` +
    `@media print{@page{size:${width}px ${height}px;margin:0}` +
    "body{background:#fff!important;padding:0}" +
    `.${PAGE_CLASS}{margin:0!important;box-shadow:none;break-after:page;page-break-after:always}` +
    `.${PAGE_CLASS}:last-child{break-after:auto;page-break-after:auto}}` +
    `</style></head><body class="${escapeAttr(document.body.className)}">` +
    wrappers.join("") +
    "</body></html>";

  return { html, width, height };
};

const waitForPrintAssets = async (doc: Document): Promise<void> => {
  const images = Array.from(doc.images).filter((img) => !img.complete);
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
  await doc.fonts?.ready;
};

/**
 * The paged Article as one standalone HTML document: every page as laid out
 * on screen, contents rows and heading links working, printable page by page.
 * Null when the view has no pages.
 */
export const buildArticlePagesHtml = (
  widget: IDocumentWidget,
  title: string,
): string | null => {
  const article = findPagedArticle(widget);
  return article ? (buildPrintHtml(article, title)?.html ?? null) : null;
};

/**
 * Print the paged Article exactly as laid out on screen, as real text (the
 * system dialog's “Save as PDF” keeps it selectable). Resolves false when the
 * view has no pages to print.
 */
export const printArticleVector = async (
  widget: IDocumentWidget,
  title: string,
): Promise<boolean> => {
  const article = findPagedArticle(widget);
  const built = article ? buildPrintHtml(article, title) : null;

  if (!built) {
    return false;
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${built.width}px;height:${built.height}px;border:0;visibility:hidden;`;
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = frame.contentDocument;

  if (!win || !doc) {
    frame.remove();
    return false;
  }

  const previousTitle = document.title;
  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    document.title = previousTitle;
    frame.remove();
  };

  doc.open();
  doc.write(built.html);
  doc.close();

  await waitForPrintAssets(doc);
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  // The saved file name follows the top-level title in most browsers.
  document.title = title;
  win.addEventListener("afterprint", cleanup, { once: true });
  win.focus();
  win.print();
  window.setTimeout(cleanup, 120_000);
  return true;
};

/**
 * Where every link sits on each printed page (px from the page's top-left),
 * measured on the same page-by-page document that gets printed. Used to put
 * clickable links back into a saved PDF that lost or never had them.
 */
export const measurePrintLinks = async (
  widget: IDocumentWidget,
): Promise<PdfPageLinks | null> => {
  const article = findPagedArticle(widget);
  const built = article ? buildPrintHtml(article, "links") : null;

  if (!built) {
    return null;
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${built.width + 80}px;height:${built.height}px;border:0;visibility:hidden;`;
  document.body.appendChild(frame);

  try {
    const doc = frame.contentDocument;

    if (!doc) {
      return null;
    }

    doc.open();
    doc.write(built.html);
    doc.close();
    await waitForPrintAssets(doc);
    await new Promise((resolve) => window.setTimeout(resolve, 100));

    const pages = Array.from(
      doc.querySelectorAll<HTMLElement>(`.${PAGE_CLASS}`),
    ).map((page) => {
      const origin = page.getBoundingClientRect();
      const links: PdfLinkRect[] = [];

      page.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
        const href = a.getAttribute("href") ?? "";
        const target = href.startsWith("#kuusi-h-")
          ? { anchor: href.slice(1) }
          : /^(https?:|mailto:)/i.test(href)
            ? { uri: a.href }
            : null;

        if (!target) {
          return;
        }

        Array.from(a.getClientRects()).forEach((r) => {
          if (r.width > 1 && r.height > 1) {
            links.push({
              x: r.left - origin.left,
              y: r.top - origin.top,
              width: r.width,
              height: r.height,
              ...target,
            });
          }
        });
      });

      return links;
    });

    return { widthPx: built.width, heightPx: built.height, pages };
  } finally {
    frame.remove();
  }
};

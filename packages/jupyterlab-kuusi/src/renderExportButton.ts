import type { JupyterFrontEnd } from "@jupyterlab/application";
import { Notification, type IToolbarWidgetRegistry } from "@jupyterlab/apputils";
import { PathExt } from "@jupyterlab/coreutils";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import type { Contents } from "@jupyterlab/services";
import { Widget } from "@lumino/widgets";

import {
  FACTORY_KUUSI_MARKDOWN_BOOK,
  FACTORY_KUUSI_MARKDOWN_MIND_MAP,
  FACTORY_KUUSI_MARKDOWN_SLIDES,
  FACTORY_KUUSI_NOTEBOOK,
  FACTORY_KUUSI_NOTEBOOK_ARTICLE,
  FACTORY_KUUSI_NOTEBOOK_BOOK,
  FACTORY_KUUSI_NOTEBOOK_SLIDES,
  FACTORY_MARKDOWN_PREVIEW,
} from "./defaultOpeners/constants";
import {
  ARTICLE_PAGE_BREAK_CLASS,
} from "./articlePaged";
import {
  closeKuusiDropdownMenus,
  openKuusiDropdownMenu,
} from "./formatToolbar";
import { createKuusiTranslator, type KuusiTranslator } from "./kuusiI18n";
import { scheduleDocumentToolbarRelayout } from "./documentToolbarLayout";
import {
  ensureKuusiRenderViewSwitcherOnToolbar,
  KUUSI_RENDER_VIEW_SWITCHER_ITEM,
} from "./kuusiRenderViewSwitcher";
import { MarkdownSlidesDocumentWidget } from "./markdownSlides/markdownSlidesWidget";
import {
  exportRenderedImage,
  exportRenderedPdf,
  RASTER_IMAGE_FORMATS,
  RASTER_IMAGE_LABELS,
  triggerDownload,
} from "./renderRasterExport";

export const KUUSI_RENDER_EXPORT_ITEM = "kuusi-render-export";

const MIND_MAP_FACTORIES = new Set([
  FACTORY_KUUSI_NOTEBOOK,
  FACTORY_KUUSI_MARKDOWN_MIND_MAP,
]);

const SLIDES_FACTORIES = new Set([
  FACTORY_KUUSI_MARKDOWN_SLIDES,
  FACTORY_KUUSI_NOTEBOOK_SLIDES,
]);

const imageScopeFor = (factoryName: string, t: KuusiTranslator): string =>
  SLIDES_FACTORIES.has(factoryName)
    ? t.exportScopeSlide()
    : MIND_MAP_FACTORIES.has(factoryName)
      ? t.exportScopeMindMap()
      : t.exportScopeView();

const HTML_EXPORT_FACTORIES = new Set([
  FACTORY_MARKDOWN_PREVIEW,
  FACTORY_KUUSI_MARKDOWN_BOOK,
  FACTORY_KUUSI_MARKDOWN_SLIDES,
  FACTORY_KUUSI_NOTEBOOK_ARTICLE,
  FACTORY_KUUSI_NOTEBOOK_BOOK,
  FACTORY_KUUSI_NOTEBOOK_SLIDES,
]);

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const collectDocumentStyles = (): string =>
  Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
    .map((node) => node.outerHTML)
    .join("\n");

const findRenderedRoot = (root: HTMLElement): HTMLElement | null => {
  const selectors = [
    ".jp-KuusiNotebookMindMap-scene",
    ".jp-KuusiMarkdownSlides-exportDeck",
    ".jp-RenderedMarkdown, .jp-RenderedMySTMarkdown",
    ".jp-KuusiNotebookArticle .jp-Notebook",
    ".jp-Notebook",
  ];

  for (const selector of selectors) {
    const node = root.querySelector(selector);

    if (node instanceof HTMLElement) {
      return node;
    }
  }

  return null;
};

const resolveExportRoot = async (
  widget: IDocumentWidget,
): Promise<HTMLElement | null> => {
  if (widget instanceof MarkdownSlidesDocumentWidget) {
    return widget.content.buildExportRoot();
  }

  return findRenderedRoot(widget.node);
};

const findExportHost = (root: HTMLElement): HTMLElement => {
  const host =
    root.closest(".jp-KuusiBook-paper") ??
    root.closest(".jp-KuusiMarkdownBook") ??
    root.closest(".jp-KuusiNotebookBook") ??
    root.closest(".jp-KuusiArticle-paper") ??
    root.closest(".jp-KuusiMarkdownArticle") ??
    root.closest(".jp-KuusiMarkdownSlidesDocument") ??
    root.closest(".jp-KuusiMarkdownSlides") ??
    (root.classList.contains("jp-KuusiMarkdownSlides-exportDeck")
      ? root
      : null) ??
    root.closest(".jp-KuusiNotebookArticle") ??
    root.closest(".jp-KuusiNotebookMindMap");

  return host instanceof HTMLElement ? host : root;
};

/** Strip UI chrome from the cloned tree so print only keeps content. */
const stripExportChrome = (clone: HTMLElement): void => {
  // Keep article page sheets so paged layout survives print/HTML export;
  // only drop the visual break spacers between sheets.
  clone
    .querySelectorAll(`.${ARTICLE_PAGE_BREAK_CLASS}`)
    .forEach((node) => node.remove());

  clone
    .querySelectorAll(
      [
        ".jp-KuusiArticle-header",
        ".jp-KuusiBook-header",
        ".jp-KuusiSlides-header",
        ".jp-KuusiMarkdownSlides-nav",
        ".jp-KuusiNotebookMindMap-header",
        ".jp-KuusiRenderChrome",
        ".jp-KuusiToolbarCluster",
        ".jp-Toolbar",
        ".jp-KuusiFormatDropdown-menu",
        ".jp-InputArea-prompt",
        ".jp-Cell-promptContainer",
        ".jp-Collapser",
        ".jp-OutputPrompt",
      ].join(", "),
    )
    .forEach((node) => node.remove());
};

/**
 * Print-only stylesheet: page size from Article paper setting (A4 / Letter),
 * reading styles on white paper, no desk/chrome. Complements Lab CSS copied
 * into the window.
 */
const printExportCss = (pageSize: "A4" | "letter" = "A4"): string => `
@page {
  size: ${pageSize};
  margin: 18mm 16mm;
}

html, body {
  margin: 0 !important;
  padding: 0 !important;
  background: #fff !important;
  color: #111 !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.jp-KuusiExportPrint {
  background: #fff !important;
  color: #111 !important;
  min-height: 0 !important;
}

.jp-KuusiExportPrint .jp-KuusiArticle-header,
.jp-KuusiExportPrint .jp-KuusiBook-header,
.jp-KuusiExportPrint .jp-KuusiSlides-header,
.jp-KuusiExportPrint .jp-KuusiMarkdownSlides-nav,
.jp-KuusiExportPrint .jp-KuusiBook-nav,
.jp-KuusiExportPrint .jp-KuusiNotebookMindMap-header,
.jp-KuusiExportPrint .jp-KuusiRenderChrome,
.jp-KuusiExportPrint .jp-KuusiToolbarCluster,
.jp-KuusiExportPrint .jp-Toolbar,
.jp-KuusiExportPrint .jp-KuusiFormatDropdown-menu,
.jp-KuusiExportPrint .jp-InputArea-prompt,
.jp-KuusiExportPrint .jp-Cell-promptContainer,
.jp-KuusiExportPrint .jp-Collapser,
.jp-KuusiExportPrint .jp-OutputPrompt {
  display: none !important;
}

/* Article / notebook article: fill the printable page, drop desk chrome. */
.jp-KuusiExportPrint.jp-KuusiMarkdownArticle,
.jp-KuusiExportPrint .jp-KuusiMarkdownArticle,
.jp-KuusiExportPrint.jp-KuusiNotebookArticle,
.jp-KuusiExportPrint .jp-KuusiNotebookArticle {
  --kuusi-article-desk: #ffffff;
  --kuusi-article-page-bg: #ffffff;
  --kuusi-article-page-fg: #111111;
  --kuusi-article-measure: 100%;
  --kuusi-article-padding: 0;
  --kuusi-article-pattern-color: transparent;
  background: #fff !important;
  color: #111 !important;
  overflow: visible !important;
  position: static !important;
}

.jp-KuusiExportPrint .jp-MarkdownViewer,
.jp-KuusiExportPrint .jp-MarkdownViewer-Document,
.jp-KuusiExportPrint .jp-Notebook,
.jp-KuusiExportPrint .jp-NotebookPanel-notebook {
  background: #fff !important;
  box-shadow: none !important;
  margin: 0 !important;
  max-width: none !important;
  min-height: 0 !important;
  overflow: visible !important;
  padding: 0 !important;
  width: 100% !important;
}

.jp-KuusiExportPrint .jp-RenderedMarkdown,
.jp-KuusiExportPrint .jp-RenderedMySTMarkdown,
.jp-KuusiExportPrint .jp-MarkdownViewer .jp-RenderedHTMLCommon {
  background: #fff !important;
  box-shadow: none !important;
  color: var(--kuusi-article-body-color, #111) !important;
  font-family: var(--kuusi-article-font-family, var(--jp-content-font-family));
  font-size: var(--kuusi-article-font-size, 11pt);
  line-height: var(--kuusi-article-line-height, 1.6);
  margin: 0 auto !important;
  max-width: none !important;
  padding: 0 !important;
  width: 100% !important;
}

/* Preserve Article paged sheets as print pages. */
.jp-KuusiExportPrint .jp-KuusiArticle-pageSheet {
  background: #fff !important;
  box-shadow: none !important;
  break-after: page;
  margin: 0 0 0 !important;
  max-width: none !important;
  min-height: 0 !important;
  overflow: visible !important;
  page-break-after: always;
  padding: 0 !important;
  width: 100% !important;
}

.jp-KuusiExportPrint .jp-KuusiArticle-pageSheet:last-child {
  break-after: auto;
  page-break-after: auto;
}

.jp-KuusiExportPrint .jp-KuusiArticle-pageBand,
.jp-KuusiExportPrint .jp-KuusiArticle-pageBreak {
  display: none !important;
}

/* Book facing-pages layout in print/HTML export (2-up columns). */
.jp-KuusiExportPrint .jp-KuusiBook-paper .jp-RenderedMarkdown,
.jp-KuusiExportPrint .jp-KuusiMarkdownBook .jp-RenderedMarkdown,
.jp-KuusiExportPrint .jp-KuusiNotebookBook .jp-RenderedMarkdown {
  column-count: var(--kuusi-book-columns, 2) !important;
  column-fill: auto !important;
  column-gap: var(--kuusi-book-spine, var(--kuusi-book-column-gap, 2.5rem)) !important;
  filter: none !important;
  height: auto !important;
  max-width: none !important;
  width: 100% !important;
}

.jp-KuusiExportPrint .jp-KuusiBook-paper[data-kuusi-book-column-rule="1"] .jp-RenderedMarkdown,
.jp-KuusiExportPrint .jp-KuusiMarkdownBook[data-kuusi-book-column-rule="1"] .jp-RenderedMarkdown,
.jp-KuusiExportPrint .jp-KuusiNotebookBook[data-kuusi-book-column-rule="1"] .jp-RenderedMarkdown {
  column-rule: 1px solid #ccc;
}

/* Article dual-column in print/HTML export. */
.jp-KuusiExportPrint
  .jp-KuusiArticle-paper[data-kuusi-article-columns="2"]
  .jp-RenderedMarkdown {
  column-count: 2 !important;
  column-fill: auto;
  column-gap: 2.25rem !important;
}

.jp-KuusiExportPrint
  .jp-KuusiArticle-paper[data-kuusi-article-page-layout="paged"][data-kuusi-article-columns="2"]
  .jp-RenderedMarkdown {
  /* Let the printer fragment columns per page (not one tall pair). */
  column-fill: auto !important;
  height: auto !important;
}

.jp-KuusiExportPrint .jp-MarkdownViewer[data-kuusi-article-pattern-host]::before,
.jp-KuusiExportPrint .jp-MarkdownViewer::before,
.jp-KuusiExportPrint .jp-KuusiMarkdownArticle .jp-MarkdownViewer::before,
.jp-KuusiExportPrint :is(.jp-RenderedMarkdown, .jp-RenderedMySTMarkdown)::before,
.jp-KuusiExportPrint .jp-KuusiArticle-pageSheet::before {
  content: none !important;
  display: none !important;
}

.jp-KuusiExportPrint img,
.jp-KuusiExportPrint svg,
.jp-KuusiExportPrint video {
  max-width: 100% !important;
  height: auto !important;
  page-break-inside: avoid;
  break-inside: avoid;
}

.jp-KuusiExportPrint h1,
.jp-KuusiExportPrint h2,
.jp-KuusiExportPrint h3,
.jp-KuusiExportPrint h4,
.jp-KuusiExportPrint h5,
.jp-KuusiExportPrint h6,
.jp-KuusiExportPrint pre,
.jp-KuusiExportPrint blockquote,
.jp-KuusiExportPrint table,
.jp-KuusiExportPrint figure,
.jp-KuusiExportPrint .jp-RenderedHTMLCommon > * {
  page-break-inside: avoid;
  break-inside: avoid;
}

.jp-KuusiExportPrint a {
  color: inherit !important;
  text-decoration: underline;
}

.jp-KuusiExportPrint .jp-Cell {
  margin: 0 0 0.75em !important;
  padding: 0 !important;
  page-break-inside: avoid;
  break-inside: avoid;
}

.jp-KuusiExportPrint .jp-OutputArea,
.jp-KuusiExportPrint .jp-OutputArea-output {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

/* Markdown Slides: one printed page per slide. */
.jp-KuusiExportPrint .jp-KuusiMarkdownSlides-exportDeck {
  background: transparent !important;
  display: block !important;
  margin: 0 !important;
  padding: 0 !important;
}

.jp-KuusiExportPrint .jp-KuusiMarkdownSlides-exportPage {
  background: var(--kuusi-slides-page-bg, #fff) !important;
  box-shadow: none !important;
  box-sizing: border-box !important;
  color: var(--kuusi-slides-page-fg, #111) !important;
  margin: 0 0 12mm !important;
  max-width: none !important;
  min-height: 0 !important;
  overflow: visible !important;
  padding: 14mm 12mm !important;
  page-break-after: always;
  break-after: page;
  width: 100% !important;
}

.jp-KuusiExportPrint .jp-KuusiMarkdownSlides-exportPage:last-child {
  page-break-after: auto;
  break-after: auto;
  margin-bottom: 0 !important;
}

@media print {
  html, body, .jp-KuusiExportPrint {
    background: #fff !important;
  }

  .jp-KuusiExportPrint .jp-KuusiMarkdownSlides-exportPage {
    margin: 0 !important;
  }
}
`;

const resolvePrintPageSize = (host: HTMLElement): "A4" | "letter" => {
  const paper =
    host.closest(".jp-KuusiArticle-paper") ??
    (host.classList.contains("jp-KuusiArticle-paper") ? host : null) ??
    host.querySelector(".jp-KuusiArticle-paper");

  if (
    paper instanceof HTMLElement &&
    paper.dataset.kuusiArticlePaperSize === "letter"
  ) {
    return "letter";
  }

  return "A4";
};

const buildExportHtml = (root: HTMLElement, title: string): string => {
  const clone = root.cloneNode(true) as HTMLElement;
  stripExportChrome(clone);
  [
    clone,
    ...Array.from(
      clone.querySelectorAll<HTMLElement>(
        ".jp-RenderedMarkdown, .jp-RenderedMySTMarkdown",
      ),
    ),
  ].forEach((node) => node.style.removeProperty("min-height"));

  const host = findExportHost(root);
  const hostClass =
    host instanceof HTMLElement ? host.className : root.className;
  const dataAttrs =
    host instanceof HTMLElement
      ? Array.from(host.attributes)
          .filter((attr) => attr.name.startsWith("data-kuusi"))
          .map((attr) => `${attr.name}="${escapeHtml(attr.value)}"`)
          .join(" ")
      : "";
  const styleAttr =
    host instanceof HTMLElement && host.style.cssText
      ? ` style="${escapeHtml(host.style.cssText)}"`
      : "";
  const pageSize = resolvePrintPageSize(host);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${collectDocumentStyles()}
<style>
${printExportCss(pageSize)}
</style>
</head>
<body class="jp-ThemedContainer jp-KuusiExportPrint">
<div class="${escapeHtml(hostClass)}"${styleAttr}${dataAttrs ? ` ${dataAttrs}` : ""}>${clone.outerHTML}</div>
</body>
</html>`;
};

const waitForImages = (doc: Document): Promise<void> => {
  const images = Array.from(doc.images);

  if (images.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }

          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  ).then(() => undefined);
};

const blobFromContents = (file: Contents.IModel): Blob => {
  const mime = file.mimetype || "application/octet-stream";

  if (file.format === "base64" && typeof file.content === "string") {
    const binary = atob(file.content);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: mime });
  }

  if (file.type === "notebook" || file.format === "json") {
    return new Blob([JSON.stringify(file.content, null, 2)], {
      type: "application/json",
    });
  }

  return new Blob([String(file.content ?? "")], {
    type: mime === "application/octet-stream" ? "text/plain" : mime,
  });
};

const downloadSourceFile = async (
  app: JupyterFrontEnd,
  path: string,
): Promise<void> => {
  const file = await app.serviceManager.contents.get(path, { content: true });
  triggerDownload(blobFromContents(file), PathExt.basename(path));
  Notification.success(`Downloaded ${PathExt.basename(path)}.`, {
    autoClose: 2500,
  });
};

const printRenderedView = async (widget: IDocumentWidget): Promise<void> => {
  const root = await resolveExportRoot(widget);

  if (!root) {
    Notification.warning("This view has nothing to print yet.", {
      autoClose: 3500,
    });
    return;
  }

  const title = PathExt.basename(widget.context.path);
  const win = window.open("", "_blank");

  if (!win) {
    Notification.warning("Allow pop-ups to export PDF.", { autoClose: 4000 });
    return;
  }

  win.document.open();
  win.document.write(buildExportHtml(root, title));
  win.document.close();

  const printWhenReady = (): void => {
    void waitForImages(win.document).then(() => {
      // Let layout settle after images decode.
      window.setTimeout(() => {
        win.focus();
        win.print();
      }, 50);
    });
  };

  if (win.document.readyState === "complete") {
    window.setTimeout(printWhenReady, 100);
  } else {
    win.addEventListener("load", printWhenReady, { once: true });
  }
};

const downloadRenderedHtml = async (widget: IDocumentWidget): Promise<void> => {
  const root = await resolveExportRoot(widget);

  if (!root) {
    Notification.warning("This view has nothing to export yet.", {
      autoClose: 3500,
    });
    return;
  }

  const stem = PathExt.basename(
    widget.context.path,
    PathExt.extname(widget.context.path),
  );
  const html = buildExportHtml(root, stem);
  triggerDownload(
    new Blob([html], { type: "text/html;charset=utf-8" }),
    `${stem}.html`,
  );
  Notification.success(`Downloaded ${stem}.html.`, { autoClose: 2500 });
};

const createMenuItem = (
  label: string,
  title: string,
  onClick: () => void,
): HTMLButtonElement => {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "jp-KuusiFormatDropdown-item";
  item.setAttribute("role", "menuitem");
  item.title = title;
  item.textContent = label;
  item.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  item.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return item;
};

export class KuusiRenderExportWidget extends Widget {
  constructor(
    app: JupyterFrontEnd,
    widget: IDocumentWidget,
    factoryName: string,
  ) {
    super();
    this.addClass("jp-KuusiRenderExport");

    const t = createKuusiTranslator();
    const dropdown = document.createElement("div");
    dropdown.className = "jp-KuusiFormatDropdown jp-KuusiRenderExport-dropdown";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "jp-KuusiRenderExport-trigger";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-label", t.export());
    trigger.title = t.exportRenderView();
    trigger.textContent = t.export();

    const menu = document.createElement("div");
    menu.className =
      "jp-KuusiFormatDropdown-menu jp-KuusiFormatDropdown-menu--fixed jp-KuusiRenderExport-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", t.export());
    menu.dataset.kuusiPortal = "true";

    const closeMenu = (): void => {
      closeKuusiDropdownMenus(this.node);
    };

    let exporting = false;
    const runExclusive = (task: () => Promise<void>): void => {
      if (exporting) {
        return;
      }

      exporting = true;
      void task().finally(() => {
        exporting = false;
      });
    };

    {
      const scope = imageScopeFor(factoryName, t);

      menu.appendChild(
        createMenuItem(t.exportPdf(), t.exportPdfTitle(), () => {
          closeMenu();
          runExclusive(() => exportRenderedPdf(widget, t));
        }),
      );

      RASTER_IMAGE_FORMATS.forEach((format) => {
        const label = RASTER_IMAGE_LABELS[format];
        menu.appendChild(
          createMenuItem(
            t.exportImage(label),
            t.exportImageTitle(label, scope),
            () => {
              closeMenu();
              runExclusive(() => exportRenderedImage(widget, format, t));
            },
          ),
        );
      });

      menu.appendChild(
        createMenuItem(t.exportPrint(), t.exportPrintTitle(), () => {
          closeMenu();
          printRenderedView(widget).catch((error) => {
            Notification.error(
              error instanceof Error ? error.message : "Could not export PDF.",
              { autoClose: 4000 },
            );
          });
        }),
      );
    }

    if (HTML_EXPORT_FACTORIES.has(factoryName)) {
      menu.appendChild(
        createMenuItem(t.exportHtml(), t.exportHtmlTitle(), () => {
          closeMenu();
          downloadRenderedHtml(widget).catch((error) => {
            Notification.error(
              error instanceof Error ? error.message : "Could not export HTML.",
              { autoClose: 4000 },
            );
          });
        }),
      );
    }

    menu.appendChild(
      createMenuItem(t.exportDownloadSource(), t.exportDownloadSourceTitle(), () => {
        closeMenu();
        void downloadSourceFile(app, widget.context.path).catch((error) => {
          Notification.error(
            error instanceof Error
              ? error.message
              : "Could not download the file.",
            { autoClose: 4000 },
          );
        });
      }),
    );

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = menu.classList.contains("is-open");
      closeKuusiDropdownMenus(this.node);

      if (!isOpen) {
        openKuusiDropdownMenu(menu, widget.node);
      }
    });

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (this.node.contains(target)) {
        return;
      }

      const el =
        target instanceof Element ? target : target.parentElement;
      if (el?.closest(".jp-KuusiFormatDropdown-menu.is-open")) {
        return;
      }

      closeKuusiDropdownMenus(this.node);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    this.disposed.connect(() => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    });
    // A duplicate created by the toolbar registry is never inserted (same item
    // name), so it would never be disposed through the toolbar.
    widget.disposed.connect(() => {
      this.dispose();
    });

    dropdown.append(trigger, menu);
    this.node.appendChild(dropdown);
  }
}

export const createKuusiRenderExport = (
  app: JupyterFrontEnd,
  widget: IDocumentWidget,
  factoryName: string,
): KuusiRenderExportWidget =>
  new KuusiRenderExportWidget(app, widget, factoryName);

export const ensureKuusiRenderExportOnToolbar = (
  app: JupyterFrontEnd,
  widget: IDocumentWidget,
  factoryName: string,
): void => {
  const names = Array.from(widget.toolbar.names());

  if (names.includes(KUUSI_RENDER_EXPORT_ITEM)) {
    return;
  }

  const switcherIndex = names.indexOf(KUUSI_RENDER_VIEW_SWITCHER_ITEM);
  const index = switcherIndex >= 0 ? switcherIndex + 1 : 1;
  widget.toolbar.insertItem(
    index,
    KUUSI_RENDER_EXPORT_ITEM,
    createKuusiRenderExport(app, widget, factoryName),
  );
};

/** Switcher at the far left, Export immediately after it. One deferred relayout. */
export const ensureKuusiRenderToolbarChrome = (
  app: JupyterFrontEnd,
  widget: IDocumentWidget,
  factoryName: string,
): void => {
  if (widget.isDisposed) {
    return;
  }

  ensureKuusiRenderViewSwitcherOnToolbar(app, widget, factoryName, 0);
  ensureKuusiRenderExportOnToolbar(app, widget, factoryName);
  scheduleDocumentToolbarRelayout(widget);
};

export const registerKuusiRenderExportToolbars = (
  app: JupyterFrontEnd,
  toolbarRegistry: IToolbarWidgetRegistry,
  factoryNames: string[],
): void => {
  factoryNames.forEach((factoryName) => {
    toolbarRegistry.addFactory<IDocumentWidget>(
      factoryName,
      KUUSI_RENDER_EXPORT_ITEM,
      (widget) => createKuusiRenderExport(app, widget, factoryName),
    );
  });
};

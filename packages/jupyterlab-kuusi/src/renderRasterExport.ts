import { Notification } from "@jupyterlab/apputils";
import { PathExt } from "@jupyterlab/coreutils";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import type { jsPDF } from "jspdf";
import { mmToPt, paperDimensions } from "./articlePaper";
import {
  buildPdfOutline,
  headingTitle,
  outlineParents,
  type OutlineEntry,
} from "./pdfOutline";

import { ARTICLE_PAGE_SHEET_CLASS } from "./articlePaged";
import type { KuusiTranslator } from "./kuusiI18n";
import { MarkdownSlidesDocumentWidget } from "./markdownSlides/markdownSlidesWidget";

export type RasterImageFormat = "png" | "jpeg" | "webp";

export const RASTER_IMAGE_FORMATS: readonly RasterImageFormat[] = [
  "png",
  "jpeg",
  "webp",
];

export const RASTER_IMAGE_LABELS: Record<RasterImageFormat, string> = {
  png: "PNG",
  jpeg: "JPEG",
  webp: "WebP",
};

const IMAGE_MIME: Record<RasterImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const IMAGE_EXTENSION: Record<RasterImageFormat, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
};

const LOSSY_QUALITY = 0.92;
const TARGET_PIXEL_RATIO = 2;
const MAX_CANVAS_SIDE = 16384;
// Safari caps canvases at ~16.7M pixels; Chromium and Firefox allow far more.
const MAX_CANVAS_AREA = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  ? 16_000_000
  : 100_000_000;
const PX_TO_PT = 0.75;
// PDF viewers reject pages larger than 200in (14400pt).
const MAX_PDF_SIDE_PT = 14400;

const resolveArticlePaperMetrics = (
  root: HTMLElement,
): { widthPt: number; ratio: number } => {
  const paper =
    root.closest(".jp-KuusiArticle-paper") ??
    root.querySelector(".jp-KuusiArticle-paper");
  const dims =
    paper instanceof HTMLElement
      ? paperDimensions(
          paper.dataset.kuusiArticlePaperSize,
          paper.dataset.kuusiArticlePaperOrientation,
        )
      : paperDimensions(null, null);

  return { widthPt: mmToPt(dims.widthMm), ratio: dims.heightMm / dims.widthMm };
};
const MIND_MAP_PADDING_PX = 40;
const SLIDE_OUTPUT_WIDTH_PX = 1920;
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** Interactive overlays that must not appear in exported images. */
const EXCLUDED_SELECTOR = [
  ".jp-KuusiRenderChrome",
  ".jp-KuusiFormatDropdown-menu",
  ".jp-KuusiNotebookMindMap-resizeHandle",
  ".jp-KuusiNotebookMindMap-drag-ghost",
].join(", ");

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CaptureSource {
  node: HTMLElement;
  /** Untransformed (layout) border-box size of `node`. */
  width: number;
  height: number;
  background: string;
  fontEmbedCSS?: string;
  /** Raise the pixel ratio so small on-screen frames still export crisply. */
  minOutputWidth?: number;
}

interface PdfPage {
  region: Region;
  /** Page size in pt. */
  pageWidth: number;
  pageHeight: number;
  /** Where the captured region lands on the page, in pt. */
  top: number;
  fill?: string;
}

type ProgressReporter = (page: number, total: number) => void;

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

const layoutSize = (el: HTMLElement): { width: number; height: number } => {
  const style = getComputedStyle(el);
  let width = parseFloat(style.width) || 0;
  let height = parseFloat(style.height) || 0;

  if (style.boxSizing !== "border-box") {
    const px = (value: string): number => parseFloat(value) || 0;
    width +=
      px(style.paddingLeft) +
      px(style.paddingRight) +
      px(style.borderLeftWidth) +
      px(style.borderRightWidth);
    height +=
      px(style.paddingTop) +
      px(style.paddingBottom) +
      px(style.borderTopWidth) +
      px(style.borderBottomWidth);
  }

  return { width, height };
};

/** On-screen pixels per layout pixel (CSS zoom / transforms on the way up). */
const screenScale = (el: HTMLElement, layoutWidth: number): number => {
  const rect = el.getBoundingClientRect();
  return layoutWidth > 0 && rect.width > 0 ? rect.width / layoutWidth : 1;
};

const regionWithin = (
  el: Element,
  origin: HTMLElement,
  scale: number,
): Region => {
  const base = origin.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  return {
    x: (rect.left - base.left) / scale,
    y: (rect.top - base.top) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
};

let colorProbe: CanvasRenderingContext2D | null = null;

const probeContext = (): CanvasRenderingContext2D => {
  if (!colorProbe) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    colorProbe = canvas.getContext("2d", { willReadFrequently: true });
  }

  if (!colorProbe) {
    throw new Error("Canvas 2D is not available");
  }

  return colorProbe;
};

const alphaOf = (ctx: CanvasRenderingContext2D, color: string): number => {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  return ctx.getImageData(0, 0, 1, 1).data[3];
};

/** Effective opaque background behind `el`, as `#rrggbb`. */
const opaqueBackground = (el: HTMLElement): string => {
  const ctx = probeContext();
  const layers: string[] = [];

  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    const alpha = alphaOf(ctx, color);

    if (alpha === 0) {
      continue;
    }

    layers.push(color);

    if (alpha === 255) {
      break;
    }
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1, 1);
  layers.reverse().forEach((color) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
  });

  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

const waitForImages = async (root: HTMLElement): Promise<void> => {
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
  await document.fonts?.ready;
};

const keepNode = (node: HTMLElement): boolean =>
  !(node instanceof Element && node.matches(EXCLUDED_SELECTOR));

const SVG_PRESENTATION_PROPERTIES = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "color",
  "display",
  "visibility",
  "font-family",
  "font-size",
  "font-weight",
];

/**
 * html-to-image deep-clones `<svg>` subtrees without their computed styles,
 * so class-based SVG styling (e.g. mind map edges) would be lost. Inline it on
 * the live nodes for the duration of the capture.
 */
const inlineSvgStyles = (root: HTMLElement): (() => void) => {
  const saved: Array<[SVGElement, string | null]> = [];

  root.querySelectorAll<SVGElement>("svg *").forEach((el) => {
    if (el.closest(EXCLUDED_SELECTOR)) {
      return;
    }

    const computed = getComputedStyle(el);
    saved.push([el, el.getAttribute("style")]);
    SVG_PRESENTATION_PROPERTIES.forEach((name) => {
      const value = computed.getPropertyValue(name);

      if (value) {
        el.style.setProperty(name, value);
      }
    });
  });

  return () => {
    saved.forEach(([el, style]) => {
      if (style === null) {
        el.removeAttribute("style");
      } else {
        el.setAttribute("style", style);
      }
    });
  };
};

const fontEmbedCSSFor = async (node: HTMLElement): Promise<string> => {
  try {
    const { getFontEmbedCSS } = await import("html-to-image");
    return await getFontEmbedCSS(node, { imagePlaceholder: TRANSPARENT_PIXEL });
  } catch (error) {
    console.warn("jupyterlab-kuusi: Could not embed fonts for export", error);
    return "";
  }
};

const pixelRatioFor = (
  width: number,
  height: number,
  minOutputWidth = 0,
): number =>
  Math.max(
    0.25,
    Math.min(
      Math.max(TARGET_PIXEL_RATIO, minOutputWidth / width),
      MAX_CANVAS_SIDE / width,
      MAX_CANVAS_SIDE / height,
      Math.sqrt(MAX_CANVAS_AREA / (width * height)),
    ),
  );

/**
 * Rasterize `region` (layout px, relative to the source's border box). The
 * clone is pinned to its full layout size and shifted so only the region is
 * inside the SVG viewport; live zoom/pan transforms are dropped.
 */
const captureRegion = async (
  source: CaptureSource,
  region: Region,
): Promise<HTMLCanvasElement> => {
  const { toCanvas } = await import("html-to-image");
  const width = Math.max(1, Math.ceil(region.width));
  const height = Math.max(1, Math.ceil(region.height));
  const restoreSvg = inlineSvgStyles(source.node);

  try {
    return await toCanvas(source.node, {
      width,
      height,
      pixelRatio: pixelRatioFor(width, height, source.minOutputWidth),
      backgroundColor: source.background,
      fontEmbedCSS: source.fontEmbedCSS,
      imagePlaceholder: TRANSPARENT_PIXEL,
      filter: keepNode,
      style: {
        boxSizing: "border-box",
        width: `${source.width}px`,
        height: `${source.height}px`,
        minHeight: "0",
        maxWidth: "none",
        maxHeight: "none",
        margin: "0",
        position: "relative",
        // html-to-image copies the computed cssText, which in current Chrome
        // lists logical `inset-inline` / `inset-block` after the physical
        // properties and would win over left / top below. Reset them first.
        inset: "auto",
        left: "0",
        top: "0",
        zoom: "1",
        transform: `translate(${-region.x}px, ${-region.y}px)`,
        transformOrigin: "0 0",
      },
    });
  } finally {
    restoreSvg();
  }
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mime: string,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("The image is too large")),
      mime,
      LOSSY_QUALITY,
    );
  });

export const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

// ---------------------------------------------------------------------------
// View adapters
// ---------------------------------------------------------------------------

interface RasterExportTarget {
  /** Capture for a single image download. */
  image(): Promise<HTMLCanvasElement>;
  /** Visit every PDF page (capture + page geometry). */
  pdfPages(
    visit: (canvas: HTMLCanvasElement, page: PdfPage) => void,
    progress: ProgressReporter,
  ): Promise<OutlineEntry[] | void>;
  imageSuffix: string;
}

const fitPageToPdf = (
  widthPx: number,
  heightPx: number,
): { pageWidth: number; pageHeight: number } => {
  const scale = Math.min(
    PX_TO_PT,
    MAX_PDF_SIDE_PT / widthPx,
    MAX_PDF_SIDE_PT / heightPx,
  );
  return { pageWidth: widthPx * scale, pageHeight: heightPx * scale };
};

const singleRegionTarget = (
  makeSource: () => Promise<{ source: CaptureSource; region: Region }>,
): RasterExportTarget => ({
  imageSuffix: "",
  async image() {
    const { source, region } = await makeSource();
    return captureRegion(source, region);
  },
  async pdfPages(visit, progress) {
    const { source, region } = await makeSource();
    progress(1, 1);
    const canvas = await captureRegion(source, region);
    visit(canvas, {
      region,
      ...fitPageToPdf(region.width, region.height),
      top: 0,
    });
  },
});

const mindMapTarget = (scene: HTMLElement): RasterExportTarget =>
  singleRegionTarget(async () => {
    const size = layoutSize(scene);
    const scale = screenScale(scene, size.width);
    const parts = [
      ...Array.from(
        scene.querySelectorAll(".jp-KuusiNotebookMindMap-cellNode"),
      ),
      ...Array.from(
        scene.querySelectorAll(".jp-KuusiNotebookMindMap-edges path"),
      ),
    ].filter((el) => el.getClientRects().length > 0);

    if (parts.length === 0) {
      throw new Error("empty");
    }

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    for (const part of parts) {
      const r = regionWithin(part, scene, scale);
      left = Math.min(left, r.x);
      top = Math.min(top, r.y);
      right = Math.max(right, r.x + r.width);
      bottom = Math.max(bottom, r.y + r.height);
    }

    await waitForImages(scene);
    const viewport =
      scene.closest<HTMLElement>(".jp-KuusiNotebookMindMap-viewport") ??
      scene.parentElement ??
      scene;

    return {
      source: {
        node: scene,
        ...size,
        background: opaqueBackground(viewport),
        fontEmbedCSS: await fontEmbedCSSFor(scene),
      },
      region: {
        x: left - MIND_MAP_PADDING_PX,
        y: top - MIND_MAP_PADDING_PX,
        width: right - left + MIND_MAP_PADDING_PX * 2,
        height: bottom - top + MIND_MAP_PADDING_PX * 2,
      },
    };
  });

const flowChildren = (root: HTMLElement): HTMLElement[] => {
  let flow: Element = root;

  while (
    flow.children.length === 1 &&
    flow.firstElementChild instanceof HTMLElement
  ) {
    flow = flow.firstElementChild;
  }

  return Array.from(flow.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      !child.classList.contains(ARTICLE_PAGE_SHEET_CLASS) &&
      child.getClientRects().length > 0,
  );
};

/** Slice a continuous article into paper-proportioned pages at block edges. */
const continuousArticlePages = (
  root: HTMLElement,
  source: CaptureSource,
  scale: number,
): PdfPage[] => {
  const style = getComputedStyle(root);
  const padTop = parseFloat(style.paddingTop) || 0;
  const padBottom = parseFloat(style.paddingBottom) || 0;
  const { widthPt, ratio } = resolveArticlePaperMetrics(root);
  const pageHeightPx = source.width * ratio;
  const ptPerPx = widthPt / source.width;
  const cuts = flowChildren(root)
    .filter((child) => !/^H[1-6]$/.test(child.tagName))
    .map((child) => {
      const r = regionWithin(child, root, scale);
      return r.y + r.height;
    })
    .sort((a, b) => a - b);
  const pages: PdfPage[] = [];
  let start = 0;

  while (start < source.height - 1) {
    const inset = pages.length === 0 ? 0 : padTop;
    const room = pageHeightPx - inset;
    let end: number;

    if (source.height - start <= room) {
      end = source.height;
    } else {
      const limit = start + room - padBottom;
      const floor = start + (room - padBottom) * 0.4;
      const fitting = cuts.filter((cut) => cut > floor && cut <= limit);
      end = fitting.length > 0 ? fitting[fitting.length - 1] : limit;
    }

    pages.push({
      region: { x: 0, y: start, width: source.width, height: end - start },
      pageWidth: widthPt,
      pageHeight: widthPt * ratio,
      top: inset * ptPerPx,
      fill: source.background,
    });
    start = end;
  }

  return pages;
};

const articleTarget = (root: HTMLElement): RasterExportTarget => {
  const prepare = async (): Promise<{
    source: CaptureSource;
    scale: number;
  }> => {
    await waitForImages(root);
    const size = layoutSize(root);
    return {
      scale: screenScale(root, size.width),
      source: {
        node: root,
        ...size,
        background: opaqueBackground(root),
        fontEmbedCSS: await fontEmbedCSSFor(root),
      },
    };
  };

  return {
    imageSuffix: "",
    async image() {
      const { source } = await prepare();
      return captureRegion(source, {
        x: 0,
        y: 0,
        width: source.width,
        height: source.height,
      });
    },
    async pdfPages(visit, progress) {
      const { source, scale } = await prepare();
      const sheets = Array.from(
        root.querySelectorAll(`.${ARTICLE_PAGE_SHEET_CLASS}`),
      );
      const pages: PdfPage[] =
        sheets.length > 0
          ? sheets.map((sheet) => {
              const region = regionWithin(sheet, root, scale);
              return {
                region,
                ...fitPageToPdf(region.width, region.height),
                top: 0,
              };
            })
          : continuousArticlePages(root, source, scale);

      for (const chunk of groupPagesIntoChunks(pages)) {
        progress(chunk.first + 1, pages.length);
        const canvas = await captureRegion(source, chunk.region);
        const ratio = canvas.width / Math.ceil(chunk.region.width);

        for (const page of chunk.pages) {
          visit(sliceCanvas(canvas, page.region, chunk.region, ratio), page);
        }
      }

      const headings = Array.from(
        root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
      )
        .filter((h) => !h.closest("nav, .jp-KuusiArticle-toc"))
        .map((h) => ({
          level: Number(h.tagName.slice(1)),
          title: headingTitle(
            `${h.getAttribute("data-kuusi-num") ?? ""} ${h.textContent ?? ""}`,
          ),
          y: regionWithin(h, root, scale).y,
        }));

      return buildPdfOutline(
        headings,
        pages.map((page) => ({ y: page.region.y, height: page.region.height })),
      );
    },
  };
};

interface PageChunk {
  region: Region;
  pages: PdfPage[];
  first: number;
}

/**
 * Serializing the whole article per page is slow, so capture consecutive
 * pages together as long as the canvas still fits at the target pixel ratio.
 */
const groupPagesIntoChunks = (pages: PdfPage[]): PageChunk[] => {
  const chunks: PageChunk[] = [];
  const bounds = (list: PdfPage[]): Region => {
    const left = Math.min(...list.map((p) => p.region.x));
    const top = Math.min(...list.map((p) => p.region.y));
    const right = Math.max(...list.map((p) => p.region.x + p.region.width));
    const bottom = Math.max(...list.map((p) => p.region.y + p.region.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  };
  const fits = (region: Region): boolean =>
    pixelRatioFor(Math.ceil(region.width), Math.ceil(region.height)) >=
    TARGET_PIXEL_RATIO;

  pages.forEach((page, index) => {
    const current = chunks[chunks.length - 1];

    if (current && fits(bounds([...current.pages, page]))) {
      current.pages.push(page);
      current.region = bounds(current.pages);
      return;
    }

    chunks.push({ region: { ...page.region }, pages: [page], first: index });
  });

  return chunks;
};

const sliceCanvas = (
  source: HTMLCanvasElement,
  region: Region,
  within: Region,
  ratio: number,
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(region.width * ratio));
  canvas.height = Math.max(1, Math.round(region.height * ratio));
  canvas
    .getContext("2d")
    ?.drawImage(
      source,
      Math.round((region.x - within.x) * ratio),
      Math.round((region.y - within.y) * ratio),
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  return canvas;
};

const slidesTarget = (
  widget: MarkdownSlidesDocumentWidget,
): RasterExportTarget => {
  const viewer = widget.content;
  const captureStage = async (): Promise<{
    canvas: HTMLCanvasElement;
    region: Region;
  }> => {
    const stage = viewer.stageNode;
    await nextFrame();
    await waitForImages(stage);
    const size = layoutSize(stage);
    const region = { x: 0, y: 0, ...size };
    const canvas = await captureRegion(
      {
        node: stage,
        ...size,
        background: opaqueBackground(stage),
        minOutputWidth: SLIDE_OUTPUT_WIDTH_PX,
      },
      region,
    );
    return { canvas, region };
  };

  return {
    get imageSuffix() {
      return `-slide-${viewer.currentIndex + 1}`;
    },
    async image() {
      return (await captureStage()).canvas;
    },
    async pdfPages(visit, progress) {
      await viewer.forEachRenderedSlide(async (index, count) => {
        progress(index + 1, count);
        const { canvas, region } = await captureStage();
        visit(canvas, {
          region,
          ...fitPageToPdf(region.width, region.height),
          top: 0,
        });
      });
    },
  };
};

const resolveTarget = (widget: IDocumentWidget): RasterExportTarget | null => {
  if (widget instanceof MarkdownSlidesDocumentWidget) {
    return widget.content.slideCount > 0 ? slidesTarget(widget) : null;
  }

  const scene = widget.node.querySelector<HTMLElement>(
    ".jp-KuusiNotebookMindMap-scene",
  );

  if (scene) {
    return mindMapTarget(scene);
  }

  const rendered = widget.node.querySelector<HTMLElement>(
    ".jp-RenderedMarkdown, .jp-RenderedMySTMarkdown",
  );

  return rendered && rendered.childElementCount > 0
    ? articleTarget(rendered)
    : null;
};

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const fileStem = (widget: IDocumentWidget): string =>
  PathExt.basename(widget.context.path, PathExt.extname(widget.context.path));

const errorReason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const runWithProgress = async (
  t: KuusiTranslator,
  filename: string,
  task: (report: (message: string) => void) => Promise<string | void>,
): Promise<void> => {
  const id = Notification.emit(t.exportWorking(filename), "in-progress", {
    autoClose: false,
  });

  try {
    const note = await task((message) => {
      Notification.update({ id, message });
    });
    Notification.update({
      id,
      message: note ? `${t.exportDone(filename)} ${note}` : t.exportDone(filename),
      type: "success",
      autoClose: note ? 6000 : 2500,
    });
  } catch (error) {
    console.error("jupyterlab-kuusi: Export failed", error);
    Notification.update({
      id,
      message:
        errorReason(error) === "empty"
          ? t.exportNothing()
          : t.exportFailed(errorReason(error)),
      type: "error",
      autoClose: 6000,
    });
  }
};

export const exportRenderedImage = async (
  widget: IDocumentWidget,
  format: RasterImageFormat,
  t: KuusiTranslator,
): Promise<void> => {
  const target = resolveTarget(widget);

  if (!target) {
    Notification.warning(t.exportNothing(), { autoClose: 3500 });
    return;
  }

  const filename = `${fileStem(widget)}${target.imageSuffix}.${IMAGE_EXTENSION[format]}`;

  await runWithProgress(t, filename, async () => {
    const canvas = await target.image();
    let blob = await canvasToBlob(canvas, IMAGE_MIME[format]);
    let name = filename;
    let note: string | undefined;

    if (blob.type !== IMAGE_MIME[format]) {
      blob = await canvasToBlob(canvas, IMAGE_MIME.png);
      name = filename.replace(/\.[^.]+$/, ".png");
      note = t.exportWebpFallback();
    }

    triggerDownload(blob, name);
    return note;
  });
};

export const exportRenderedPdf = async (
  widget: IDocumentWidget,
  t: KuusiTranslator,
): Promise<void> => {
  const target = resolveTarget(widget);

  if (!target) {
    Notification.warning(t.exportNothing(), { autoClose: 3500 });
    return;
  }

  const filename = `${fileStem(widget)}.pdf`;

  await runWithProgress(t, filename, async (report) => {
    const { jsPDF: JsPDF } = await import("jspdf");
    let doc: jsPDF | null = null;

    const paper =
      widget.node.closest<HTMLElement>(".jp-KuusiArticle-paper") ??
      widget.node.querySelector<HTMLElement>(".jp-KuusiArticle-paper");
    const pdfQuality = paper?.dataset.kuusiArticlePdfQuality === "high" ? 1 : LOSSY_QUALITY;
    const wantBookmarks = paper?.dataset.kuusiArticlePdfBookmarks !== "0";
    const outline = await target.pdfPages(
      (canvas, page) => {
        const orientation =
          page.pageWidth > page.pageHeight ? "landscape" : "portrait";
        const format: [number, number] = [page.pageWidth, page.pageHeight];

        if (!doc) {
          doc = new JsPDF({ unit: "pt", format, orientation, compress: true });
        } else {
          doc.addPage(format, orientation);
        }

        if (page.fill) {
          doc.setFillColor(page.fill);
          doc.rect(0, 0, page.pageWidth, page.pageHeight, "F");
        }

        const width = page.pageWidth;
        const height = (page.region.height / page.region.width) * width;
        doc.addImage(
          canvas.toDataURL("image/jpeg", pdfQuality),
          "JPEG",
          0,
          page.top,
          width,
          height,
          undefined,
          "FAST",
        );
      },
      (page, total) => {
        if (total > 1) {
          report(t.exportWorkingPage(filename, page, total));
        }
      },
    );

    const finished = doc as jsPDF | null;

    if (!finished) {
      throw new Error("empty");
    }

    finished.setProperties({ title: fileStem(widget) });

    if (wantBookmarks && outline && outline.length > 0) {
      const parents = outlineParents(outline);
      const nodes: unknown[] = [];

      outline.forEach((entry, index) => {
        const parent = parents[index] >= 0 ? nodes[parents[index]] : null;
        nodes[index] = finished.outline.add(parent, entry.title, {
          pageNumber: entry.page,
        });
      });
    }

    triggerDownload(finished.output("blob"), filename);
  });
};

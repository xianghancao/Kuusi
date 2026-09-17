import * as pdfjs from "pdfjs-dist";

/** Same default as pdf.js viewer (4096 × 8192). */
const MAX_CANVAS_PIXELS = 4096 * 8192;

export type RenderPdfPageCanvasOptions = {
  /** When true, allow CSS to shrink the page to the viewport width. */
  constrainWidth?: boolean;
};

export type RenderPdfPageCanvasResult = {
  canvas: HTMLCanvasElement;
  baseViewport: pdfjs.PageViewport;
};

/**
 * Render a PDF page to a HiDPI canvas at the requested scale.
 * Matches pdf.js viewer output-scale handling for sharp text.
 */
export async function renderPdfPageCanvas(
  page: pdfjs.PDFPageProxy,
  renderScale: number,
  options: RenderPdfPageCanvasOptions = {},
): Promise<RenderPdfPageCanvasResult> {
  const viewport = page.getViewport({ scale: renderScale });
  const baseViewport = page.getViewport({ scale: 1 });
  const outputScale = new pdfjs.OutputScale();
  const { width, height } = viewport;

  const pixelsInViewport = width * height;

  if (pixelsInViewport > 0 && MAX_CANVAS_PIXELS > 0) {
    const maxScale = Math.sqrt(MAX_CANVAS_PIXELS / pixelsInViewport);

    if (outputScale.sx > maxScale) {
      outputScale.sx = maxScale;
    }

    if (outputScale.sy > maxScale) {
      outputScale.sy = maxScale;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.className = "jp-KuusiLivePdf-page";

  const displayWidth = Math.floor(width);
  const displayHeight = Math.floor(height);
  canvas.width = Math.max(1, Math.floor(displayWidth * outputScale.sx));
  canvas.height = Math.max(1, Math.floor(displayHeight * outputScale.sy));
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  if (options.constrainWidth) {
    canvas.style.maxWidth = "100%";
  }

  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    throw new Error("Failed to acquire canvas 2D context.");
  }

  // Reconcile rounding so the render transform matches the backing store.
  outputScale.sx = canvas.width / displayWidth;
  outputScale.sy = canvas.height / displayHeight;

  const transform = outputScale.scaled
    ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0]
    : undefined;

  await page.render({ canvasContext: context, viewport, transform }).promise;

  return { canvas, baseViewport };
}

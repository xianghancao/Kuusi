export type PdfPageMetrics = {
  pageWidthPt: number;
  pageHeightPt: number;
  displayScale: number;
};

export const readPdfPageMetrics = (
  wrap: HTMLElement,
): PdfPageMetrics | null => {
  const canvas = wrap.querySelector("canvas.jp-KuusiLivePdf-page");

  if (!(canvas instanceof HTMLCanvasElement)) {
    return null;
  }

  const pageWidthPt = Number.parseFloat(wrap.dataset.pageWidthPt ?? "");
  const pageHeightPt = Number.parseFloat(wrap.dataset.pageHeightPt ?? "");

  if (
    !Number.isFinite(pageWidthPt) ||
    pageWidthPt <= 0 ||
    !Number.isFinite(pageHeightPt) ||
    pageHeightPt <= 0 ||
    canvas.clientWidth <= 0
  ) {
    return null;
  }

  return {
    pageWidthPt,
    pageHeightPt,
    displayScale: canvas.clientWidth / pageWidthPt,
  };
};

/** SyncTeX coords (origin top-left, points) → CSS px in page wrap. */
export const syncTexBoxToCss = (
  metrics: PdfPageMetrics,
  h: number,
  v: number,
  width: number,
  height: number,
  point?: { x?: number; y?: number },
): { left: number; top: number; width: number; height: number } => {
  const scale = metrics.displayScale;
  const boxHeight = Math.max(6, height * scale);
  const hasPoint =
    typeof point?.x === "number" &&
    Number.isFinite(point.x) &&
    typeof point?.y === "number" &&
    Number.isFinite(point.y);

  if (hasPoint) {
    return {
      left: Math.max(0, point.x! * scale),
      top: Math.max(0, point.y! * scale),
      width: Math.max(6, Math.min(width * scale, boxHeight * 2.5)),
      height: boxHeight,
    };
  }

  return {
    left: Math.max(0, h * scale),
    top: Math.max(0, v * scale),
    width: Math.max(6, width * scale),
    height: boxHeight,
  };
};

/** CSS px in page wrap → SyncTeX coords (origin top-left, points). */
export const cssToSyncTexPoint = (
  metrics: PdfPageMetrics,
  x: number,
  yFromTop: number,
): { h: number; v: number } => ({
  h: Math.max(0, x / metrics.displayScale),
  v: Math.max(0, yFromTop / metrics.displayScale),
});

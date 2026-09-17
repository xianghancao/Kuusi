import type * as pdfjs from "pdfjs-dist";

export type PdfTextHighlight = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type TextRun = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const HIGHLIGHT_CLASS = "jp-KuusiLivePdf-textHighlight";

const isTextItem = (
  item: unknown,
): item is {
  str: string;
  transform: number[];
  width: number;
  height?: number;
} =>
  typeof item === "object" &&
  item !== null &&
  "str" in item &&
  typeof (item as { str: unknown }).str === "string";

const getPageTextRuns = async (
  page: pdfjs.PDFPageProxy,
): Promise<TextRun[]> => {
  const content = await page.getTextContent();
  const runs: TextRun[] = [];

  for (const item of content.items) {
    if (!isTextItem(item) || !item.str) {
      continue;
    }

    const transform = item.transform;
    runs.push({
      str: item.str,
      x: transform[4],
      y: transform[5],
      width: item.width,
      height: item.height || Math.abs(transform[3]) || 12,
    });
  }

  return runs;
};

const highlightForRange = (
  runs: TextRun[],
  startIndex: number,
  endIndex: number,
  viewport: pdfjs.PageViewport,
): PdfTextHighlight | null => {
  let cursor = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let matched = false;

  for (const run of runs) {
    const runStart = cursor;
    const runEnd = cursor + run.str.length;
    cursor = runEnd;

    const overlapStart = Math.max(startIndex, runStart);
    const overlapEnd = Math.min(endIndex, runEnd);

    if (overlapStart >= overlapEnd) {
      continue;
    }

    matched = true;
    const charWidth = run.width / Math.max(1, run.str.length);
    const localStart = overlapStart - runStart;
    const localEnd = overlapEnd - runStart;
    const x0 = run.x + localStart * charWidth;
    const x1 = run.x + localEnd * charWidth;
    const y0 = run.y;
    const y1 = run.y + run.height;

    const corners: [number, number][] = [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ];

    for (const [pdfX, pdfY] of corners) {
      const [vx, vy] = viewport.convertToViewportPoint(pdfX, pdfY);
      minX = Math.min(minX, vx);
      minY = Math.min(minY, vy);
      maxX = Math.max(maxX, vx);
      maxY = Math.max(maxY, vy);
    }
  }

  if (!matched || !Number.isFinite(minX)) {
    return null;
  }

  return {
    left: minX,
    top: minY,
    width: Math.max(2, maxX - minX),
    height: Math.max(2, maxY - minY),
  };
};

export const findPageHighlights = async (
  page: pdfjs.PDFPageProxy,
  query: string,
  renderScale: number,
): Promise<PdfTextHighlight[]> => {
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  const runs = await getPageTextRuns(page);
  const fullText = runs.map((run) => run.str).join("");
  const haystack = fullText.toLowerCase();
  const needle = trimmed.toLowerCase();
  const viewport = page.getViewport({ scale: renderScale });
  const highlights: PdfTextHighlight[] = [];

  let fromIndex = 0;

  while (fromIndex < haystack.length) {
    const matchIndex = haystack.indexOf(needle, fromIndex);

    if (matchIndex < 0) {
      break;
    }

    const highlight = highlightForRange(
      runs,
      matchIndex,
      matchIndex + needle.length,
      viewport,
    );

    if (highlight) {
      highlights.push(highlight);
    }

    fromIndex = matchIndex + Math.max(1, needle.length);
  }

  return highlights;
};

export const paintHighlights = (
  wrap: HTMLElement,
  highlights: PdfTextHighlight[],
): void => {
  wrap.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((node) => node.remove());

  for (const highlight of highlights) {
    const marker = document.createElement("div");
    marker.className = HIGHLIGHT_CLASS;
    marker.style.left = `${highlight.left}px`;
    marker.style.top = `${highlight.top}px`;
    marker.style.width = `${highlight.width}px`;
    marker.style.height = `${highlight.height}px`;
    wrap.appendChild(marker);
  }
};

export const clearHighlights = (host: HTMLElement): void => {
  host.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((node) => node.remove());
};

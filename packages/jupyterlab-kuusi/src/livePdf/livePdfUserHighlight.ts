import { normalizeSelectedText } from "./livePdfTextLayer";

export const LIVE_PDF_HIGHLIGHT_COLORS = [
  { id: "yellow", label: "Yellow", color: "#ffeb3b" },
  { id: "green", label: "Green", color: "#a5d6a7" },
  { id: "blue", label: "Blue", color: "#90caf9" },
  { id: "pink", label: "Pink", color: "#f48fb1" },
  { id: "orange", label: "Orange", color: "#ffcc80" },
] as const;

export type LivePdfHighlightColor =
  (typeof LIVE_PDF_HIGHLIGHT_COLORS)[number]["id"];

export type TextSpanRef = {
  divIdx: number;
  offset: number;
};

export type PdfUserHighlight = {
  id: string;
  pageNumber: number;
  begin: TextSpanRef;
  end: TextSpanRef;
  color: LivePdfHighlightColor;
};

type TextLayerMapping = {
  textDivs: HTMLElement[];
  textContentItemsStr: string[];
};

const infinityOffset = Number.MAX_SAFE_INTEGER;

export const compareSpanRef = (
  left: TextSpanRef,
  right: TextSpanRef,
): number => {
  if (left.divIdx !== right.divIdx) {
    return left.divIdx - right.divIdx;
  }

  return left.offset - right.offset;
};

export const spanRangesOverlap = (
  beginA: TextSpanRef,
  endA: TextSpanRef,
  beginB: TextSpanRef,
  endB: TextSpanRef,
): boolean =>
  compareSpanRef(beginA, endB) < 0 && compareSpanRef(beginB, endA) < 0;

export const isPositionInsideRange = (
  position: TextSpanRef,
  begin: TextSpanRef,
  end: TextSpanRef,
): boolean =>
  compareSpanRef(begin, position) <= 0 && compareSpanRef(position, end) < 0;

export const cloneHighlightMap = (
  source: Map<number, PdfUserHighlight[]>,
): Map<number, PdfUserHighlight[]> =>
  new Map(
    Array.from(source.entries()).map(([pageNumber, highlights]) => [
      pageNumber,
      highlights.map((highlight) => ({
        ...highlight,
        begin: { ...highlight.begin },
        end: { ...highlight.end },
      })),
    ]),
  );

const isLivePdfHighlightColor = (
  value: string,
): value is LivePdfHighlightColor =>
  LIVE_PDF_HIGHLIGHT_COLORS.some((entry) => entry.id === value);

export const resetTextLayerContent = ({
  textDivs,
  textContentItemsStr,
}: TextLayerMapping): void => {
  for (let index = 0; index < textDivs.length; index += 1) {
    textDivs[index].textContent = textContentItemsStr[index];
    textDivs[index].className = "";
  }
};

const findBoundaryRef = (
  range: Range,
  endPoint: "start" | "end",
  textLayer: HTMLDivElement,
  mapping: TextLayerMapping,
): TextSpanRef | null => {
  const container =
    endPoint === "start" ? range.startContainer : range.endContainer;
  const boundaryOffset =
    endPoint === "start" ? range.startOffset : range.endOffset;

  let node: Node | null = container;

  while (node && node !== textLayer) {
    const divIdx = mapping.textDivs.indexOf(node as HTMLElement);

    if (divIdx >= 0) {
      const measureRange = document.createRange();
      measureRange.selectNodeContents(mapping.textDivs[divIdx]);
      measureRange.setEnd(container, boundaryOffset);
      const offset = Math.max(
        0,
        Math.min(
          mapping.textContentItemsStr[divIdx]?.length ?? 0,
          measureRange.toString().length,
        ),
      );

      return { divIdx, offset };
    }

    node = node.parentNode;
  }

  return null;
};

export const createHighlightFromSelection = (
  textLayer: HTMLDivElement,
  pageNumber: number,
  color: LivePdfHighlightColor,
  mapping: TextLayerMapping,
): PdfUserHighlight | null => {
  const selection = document.getSelection();

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!range.intersectsNode(textLayer)) {
    return null;
  }

  const begin = findBoundaryRef(range, "start", textLayer, mapping);
  const end = findBoundaryRef(range, "end", textLayer, mapping);

  if (!begin || !end) {
    return null;
  }

  if (
    begin.divIdx > end.divIdx ||
    (begin.divIdx === end.divIdx && begin.offset >= end.offset)
  ) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    pageNumber,
    begin,
    end,
    color,
  };
};

const appendTextToDiv = (
  mapping: TextLayerMapping,
  divIdx: number,
  fromOffset: number,
  toOffset: number,
  className?: string,
): void => {
  let div = mapping.textDivs[divIdx];

  if (div.nodeType === Node.TEXT_NODE) {
    const span = document.createElement("span");
    div.before(span);
    span.append(div);
    mapping.textDivs[divIdx] = span;
    div = span;
  }

  const content = mapping.textContentItemsStr[divIdx].substring(
    fromOffset,
    toOffset,
  );
  const node = document.createTextNode(content);

  if (className) {
    const span = document.createElement("span");
    span.className = `${className} appended`;
    span.append(node);
    div.append(span);
    return;
  }

  div.append(node);
};

const beginText = (
  mapping: TextLayerMapping,
  begin: TextSpanRef,
  className?: string,
): void => {
  mapping.textDivs[begin.divIdx].textContent = "";
  appendTextToDiv(mapping, begin.divIdx, 0, begin.offset, className);
};

const renderHighlightMatch = (
  mapping: TextLayerMapping,
  begin: TextSpanRef,
  end: TextSpanRef,
  color: LivePdfHighlightColor,
  prevEnd: TextSpanRef | null,
): TextSpanRef => {
  const className = `jp-KuusiLivePdf-userHighlight jp-KuusiLivePdf-userHighlight--${color}`;

  if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
    if (prevEnd !== null) {
      appendTextToDiv(
        mapping,
        prevEnd.divIdx,
        prevEnd.offset,
        infinityOffset,
      );
    }

    beginText(mapping, begin);
  } else {
    appendTextToDiv(mapping, prevEnd.divIdx, prevEnd.offset, begin.offset);
  }

  if (begin.divIdx === end.divIdx) {
    appendTextToDiv(mapping, begin.divIdx, begin.offset, end.offset, className);
  } else {
    appendTextToDiv(
      mapping,
      begin.divIdx,
      begin.offset,
      infinityOffset,
      `${className} begin`,
    );

    for (let divIdx = begin.divIdx + 1; divIdx < end.divIdx; divIdx += 1) {
      mapping.textDivs[divIdx].className = `${className} middle`.trim();
    }

    beginText(mapping, end, `${className} end`);
  }

  return end;
};

export const paintUserHighlights = (
  mapping: TextLayerMapping,
  highlights: PdfUserHighlight[],
): void => {
  resetTextLayerContent(mapping);

  if (highlights.length === 0) {
    return;
  }

  const sorted = [...highlights].sort((left, right) => {
    if (left.begin.divIdx !== right.begin.divIdx) {
      return left.begin.divIdx - right.begin.divIdx;
    }

    return left.begin.offset - right.begin.offset;
  });

  let prevEnd: TextSpanRef | null = null;

  for (const highlight of sorted) {
    prevEnd = renderHighlightMatch(
      mapping,
      highlight.begin,
      highlight.end,
      highlight.color,
      prevEnd,
    );
  }

  if (prevEnd !== null) {
    appendTextToDiv(
      mapping,
      prevEnd.divIdx,
      prevEnd.offset,
      infinityOffset,
    );
  }
};

export const findHighlightsForSelection = (
  textLayer: HTMLDivElement,
  mapping: TextLayerMapping,
  pageHighlights: PdfUserHighlight[],
): PdfUserHighlight[] => {
  const selection = document.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return [];
  }

  const range = selection.getRangeAt(0);

  if (!range.intersectsNode(textLayer)) {
    return [];
  }

  const begin = findBoundaryRef(range, "start", textLayer, mapping);
  const end = findBoundaryRef(range, "end", textLayer, mapping);

  if (!begin || !end) {
    return [];
  }

  if (selection.isCollapsed) {
    return pageHighlights.filter((highlight) =>
      isPositionInsideRange(begin, highlight.begin, highlight.end),
    );
  }

  const selectionBegin =
    compareSpanRef(begin, end) <= 0 ? begin : end;
  const selectionEnd = compareSpanRef(begin, end) <= 0 ? end : begin;

  return pageHighlights.filter((highlight) =>
    spanRangesOverlap(
      highlight.begin,
      highlight.end,
      selectionBegin,
      selectionEnd,
    ),
  );
};

export const getSelectedTextInLayer = (textLayer: HTMLDivElement): string => {
  const selection = document.getSelection();

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return "";
  }

  const range = selection.getRangeAt(0);

  if (!range.intersectsNode(textLayer)) {
    return "";
  }

  return normalizeSelectedText(selection.toString());
};

export const isLivePdfHighlightColorValue = isLivePdfHighlightColor;

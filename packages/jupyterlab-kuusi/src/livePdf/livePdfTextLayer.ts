import * as pdfjs from "pdfjs-dist";

export type PdfTextLayerResult = {
  layer: HTMLDivElement;
  textDivs: HTMLElement[];
  textContentItemsStr: string[];
};

const textLayers = new Map<HTMLDivElement, HTMLDivElement>();

const resetTextLayerSelection = (
  end: HTMLDivElement,
  textLayer: HTMLDivElement,
): void => {
  textLayer.append(end);
  end.style.width = "";
  end.style.height = "";
  textLayer.classList.remove("selecting");
};

const bindTextLayerSelection = (
  textLayer: HTMLDivElement,
  endOfContent: HTMLDivElement,
): void => {
  textLayer.addEventListener("mousedown", () => {
    textLayer.classList.add("selecting");
  });

  textLayer.addEventListener("copy", (event) => {
    const selection = document.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return;
    }

    event.clipboardData?.setData(
      "text/plain",
      trimSelectionText(selection.toString()),
    );
    event.preventDefault();
  });

  textLayers.set(textLayer, endOfContent);
  enableGlobalTextLayerSelectionListener();
};

const trimSelectionText = (value: string): string =>
  value
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

/** Ignore wide whitespace spans used for justification / margin padding. */
export const refineWhitespaceSpanSelection = (
  textDivs: HTMLElement[],
  textContentItemsStr: string[],
): void => {
  for (let index = 0; index < textDivs.length; index += 1) {
    const text = textContentItemsStr[index] ?? "";

    if (!text || !/^\s+$/.test(text)) {
      continue;
    }

    const rect = textDivs[index].getBoundingClientRect();
    const maxNormalSpaceWidth = Math.max(12, rect.height * 0.8);

    if (rect.width > maxNormalSpaceWidth) {
      textDivs[index].classList.add("jp-KuusiLivePdf-textWhitespace");
    }
  }
};

let selectionListenerAbort: AbortController | null = null;
let previousSelectionRange: Range | null = null;

const enableGlobalTextLayerSelectionListener = (): void => {
  if (selectionListenerAbort) {
    return;
  }

  selectionListenerAbort = new AbortController();
  const { signal } = selectionListenerAbort;
  let isPointerDown = false;
  let isFirefox: boolean | undefined;

  document.addEventListener(
    "pointerdown",
    () => {
      isPointerDown = true;
    },
    { signal },
  );

  document.addEventListener(
    "pointerup",
    () => {
      isPointerDown = false;
      previousSelectionRange = null;
      textLayers.forEach(resetTextLayerSelection);
    },
    { signal },
  );

  window.addEventListener(
    "blur",
    () => {
      isPointerDown = false;
      previousSelectionRange = null;
      textLayers.forEach(resetTextLayerSelection);
    },
    { signal },
  );

  document.addEventListener(
    "keyup",
    () => {
      if (!isPointerDown) {
        previousSelectionRange = null;
        textLayers.forEach(resetTextLayerSelection);
      }
    },
    { signal },
  );

  document.addEventListener(
    "selectionchange",
    () => {
      const selection = document.getSelection();

      if (!selection || selection.rangeCount === 0) {
        previousSelectionRange = null;
        textLayers.forEach(resetTextLayerSelection);
        return;
      }

      const activeLayers = new Set<HTMLDivElement>();

      for (let index = 0; index < selection.rangeCount; index += 1) {
        const range = selection.getRangeAt(index);

        for (const layer of textLayers.keys()) {
          if (!activeLayers.has(layer) && range.intersectsNode(layer)) {
            activeLayers.add(layer);
          }
        }
      }

      for (const [layer, end] of textLayers) {
        if (activeLayers.has(layer)) {
          layer.classList.add("selecting");
        } else {
          resetTextLayerSelection(end, layer);
        }
      }

      if (textLayers.size === 0) {
        return;
      }

      isFirefox ??=
        getComputedStyle(textLayers.keys().next().value as HTMLDivElement)
          .getPropertyValue("-moz-user-select") === "none";

      if (isFirefox) {
        return;
      }

      const range = selection.getRangeAt(0);
      const modifyStart =
        previousSelectionRange !== null &&
        (range.compareBoundaryPoints(Range.END_TO_END, previousSelectionRange) ===
          0 ||
          range.compareBoundaryPoints(
            Range.START_TO_END,
            previousSelectionRange,
          ) === 0);

      let anchor: Node | null = modifyStart
        ? range.startContainer
        : range.endContainer;

      if (anchor.nodeType === Node.TEXT_NODE) {
        anchor = anchor.parentNode;
      }

      const parentTextLayer = (anchor as HTMLElement | null)?.parentElement?.closest(
        ".textLayer",
      ) as HTMLDivElement | null;
      const endDiv = parentTextLayer
        ? textLayers.get(parentTextLayer)
        : undefined;

      if (endDiv && parentTextLayer) {
        endDiv.style.width = parentTextLayer.style.width;
        endDiv.style.height = parentTextLayer.style.height;
        (anchor as HTMLElement).parentElement?.insertBefore(
          endDiv,
          modifyStart
            ? (anchor as HTMLElement)
            : (anchor as HTMLElement).nextSibling,
        );
      }

      previousSelectionRange = range.cloneRange();
    },
    { signal },
  );
};

export const disposePdfTextLayer = (textLayer: HTMLDivElement): void => {
  textLayers.delete(textLayer);

  if (textLayers.size === 0) {
    selectionListenerAbort?.abort();
    selectionListenerAbort = null;
    previousSelectionRange = null;
  }
};

export const normalizeSelectedText = trimSelectionText;

export async function renderPdfPageTextLayer(
  page: pdfjs.PDFPageProxy,
  viewport: pdfjs.PageViewport,
): Promise<PdfTextLayerResult> {
  const layer = document.createElement("div");
  layer.className = "textLayer jp-KuusiLivePdf-textLayer";
  layer.tabIndex = 0;

  pdfjs.setLayerDimensions(layer, viewport, false, false);

  const textLayer = new pdfjs.TextLayer({
    textContentSource: page.streamTextContent({
      includeMarkedContent: true,
      disableNormalization: true,
    }),
    container: layer,
    viewport,
  });

  const { textDivs, textContentItemsStr } = textLayer;
  await textLayer.render();

  const endOfContent = document.createElement("div");
  endOfContent.className = "endOfContent";
  layer.append(endOfContent);
  bindTextLayerSelection(layer, endOfContent);

  return { layer, textDivs, textContentItemsStr };
}

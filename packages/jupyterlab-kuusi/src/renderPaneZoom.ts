/**
 * Pane-driven zoom for Article / Book / Slides: when the split sash moves,
 * fit the fixed paper (or slide stage) into the desk by adjusting zoom %.
 *
 * Auto-adjust only while zoom is in [PANE_ZOOM_MIN, PANE_ZOOM_MAX]. Outside
 * that band, only the zoom −/+ controls change scale.
 */

/** Lowest zoom the sash may drive (manual − can go lower). */
export const PANE_ZOOM_MIN = 40;
/** Highest zoom the sash may drive (manual + can go higher). */
export const PANE_ZOOM_MAX = 100;
const PANE_ZOOM_STEP = 10;

type PaneFitPair = {
  viewport: HTMLElement;
  /** Untransformed layout box to contain (paper / stage). */
  subject: HTMLElement;
  /** When set, fit height uses one page instead of the full tall subject. */
  pageHeight?: number;
  /** Width-only fit (continuous Article scroll — height is unbounded). */
  widthOnly?: boolean;
};

const snapPaneZoomPercent = (percent: number): number => {
  const snapped = Math.round(percent / PANE_ZOOM_STEP) * PANE_ZOOM_STEP;
  return Math.min(PANE_ZOOM_MAX, Math.max(PANE_ZOOM_MIN, snapped));
};

const resolvePaneFitPair = (host: HTMLElement): PaneFitPair | null => {
  const slidesStage = host.querySelector<HTMLElement>(
    ".jp-KuusiMarkdownSlides-stage",
  );
  const slidesDeck = host.querySelector<HTMLElement>(
    ".jp-KuusiMarkdownSlides-deck",
  );
  const slidesViewer =
    host.querySelector<HTMLElement>(".jp-KuusiMarkdownSlidesViewer") ??
    (host.classList.contains("jp-KuusiMarkdownSlidesViewer") ? host : null);
  if (slidesStage && (slidesDeck || slidesViewer)) {
    return {
      viewport: slidesDeck ?? slidesViewer!,
      subject: slidesStage,
    };
  }

  const bookStage = host.querySelector<HTMLElement>(".jp-KuusiBook-stage");
  const bookPaper =
    host.querySelector<HTMLElement>(".jp-KuusiBook-paper") ??
    host.querySelector<HTMLElement>(".jp-MarkdownViewer");
  if (bookStage && bookPaper) {
    return { viewport: bookPaper, subject: bookStage };
  }

  const articlePaper =
    host.querySelector<HTMLElement>(".jp-KuusiArticle-paper") ??
    host.querySelector<HTMLElement>(".jp-MarkdownViewer");
  const rendered = host.querySelector<HTMLElement>(
    ".jp-RenderedMarkdown, .jp-RenderedMySTMarkdown",
  );
  if (articlePaper && rendered) {
    const paged =
      articlePaper.getAttribute("data-kuusi-article-page-layout") === "paged";
    if (!paged) {
      return {
        viewport: articlePaper,
        subject: rendered,
        widthOnly: true,
      };
    }
    // Paged A4/Letter is ~297mm tall — typical Jupyter panes are shorter, so
    // height-limited fit never reaches 100%. The sash usually changes width;
    // fit to page width so widening can drive zoom up to 100% (tall pages
    // scroll inside the desk, same as an oversized sheet at 100%).
    return {
      viewport: articlePaper,
      subject: rendered,
      widthOnly: true,
    };
  }

  return null;
};

const contentBox = (
  el: HTMLElement,
): { width: number; height: number } => {
  const style = getComputedStyle(el);
  const padX =
    (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const padY =
    (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  return {
    width: Math.max(1, el.clientWidth - padX),
    height: Math.max(1, el.clientHeight - padY),
  };
};

/** Fit scale as a zoom percent, snapped and clamped to the sash band. */
export const computePaneFitZoomPercent = (host: HTMLElement): number | null => {
  const pair = resolvePaneFitPair(host);
  if (!pair) {
    return null;
  }

  const paperW = Math.max(1, pair.subject.offsetWidth);
  const fullH = Math.max(1, pair.subject.offsetHeight);
  const paperH = Math.max(1, pair.pageHeight ?? fullH);
  const { width: viewW, height: viewH } = contentBox(pair.viewport);

  const fit = pair.widthOnly
    ? viewW / paperW
    : Math.min(viewW / paperW, viewH / paperH);

  if (!Number.isFinite(fit) || fit <= 0) {
    return null;
  }

  return snapPaneZoomPercent(fit * 100);
};

export const isPaneAutoZoomActive = (percent: number): boolean =>
  percent >= PANE_ZOOM_MIN && percent <= PANE_ZOOM_MAX;

/**
 * Observe the desk and push zoom % while the current zoom stays in-band.
 */
export const bindPaneAutoZoom = (
  host: HTMLElement,
  getZoomPercent: () => number,
  setZoomPercent: (percent: number) => void,
): { dispose: () => void; refresh: () => void } => {
  let frame = 0;
  const observed = new Set<Element>();

  const ro =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          schedule();
        })
      : null;

  const watch = (el: Element | null | undefined): void => {
    if (!el || !ro || observed.has(el)) {
      return;
    }
    observed.add(el);
    ro.observe(el);
  };

  const refresh = (): void => {
    frame = 0;

    if (
      host.classList.contains("is-kuusi-playing") ||
      Boolean(host.closest(".is-kuusi-playing"))
    ) {
      return;
    }

    const current = getZoomPercent();
    if (!isPaneAutoZoomActive(current)) {
      return;
    }

    const pair = resolvePaneFitPair(host);
    watch(host);
    if (pair) {
      watch(pair.viewport);
      watch(pair.subject);
    }

    const next = computePaneFitZoomPercent(host);
    if (next == null || next === current) {
      return;
    }

    setZoomPercent(next);
  };

  const schedule = (): void => {
    if (frame) {
      return;
    }
    frame = requestAnimationFrame(() => {
      refresh();
    });
  };

  watch(host);
  schedule();

  return {
    refresh: schedule,
    dispose: () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      ro?.disconnect();
      observed.clear();
    },
  };
};

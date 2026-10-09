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

type PaneFitPair = {
  viewport: HTMLElement;
  /** Untransformed layout box to contain (paper / stage). */
  subject: HTMLElement;
  /** When set, fit height uses one page instead of the full tall subject. */
  pageHeight?: number;
  /** Width-only fit (continuous Article scroll — height is unbounded). */
  widthOnly?: boolean;
  /** Height kept free below the subject (e.g. Book's page-turn bar), in px. */
  reserveBottom?: number;
};

/**
 * Fit zoom is continuous (0.1% precision): snapping to 10% made the page jump
 * in steps while the sash moved smoothly under the pointer.
 */
const clampPaneZoomPercent = (percent: number): number =>
  Math.min(PANE_ZOOM_MAX, Math.max(PANE_ZOOM_MIN, Math.round(percent * 10) / 10));

/**
 * Article fullscreen with the horizontal page strip: the desk shows one page at
 * a time (thumbnails sit below), so the fit target is a single sheet, not the
 * whole strip. Returns that desk and sheet.
 */
export const resolveArticleStrip = (
  host: HTMLElement,
): { desk: HTMLElement; sheet: HTMLElement } | null => {
  const desk =
    host.querySelector<HTMLElement>(".jp-KuusiArticle-paper") ??
    (host.classList.contains("jp-KuusiArticle-paper") ? host : null);

  if (
    !desk ||
    desk.dataset.kuusiArticleFullscreen !== "1" ||
    desk.dataset.kuusiArticlePageScroll === "vertical" ||
    desk.dataset.kuusiArticlePageLayout !== "paged"
  ) {
    return null;
  }

  const strip = desk.querySelector<HTMLElement>(
    ".jp-RenderedMarkdown.is-kuusi-article-page-scroll-x, .jp-RenderedMySTMarkdown.is-kuusi-article-page-scroll-x",
  );
  const sheet = strip?.querySelector<HTMLElement>(".jp-KuusiArticle-pageSheet");

  return strip && sheet ? { desk, sheet } : null;
};

const resolvePaneFitPair = (host: HTMLElement): PaneFitPair | null => {
  const strip = resolveArticleStrip(host);
  if (strip) {
    return { viewport: strip.desk, subject: strip.sheet };
  }

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
    // The page-turn bar sits under the opening, so the opening must not take
    // the whole desk height.
    const nav = bookPaper.querySelector<HTMLElement>(".jp-KuusiBook-nav");
    return {
      viewport: bookPaper,
      subject: bookStage,
      reserveBottom: (nav?.offsetHeight || 44) + 8,
    };
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

/** Fit scale as a zoom percent, clamped to the sash band. */
export const computePaneFitZoomPercent = (host: HTMLElement): number | null => {
  const pair = resolvePaneFitPair(host);
  if (!pair) {
    return null;
  }

  const paperW = Math.max(1, pair.subject.offsetWidth);
  const fullH = Math.max(1, pair.subject.offsetHeight);
  const paperH = Math.max(1, pair.pageHeight ?? fullH);
  const box = contentBox(pair.viewport);
  const viewW = box.width;
  const viewH = Math.max(1, box.height - (pair.reserveBottom ?? 0));

  const fit = pair.widthOnly
    ? viewW / paperW
    : Math.min(viewW / paperW, viewH / paperH);

  if (!Number.isFinite(fit) || fit <= 0) {
    return null;
  }

  // One page can be shown larger than 100% on a big screen.
  return resolveArticleStrip(host)
    ? Math.min(
        STRIP_ZOOM_MAX,
        Math.max(PANE_ZOOM_MIN, Math.round(fit * 1000) / 10),
      )
    : clampPaneZoomPercent(fit * 100);
};

/** Highest zoom the page-at-a-time strip may fit to. */
const STRIP_ZOOM_MAX = 200;

export const isPaneAutoZoomActive = (
  percent: number,
  host?: HTMLElement,
): boolean =>
  percent >= PANE_ZOOM_MIN &&
  percent <= (host && resolveArticleStrip(host) ? STRIP_ZOOM_MAX : PANE_ZOOM_MAX);

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
    if (!isPaneAutoZoomActive(current, host)) {
      return;
    }

    const pair = resolvePaneFitPair(host);
    watch(host);
    if (pair) {
      watch(pair.viewport);
      watch(pair.subject);
    }

    const next = computePaneFitZoomPercent(host);
    // Ignore sub-pixel noise so a still sash does not keep rewriting the zoom.
    if (next == null || Math.abs(next - current) < 0.2) {
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

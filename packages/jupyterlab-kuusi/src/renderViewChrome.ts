import type { Widget } from "@lumino/widgets";

import type { KuusiTranslator } from "./kuusiI18n";
import {
  findKuusiDocumentWidget,
  KuusiDocumentFullscreen,
  type KuusiCornerAction,
} from "./kuusiFullscreen";
import { bindPaneAutoZoom } from "./renderPaneZoom";
import { formatFileSize } from "./statusStats";

export const RENDER_ZOOM_MIN = 20;
export const RENDER_ZOOM_MAX = 200;
export const RENDER_ZOOM_STEP = 10;
export const RENDER_ZOOM_TICK = 20;
const ZOOM_TRACK_PX = 186;
const ZOOM_THUMB_PX = 12;

export const snapRenderZoomPercent = (
  percent: number,
  min = RENDER_ZOOM_MIN,
  max = RENDER_ZOOM_MAX,
): number => {
  const snapped = Math.round(percent / RENDER_ZOOM_STEP) * RENDER_ZOOM_STEP;
  return Math.min(max, Math.max(min, snapped));
};

/** Whole-percent clamp for display; unlike {@link snapRenderZoomPercent} it keeps in-between values. */
export const clampRenderZoomPercent = (
  percent: number,
  min = RENDER_ZOOM_MIN,
  max = RENDER_ZOOM_MAX,
): number => Math.min(max, Math.max(min, Math.round(percent)));

const zoomSettleTimers = new WeakMap<HTMLElement, number>();

/**
 * While the zoom is being driven continuously (sash drag), promote the target
 * to its own layer so each step only rescales a texture; drop the hint a
 * moment after the last step so the page is re-rasterized sharp.
 */
const markZoomInMotion = (target: HTMLElement): void => {
  target.classList.add("jp-KuusiRenderZoomTarget--moving");
  window.clearTimeout(zoomSettleTimers.get(target));
  zoomSettleTimers.set(
    target,
    window.setTimeout(() => {
      target.classList.remove("jp-KuusiRenderZoomTarget--moving");
      zoomSettleTimers.delete(target);
    }, 200),
  );
};

export const applyRenderViewCssZoom = (
  target: HTMLElement,
  percent: number,
  previous?: HTMLElement | null,
  options: { inMotion?: boolean } = {},
): void => {
  if (options.inMotion) {
    markZoomInMotion(target);
  }

  if (previous && previous !== target) {
    previous.classList.remove("jp-KuusiRenderZoomTarget");
    previous.style.removeProperty("--kuusi-render-zoom");
  }
  // 0.1% precision: manual steps are multiples of 10, the sash fit is not.
  const exact =
    Math.round(Math.min(RENDER_ZOOM_MAX, Math.max(RENDER_ZOOM_MIN, percent)) * 10) /
    10;
  target.classList.add("jp-KuusiRenderZoomTarget");
  target.style.setProperty("--kuusi-render-zoom", String(exact / 100));
};

const resolveCssZoomTarget = (host: HTMLElement): HTMLElement =>
  // Slides: scale the stage only — page nav must stay chrome-sized.
  (host.querySelector(".jp-KuusiMarkdownSlides-stage") as HTMLElement | null) ??
  // Book: scale the fixed opening, not only the markdown (stage chrome stays).
  (host.querySelector(".jp-KuusiBook-stage") as HTMLElement | null) ??
  (host.querySelector(".jp-RenderedMarkdown, .jp-RenderedMySTMarkdown") as HTMLElement | null) ??
  (host.querySelector(".jp-Notebook") as HTMLElement | null) ??
  host;

export type CssZoomRenderChromeExtra = Partial<
  Omit<
    RenderViewChromeOptions,
    "host" | "owner" | "t" | "getZoomPercent" | "setZoomPercent"
  >
> & {
  onZoomChange?: (percent: number) => void;
};

export type CssZoomRenderChromeHandle = RenderViewChromeHandle & {
  syncZoomTarget: () => void;
};

export const mountCssZoomRenderChrome = (
  owner: Widget,
  host: HTMLElement,
  t: KuusiTranslator,
  extra?: CssZoomRenderChromeExtra,
): CssZoomRenderChromeHandle => {
  let percent = 100;
  let zoomTarget: HTMLElement | null = null;
  const showZoom = extra?.showZoom !== false;
  const { onZoomChange, ...chromeExtra } = extra ?? {};

  const applyZoom = (next: number, notify: boolean, exact = false): void => {
    percent = exact
      ? Math.round(
          Math.min(RENDER_ZOOM_MAX, Math.max(RENDER_ZOOM_MIN, next)) * 10,
        ) / 10
      : snapRenderZoomPercent(next);
    if (showZoom) {
      const target = resolveCssZoomTarget(host);
      applyRenderViewCssZoom(target, percent, zoomTarget, { inMotion: exact });
      zoomTarget = target;
    }
    if (notify) {
      onZoomChange?.(percent);
    }
  };

  if (showZoom) {
    applyZoom(percent, false);
  }

  const handle = mountRenderViewChrome({
    host,
    owner,
    t,
    getZoomPercent: () => percent,
    setZoomPercent: (next) => {
      applyZoom(next, true);
    },
    ...chromeExtra,
  });

  // Article / Book / Slides: sash resize drives zoom in the 40%–100% band.
  const paneZoom = showZoom
    ? bindPaneAutoZoom(
        host,
        () => percent,
        (next) => {
          // Sash-driven fit: continuous, not snapped to 10% steps.
          applyZoom(next, true, true);
          handle.setZoomPercent(percent);
        },
      )
    : null;

  const baseDispose = handle.dispose.bind(handle);
  handle.dispose = (): void => {
    paneZoom?.dispose();
    baseDispose();
  };

  return {
    ...handle,
    syncZoomTarget: () => {
      applyZoom(percent, false);
      paneZoom?.refresh();
    },
  };
};

export type RenderChromeStatId = "nodes" | "text" | "pages" | "fileSize";

export type RenderChromeStatValues = {
  nodes?: number;
  characters?: number;
  words?: number;
  pages?: number;
  fileBytes?: number;
};

export type RenderChromeStatVisibility = Partial<
  Record<RenderChromeStatId, boolean>
>;

export type RenderViewChromeHandle = {
  node: HTMLElement;
  setZoomPercent: (percent: number) => void;
  closeZoomSlider: () => void;
  setNodeCount: (count: number) => void;
  setNodeCountVisible: (visible: boolean) => void;
  setStats: (values: RenderChromeStatValues) => void;
  setStatVisibility: (visibility: RenderChromeStatVisibility) => void;
  /** Change the zoom slider's range after mount (percent). */
  setZoomRange?: (min: number, max: number) => void;
  /** Show/hide the Article fullscreen scroll-axis control. */
  setPageScrollAxisVisible?: (visible: boolean) => void;
  dispose: () => void;
};

export type ArticlePageScrollAxis = "horizontal" | "vertical";

export type RenderViewChromeOptions = {
  host: HTMLElement;
  owner: Widget;
  t: KuusiTranslator;
  getZoomPercent: () => number;
  setZoomPercent: (percent: number) => void;
  minZoom?: number;
  maxZoom?: number;
  /** When false, only corner action controls are shown (default true). */
  showZoom?: boolean;
  showNodeCount?: boolean;
  showTextCount?: boolean;
  showPageCount?: boolean;
  showFileSize?: boolean;
  /**
   * Article fullscreen: toggle horizontal vs vertical page swipe next to zoom.
   */
  showPageScrollAxis?: boolean;
  getPageScrollAxis?: () => ArticlePageScrollAxis;
  setPageScrollAxis?: (axis: ArticlePageScrollAxis) => void;
  /**
   * Corner control: `"play"` for slides presentation; `"fullscreen"` for
   * article / mind map window fullscreen (default).
   */
  cornerAction?: KuusiCornerAction;
  documentClassName?: string;
  onLayout?: () => void;
  /** Adds a "fit to window" button beside the zoom controls. */
  onFit?: () => void;
  onActiveChange?: (active: boolean) => void;
  onCloseMenus?: () => void;
  getDocumentWidget?: () => Widget | null;
};

const zoomTickPercents = (min: number, max: number): number[] => {
  const ticks: number[] = [];
  // Wide ranges would crowd the rail with a tick every 20%.
  const step =
    max - min > 300 ? 100 : max - min > 200 ? 50 : RENDER_ZOOM_TICK;
  const first = Math.ceil(min / step) * step;

  ticks.push(min);

  for (let percent = first; percent < max; percent += step) {
    if (percent > min) {
      ticks.push(percent);
    }
  }

  ticks.push(max);

  return ticks;
};

const percentToTrackBottom = (
  percent: number,
  min: number,
  max: number,
): number => {
  const snapped = Math.min(max, Math.max(min, percent));
  return ((snapped - min) / (max - min)) * ZOOM_TRACK_PX;
};

const percentFromTrackClientY = (
  track: HTMLElement,
  clientY: number,
  min: number,
  max: number,
): number => {
  const rect = track.getBoundingClientRect();
  const height = Math.max(rect.height, 1);
  const fromBottom = rect.bottom - clientY;
  const fraction = Math.min(1, Math.max(0, fromBottom / height));
  return min + fraction * (max - min);
};

const formatZoomLabel = (t: KuusiTranslator, percent: number): string =>
  `${t.zoom()}: ${percent}%`;

const chromeBindings = new WeakMap<Widget, RenderViewChromeHandle>();

export const mountRenderViewChrome = (
  options: RenderViewChromeOptions,
): RenderViewChromeHandle => {
  const existing = chromeBindings.get(options.owner);

  if (existing) {
    return existing;
  }

  let min = options.minZoom ?? RENDER_ZOOM_MIN;
  let max = options.maxZoom ?? RENDER_ZOOM_MAX;
  const t = options.t;
  const showZoom = options.showZoom !== false;

  const cluster = document.createElement("div");
  cluster.className = "jp-KuusiRenderChrome";

  const statsCapsule = document.createElement("div");
  statsCapsule.className =
    "jp-KuusiRenderChrome-stats jp-KuusiRenderChrome-node";

  const createStatEl = (id: RenderChromeStatId): HTMLElement => {
    const el = document.createElement("span");
    el.className = "jp-KuusiRenderChrome-stat";
    el.dataset.kuusiStat = id;
    el.hidden = true;
    return el;
  };

  const nodesEl = createStatEl("nodes");
  const textEl = createStatEl("text");
  const pagesEl = createStatEl("pages");
  const fileSizeEl = createStatEl("fileSize");
  statsCapsule.append(nodesEl, textEl, pagesEl, fileSizeEl);

  const visibility: Record<RenderChromeStatId, boolean> = {
    nodes: options.showNodeCount === true,
    text: options.showTextCount === true,
    pages: options.showPageCount === true,
    fileSize: options.showFileSize === true,
  };

  const values: Required<
    Pick<RenderChromeStatValues, "nodes" | "characters" | "words" | "pages" | "fileBytes">
  > = {
    nodes: 0,
    characters: 0,
    words: 0,
    pages: 0,
    fileBytes: 0,
  };

  const syncStatsCapsule = (): void => {
    nodesEl.hidden = !visibility.nodes;
    textEl.hidden = !visibility.text;
    pagesEl.hidden = !visibility.pages;
    fileSizeEl.hidden = !visibility.fileSize;

    if (visibility.nodes) {
      nodesEl.textContent = t.statusNodes(values.nodes);
    }

    if (visibility.text) {
      textEl.textContent = t.statusText(values.characters, values.words);
    }

    if (visibility.pages) {
      pagesEl.textContent = t.statusPages(values.pages);
    }

    if (visibility.fileSize) {
      fileSizeEl.textContent = formatFileSize(values.fileBytes, t);
    }

    const anyVisible =
      visibility.nodes ||
      visibility.text ||
      visibility.pages ||
      visibility.fileSize;
    statsCapsule.hidden = !anyVisible;
  };

  syncStatsCapsule();

  const viewCapsule = document.createElement("div");
  viewCapsule.className =
    "jp-KuusiRenderChrome-view jp-KuusiNotebookMindMap-status";

  const fullscreen = new KuusiDocumentFullscreen({
    t,
    onLayout: options.onLayout,
    onActiveChange: options.onActiveChange,
    getDocumentWidget: () =>
      options.getDocumentWidget?.() ??
      findKuusiDocumentWidget(options.owner, options.documentClassName),
  });

  let zoomSliderWrap: HTMLElement | null = null;
  let zoomTrigger: HTMLButtonElement | null = null;
  let zoomOutBtn: HTMLButtonElement | null = null;
  let zoomInBtn: HTMLButtonElement | null = null;
  let zoomTrack: HTMLElement | null = null;
  let zoomTicks: HTMLElement | null = null;
  let zoomThumb: HTMLElement | null = null;

  const closeZoomSlider = (): void => {
    zoomSliderWrap?.classList.remove("is-open");
    viewCapsule
      .querySelector(".jp-KuusiNotebookMindMap-status-zoom")
      ?.classList.remove("is-open");
    zoomTrigger?.setAttribute("aria-expanded", "false");
  };

  const syncZoomThumb = (percent: number): void => {
    const snapped = clampRenderZoomPercent(percent, min, max);

    if (zoomThumb) {
      zoomThumb.style.bottom = `${percentToTrackBottom(snapped, min, max)}px`;
    }

    if (zoomTrack) {
      zoomTrack.setAttribute("aria-valuenow", String(snapped));
      zoomTrack.setAttribute("aria-valuetext", `${snapped}%`);
      zoomTrack.title = t.zoomSlider();
      zoomTrack.setAttribute("aria-label", formatZoomLabel(t, snapped));
    }
  };

  const setZoomUi = (percent: number): void => {
    if (!showZoom) {
      return;
    }

    const snapped = clampRenderZoomPercent(percent, min, max);
    const label = formatZoomLabel(t, snapped);

    if (zoomTrigger) {
      zoomTrigger.textContent = label;
      zoomTrigger.title = t.zoomSlider();
      zoomTrigger.setAttribute("aria-label", label);
    }

    if (zoomOutBtn) {
      zoomOutBtn.disabled = snapped <= min;
    }

    if (zoomInBtn) {
      zoomInBtn.disabled = snapped >= max;
    }

    syncZoomThumb(snapped);
  };

  const applyZoom = (percent: number): void => {
    const snapped = snapRenderZoomPercent(percent, min, max);
    options.setZoomPercent(snapped);
    setZoomUi(options.getZoomPercent());
  };

  const renderZoomTicks = (): void => {
    if (!zoomTicks) {
      return;
    }

    zoomTicks.replaceChildren();

    zoomTickPercents(min, max).forEach((percent) => {
      const tick = document.createElement("button");
      tick.type = "button";
      tick.className = "jp-KuusiNotebookMindMap-status-zoom-tick";
      tick.textContent = `${percent}%`;
      tick.title = `${percent}%`;
      tick.style.bottom = `${percentToTrackBottom(percent, min, max)}px`;
      tick.addEventListener("click", (event) => {
        event.stopPropagation();
        applyZoom(percent);
      });
      zoomTicks!.appendChild(tick);
    });
  };

  const createZoomControl = (): HTMLElement => {
    const wrapper = document.createElement("div");
    wrapper.className = "jp-KuusiNotebookMindMap-status-zoom";

    const sliderWrap = document.createElement("div");
    sliderWrap.className = "jp-KuusiNotebookMindMap-status-zoom-slider-wrap";
    sliderWrap.style.setProperty("--kuusi-zoom-track", `${ZOOM_TRACK_PX}px`);
    sliderWrap.style.setProperty("--kuusi-zoom-thumb", `${ZOOM_THUMB_PX}px`);
    zoomSliderWrap = sliderWrap;

    const rail = document.createElement("div");
    rail.className = "jp-KuusiNotebookMindMap-status-zoom-rail";

    const ticks = document.createElement("div");
    ticks.className = "jp-KuusiNotebookMindMap-status-zoom-ticks";
    zoomTicks = ticks;
    renderZoomTicks();

    const track = document.createElement("div");
    track.className = "jp-KuusiNotebookMindMap-status-zoom-track";
    track.setAttribute("role", "slider");
    track.tabIndex = 0;
    track.setAttribute("aria-orientation", "vertical");
    track.setAttribute("aria-valuemin", String(min));
    track.setAttribute("aria-valuemax", String(max));
    zoomTrack = track;

    const trackLine = document.createElement("div");
    trackLine.className = "jp-KuusiNotebookMindMap-status-zoom-track-line";
    trackLine.setAttribute("aria-hidden", "true");

    const thumb = document.createElement("div");
    thumb.className = "jp-KuusiNotebookMindMap-status-zoom-thumb";
    thumb.setAttribute("aria-hidden", "true");
    zoomThumb = thumb;

    const controls = document.createElement("div");
    controls.className = "jp-KuusiNotebookMindMap-status-zoom-controls";

    const outBtn = document.createElement("button");
    outBtn.type = "button";
    outBtn.className =
      "jp-KuusiNotebookMindMap-status-zoom-step jp-KuusiNotebookMindMap-status-zoom-out";
    outBtn.textContent = "−";
    outBtn.title = t.zoomOut();
    outBtn.setAttribute("aria-label", t.zoomOut());
    zoomOutBtn = outBtn;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "jp-KuusiNotebookMindMap-status-zoom-btn";
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", t.zoom());
    zoomTrigger = trigger;

    const inBtn = document.createElement("button");
    inBtn.type = "button";
    inBtn.className =
      "jp-KuusiNotebookMindMap-status-zoom-step jp-KuusiNotebookMindMap-status-zoom-in";
    inBtn.textContent = "+";
    inBtn.title = t.zoomIn();
    inBtn.setAttribute("aria-label", t.zoomIn());
    zoomInBtn = inBtn;

    const applyFromPointer = (clientY: number): void => {
      applyZoom(percentFromTrackClientY(track, clientY, min, max));
    };

    outBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      applyZoom(options.getZoomPercent() - RENDER_ZOOM_STEP);
    });

    inBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      applyZoom(options.getZoomPercent() + RENDER_ZOOM_STEP);
    });

    track.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      track.setPointerCapture(event.pointerId);
      applyFromPointer(event.clientY);
    });

    track.addEventListener("pointermove", (event) => {
      if (!track.hasPointerCapture(event.pointerId)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      applyFromPointer(event.clientY);
    });

    track.addEventListener("pointerup", (event) => {
      if (track.hasPointerCapture(event.pointerId)) {
        track.releasePointerCapture(event.pointerId);
      }
    });

    track.addEventListener("keydown", (event) => {
      let next: number | null = null;
      const current = snapRenderZoomPercent(options.getZoomPercent(), min, max);

      if (event.key === "ArrowUp" || event.key === "ArrowRight") {
        next = current + RENDER_ZOOM_STEP;
      } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
        next = current - RENDER_ZOOM_STEP;
      } else if (event.key === "Home") {
        next = max;
      } else if (event.key === "End") {
        next = min;
      }

      if (next === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      applyZoom(next);
    });

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = sliderWrap.classList.contains("is-open");
      options.onCloseMenus?.();
      closeZoomSlider();

      if (isOpen) {
        return;
      }

      sliderWrap.classList.add("is-open");
      wrapper.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      syncZoomThumb(options.getZoomPercent());
    });

    wrapper.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    wrapper.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    wrapper.addEventListener("wheel", (event) => {
      event.stopPropagation();
    });

    track.append(trackLine, thumb);
    rail.append(ticks, track);
    sliderWrap.appendChild(rail);
    controls.append(outBtn, trigger, inBtn);

    if (options.onFit) {
      const fitBtn = document.createElement("button");
      fitBtn.type = "button";
      fitBtn.className =
        "jp-KuusiNotebookMindMap-status-zoom-step jp-KuusiNotebookMindMap-status-zoom-fit";
      fitBtn.textContent = "⤢";
      fitBtn.title = t.fitToWindowTitle();
      fitBtn.setAttribute("aria-label", t.fitToWindow());
      fitBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        options.onFit?.();
      });
      controls.appendChild(fitBtn);
    }
    wrapper.append(sliderWrap, controls);
    return wrapper;
  };

  if (showZoom) {
    viewCapsule.append(createZoomControl());
    cluster.append(statsCapsule, viewCapsule);
  } else {
    cluster.append(statsCapsule);
  }

  let scrollAxisBtn: HTMLButtonElement | null = null;
  let scrollAxisWrap: HTMLElement | null = null;

  const syncScrollAxisButton = (): void => {
    if (!scrollAxisBtn || !options.getPageScrollAxis) {
      return;
    }
    const axis = options.getPageScrollAxis();
    const horizontal = axis !== "vertical";
    scrollAxisBtn.dataset.kuusiScrollAxis = horizontal
      ? "horizontal"
      : "vertical";
    scrollAxisBtn.setAttribute(
      "aria-pressed",
      horizontal ? "true" : "false",
    );
    scrollAxisBtn.title = horizontal
      ? t.articleScrollHorizontalTitle()
      : t.articleScrollVerticalTitle();
    scrollAxisBtn.setAttribute(
      "aria-label",
      horizontal
        ? t.articleScrollHorizontal()
        : t.articleScrollVertical(),
    );
    scrollAxisBtn.textContent = horizontal ? "↔" : "↕";
  };

  if (
    options.showPageScrollAxis &&
    options.getPageScrollAxis &&
    options.setPageScrollAxis
  ) {
    scrollAxisWrap = document.createElement("div");
    scrollAxisWrap.className =
      "jp-KuusiCornerControl jp-KuusiArticle-scrollAxis";
    scrollAxisWrap.hidden = true;

    scrollAxisBtn = document.createElement("button");
    scrollAxisBtn.type = "button";
    scrollAxisBtn.className =
      "jp-KuusiCornerBtn jp-KuusiArticle-scrollAxis-btn";
    scrollAxisBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onCloseMenus?.();
      const next: ArticlePageScrollAxis =
        options.getPageScrollAxis?.() === "vertical"
          ? "horizontal"
          : "vertical";
      options.setPageScrollAxis?.(next);
      syncScrollAxisButton();
    });
    scrollAxisWrap.appendChild(scrollAxisBtn);
    syncScrollAxisButton();
    // Place beside zoom, before the fullscreen / play control.
    cluster.append(scrollAxisWrap);
  }

  // Standalone glass pill — same corner button on every view (fullscreen / play).
  cluster.append(fullscreen.createButtons(options.cornerAction ?? "fullscreen"));
  options.host.appendChild(cluster);
  setZoomUi(options.getZoomPercent());

  const onDocumentClick = (): void => {
    closeZoomSlider();
  };

  if (showZoom) {
    document.addEventListener("click", onDocumentClick);
  }

  let disposed = false;

  const handle: RenderViewChromeHandle = {
    node: cluster,
    setZoomPercent: setZoomUi,
    closeZoomSlider,
    setNodeCount: (count) => {
      values.nodes = Math.max(0, Math.round(count));
      syncStatsCapsule();
    },
    setNodeCountVisible: (visible) => {
      visibility.nodes = visible;
      syncStatsCapsule();
    },
    setStats: (next) => {
      if (typeof next.nodes === "number") {
        values.nodes = Math.max(0, Math.round(next.nodes));
      }
      if (typeof next.characters === "number") {
        values.characters = Math.max(0, Math.round(next.characters));
      }
      if (typeof next.words === "number") {
        values.words = Math.max(0, Math.round(next.words));
      }
      if (typeof next.pages === "number") {
        values.pages = Math.max(0, Math.round(next.pages));
      }
      if (typeof next.fileBytes === "number") {
        values.fileBytes = Math.max(0, Math.round(next.fileBytes));
      }
      syncStatsCapsule();
    },
    setStatVisibility: (next) => {
      if (typeof next.nodes === "boolean") {
        visibility.nodes = next.nodes;
      }
      if (typeof next.text === "boolean") {
        visibility.text = next.text;
      }
      if (typeof next.pages === "boolean") {
        visibility.pages = next.pages;
      }
      if (typeof next.fileSize === "boolean") {
        visibility.fileSize = next.fileSize;
      }
      syncStatsCapsule();
    },
    setZoomRange: (nextMin, nextMax) => {
      if (nextMin === min && nextMax === max) {
        return;
      }

      min = nextMin;
      max = nextMax;
      zoomTrack?.setAttribute("aria-valuemin", String(min));
      zoomTrack?.setAttribute("aria-valuemax", String(max));
      renderZoomTicks();
      setZoomUi(options.getZoomPercent());
    },
    setPageScrollAxisVisible: (visible) => {
      if (scrollAxisWrap) {
        scrollAxisWrap.hidden = !visible;
      }
      if (visible) {
        syncScrollAxisButton();
      }
    },
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      if (showZoom) {
        document.removeEventListener("click", onDocumentClick);
      }
      fullscreen.dispose();
      cluster.remove();
      chromeBindings.delete(options.owner);
    },
  };

  chromeBindings.set(options.owner, handle);
  options.owner.disposed.connect(() => {
    handle.dispose();
  });

  return handle;
};

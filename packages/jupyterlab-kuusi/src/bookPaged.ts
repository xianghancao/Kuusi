import type { Widget } from "@lumino/widgets";

import type { BookSettingsManager } from "./bookSettings";
import { createKuusiTranslator, type KuusiTranslator } from "./kuusiI18n";
import { formatPageNumberLabel } from "./pageNumberStart";
import {
  BOOK_DRAG_CLASS,
  BOOK_EDGE_TAP_RATIO,
  BOOK_TURNING_CLASS,
  BOOK_TURN_PREV_CLASS,
  BOOK_TURN_NEXT_CLASS,
  dragTurnProgress,
  ensureBookTurnLeaf,
  playBookPageTurn,
  shouldCommitTurn,
  type BookTurnDirection,
} from "./bookTurn";

export const BOOK_STAGE_CLASS = "jp-KuusiBook-stage";
export const BOOK_NAV_CLASS = "jp-KuusiBook-nav";
export const BOOK_NAV_BTN_CLASS = "jp-KuusiBook-navBtn";
export const BOOK_COUNTER_CLASS = "jp-KuusiBook-counter";
export const BOOK_PAGED_CLASS = "is-kuusi-book-paged";

const RENDERED_SELECTOR = ":is(.jp-RenderedMarkdown, .jp-RenderedMySTMarkdown)";
const MIN_PAGE_H = 240;
const BOOK_COLUMN_WRAP_CLASS = "is-kuusi-book-column-wrap";
/** Fallback when CSS mm→px probe is unavailable (approx 297mm at 96dpi). */
const DEFAULT_A4_PAGE_H_PX = 1123;

const supportsColumnHeight = (): boolean =>
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("column-height", "100px");

/** Resolve fixed opening height from CSS (--kuusi-book-page-h is 297mm). */
const measureFixedPageHeightPx = (paper: HTMLElement): number => {
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.height = "var(--kuusi-book-page-h, 297mm)";
  paper.appendChild(probe);
  const height = probe.offsetHeight;
  probe.remove();
  return height >= MIN_PAGE_H ? height : DEFAULT_A4_PAGE_H_PX;
};

export type BookPagerHandle = {
  dispose: () => void;
  refresh: () => void;
  pageCount: () => number;
  spreadIndex: () => number;
};

const bound = new WeakSet<Widget>();

const formatCounter = (
  spread: number,
  spreads: number,
  start: "first" | "second",
): string => {
  if (spreads <= 0) {
    return "0 / 0";
  }
  return formatPageNumberLabel(spread, spreads, start, true) || "—";
};

const isBookChrome = (node: Node): boolean => {
  if (!(node instanceof Element)) {
    return false;
  }
  return Boolean(
    node.closest(
      `.${BOOK_STAGE_CLASS}, .${BOOK_NAV_CLASS}, .jp-KuusiBook-header, .jp-KuusiRenderChrome, .jp-KuusiCornerControl`,
    ),
  );
};

const ensureChrome = (
  paper: HTMLElement,
  t: KuusiTranslator,
): {
  stage: HTMLElement;
  nav: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  counter: HTMLElement;
} => {
  let stage = paper.querySelector<HTMLElement>(`.${BOOK_STAGE_CLASS}`);
  if (!stage) {
    stage = document.createElement("div");
    stage.className = BOOK_STAGE_CLASS;
    const firstContent =
      paper.querySelector<HTMLElement>(RENDERED_SELECTOR) ?? paper.firstChild;
    if (firstContent) {
      paper.insertBefore(stage, firstContent);
    } else {
      paper.appendChild(stage);
    }
  }

  const rendered = paper.querySelector<HTMLElement>(RENDERED_SELECTOR);
  if (rendered && rendered.parentElement !== stage) {
    stage.appendChild(rendered);
  }

  ensureBookTurnLeaf(stage);

  paper.querySelectorAll(":scope > .jp-KuusiBook-header").forEach((node) => {
    node.remove();
  });

  let nav = paper.querySelector<HTMLElement>(`.${BOOK_NAV_CLASS}`);
  let prev: HTMLButtonElement;
  let next: HTMLButtonElement;
  let counter: HTMLElement;

  if (!nav) {
    nav = document.createElement("nav");
    nav.className = BOOK_NAV_CLASS;
    nav.setAttribute("aria-label", t.bookControls());

    prev = document.createElement("button");
    prev.type = "button";
    prev.className = BOOK_NAV_BTN_CLASS;
    prev.textContent = "‹";
    prev.title = t.bookPrevious();
    prev.setAttribute("aria-label", t.bookPrevious());
    prev.dataset.kuusiBookNav = "prev";

    counter = document.createElement("span");
    counter.className = BOOK_COUNTER_CLASS;

    next = document.createElement("button");
    next.type = "button";
    next.className = BOOK_NAV_BTN_CLASS;
    next.textContent = "›";
    next.title = t.bookNext();
    next.setAttribute("aria-label", t.bookNext());
    next.dataset.kuusiBookNav = "next";

    nav.append(prev, counter, next);
    paper.appendChild(nav);
  } else {
    prev = nav.querySelector<HTMLButtonElement>('[data-kuusi-book-nav="prev"]')!;
    next = nav.querySelector<HTMLButtonElement>('[data-kuusi-book-nav="next"]')!;
    counter = nav.querySelector<HTMLElement>(`.${BOOK_COUNTER_CLASS}`)!;
  }

  return { stage, nav, prev, next, counter };
};

/**
 * Facing-page Book layout with Apple Books–style peel turns (swipe / edge tap).
 */
export const bindBookPagedLayout = (
  widget: Widget,
  manager?: BookSettingsManager,
): BookPagerHandle | null => {
  if (bound.has(widget) || widget.isDisposed) {
    return null;
  }

  bound.add(widget);
  const root = widget.node;
  const t = createKuusiTranslator();
  let frame = 0;
  let applying = false;
  let turning = false;
  let spread = 0;
  let spreads = 1;
  let pageH = MIN_PAGE_H;

  const paperOf = (): HTMLElement | null =>
    root.querySelector<HTMLElement>(".jp-KuusiBook-paper") ??
    (root.classList.contains("jp-KuusiBook-paper") ? root : null) ??
    root.querySelector<HTMLElement>(".jp-MarkdownViewer");

  const syncNav = (
    prev: HTMLButtonElement,
    next: HTMLButtonElement,
    counter: HTMLElement,
  ): void => {
    spread = Math.max(0, Math.min(spread, Math.max(0, spreads - 1)));
    const start = manager?.settings.pageNumberStart ?? "first";
    counter.textContent = formatCounter(spread, spreads, start);
    prev.disabled = spread <= 0;
    next.disabled = spread >= spreads - 1;
  };

  const syncNavFromDom = (): void => {
    const paper = paperOf();
    const nav = paper?.querySelector<HTMLElement>(`.${BOOK_NAV_CLASS}`);
    if (!nav) {
      return;
    }
    const prev = nav.querySelector<HTMLButtonElement>(
      '[data-kuusi-book-nav="prev"]',
    );
    const next = nav.querySelector<HTMLButtonElement>(
      '[data-kuusi-book-nav="next"]',
    );
    const counter = nav.querySelector<HTMLElement>(`.${BOOK_COUNTER_CLASS}`);
    if (prev && next && counter) {
      syncNav(prev, next, counter);
    }
  };

  const setOpening = (stage: HTMLElement, index: number): void => {
    spread = Math.max(0, Math.min(index, spreads - 1));
    stage.scrollTop = spread * pageH;
    syncNavFromDom();
  };

  const layout = (): void => {
    const paper = paperOf();
    if (!paper || applying) {
      return;
    }

    applying = true;
    try {
      const chrome = ensureChrome(paper, t);
      const rendered = chrome.stage.querySelector<HTMLElement>(RENDERED_SELECTOR);
      if (!rendered) {
        return;
      }

      paper.classList.add(BOOK_PAGED_CLASS);
      const useColumnWrap = supportsColumnHeight();
      paper.classList.toggle(BOOK_COLUMN_WRAP_CLASS, useColumnWrap);

      pageH = measureFixedPageHeightPx(paper);
      const nextH = `${pageH}px`;
      if (chrome.stage.style.height !== nextH) {
        chrome.stage.style.height = nextH;
      }

      rendered.style.removeProperty("height");
      void rendered.offsetHeight;
      void chrome.stage.offsetHeight;

      const contentH = Math.max(rendered.scrollHeight, pageH);
      spreads = Math.max(1, Math.ceil(contentH / pageH - 0.001));
      const pinnedH = `${spreads * pageH}px`;
      if (rendered.style.height !== pinnedH) {
        rendered.style.height = pinnedH;
      }
      void rendered.offsetHeight;

      spread = Math.max(0, Math.min(spread, spreads - 1));
      chrome.stage.scrollTop = spread * pageH;
      syncNav(chrome.prev, chrome.next, chrome.counter);
      mo.takeRecords();
    } finally {
      applying = false;
    }
  };

  const goToSpread = (index: number, animate = true): void => {
    const paper = paperOf();
    const stage = paper?.querySelector<HTMLElement>(`.${BOOK_STAGE_CLASS}`);
    if (!stage || turning) {
      return;
    }

    const target = Math.max(0, Math.min(index, spreads - 1));
    if (target === spread) {
      return;
    }

    const direction: BookTurnDirection = target > spread ? 1 : -1;

    if (!animate) {
      setOpening(stage, target);
      return;
    }

    turning = true;
    void playBookPageTurn(stage, direction, () => {
      setOpening(stage, target);
    }).finally(() => {
      turning = false;
    });
  };

  const onPrev = (): void => goToSpread(spread - 1);
  const onNext = (): void => goToSpread(spread + 1);
  let boundPrev: HTMLButtonElement | null = null;
  let boundNext: HTMLButtonElement | null = null;
  let boundStage: HTMLElement | null = null;

  /** Snap free-scroll back to the discrete opening (Books has no scrub scroll). */
  const onStageScroll = (): void => {
    if (applying || turning || !boundStage || pageH <= 0) {
      return;
    }
    const snapped = Math.round(boundStage.scrollTop / pageH);
    const nextSpread = Math.max(0, Math.min(snapped, spreads - 1));
    if (Math.abs(boundStage.scrollTop - nextSpread * pageH) > 1) {
      boundStage.scrollTop = nextSpread * pageH;
    }
    if (nextSpread !== spread) {
      spread = nextSpread;
      syncNavFromDom();
    }
  };

  type DragState = {
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastT: number;
    velocityX: number;
    axis: "pending" | "horizontal" | "vertical";
    direction: BookTurnDirection | 0;
  };
  let drag: DragState | null = null;

  const clearDragVisual = (stage: HTMLElement): void => {
    stage.classList.remove(
      BOOK_DRAG_CLASS,
      BOOK_TURN_NEXT_CLASS,
      BOOK_TURN_PREV_CLASS,
    );
    stage.style.removeProperty("--kuusi-book-turn-progress");
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (turning || event.button !== 0 || !boundStage) {
      return;
    }
    if (
      event.target instanceof HTMLElement &&
      event.target.closest(`.${BOOK_NAV_CLASS}, button, a, input, textarea`)
    ) {
      return;
    }
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocityX: 0,
      axis: "pending",
      direction: 0,
    };
    try {
      boundStage.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || !boundStage || event.pointerId !== drag.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const dt = Math.max(1, event.timeStamp - drag.lastT);
    drag.velocityX = (event.clientX - drag.lastX) / dt;
    drag.lastX = event.clientX;
    drag.lastT = event.timeStamp;

    if (drag.axis === "pending") {
      if (Math.hypot(dx, dy) < 8) {
        return;
      }
      if (Math.abs(dx) < Math.abs(dy) * 1.15) {
        drag.axis = "vertical";
        return;
      }
      drag.axis = "horizontal";
      const wantsNext = dx < 0;
      if (wantsNext && spread >= spreads - 1) {
        drag.direction = 0;
        return;
      }
      if (!wantsNext && spread <= 0) {
        drag.direction = 0;
        return;
      }
      drag.direction = wantsNext ? 1 : -1;
      ensureBookTurnLeaf(boundStage);
      boundStage.classList.add(
        BOOK_DRAG_CLASS,
        drag.direction > 0 ? BOOK_TURN_NEXT_CLASS : BOOK_TURN_PREV_CLASS,
      );
    }

    if (drag.axis !== "horizontal" || !drag.direction) {
      return;
    }

    event.preventDefault();
    const width = Math.max(1, boundStage.clientWidth);
    const progress = dragTurnProgress(dx, width, drag.direction);
    boundStage.style.setProperty("--kuusi-book-turn-progress", String(progress));
  };

  const finishDrag = (event: PointerEvent): void => {
    if (!drag || !boundStage || event.pointerId !== drag.pointerId) {
      return;
    }
    const state = drag;
    drag = null;
    try {
      boundStage.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    if (state.axis === "pending") {
      // Edge tap — Apple Books: left third previous, right third next.
      const rect = boundStage.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const edge = rect.width * BOOK_EDGE_TAP_RATIO;
      if (x <= edge) {
        goToSpread(spread - 1);
      } else if (x >= rect.width - edge) {
        goToSpread(spread + 1);
      }
      return;
    }

    if (state.axis !== "horizontal" || !state.direction) {
      clearDragVisual(boundStage);
      return;
    }

    const width = Math.max(1, boundStage.clientWidth);
    const dx = event.clientX - state.startX;
    const progress = dragTurnProgress(dx, width, state.direction);
    const commit = shouldCommitTurn(progress, state.velocityX, state.direction);
    clearDragVisual(boundStage);

    if (commit) {
      goToSpread(spread + state.direction);
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    finishDrag(event);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (!drag || !boundStage || event.pointerId !== drag.pointerId) {
      return;
    }
    drag = null;
    clearDragVisual(boundStage);
  };

  const onWheel = (event: WheelEvent): void => {
    if (turning || !boundStage) {
      return;
    }
    const absX = Math.abs(event.deltaX);
    const absY = Math.abs(event.deltaY);
    // Trackpad horizontal (Books) or shift+wheel.
    if (absX > absY && absX > 6) {
      event.preventDefault();
      goToSpread(spread + (event.deltaX > 0 ? 1 : -1));
      return;
    }
    if (event.shiftKey && absY > 6) {
      event.preventDefault();
      goToSpread(spread + (event.deltaY > 0 ? 1 : -1));
    }
  };

  const ensureNavBound = (): void => {
    const p = paperOf();
    if (!p) {
      return;
    }
    const c = ensureChrome(p, t);
    if (boundPrev !== c.prev) {
      boundPrev?.removeEventListener("click", onPrev);
      c.prev.addEventListener("click", onPrev);
      boundPrev = c.prev;
    }
    if (boundNext !== c.next) {
      boundNext?.removeEventListener("click", onNext);
      c.next.addEventListener("click", onNext);
      boundNext = c.next;
    }
    if (boundStage !== c.stage) {
      boundStage?.removeEventListener("scroll", onStageScroll);
      boundStage?.removeEventListener("pointerdown", onPointerDown);
      boundStage?.removeEventListener("pointermove", onPointerMove);
      boundStage?.removeEventListener("pointerup", onPointerUp);
      boundStage?.removeEventListener("pointercancel", onPointerCancel);
      boundStage?.removeEventListener("wheel", onWheel);
      c.stage.addEventListener("scroll", onStageScroll, { passive: true });
      c.stage.addEventListener("pointerdown", onPointerDown);
      c.stage.addEventListener("pointermove", onPointerMove);
      c.stage.addEventListener("pointerup", onPointerUp);
      c.stage.addEventListener("pointercancel", onPointerCancel);
      c.stage.addEventListener("wheel", onWheel, { passive: false });
      boundStage = c.stage;
    }
  };

  const schedule = (): void => {
    if (frame || applying || turning) {
      return;
    }
    frame = requestAnimationFrame(() => {
      frame = 0;
      ensureNavBound();
      layout();
    });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT")
    ) {
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      goToSpread(spread - 1);
    } else if (
      event.key === "ArrowRight" ||
      event.key === "PageDown" ||
      event.key === " "
    ) {
      event.preventDefault();
      goToSpread(spread + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      goToSpread(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goToSpread(spreads - 1);
    }
  };

  root.addEventListener("keydown", onKeyDown);
  if (!root.hasAttribute("tabindex")) {
    root.tabIndex = 0;
  }

  const ro =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (!applying && !turning) {
            schedule();
          }
        })
      : null;
  const observePaper = paperOf();
  if (observePaper && ro) {
    ro.observe(observePaper);
  }

  const mo = new MutationObserver((records) => {
    if (applying || turning) {
      return;
    }
    const relevant = records.some((record) => {
      if (record.type === "attributes") {
        const name = record.attributeName ?? "";
        return (
          name.startsWith("data-kuusi-") ||
          name === "style" ||
          name === "class"
        );
      }
      if (isBookChrome(record.target)) {
        return false;
      }
      return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(
        (node) => !isBookChrome(node),
      );
    });
    if (relevant) {
      schedule();
    }
  });
  mo.observe(root, {
    attributes: true,
    attributeFilter: [
      "data-kuusi-book-columns",
      "data-kuusi-article-font",
      "data-kuusi-article-font-size",
      "data-kuusi-article-padding",
      "style",
      "class",
    ],
    childList: true,
    characterData: true,
    subtree: true,
  });

  // Keep the open spread: `layout` clamps it to the new page count. Resetting
  // to the first opening here also fired on the settings event that follows
  // every page turn, so "Next" only ever reached the second opening.
  const settingsDisp = manager?.changed.connect(() => {
    schedule();
  });

  root.addEventListener("load", schedule, true);
  document.fonts?.addEventListener?.("loadingdone", schedule);

  schedule();

  const handle: BookPagerHandle = {
    dispose: () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("load", schedule, true);
      document.fonts?.removeEventListener?.("loadingdone", schedule);
      boundPrev?.removeEventListener("click", onPrev);
      boundNext?.removeEventListener("click", onNext);
      boundStage?.removeEventListener("scroll", onStageScroll);
      boundStage?.removeEventListener("pointerdown", onPointerDown);
      boundStage?.removeEventListener("pointermove", onPointerMove);
      boundStage?.removeEventListener("pointerup", onPointerUp);
      boundStage?.removeEventListener("pointercancel", onPointerCancel);
      boundStage?.removeEventListener("wheel", onWheel);
      if (boundStage) {
        boundStage.classList.remove(
          BOOK_TURNING_CLASS,
          BOOK_DRAG_CLASS,
          BOOK_TURN_NEXT_CLASS,
          BOOK_TURN_PREV_CLASS,
        );
      }
      ro?.disconnect();
      mo.disconnect();
      settingsDisp?.disconnect();
      bound.delete(widget);
    },
    refresh: schedule,
    pageCount: () => spreads,
    spreadIndex: () => spread,
  };

  widget.disposed.connect(() => {
    handle.dispose();
  });

  return handle;
};

import { PAGE_GAP_PX } from "./articlePaged";
import type { KuusiTranslator } from "./kuusiI18n";
import { resolveArticleStrip } from "./renderPaneZoom";

/** Height of one thumbnail, in px. */
const THUMB_HEIGHT = 84;
/** Visible space between neighbouring thumbnails, in px. */
const THUMB_GAP = 8;
/** Room the pager takes at the bottom of the desk (bar + margin), in px. */
const PAGER_HEIGHT = 136;
/** Vertical wheel / trackpad gesture: pages flip once per gesture. */
const WHEEL_QUIET_MS = 140;
const WHEEL_LOCK_MS = 420;

export type ArticlePager = { dispose: () => void };

export type ArticlePagerOptions = {
  /** Fullscreen element; the pager is mounted inside it. */
  host: HTMLElement;
  /** Re-fit the zoom once the strip exists or its page count changes. */
  refreshZoom: () => void;
  t: KuusiTranslator;
};

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** The desk is in fullscreen with the horizontal single-column page strip. */
const stripWanted = (host: HTMLElement): HTMLElement | null => {
  const desk = host.querySelector<HTMLElement>(
    ".jp-KuusiArticle-paper:not(.jp-KuusiArticle-pagerClone)",
  );

  return desk &&
    desk.dataset.kuusiArticleFullscreen === "1" &&
    desk.dataset.kuusiArticlePageScroll !== "vertical" &&
    desk.dataset.kuusiArticlePageLayout === "paged" &&
    desk.dataset.kuusiArticleColumns !== "2"
    ? desk
    : null;
};

const stripPages = (pages: HTMLElement): HTMLElement[] =>
  Array.from(
    pages.querySelectorAll<HTMLElement>(":scope > .jp-KuusiArticle-pageSheet"),
  );

/**
 * Article fullscreen, horizontal page strip: one page fills the screen with a
 * row of thumbnails below it. Arrow keys, the side buttons, a swipe or the
 * wheel move between pages; all pages keep one size.
 *
 * The strip itself is laid out by `articlePaged.ts` (CSS columns, one per
 * page). This module only centres the current page (so `scrollLeft` is always
 * `index * stride`), adds the controls, and keeps the thumbnails in step.
 */
export const mountArticlePager = (
  options: ArticlePagerOptions,
): ArticlePager => {
  const { host, refreshZoom, t } = options;

  const root = document.createElement("div");
  root.className = "jp-KuusiArticle-pager";
  root.hidden = true;

  let deskNode: HTMLElement | null = null;
  let stripNode: HTMLElement | null = null;
  let active = false;
  let stridePx = 1;
  let pageCount = 0;
  let cells: HTMLButtonElement[] = [];
  let frame = 0;
  let rebuildTimer: number | null = null;
  let needsRebuild = true;
  let wheelLockUntil = 0;
  let disposed = false;

  const current = (): number =>
    deskNode && stridePx > 0
      ? Math.min(
          Math.max(0, pageCount - 1),
          Math.max(0, Math.round(deskNode.scrollLeft / stridePx)),
        )
      : 0;

  const goTo = (index: number): void => {
    if (!deskNode || !active) {
      return;
    }

    const target = Math.min(pageCount - 1, Math.max(0, index));
    deskNode.scrollTo({ left: target * stridePx, behavior: "smooth" });
  };

  const makeNav = (direction: "prev" | "next"): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `jp-KuusiArticle-pagerNav is-${direction}`;
    const label = direction === "prev" ? t.previousPage() : t.nextPage();
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = direction === "prev" ? "‹" : "›";
    button.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      goTo(current() + (direction === "prev" ? -1 : 1));
    });
    return button;
  };

  const prev = makeNav("prev");
  const next = makeNav("next");

  const bar = document.createElement("div");
  bar.className = "jp-KuusiArticle-pagerBar";
  const counter = document.createElement("div");
  counter.className = "jp-KuusiArticle-pagerCounter";
  counter.setAttribute("aria-live", "polite");
  const thumbs = document.createElement("div");
  thumbs.className = "jp-KuusiArticle-pagerThumbs";
  const strip = document.createElement("div");
  strip.className = "jp-KuusiArticle-pagerStrip";
  thumbs.appendChild(strip);
  bar.append(counter, thumbs);
  root.append(prev, next, bar);
  host.appendChild(root);

  // Extends the desk's scroll range so the last page can also be centred.
  const spacer = document.createElement("div");
  spacer.className = "jp-KuusiArticle-pagerSpacer";
  spacer.setAttribute("aria-hidden", "true");

  const markCurrent = (): void => {
    const index = current();
    counter.textContent = `${index + 1} / ${pageCount}`;
    prev.disabled = index <= 0;
    next.disabled = index >= pageCount - 1;
    cells.forEach((cell, i) => {
      const on = i === index;
      if (cell.classList.contains("is-current") !== on) {
        cell.classList.toggle("is-current", on);
      }

      const aria = on ? "page" : "false";

      if (cell.getAttribute("aria-current") !== aria) {
        cell.setAttribute("aria-current", aria);
      }

      if (on) {
        // Keep the current thumbnail inside a scrolled thumbnail row.
        const left = cell.offsetLeft;
        const right = left + cell.offsetWidth;

        if (left < thumbs.scrollLeft) {
          thumbs.scrollLeft = left - THUMB_GAP;
        } else if (right > thumbs.scrollLeft + thumbs.clientWidth) {
          thumbs.scrollLeft = right - thumbs.clientWidth + THUMB_GAP;
        }
      }
    });
  };

  const clearThumbs = (): void => {
    strip.replaceChildren();
    cells = [];
  };

  /**
   * One scaled copy of the strip: it already holds every page side by side, so
   * a single clone yields all thumbnails (not one copy per page). The copy sits
   * in a shallow clone of the desk so the stylesheet's attribute selectors and
   * CSS variables apply to it unchanged.
   */
  const rebuildThumbs = (
    desk: HTMLElement,
    pages: HTMLElement,
    sheets: HTMLElement[],
  ): void => {
    clearThumbs();
    const paperW = sheets[0].offsetWidth;
    const paperH = sheets[0].offsetHeight;

    if (paperW <= 0 || paperH <= 0) {
      return;
    }

    const scale = THUMB_HEIGHT / paperH;
    // Widen the gap so the scaled gap is THUMB_GAP, and keep the text columns
    // in step with the sheets (column gap = sheet gap + the page's margins).
    const gap = PAGE_GAP_PX + THUMB_GAP / scale;
    const styles = getComputedStyle(pages);
    const padX =
      (Number.parseFloat(styles.paddingLeft) || 0) +
      (Number.parseFloat(styles.paddingRight) || 0);
    const width = sheets.length * paperW + (sheets.length - 1) * gap;

    const frameEl = desk.cloneNode(false) as HTMLElement;
    frameEl.removeAttribute("id");
    frameEl.classList.add("jp-KuusiArticle-pagerClone");
    frameEl.setAttribute("aria-hidden", "true");
    const force = (el: HTMLElement, name: string, value: string): void => {
      el.style.setProperty(name, value, "important");
    };
    force(frameEl, "position", "relative");
    force(frameEl, "display", "block");
    force(frameEl, "overflow", "hidden");
    force(frameEl, "padding", "0");
    force(frameEl, "background", "transparent");
    force(frameEl, "pointer-events", "none");
    force(frameEl, "width", `${width * scale}px`);
    force(frameEl, "height", `${THUMB_HEIGHT}px`);

    const copy = pages.cloneNode(true) as HTMLElement;
    copy.removeAttribute("id");
    copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    copy.querySelectorAll("a, button, input").forEach((el) => {
      el.setAttribute("tabindex", "-1");
    });
    copy.classList.remove("jp-KuusiRenderZoomTarget--moving");
    copy.style.setProperty("--kuusi-render-zoom", String(scale));
    copy.style.setProperty("--kuusi-article-strip-shift", "0px");
    copy.style.setProperty("--kuusi-article-strip-shift-y", "0px");
    copy.style.setProperty("left", "0px");
    copy.style.setProperty("top", "0px");
    copy.style.setProperty("width", `${width}px`);
    copy.style.setProperty("column-gap", `${gap + padX}px`);
    stripPages(copy).forEach((sheet, i) => {
      sheet.style.left = `${i * (paperW + gap)}px`;
    });
    frameEl.appendChild(copy);
    strip.style.width = `${width * scale}px`;
    strip.style.height = `${THUMB_HEIGHT}px`;
    strip.appendChild(frameEl);

    sheets.forEach((_, i) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "jp-KuusiArticle-pagerCell";
      cell.style.left = `${i * (paperW + gap) * scale}px`;
      cell.style.width = `${paperW * scale}px`;
      cell.style.height = `${THUMB_HEIGHT}px`;
      cell.title = `${t.pagerPage()} ${i + 1}`;
      cell.setAttribute("aria-label", cell.title);
      cell.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      cell.addEventListener("click", (event) => {
        event.stopPropagation();
        goTo(i);
      });
      strip.appendChild(cell);
      cells.push(cell);
    });
  };

  const deactivate = (): void => {
    if (!active && root.hidden && !host.classList.contains("has-kuusi-article-pager")) {
      return;
    }

    active = false;
    root.hidden = true;
    clearThumbs();
    spacer.remove();
    deskNode?.style.removeProperty("--kuusi-article-pager-h");
    stripNode?.style.removeProperty("--kuusi-article-strip-shift");
    stripNode?.style.removeProperty("--kuusi-article-strip-shift-y");
    host.classList.remove("has-kuusi-article-pager");
  };

  const scheduleRebuild = (delay: number): void => {
    if (rebuildTimer !== null) {
      window.clearTimeout(rebuildTimer);
    }

    // Pagination replaces the sheets in bursts; copy once it settles.
    rebuildTimer = window.setTimeout(() => {
      rebuildTimer = null;
      const again = resolveArticleStrip(host);

      if (disposed || !again) {
        return;
      }

      const pages = again.sheet.parentElement as HTMLElement;
      const list = stripPages(pages);

      if (list.length > 0) {
        needsRebuild = false;
        rebuildThumbs(again.desk, pages, list);
        markCurrent();
        // Pagination has settled: fit the zoom to one page now (a no-op when
        // it already does).
        refreshZoom();
      }
    }, delay);
  };

  const sync = (): void => {
    frame = 0;

    if (disposed) {
      return;
    }

    // Whether the strip is wanted follows the settings, not whether its DOM
    // exists this instant: re-pagination briefly removes the sheets, and
    // dropping the reserved space then would resize the desk and trigger yet
    // another pagination.
    const wanted = stripWanted(host);

    if (!wanted) {
      deactivate();
      return;
    }

    // `classList.add` queues a mutation record even when the class is already
    // there, which would wake the host observer and loop back into `sync`.
    if (!host.classList.contains("has-kuusi-article-pager")) {
      host.classList.add("has-kuusi-article-pager");
    }

    root.hidden = false;

    if (wanted.style.getPropertyValue("--kuusi-article-pager-h") !== `${PAGER_HEIGHT}px`) {
      wanted.style.setProperty("--kuusi-article-pager-h", `${PAGER_HEIGHT}px`);
    }

    const found = resolveArticleStrip(host);

    if (!found) {
      return;
    }

    const { desk, sheet } = found;
    const pages = sheet.parentElement as HTMLElement;
    const sheets = stripPages(pages);

    if (sheets.length === 0) {
      return;
    }

    const wasActive = active;
    const countChanged = sheets.length !== pageCount;
    active = true;
    attach(desk, pages);
    pageCount = sheets.length;

    const zoom =
      Number.parseFloat(pages.style.getPropertyValue("--kuusi-render-zoom")) ||
      1;
    const paperW = sheet.offsetWidth;
    const paperH = sheet.offsetHeight;
    stridePx = (paperW + PAGE_GAP_PX) * zoom;

    // Centre page 0, so page i is centred at scrollLeft = i * stride.
    const deskW = desk.clientWidth;
    const room = desk.clientHeight - (pages.offsetTop || 0) - PAGER_HEIGHT;
    const shiftX = (deskW - paperW * zoom) / 2 - pages.offsetLeft;
    const shiftY = Math.max(0, (room - paperH * zoom) / 2);
    // Whole values only: a long float is re-serialised by the browser, so the
    // "unchanged" check would never match and every write would trigger the
    // style observer again.
    const px = (value: number): string => `${Math.round(value * 100) / 100}px`;
    const setVar = (name: string, value: string): void => {
      if (pages.style.getPropertyValue(name) !== value) {
        pages.style.setProperty(name, value);
      }
    };
    setVar("--kuusi-article-strip-shift", px(shiftX));
    setVar("--kuusi-article-strip-shift-y", px(shiftY));

    // …and let the last page be centred too.
    const spacerLeft = px((pageCount - 1) * stridePx + deskW - 1);

    if (spacer.parentElement !== desk) {
      desk.appendChild(spacer);
    }

    if (spacer.style.left !== spacerLeft) {
      spacer.style.left = spacerLeft;
    }

    if (needsRebuild || countChanged || !wasActive) {
      scheduleRebuild(wasActive ? 280 : 60);
    }

    if (!wasActive || countChanged) {
      refreshZoom();
    }

    markCurrent();
  };

  const schedule = (): void => {
    if (!disposed && !frame) {
      frame = window.requestAnimationFrame(sync);
    }
  };

  // --- observation -------------------------------------------------------

  // Class sets without the zoom "in motion" marker: that class comes and goes
  // with every zoom write, and re-adding a class that is already there still
  // queues a record. Neither changes the pages.
  const pageClasses = (value: string | null): string =>
    (value ?? "")
      .split(/\s+/)
      .filter((name) => name && name !== "jp-KuusiRenderZoomTarget--moving")
      .sort()
      .join(" ");
  const stripObserver = new MutationObserver((records) => {
    const classChanged = (r: MutationRecord): boolean =>
      r.type === "attributes" &&
      r.attributeName === "class" &&
      r.target instanceof HTMLElement &&
      pageClasses(r.oldValue) !== pageClasses(r.target.getAttribute("class"));

    if (records.some((r) => r.type === "childList" || classChanged(r))) {
      needsRebuild = true;
    }

    // Style writes (zoom, strip shift) and no-op class writes need no pass:
    // `sync` itself is what writes them.
    if (
      records.some(
        (r) =>
          r.type === "childList" ||
          (r.type === "attributes" &&
            (r.attributeName === "style" || classChanged(r))),
      )
    ) {
      schedule();
    }
  });
  const deskObserver = new MutationObserver(() => {
    schedule();
  });
  const resizeObserver =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => schedule())
      : null;

  const onScroll = (): void => {
    if (active) {
      markCurrent();
    }
  };

  const onWheel = (event: WheelEvent): void => {
    if (!active || event.ctrlKey || event.metaKey) {
      return;
    }

    // Sideways trackpad swipes scroll (and snap) natively.
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
      return;
    }

    event.preventDefault();
    const now = performance.now();

    if (now < wheelLockUntil) {
      // Still the same gesture (momentum): do not flip again.
      wheelLockUntil = Math.max(wheelLockUntil, now + WHEEL_QUIET_MS);
      return;
    }

    if (Math.abs(event.deltaY) < 4) {
      return;
    }

    wheelLockUntil = now + WHEEL_LOCK_MS;
    goTo(current() + (event.deltaY > 0 ? 1 : -1));
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      !active ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isTypingTarget(event.target)
    ) {
      return;
    }

    const index = current();
    let target: number;

    switch (event.key) {
      case "ArrowRight":
      case "PageDown":
        target = index + 1;
        break;
      case "ArrowLeft":
      case "PageUp":
        target = index - 1;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = pageCount - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    goTo(target);
  };

  function attach(desk: HTMLElement, pages: HTMLElement): void {
    if (desk !== deskNode) {
      deskNode?.removeEventListener("scroll", onScroll);
      deskNode?.removeEventListener("wheel", onWheel);
      deskObserver.disconnect();
      resizeObserver?.disconnect();
      deskNode = desk;
      desk.addEventListener("scroll", onScroll, { passive: true });
      desk.addEventListener("wheel", onWheel, { passive: false });
      deskObserver.observe(desk, {
        attributes: true,
        attributeFilter: [
          "data-kuusi-article-fullscreen",
          "data-kuusi-article-page-scroll",
          "data-kuusi-article-page-layout",
        ],
        childList: true,
      });
      resizeObserver?.observe(desk);
    }

    if (pages !== stripNode) {
      stripObserver.disconnect();
      stripNode = pages;
      stripObserver.observe(pages, {
        attributes: true,
        attributeFilter: ["class", "style"],
        attributeOldValue: true,
        childList: true,
      });
    }
  }

  window.addEventListener("keydown", onKeyDown, true);

  // Entering fullscreen flips attributes on the desk before it is laid out, so
  // also watch the fullscreen element for its class changing.
  const hostObserver = new MutationObserver(() => schedule());
  hostObserver.observe(host, { attributes: true, attributeFilter: ["class"] });

  const wireDesk = (): void => {
    const desk = host.querySelector<HTMLElement>(
      ".jp-KuusiArticle-paper:not(.jp-KuusiArticle-pagerClone)",
    );

    if (!desk) {
      return;
    }

    const pages = desk.querySelector<HTMLElement>(
      ".jp-RenderedMarkdown, .jp-RenderedMySTMarkdown",
    );

    if (pages && (desk !== deskNode || pages !== stripNode)) {
      attach(desk, pages);
    }
  };

  wireDesk();
  schedule();
  // The desk can appear (or be re-rendered) after the header; keep looking.
  const wireTimer = window.setInterval(() => {
    wireDesk();
    schedule();
  }, 1500);

  return {
    dispose: () => {
      disposed = true;
      window.clearInterval(wireTimer);
      window.removeEventListener("keydown", onKeyDown, true);
      deskNode?.removeEventListener("scroll", onScroll);
      deskNode?.removeEventListener("wheel", onWheel);
      stripObserver.disconnect();
      deskObserver.disconnect();
      hostObserver.disconnect();
      resizeObserver?.disconnect();

      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      if (rebuildTimer !== null) {
        window.clearTimeout(rebuildTimer);
      }

      spacer.remove();
      root.remove();
    },
  };
};

import { PAGE_GAP_PX } from "./articlePaged";
import type { KuusiTranslator } from "./kuusiI18n";

/** Width of the panel, in px. */
const SIDEBAR_WIDTH = 252;
/** Width of one page thumbnail, in px. */
const THUMB_WIDTH = 168;
const STORAGE_KEY = "kuusi:article-sidebar";

type Tab = "outline" | "pages";
type Remembered = { open: boolean; tab: Tab };

export type ArticleSidebar = { dispose: () => void };

export type ArticleSidebarOptions = {
  /** Fullscreen element; the sidebar is mounted inside it. */
  host: HTMLElement;
  t: KuusiTranslator;
};

const DESK_SELECTOR = ".jp-KuusiArticle-paper:not(.jp-KuusiArticle-pagerClone)";

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

// Write only on change: a no-op write still queues a mutation record, and the
// article layout observers sit on the same node.
const setAttr = (el: HTMLElement, name: string, value: string): void => {
  if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
};
const setHidden = (el: HTMLElement, hidden: boolean): void => {
  if (el.hidden !== hidden) {
    el.hidden = hidden;
  }
};
const setClass = (el: HTMLElement, name: string, on: boolean): void => {
  if (el.classList.contains(name) !== on) {
    el.classList.toggle(name, on);
  }
};

const readRemembered = (): Remembered => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");

    return {
      open: raw?.open !== false,
      tab: raw?.tab === "pages" ? "pages" : "outline",
    };
  } catch {
    return { open: true, tab: "outline" };
  }
};

const remember = (value: Remembered): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the choice just is not kept.
  }
};

/** The desk is in fullscreen and scrolls vertically. */
const sidebarDesk = (host: HTMLElement): HTMLElement | null => {
  const desk = host.querySelector<HTMLElement>(DESK_SELECTOR);

  return desk &&
    desk.dataset.kuusiArticleFullscreen === "1" &&
    desk.dataset.kuusiArticlePageScroll !== "horizontal" &&
    !(
      desk.dataset.kuusiArticlePageLayout === "paged" &&
      desk.dataset.kuusiArticlePageScroll !== "vertical"
    )
    ? desk
    : null;
};

const pagesOf = (desk: HTMLElement): HTMLElement | null =>
  desk.querySelector<HTMLElement>(
    ".jp-RenderedMarkdown, .jp-RenderedMySTMarkdown",
  );

const sheetsOf = (pages: HTMLElement): HTMLElement[] =>
  Array.from(
    pages.querySelectorAll<HTMLElement>(":scope > .jp-KuusiArticle-pageSheet"),
  );

type Heading = { el: HTMLElement; level: number; text: string };

const headingsOf = (pages: HTMLElement): Heading[] =>
  Array.from(pages.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"))
    .filter((el) => !el.closest("[data-kuusi-columns-clone]"))
    .map((el) => ({
      el,
      level: Number(el.tagName.slice(1)),
      text: (el.textContent ?? "").replace(/¶/g, "").trim(),
    }))
    .filter((h) => h.text.length > 0);

/**
 * Article fullscreen, vertical scrolling: a collapsible panel on the left with
 * the document outline and a column of page thumbnails. Opening it narrows the
 * desk (so the pages re-centre in what is left); the toggle stays visible
 * either way.
 */
export const mountArticleSidebar = (
  options: ArticleSidebarOptions,
): ArticleSidebar => {
  const { host, t } = options;
  let state = readRemembered();
  let active = false;
  let deskNode: HTMLElement | null = null;
  let pagesNode: HTMLElement | null = null;
  let frame = 0;
  let rebuildTimer: number | null = null;
  let outlineDirty = true;
  let thumbsDirty = true;
  let headings: Heading[] = [];
  let outlineButtons: HTMLButtonElement[] = [];
  let cells: HTMLButtonElement[] = [];
  let disposed = false;

  const root = document.createElement("div");
  root.className = "jp-KuusiArticle-sidebar";
  root.hidden = true;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "jp-KuusiArticle-sidebarToggle";
  toggle.textContent = "☰";

  const panel = document.createElement("div");
  panel.className = "jp-KuusiArticle-sidebarPanel";
  panel.style.width = `${SIDEBAR_WIDTH}px`;

  const tabs = document.createElement("div");
  tabs.className = "jp-KuusiArticle-sidebarTabs";
  tabs.setAttribute("role", "tablist");
  const makeTab = (tab: Tab, label: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "jp-KuusiArticle-sidebarTab";
    button.setAttribute("role", "tab");
    button.textContent = label;
    button.dataset.tab = tab;
    button.addEventListener("click", () => {
      state = { ...state, tab };
      remember(state);
      render();
    });
    return button;
  };
  const outlineTab = makeTab("outline", t.sidebarOutline());
  const pagesTab = makeTab("pages", t.sidebarPages());
  tabs.append(outlineTab, pagesTab);

  const outlineList = document.createElement("div");
  outlineList.className = "jp-KuusiArticle-sidebarOutline";
  const thumbList = document.createElement("div");
  thumbList.className = "jp-KuusiArticle-sidebarThumbs";
  panel.append(tabs, outlineList, thumbList);
  root.append(panel, toggle);
  host.appendChild(root);

  const scrollTopOf = (desk: HTMLElement, el: HTMLElement): number =>
    desk.scrollTop +
    el.getBoundingClientRect().top -
    desk.getBoundingClientRect().top;

  // A jump, not a smooth scroll: a re-pagination mid-animation would restore
  // the scroll position it started from and cancel the animation.
  const scrollToElement = (el: HTMLElement, offset: number): void => {
    if (deskNode) {
      deskNode.scrollTop = Math.max(0, scrollTopOf(deskNode, el) - offset);
    }
  };

  const buildOutline = (): void => {
    outlineList.replaceChildren();
    outlineButtons = [];
    headings = pagesNode ? headingsOf(pagesNode) : [];

    if (headings.length === 0) {
      const empty = document.createElement("div");
      empty.className = "jp-KuusiArticle-sidebarEmpty";
      empty.textContent = t.sidebarNoHeadings();
      outlineList.appendChild(empty);
      return;
    }

    const top = Math.min(...headings.map((h) => h.level));

    headings.forEach((heading) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jp-KuusiArticle-sidebarItem";
      button.style.paddingLeft = `${10 + (heading.level - top) * 14}px`;
      button.textContent = heading.text;
      button.title = heading.text;
      button.addEventListener("click", () => {
        scrollToElement(heading.el, 24);
      });
      outlineList.appendChild(button);
      outlineButtons.push(button);
    });
    outlineDirty = false;
  };

  /**
   * One scaled copy of the pages beside a button per page, like the
   * horizontal pager: the stylesheet's attribute selectors and variables apply
   * to the copy because it sits in a shallow clone of the desk.
   */
  const buildThumbs = (): void => {
    thumbList.replaceChildren();
    cells = [];

    if (!deskNode || !pagesNode) {
      return;
    }

    const sheets = sheetsOf(pagesNode);

    if (sheets.length === 0) {
      return;
    }

    const paperW = sheets[0].offsetWidth;
    const paperH = sheets[0].offsetHeight;

    if (paperW <= 0 || paperH <= 0) {
      return;
    }

    const scale = THUMB_WIDTH / paperW;
    const stride = paperH + PAGE_GAP_PX;
    const frameEl = deskNode.cloneNode(false) as HTMLElement;
    frameEl.removeAttribute("id");
    frameEl.classList.add("jp-KuusiArticle-pagerClone");
    frameEl.setAttribute("aria-hidden", "true");
    const force = (el: HTMLElement, name: string, value: string): void => {
      el.style.setProperty(name, value, "important");
    };
    const totalH = (sheets.length - 1) * stride + paperH;
    force(frameEl, "position", "absolute");
    force(frameEl, "inset", "0 auto auto 0");
    force(frameEl, "display", "block");
    force(frameEl, "overflow", "hidden");
    force(frameEl, "padding", "0");
    force(frameEl, "background", "transparent");
    force(frameEl, "pointer-events", "none");
    force(frameEl, "width", `${THUMB_WIDTH}px`);
    force(frameEl, "height", `${totalH * scale}px`);

    const copy = pagesNode.cloneNode(true) as HTMLElement;
    copy.removeAttribute("id");
    copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    copy.querySelectorAll("a, button, input").forEach((el) => {
      el.setAttribute("tabindex", "-1");
    });
    copy.classList.remove("jp-KuusiRenderZoomTarget--moving");
    copy.style.setProperty("--kuusi-render-zoom", String(scale));
    copy.style.setProperty("left", "0px");
    copy.style.setProperty("top", "0px");
    copy.style.setProperty("width", `${paperW}px`);
    copy.style.setProperty("height", `${totalH}px`);
    copy.style.setProperty("transform-origin", "0 0", "important");
    frameEl.appendChild(copy);

    const holder = document.createElement("div");
    holder.className = "jp-KuusiArticle-sidebarThumbsInner";
    holder.style.width = `${THUMB_WIDTH}px`;
    holder.style.height = `${totalH * scale}px`;
    holder.appendChild(frameEl);

    sheets.forEach((sheet, i) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "jp-KuusiArticle-sidebarCell";
      cell.style.top = `${i * stride * scale}px`;
      cell.style.height = `${paperH * scale}px`;
      cell.title = `${t.pagerPage()} ${i + 1}`;
      cell.setAttribute("aria-label", cell.title);
      const number = document.createElement("span");
      number.className = "jp-KuusiArticle-sidebarCellNumber";
      number.textContent = String(i + 1);
      cell.appendChild(number);
      cell.addEventListener("click", () => {
        const live = pagesNode ? sheetsOf(pagesNode)[i] : null;
        scrollToElement(live ?? sheet, 36);
      });
      holder.appendChild(cell);
      cells.push(cell);
    });

    thumbList.appendChild(holder);
    thumbsDirty = false;
  };

  // The lists only follow the page when the current entry changes, and never
  // while the reader is scrolling a list by hand (otherwise it snaps back).
  const USER_SCROLL_HOLD_MS = 2000;
  let lastOutlineIndex = -1;
  let lastPageIndex = -1;
  let userScrolledAt = 0;
  const holdForUser = (): void => {
    userScrolledAt = Date.now();
  };
  [outlineList, thumbList].forEach((list) => {
    list.addEventListener("wheel", holdForUser, { passive: true });
    list.addEventListener("touchmove", holdForUser, { passive: true });
    list.addEventListener("pointerdown", holdForUser);
  });
  const userIsScrolling = (): boolean =>
    Date.now() - userScrolledAt < USER_SCROLL_HOLD_MS;

  const markCurrent = (): void => {
    if (!deskNode || !active) {
      return;
    }

    const deskRect = deskNode.getBoundingClientRect();
    const probe = deskRect.top + deskRect.height * 0.3;

    if (state.tab === "outline" && headings.length > 0) {
      let index = 0;
      headings.forEach((h, i) => {
        if (h.el.getBoundingClientRect().top <= probe) {
          index = i;
        }
      });
      const follow = index !== lastOutlineIndex && !userIsScrolling();
      lastOutlineIndex = index;
      outlineButtons.forEach((button, i) => {
        const on = i === index;
        setClass(button, "is-current", on);

        if (on && follow) {
          const top = button.offsetTop;
          const bottom = top + button.offsetHeight;

          if (top < outlineList.scrollTop) {
            outlineList.scrollTop = top - 8;
          } else if (bottom > outlineList.scrollTop + outlineList.clientHeight) {
            outlineList.scrollTop = bottom - outlineList.clientHeight + 8;
          }
        }
      });
    }

    if (state.tab === "pages" && pagesNode && cells.length > 0) {
      const sheets = sheetsOf(pagesNode);
      const middle = deskRect.top + deskRect.height / 2;
      let index = 0;
      sheets.forEach((sheet, i) => {
        if (sheet.getBoundingClientRect().top <= middle) {
          index = i;
        }
      });
      const follow = index !== lastPageIndex && !userIsScrolling();
      lastPageIndex = index;
      cells.forEach((cell, i) => {
        const on = i === index;
        setClass(cell, "is-current", on);

        if (on && follow) {
          const top = cell.offsetTop;
          const bottom = top + cell.offsetHeight;

          if (top < thumbList.scrollTop) {
            thumbList.scrollTop = top - 8;
          } else if (bottom > thumbList.scrollTop + thumbList.clientHeight) {
            thumbList.scrollTop = bottom - thumbList.clientHeight + 8;
          }
        }
      });
    }
  };

  const hasSheets = (): boolean =>
    Boolean(pagesNode && sheetsOf(pagesNode).length > 0);

  /** Draw the current state: toggle, tab, the visible list, desk inset. */
  function render(): void {
    if (!active) {
      return;
    }

    const open = state.open;
    setHidden(root, false);
    setClass(root, "is-open", open);
    setHidden(panel, !open);
    const label = open ? t.sidebarHide() : t.sidebarShow();
    setAttr(toggle, "title", label);
    setAttr(toggle, "aria-label", label);
    setAttr(toggle, "aria-pressed", String(open));

    // Thumbnails need the paged layout; the outline works everywhere.
    const showPages = hasSheets();
    setHidden(pagesTab, !showPages);
    const tab: Tab = showPages ? state.tab : "outline";
    setClass(outlineTab, "is-active", tab === "outline");
    setClass(pagesTab, "is-active", tab === "pages");
    setAttr(outlineTab, "aria-selected", String(tab === "outline"));
    setAttr(pagesTab, "aria-selected", String(tab === "pages"));
    setHidden(outlineList, tab !== "outline");
    setHidden(thumbList, tab !== "pages");

    // Rebuilding empties the list, which resets its scroll to the top; put it
    // back so a rebuild never makes the list jump.
    if (open && tab === "outline" && outlineDirty) {
      const keep = outlineList.scrollTop;
      buildOutline();
      outlineList.scrollTop = keep;
    }

    if (open && tab === "pages" && thumbsDirty) {
      const keep = thumbList.scrollTop;
      buildThumbs();
      thumbList.scrollTop = keep;
    }

    applyInset(open);
    markCurrent();
  }

  /** Make room: the stylesheet shifts the pages right of the panel. */
  const applyInset = (open: boolean): void => {
    // `classList.toggle` queues a mutation record even when nothing changes,
    // which would wake the host observer and loop back into `sync`.
    setClass(host, "has-kuusi-article-sidebar", open);
  };

  const deactivate = (): void => {
    if (!active && root.hidden) {
      return;
    }

    active = false;
    root.hidden = true;
    thumbList.replaceChildren();
    cells = [];
    thumbsDirty = true;
    outlineDirty = true;

    applyInset(false);
  };

  const scheduleRebuild = (): void => {
    if (rebuildTimer !== null) {
      window.clearTimeout(rebuildTimer);
    }

    // Pagination replaces the sheets in bursts; copy once it settles.
    rebuildTimer = window.setTimeout(() => {
      rebuildTimer = null;

      if (!disposed && active) {
        outlineDirty = true;
        thumbsDirty = true;
        render();
      }
    }, 300);
  };

  function sync(): void {
    frame = 0;

    if (disposed) {
      return;
    }

    const desk = sidebarDesk(host);

    if (!desk) {
      deactivate();
      return;
    }

    const pages = pagesOf(desk);

    if (desk !== deskNode) {
      deskNode?.removeEventListener("scroll", onScroll);
      deskNode = desk;
      desk.addEventListener("scroll", onScroll, { passive: true });
    }

    if (pages !== pagesNode) {
      pagesObserver.disconnect();
      pagesNode = pages;
      outlineDirty = true;
      thumbsDirty = true;

      if (pages) {
        pagesObserver.observe(pages, { childList: true, subtree: false });
      }
    }

    const wasActive = active;
    active = true;
    render();

    if (!wasActive) {
      scheduleRebuild();
    }
  }

  function schedule(): void {
    if (!disposed && !frame) {
      frame = window.requestAnimationFrame(sync);
    }
  }

  const onScroll = (): void => {
    if (!active) {
      return;
    }

    if (!scrollFrame) {
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        markCurrent();
      });
    }
  };
  let scrollFrame = 0;

  const pagesObserver = new MutationObserver(() => {
    if (active) {
      scheduleRebuild();
    }
  });
  // Settings flip attributes on the desk; fullscreen flips the host's class.
  const hostObserver = new MutationObserver(() => schedule());
  hostObserver.observe(host, { attributes: true, attributeFilter: ["class"] });
  const deskObserver = new MutationObserver(() => schedule());
  let observedDesk: HTMLElement | null = null;

  const watchDesk = (): void => {
    const desk = host.querySelector<HTMLElement>(DESK_SELECTOR);

    if (desk && desk !== observedDesk) {
      deskObserver.disconnect();
      observedDesk = desk;
      deskObserver.observe(desk, {
        attributes: true,
        attributeFilter: [
          "data-kuusi-article-fullscreen",
          "data-kuusi-article-page-scroll",
          "data-kuusi-article-page-layout",
        ],
      });
    }
  };

  toggle.addEventListener("click", () => {
    state = { ...state, open: !state.open };
    remember(state);
    render();
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      !active ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isTypingTarget(event.target) ||
      (event.key !== "o" && event.key !== "O")
    ) {
      return;
    }

    event.preventDefault();
    state = { ...state, open: !state.open };
    remember(state);
    render();
  };

  window.addEventListener("keydown", onKeyDown, true);
  watchDesk();
  schedule();
  // The desk can appear (or be re-rendered) after the header; keep looking.
  const wireTimer = window.setInterval(() => {
    watchDesk();
    schedule();
  }, 1500);

  return {
    dispose: () => {
      disposed = true;
      deactivate();
      window.clearInterval(wireTimer);
      window.removeEventListener("keydown", onKeyDown, true);
      deskNode?.removeEventListener("scroll", onScroll);
      pagesObserver.disconnect();
      hostObserver.disconnect();
      deskObserver.disconnect();

      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      if (scrollFrame) {
        window.cancelAnimationFrame(scrollFrame);
      }

      if (rebuildTimer !== null) {
        window.clearTimeout(rebuildTimer);
      }

      root.remove();
    },
  };
};

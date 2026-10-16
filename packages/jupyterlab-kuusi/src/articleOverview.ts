import type { IDocumentWidget } from "@jupyterlab/docregistry";

import {
  buildArticleOverviewHtml,
  currentArticlePage,
  scrollArticleToPage,
} from "./articleVectorPrint";
import type { KuusiTranslator } from "./kuusiI18n";

const OVERLAY_CLASS = "jp-KuusiArticle-overview";

export type ArticleOverview = {
  toggle: () => void;
  close: () => void;
  dispose: () => void;
};

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Page overview for the paged Article: a grid of thumbnails over the view
 * (key G, or the corner button). Clicking a page closes the grid and scrolls
 * the Article to it; Esc / G closes.
 */
export const mountArticleOverview = (
  widget: IDocumentWidget,
  getTitle: () => string,
  t: KuusiTranslator,
): ArticleOverview => {
  let overlay: HTMLElement | null = null;
  let frame: HTMLIFrameElement | null = null;

  const onMessage = (event: MessageEvent): void => {
    if (!frame || event.source !== frame.contentWindow) {
      return;
    }

    const data = event.data as { kuusiOverviewPage?: number; kuusiOverviewClose?: boolean };

    if (typeof data?.kuusiOverviewPage === "number") {
      const index = data.kuusiOverviewPage;
      close();
      scrollArticleToPage(widget, index);
    } else if (data?.kuusiOverviewClose) {
      close();
    }
  };

  const close = (): void => {
    window.removeEventListener("message", onMessage);
    overlay?.remove();
    overlay = null;
    frame = null;
  };

  const open = (): void => {
    if (overlay) {
      return;
    }

    const built = buildArticleOverviewHtml(
      widget,
      getTitle(),
      currentArticlePage(widget),
    );

    if (!built) {
      return;
    }

    overlay = document.createElement("div");
    overlay.className = OVERLAY_CLASS;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", t.articleOverview());

    const bar = document.createElement("div");
    bar.className = `${OVERLAY_CLASS}Bar`;
    const title = document.createElement("span");
    title.textContent = `${t.articleOverview()} · ${built.count}`;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = `${OVERLAY_CLASS}Close`;
    closeBtn.textContent = "×";
    closeBtn.title = t.close();
    closeBtn.setAttribute("aria-label", t.close());
    closeBtn.addEventListener("click", close);
    bar.append(title, closeBtn);

    frame = document.createElement("iframe");
    frame.className = `${OVERLAY_CLASS}Frame`;
    frame.title = t.articleOverview();
    frame.srcdoc = built.html;

    overlay.append(bar, frame);
    widget.node.appendChild(overlay);
    window.addEventListener("message", onMessage);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || isTypingTarget(event.target)) {
      return;
    }

    if (event.key === "Escape" && overlay) {
      event.preventDefault();
      close();
      return;
    }

    if (
      event.key.toLowerCase() === "g" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      toggle();
    }
  };

  const toggle = (): void => {
    if (overlay) {
      close();
    } else {
      open();
    }
  };

  widget.node.addEventListener("keydown", onKeyDown);

  return {
    toggle,
    close,
    dispose: () => {
      close();
      widget.node.removeEventListener("keydown", onKeyDown);
    },
  };
};

import { mountArticlePager } from "./articlePager";
import { mountArticleSidebar } from "./articleSidebar";
import { PathExt } from "@jupyterlab/coreutils";
import type { MarkdownDocument } from "@jupyterlab/markdownviewer";

import {
  createArticlePageToolbar,
  createArticleThemeToolbar,
  createArticleTypographyModel,
} from "./articleMenus";
import { bindArticlePagedLayout, setStructureWords } from "./articlePaged";
import {
  applyArticleAppearance,
  type ArticleSettingsManager,
} from "./articleSettings";
import {
  bindDocumentStatusChrome,
  pageCountFromArticleHost,
} from "./bindStatusChrome";
import { closeKuusiDropdownMenus } from "./formatToolbar";
import { createKuusiTranslator } from "./kuusiI18n";
import { articleIcon } from "./kuusiIcon";
import {
  mountCssZoomRenderChrome,
  type ArticlePageScrollAxis,
} from "./renderViewChrome";
import { createTypographyCapsuleItems } from "./typographyCapsule";
import { createViewCapsuleLogo } from "./viewBrand";
import {
  mountViewCapsuleHeader,
  type ViewCapsuleHeader,
} from "./viewCapsule";

type ArticleChromeBinding = {
  capsule: ViewCapsuleHeader;
  disposeStatusChrome: () => void;
};

const chromeBindings = new WeakMap<MarkdownDocument, ArticleChromeBinding>();

const articlePaperHost = (widget: MarkdownDocument): HTMLElement | null => {
  const content = widget.content?.node;
  if (content instanceof HTMLElement) {
    return content;
  }

  return widget.node.querySelector<HTMLElement>(".jp-MarkdownViewer");
};

const mountArticleHeader = (
  widget: MarkdownDocument,
  manager: ArticleSettingsManager,
): void => {
  if (chromeBindings.has(widget) || widget.isDisposed) {
    return;
  }

  const t = createKuusiTranslator();
  const typography = createArticleTypographyModel(manager);
  const capsule = mountViewCapsuleHeader({
    host: widget.node,
    headerClass: "jp-KuusiArticle-header",
    ariaLabel: t.articleControls(),
    t,
    menuRoot: widget.node,
    items: [
      {
        id: "brand",
        group: "brand",
        order: 10,
        create: () => createViewCapsuleLogo(articleIcon, t.articleControls()),
      },
      {
        id: "theme",
        group: "appearance",
        order: 10,
        create: () => createArticleThemeToolbar(widget.node, manager, t),
      },
      {
        id: "page",
        group: "appearance",
        order: 20,
        create: () => createArticlePageToolbar(widget.node, manager, t),
      },
      ...createTypographyCapsuleItems(widget.node, typography, t),
    ],
  });

  // Fullscreen page swipe: horizontal by default.
  let pageScrollAxis: ArticlePageScrollAxis = "horizontal";
  let fullscreenActive = false;
  let renderChrome: ReturnType<typeof mountCssZoomRenderChrome> | null = null;
  const syncPaperScrollAxis = (active: boolean): void => {
    const paper = articlePaperHost(widget);
    if (!paper) {
      return;
    }
    paper.dataset.kuusiArticleFullscreen = active ? "1" : "0";
    paper.dataset.kuusiArticlePageScroll = effectiveScrollAxis();
  };
  // Two-column pages are stacked vertically (the horizontal strip is one
  // column per page), so they always scroll vertically in fullscreen.
  const effectiveScrollAxis = (): ArticlePageScrollAxis =>
    manager.settings.columns >= 2 ? "vertical" : pageScrollAxis;
  const syncScrollAxisButton = (): void => {
    const paged =
      manager.settings.pageLayout === "paged" ||
      articlePaperHost(widget)?.dataset.kuusiArticlePageLayout === "paged";
    renderChrome?.setPageScrollAxisVisible?.(
      fullscreenActive && Boolean(paged) && manager.settings.columns < 2,
    );
  };
  syncPaperScrollAxis(false);

  renderChrome = mountCssZoomRenderChrome(widget, widget.node, t, {
    showTextCount: manager.settings.showTextCount,
    showPageCount: manager.settings.showPageCount,
    showFileSize: manager.settings.showFileSize,
    showPageScrollAxis: true,
    getPageScrollAxis: () => pageScrollAxis,
    setPageScrollAxis: (axis) => {
      pageScrollAxis = axis;
      const paper = articlePaperHost(widget);
      if (paper) {
        paper.dataset.kuusiArticlePageScroll = effectiveScrollAxis();
        paper.scrollLeft = 0;
        paper.scrollTop = 0;
      }
    },
    onCloseMenus: () => closeKuusiDropdownMenus(widget.node),
    onActiveChange: (active) => {
      fullscreenActive = active;
      syncPaperScrollAxis(active);
      syncScrollAxisButton();
    },
  });
  // Fullscreen horizontal pages: one page at a time, thumbnails below.
  const pager = mountArticlePager({
    host: widget.node,
    refreshZoom: () => renderChrome?.syncZoomTarget(),
    t,
  });
  // Fullscreen vertical scrolling: outline and page thumbnails on the left.
  const sidebar = mountArticleSidebar({ host: widget.node, t });
  // Lab's viewer places the rendered page inside the desk's padding, but its
  // layout measures that padding only on a fit request. If the Article padding
  // is applied after the first fit, the page sits flush with the top edge (no
  // page margin), so ask for a fit once the padding is in place.
  const refreshViewerLayout = (): void => {
    window.requestAnimationFrame(() => {
      if (widget.isDisposed) {
        return;
      }

      widget.content?.fit();
      // The page moved inside the desk: centre the zoomed page again.
      window.setTimeout(() => renderChrome?.syncZoomTarget(), 120);
    });
  };
  refreshViewerLayout();
  window.setTimeout(refreshViewerLayout, 400);
  const settingsConnection = manager.changed.connect(() => {
    refreshViewerLayout();
    syncPaperScrollAxis(fullscreenActive);
    syncScrollAxisButton();
  });
  const disposeStatusChrome = bindDocumentStatusChrome({
    chrome: renderChrome,
    context: widget.context,
    manager,
    getPages: () => pageCountFromArticleHost(widget.node),
  });

  chromeBindings.set(widget, {
    capsule,
    disposeStatusChrome: () => {
      settingsConnection.disconnect();
      pager.dispose();
      sidebar.dispose();
      disposeStatusChrome();
    },
  });

  widget.disposed.connect(() => {
    const binding = chromeBindings.get(widget);

    if (!binding) {
      return;
    }

    binding.capsule.dispose();
    binding.disposeStatusChrome();
    chromeBindings.delete(widget);
    // JupyterLab keeps a closed widget's toolbar element, which keeps this
    // subtree alive as detached DOM; empty it once disposal has finished.
    window.setTimeout(() => widget.node.replaceChildren(), 0);
  });
};

/**
 * Shell keeps layout class only. Paper/typography attrs land on the viewer
 * (`.jp-KuusiArticle-paper`) so they do not fight DocumentWidget / toolbar CSS.
 */
export const applyArticleToMarkdownDocument = (
  widget: MarkdownDocument,
  manager: ArticleSettingsManager,
): void => {
  widget.node.classList.add("jp-KuusiMarkdownArticle");
  const paper = articlePaperHost(widget);
  if (!paper) {
    return;
  }

  applyArticleAppearance(paper, manager.settings);
};

export const ensureKuusiArticleChrome = (
  widget: MarkdownDocument,
  manager: ArticleSettingsManager,
): void => {
  applyArticleToMarkdownDocument(widget, manager);
  mountArticleHeader(widget, manager);
  {
    const words = createKuusiTranslator();
    setStructureWords({
      contents: words.contentsDefaultTitle(),
      figure: words.figureLabel(),
      links: words.linksLabel(),
    });
  }
  bindArticlePagedLayout(widget, manager, () =>
    PathExt.basename(
      widget.context.path,
      PathExt.extname(widget.context.path),
    ),
  );
};

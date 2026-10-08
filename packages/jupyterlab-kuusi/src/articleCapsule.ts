import { PathExt } from "@jupyterlab/coreutils";
import type { MarkdownDocument } from "@jupyterlab/markdownviewer";

import {
  createArticlePageToolbar,
  createArticleThemeToolbar,
  createArticleTypographyModel,
} from "./articleMenus";
import { bindArticlePagedLayout, setTocDefaultTitle } from "./articlePaged";
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
    paper.dataset.kuusiArticlePageScroll = pageScrollAxis;
  };
  const syncScrollAxisButton = (): void => {
    const paged =
      manager.settings.pageLayout === "paged" ||
      articlePaperHost(widget)?.dataset.kuusiArticlePageLayout === "paged";
    renderChrome?.setPageScrollAxisVisible?.(fullscreenActive && Boolean(paged));
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
        paper.dataset.kuusiArticlePageScroll = axis;
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
  const settingsConnection = manager.changed.connect(() => {
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
  setTocDefaultTitle(createKuusiTranslator().contentsDefaultTitle());
  bindArticlePagedLayout(widget, manager, () =>
    PathExt.basename(
      widget.context.path,
      PathExt.extname(widget.context.path),
    ),
  );
};

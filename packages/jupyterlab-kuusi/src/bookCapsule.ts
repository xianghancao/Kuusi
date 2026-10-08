import type { MarkdownDocument } from "@jupyterlab/markdownviewer";

import {
  createBookPageToolbar,
  createBookThemeToolbar,
  createBookTypographyModel,
} from "./bookMenus";
import { bindBookPagedLayout, type BookPagerHandle } from "./bookPaged";
import {
  applyBookAppearance,
  type BookSettingsManager,
} from "./bookSettings";
import { bindDocumentStatusChrome } from "./bindStatusChrome";
import { closeKuusiDropdownMenus } from "./formatToolbar";
import { createKuusiTranslator } from "./kuusiI18n";
import { bookIcon } from "./kuusiIcon";
import { mountCssZoomRenderChrome } from "./renderViewChrome";
import { createTypographyCapsuleItems } from "./typographyCapsule";
import { createViewCapsuleLogo } from "./viewBrand";
import {
  mountViewCapsuleHeader,
  type ViewCapsuleHeader,
} from "./viewCapsule";

type BookChromeBinding = {
  capsule: ViewCapsuleHeader;
  disposeStatusChrome: () => void;
  pager: BookPagerHandle | null;
};

const chromeBindings = new WeakMap<MarkdownDocument, BookChromeBinding>();

const bookPaperHost = (widget: MarkdownDocument): HTMLElement | null => {
  const content = widget.content?.node;
  if (content instanceof HTMLElement) {
    return content;
  }

  return widget.node.querySelector<HTMLElement>(".jp-MarkdownViewer");
};

/**
 * Capsule chrome lives on the Document shell (like Article), not inside the
 * paper flex column — stage/nav restructuring must not displace it.
 */
const mountBookHeader = (
  widget: MarkdownDocument,
  paper: HTMLElement,
  manager: BookSettingsManager,
): void => {
  if (chromeBindings.has(widget) || widget.isDisposed) {
    return;
  }

  const t = createKuusiTranslator();
  const typography = createBookTypographyModel(manager);
  // Menus still target the paper host for appearance/dataset lookups.
  const capsule = mountViewCapsuleHeader({
    host: widget.node,
    headerClass: "jp-KuusiBook-header",
    ariaLabel: t.bookControls(),
    t,
    menuRoot: widget.node,
    items: [
      {
        id: "brand",
        group: "brand",
        order: 10,
        create: () => createViewCapsuleLogo(bookIcon, t.bookControls()),
      },
      {
        id: "theme",
        group: "appearance",
        order: 15,
        create: () => createBookThemeToolbar(paper, manager, t),
      },
      {
        id: "page",
        group: "appearance",
        order: 20,
        create: () => createBookPageToolbar(paper, manager, t),
      },
      ...createTypographyCapsuleItems(paper, typography, t),
    ],
  });

  let pager: BookPagerHandle | null = null;
  const renderChrome = mountCssZoomRenderChrome(widget, widget.node, t, {
    showTextCount: manager.settings.showTextCount,
    showPageCount: manager.settings.showPageCount,
    showFileSize: manager.settings.showFileSize,
    onCloseMenus: () => closeKuusiDropdownMenus(widget.node),
    // Zoom is camera-only (transform). Do not re-layout page geometry.
  });
  pager = bindBookPagedLayout(widget, manager);
  renderChrome.syncZoomTarget();
  const disposeStatusChrome = bindDocumentStatusChrome({
    chrome: renderChrome,
    context: widget.context,
    manager,
    getPages: () => pager?.pageCount() ?? 1,
  });

  chromeBindings.set(widget, {
    capsule,
    disposeStatusChrome,
    pager,
  });

  widget.disposed.connect(() => {
    const binding = chromeBindings.get(widget);

    if (!binding) {
      return;
    }

    binding.capsule.dispose();
    binding.disposeStatusChrome();
    binding.pager?.dispose();
    chromeBindings.delete(widget);
  });
};

export const applyBookToMarkdownDocument = (
  widget: MarkdownDocument,
  manager: BookSettingsManager,
): void => {
  // Notebook Book already has jp-KuusiNotebookBook — don't dual-tag the shell.
  if (widget.node.classList.contains("jp-KuusiNotebookBook")) {
    widget.node.classList.remove("jp-KuusiMarkdownBook");
  } else {
    widget.node.classList.add("jp-KuusiMarkdownBook");
  }
  const paper = bookPaperHost(widget);
  if (!paper) {
    return;
  }

  applyBookAppearance(paper, manager.settings);
  chromeBindings.get(widget)?.pager?.refresh();
};

export const ensureKuusiBookChrome = (
  widget: MarkdownDocument,
  manager: BookSettingsManager,
): void => {
  applyBookToMarkdownDocument(widget, manager);
  const paper = bookPaperHost(widget);
  if (!paper) {
    return;
  }

  mountBookHeader(widget, paper, manager);
};

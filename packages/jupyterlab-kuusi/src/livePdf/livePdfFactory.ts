import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
} from "@jupyterlab/docregistry";
import {
  caretLeftIcon,
  caretRightIcon,
  folderIcon,
  redoIcon,
  refreshIcon,
  tocIcon,
  undoIcon,
} from "@jupyterlab/ui-components";
import { ToolbarButton } from "@jupyterlab/apputils";
import type { Contents } from "@jupyterlab/services";
import { Panel, Widget } from "@lumino/widgets";
import { clearPdfSourceLink, takePdfSourceLink } from "./livePdfSourceLink";
import {
  isLivePdfBackground,
  LIVE_PDF_BACKGROUND_OPTIONS,
  type LivePdfBackground,
} from "./livePdfBackground";
import { type LivePdfNavMode } from "./livePdfNavMode";
import { LivePdfViewer } from "./livePdfViewer";
import { createHighlightColorPicker } from "./livePdfHighlightPicker";
import { createZoomSliderControl } from "./livePdfZoomSlider";
import { livePdfIcon } from "../kuusiIcon";
import { applyKuusiTabIcon } from "../kuusiTabIcon";

type LivePdfBackgroundControls = {
  getBackground: () => LivePdfBackground;
  setBackground: (value: LivePdfBackground) => void;
  registerSelect: (select: HTMLSelectElement) => void;
  unregisterSelect: (select: HTMLSelectElement) => void;
};

type LivePdfDocumentOptions = DocumentWidget.IOptions<LivePdfViewer> & {
  revealInFileBrowser?: (path: string) => Promise<void>;
  jumpToSource?: (pdfPath: string, viewer: LivePdfViewer) => Promise<void>;
  showSourceLink?: boolean;
  backgroundControls?: LivePdfBackgroundControls;
};

const syncFitButton = (
  viewer: LivePdfViewer,
  fitButton: ToolbarButton,
): void => {
  fitButton.toggleClass("is-active", viewer.scaleMode === "fit-page");
};

const createAutoReloadSwitch = (viewer: LivePdfViewer): Widget => {
  const wrap = new Widget();
  wrap.addClass("jp-KuusiLivePdf-autoReload");

  const label = document.createElement("span");
  label.className = "jp-KuusiLivePdf-autoReloadLabel";
  label.textContent = "Auto reload";

  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.className = "jp-KuusiPanelWidget-switch";
  switchBtn.setAttribute("role", "switch");
  switchBtn.setAttribute("aria-label", "Auto reload");
  switchBtn.title = "Automatically reload when the PDF file changes on disk";

  const thumb = document.createElement("span");
  thumb.className = "jp-KuusiPanelWidget-switchThumb";
  thumb.setAttribute("aria-hidden", "true");
  switchBtn.appendChild(thumb);

  const syncSwitch = (enabled: boolean): void => {
    switchBtn.classList.toggle("is-on", enabled);
    switchBtn.setAttribute("aria-checked", enabled ? "true" : "false");
  };

  syncSwitch(viewer.autoReload);

  switchBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    viewer.autoReload = !viewer.autoReload;
    syncSwitch(viewer.autoReload);
  });

  wrap.node.append(label, switchBtn);
  return wrap;
};

const createGoToPageControl = (viewer: LivePdfViewer): Widget => {
  const wrap = new Widget();
  wrap.addClass("jp-KuusiLivePdf-goToPage");

  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.className = "jp-KuusiLivePdf-goToPageInput";
  input.title = "Go to page (Enter)";
  input.setAttribute("aria-label", "Go to page");

  const totalLabel = document.createElement("span");
  totalLabel.className = "jp-KuusiLivePdf-goToPageTotal";
  totalLabel.setAttribute("aria-hidden", "true");

  const syncInput = (): void => {
    const total = viewer.pageCount;
    input.max = String(Math.max(1, total));
    input.value = String(viewer.currentPage);
    totalLabel.textContent = `/ ${Math.max(1, total)}`;
  };

  const submit = (): void => {
    const pageNumber = Number.parseInt(input.value, 10);

    if (Number.isFinite(pageNumber)) {
      viewer.goToPage(pageNumber);
      syncInput();
    }
  };

  input.addEventListener("change", submit);
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();

    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });
  input.addEventListener("focus", syncInput);

  viewer.setPageChangeHandler(syncInput);
  syncInput();

  wrap.node.append(input, totalLabel);
  return wrap;
};

const createBackgroundSelect = (
  controls: LivePdfBackgroundControls,
): Widget => {
  const wrap = new Widget();
  wrap.addClass("jp-KuusiLivePdf-background");

  const select = document.createElement("select");
  select.className = "jp-KuusiLivePdf-backgroundSelect";
  select.title = "Viewer background color";
  select.setAttribute("aria-label", "Viewer background");

  for (const option of LIVE_PDF_BACKGROUND_OPTIONS) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    select.appendChild(node);
  }

  select.value = controls.getBackground();
  controls.registerSelect(select);
  wrap.disposed.connect(() => {
    controls.unregisterSelect(select);
  });

  select.addEventListener("change", () => {
    if (!isLivePdfBackground(select.value)) {
      return;
    }

    controls.setBackground(select.value);
  });

  wrap.node.appendChild(select);
  return wrap;
};

const createHighlightControls = (viewer: LivePdfViewer): Widget => {
  const wrap = new Widget();
  wrap.addClass("jp-KuusiLivePdf-highlight");

  const group = document.createElement("div");
  group.className = "jp-KuusiLivePdf-highlightGroup";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Text highlight colors");

  const undoButton = document.createElement("button");
  undoButton.type = "button";
  undoButton.className =
    "jp-KuusiLivePdf-highlightHistory jp-KuusiLivePdf-highlightUndo";
  undoButton.title = "Undo highlight";
  undoButton.setAttribute("aria-label", "Undo highlight");
  undoIcon.render(undoButton);
  undoButton.addEventListener("click", () => {
    viewer.undoHighlight();
  });

  const redoButton = document.createElement("button");
  redoButton.type = "button";
  redoButton.className =
    "jp-KuusiLivePdf-highlightHistory jp-KuusiLivePdf-highlightRedo";
  redoButton.title = "Redo highlight";
  redoButton.setAttribute("aria-label", "Redo highlight");
  redoIcon.render(redoButton);
  redoButton.addEventListener("click", () => {
    viewer.redoHighlight();
  });

  const syncHistoryButtons = (): void => {
    undoButton.disabled = !viewer.canUndoHighlight;
    redoButton.disabled = !viewer.canRedoHighlight;
  };

  viewer.setHighlightHistoryChangeHandler(syncHistoryButtons);
  syncHistoryButtons();

  const colorPicker = createHighlightColorPicker(viewer);
  wrap.disposed.connect(() => {
    colorPicker.dispose();
  });
  group.append(undoButton, redoButton, colorPicker.node);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "jp-KuusiLivePdf-highlightClear";
  clearButton.textContent = "Clear";
  clearButton.title = "Remove selected highlight";
  clearButton.setAttribute("aria-label", "Remove selected highlight");
  clearButton.addEventListener("click", () => {
    viewer.clearSelectedHighlights();
  });
  group.appendChild(clearButton);

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "jp-KuusiLivePdf-highlightCopy";
  copyButton.textContent = "Copy";
  copyButton.title = "Copy selected text";
  copyButton.setAttribute("aria-label", "Copy selected text");
  copyButton.addEventListener("click", () => {
    void viewer.copySelectedText();
  });
  group.appendChild(copyButton);

  wrap.node.appendChild(group);
  return wrap;
};

const createPageControls = (viewer: LivePdfViewer): Widget => {
  const wrap = new Panel();
  wrap.addClass("jp-KuusiLivePdf-pageNav");

  const group = new Panel();
  group.addClass("jp-KuusiLivePdf-pageNavGroup");

  const previousButton = new ToolbarButton({
    icon: caretLeftIcon,
    tooltip: "Previous page",
    onClick: () => {
      viewer.previousPage();
    },
  });

  const nextButton = new ToolbarButton({
    icon: caretRightIcon,
    tooltip: "Next page",
    onClick: () => {
      viewer.nextPage();
    },
  });

  group.addWidget(previousButton);
  group.addWidget(createGoToPageControl(viewer));
  group.addWidget(nextButton);
  wrap.addWidget(group);

  return wrap;
};

const createZoomControls = (viewer: LivePdfViewer): Widget => {
  const wrap = new Panel();
  wrap.addClass("jp-KuusiLivePdf-zoom");

  const fitButton = new ToolbarButton({
    className: "jp-KuusiLivePdf-zoomFit",
    label: "Fit",
    tooltip: "Fit current page to view",
    onClick: () => {
      viewer.fitPage();
      syncFitButton(viewer, fitButton);
    },
  });

  const { widget: zoomSliderButton, syncUi: syncZoomSlider } =
    createZoomSliderControl(viewer, fitButton);

  viewer.setScaleModeChangeHandler(() => {
    syncFitButton(viewer, fitButton);
    syncZoomSlider();
  });
  syncFitButton(viewer, fitButton);
  syncZoomSlider();

  const group = new Panel();
  group.addClass("jp-KuusiLivePdf-zoomGroup");
  group.addWidget(zoomSliderButton);
  group.addWidget(fitButton);
  wrap.addWidget(group);

  return wrap;
};

export class LivePdfDocumentWidget extends DocumentWidget<LivePdfViewer> {
  private _jumpToSource?: (
    pdfPath: string,
    viewer: LivePdfViewer,
  ) => Promise<void>;
  private _sourceLinkAdded = false;

  constructor(options: LivePdfDocumentOptions) {
    super(options);
    this.addClass("jp-KuusiLivePdfDocument");
    applyKuusiTabIcon(this.title, livePdfIcon, "Kuusi Live PDF");
    this._jumpToSource = options.jumpToSource;

    let rank = 0;

    const navToggleButton = new ToolbarButton({
      className: "jp-KuusiLivePdf-navToggle",
      icon: tocIcon,
      tooltip: "Toggle page navigation sidebar",
      onClick: () => {
        options.content.toggleNavBar();
        navToggleButton.toggleClass(
          "is-active",
          options.content.navBarVisible,
        );
      },
    });
    navToggleButton.toggleClass("is-active", options.content.navBarVisible);
    options.content.setNavVisibilityChangeHandler(() => {
      navToggleButton.toggleClass(
        "is-active",
        options.content.navBarVisible,
      );
    });
    this.toolbar.insertItem(rank++, "navToggle", navToggleButton);

    this.toolbar.insertItem(rank++, "pageNav", createPageControls(options.content));
    this.toolbar.insertItem(rank++, "zoom", createZoomControls(options.content));
    this.toolbar.insertItem(
      rank++,
      "highlight",
      createHighlightControls(options.content),
    );

    this.toolbar.insertItem(
      rank++,
      "autoReload",
      createAutoReloadSwitch(options.content),
    );

    this.toolbar.insertItem(
      rank++,
      "refresh",
      new ToolbarButton({
        icon: refreshIcon,
        tooltip: "Reload PDF from disk (R)",
        onClick: () => {
          void options.content.reload(true);
        },
      }),
    );

    if (options.showSourceLink) {
      this._insertSourceLinkButton(rank++);
    }

    if (options.backgroundControls) {
      this.toolbar.insertItem(
        rank++,
        "background",
        createBackgroundSelect(options.backgroundControls),
      );
    }

    if (options.revealInFileBrowser) {
      const reveal = options.revealInFileBrowser;

      this.toolbar.insertItem(
        rank++,
        "reveal",
        new ToolbarButton({
          icon: folderIcon,
          tooltip: "Show in file browser",
          onClick: () => {
            void reveal(options.context.path);
          },
        }),
      );
    }
  }

  ensureJumpToSource(): void {
    if (this._sourceLinkAdded) {
      return;
    }

    const names = Array.from(this.toolbar.names());
    const refreshIndex = names.indexOf("refresh");
    const rank = refreshIndex >= 0 ? refreshIndex + 1 : names.length;
    this._insertSourceLinkButton(rank);
  }

  private _insertSourceLinkButton(rank: number): void {
    if (this._sourceLinkAdded || !this._jumpToSource) {
      return;
    }

    const jumpToSource = this._jumpToSource;
    this._sourceLinkAdded = true;

    this.toolbar.insertItem(
      rank,
      "jumpToSource",
      new ToolbarButton({
        className: "jp-KuusiLivePdf-jumpToSource",
        label: "← Source",
        tooltip: "Jump to this position in the source (SyncTeX)",
        onClick: () => {
          void jumpToSource(this.context.path, this.content);
        },
      }),
    );
  }
}

export class LivePdfWidgetFactory extends ABCWidgetFactory<
  LivePdfDocumentWidget,
  DocumentRegistry.IModel
> {
  static readonly NAME = "Kuusi Live PDF";

  private _background: LivePdfBackground = "default";
  private _navMode: LivePdfNavMode = "thumbnails";
  private _backgroundSelects = new Set<HTMLSelectElement>();
  private _viewers = new Set<LivePdfViewer>();
  private _persistBackground: ((value: LivePdfBackground) => void) | null =
    null;
  private _persistNavMode: ((value: LivePdfNavMode) => void) | null = null;

  constructor(
    private _contents: Contents.IManager,
    private _revealInFileBrowser?: (path: string) => Promise<void>,
    private _jumpToSource?: (
      pdfPath: string,
      viewer: LivePdfViewer,
    ) => Promise<void>,
  ) {
    super({
      name: LivePdfWidgetFactory.NAME,
      modelName: "base64",
      fileTypes: ["PDF"],
      readOnly: true,
    });
  }

  get background(): LivePdfBackground {
    return this._background;
  }

  setBackgroundPersistHandler(
    handler: (value: LivePdfBackground) => void,
  ): void {
    this._persistBackground = handler;
  }

  setNavModePersistHandler(handler: (value: LivePdfNavMode) => void): void {
    this._persistNavMode = handler;
  }

  setNavMode(value: LivePdfNavMode, persist = false): void {
    this._navMode = value;

    for (const viewer of this._viewers) {
      viewer.setNavMode(value);
    }

    if (persist) {
      this._persistNavMode?.(value);
    }
  }

  setBackground(value: LivePdfBackground, persist = false): void {
    this._background = value;

    for (const select of this._backgroundSelects) {
      select.value = value;
    }

    for (const viewer of this._viewers) {
      viewer.setBackground(value);
    }

    if (persist) {
      this._persistBackground?.(value);
    }
  }

  private _backgroundControls: LivePdfBackgroundControls = {
    getBackground: () => this._background,
    setBackground: (value) => {
      this.setBackground(value, true);
    },
    registerSelect: (select) => {
      this._backgroundSelects.add(select);
      select.value = this._background;
    },
    unregisterSelect: (select) => {
      this._backgroundSelects.delete(select);
    },
  };

  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>,
  ): LivePdfDocumentWidget {
    const viewer = new LivePdfViewer(context, this._contents);
    viewer.setBackground(this._background);
    viewer.setNavMode(this._navMode);
    viewer.setNavModeChangeHandler((mode) => {
      this.setNavMode(mode, true);
    });
    this._viewers.add(viewer);
    viewer.disposed.connect(() => {
      this._viewers.delete(viewer);
      clearPdfSourceLink(context.path);
    });

    return new LivePdfDocumentWidget({
      content: viewer,
      context,
      revealInFileBrowser: this._revealInFileBrowser,
      jumpToSource: this._jumpToSource,
      showSourceLink: takePdfSourceLink(context.path),
      backgroundControls: this._backgroundControls,
    });
  }
}

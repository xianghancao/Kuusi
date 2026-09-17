import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
} from "@jupyterlab/docregistry";
import { ToolbarButton } from "@jupyterlab/apputils";
import type { Contents } from "@jupyterlab/services";
import {
  copyIcon,
  downloadIcon,
  folderIcon,
  refreshIcon,
  undoIcon,
} from "@jupyterlab/ui-components";
import { Widget } from "@lumino/widgets";
import { KUUSI_IMAGE_FILE_TYPES } from "./imageFormats";
import { createImageEditPopover } from "./imageEditPopover";
import { ImageViewer } from "./imageViewer";
import {
  isToolbarPopoverTarget,
  mountToolbarPopover,
  restoreToolbarPopover,
} from "../livePdf/livePdfToolbarPopover";
import { kuusiImageIcon } from "../kuusiIcon";
import { applyKuusiTabIcon } from "../kuusiTabIcon";

const createAutoReloadSwitch = (viewer: ImageViewer): Widget => {
  const wrap = new Widget();
  wrap.addClass("jp-KuusiImage-autoReload");

  const label = document.createElement("span");
  label.className = "jp-KuusiImage-autoReloadLabel";
  label.textContent = "Auto reload";

  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.className = "jp-KuusiPanelWidget-switch";
  switchBtn.setAttribute("role", "switch");
  switchBtn.setAttribute("aria-label", "Auto reload");
  switchBtn.title = "Reload when the image file changes on disk";

  const thumb = document.createElement("span");
  thumb.className = "jp-KuusiPanelWidget-switchThumb";
  thumb.setAttribute("aria-hidden", "true");
  switchBtn.appendChild(thumb);

  const sync = (enabled: boolean): void => {
    switchBtn.classList.toggle("is-on", enabled);
    switchBtn.setAttribute("aria-checked", enabled ? "true" : "false");
  };

  sync(viewer.autoReload);

  switchBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    viewer.autoReload = !viewer.autoReload;
    sync(viewer.autoReload);
  });

  wrap.node.append(label, switchBtn);
  return wrap;
};

const createZoomControls = (viewer: ImageViewer): Widget => {
  const wrap = new Widget();
  wrap.addClass("jp-KuusiImage-zoom");

  const label = document.createElement("span");
  label.className = "jp-KuusiImage-zoomLabel";

  const syncLabel = (): void => {
    label.textContent = `${viewer.zoomPercent}%`;
  };

  viewer.setScaleModeChangeHandler(syncLabel);
  syncLabel();

  const outBtn = new ToolbarButton({
    label: "−",
    className: "jp-KuusiImage-zoomOut",
    tooltip: "Zoom out",
    onClick: () => {
      viewer.zoomOut();
    },
  });

  const inBtn = new ToolbarButton({
    label: "+",
    className: "jp-KuusiImage-zoomIn",
    tooltip: "Zoom in",
    onClick: () => {
      viewer.zoomIn();
    },
  });

  const fitWidthBtn = new ToolbarButton({
    label: "Width",
    className: "jp-KuusiImage-fitWidth",
    tooltip: "Fit to width",
    onClick: () => {
      viewer.fitWidth();
    },
  });

  const fitWindowBtn = new ToolbarButton({
    label: "Fit",
    className: "jp-KuusiImage-fitWindow",
    tooltip: "Fit in window",
    onClick: () => {
      viewer.fitWindow();
    },
  });

  const actualBtn = new ToolbarButton({
    label: "100%",
    className: "jp-KuusiImage-actualSize",
    tooltip: "Actual size (1:1 pixels)",
    onClick: () => {
      viewer.actualSize();
    },
  });

  wrap.node.append(
    outBtn.node,
    label,
    inBtn.node,
    fitWidthBtn.node,
    fitWindowBtn.node,
    actualBtn.node,
  );
  return wrap;
};

const createTransformControls = (viewer: ImageViewer): Widget => {
  const wrap = new Widget();
  wrap.addClass("jp-KuusiImage-transform");

  const invertBtn = new ToolbarButton({
    className: "jp-KuusiImage-invert",
    label: "Inv",
    tooltip: "Invert colors (I)",
    onClick: () => {
      viewer.toggleInvertColors();
      invertBtn.toggleClass("is-active", viewer.colorsInverted);
    },
  });
  invertBtn.toggleClass("is-active", viewer.colorsInverted);

  viewer.setViewStateChangeHandler(() => {
    invertBtn.toggleClass("is-active", viewer.colorsInverted);
  });

  wrap.node.append(
    new ToolbarButton({
      className: "jp-KuusiImage-rotateLeft",
      label: "↶",
      tooltip: "Rotate counter-clockwise ([)",
      onClick: () => {
        viewer.rotateCounterclockwise();
      },
    }).node,
    new ToolbarButton({
      className: "jp-KuusiImage-rotateRight",
      label: "↷",
      tooltip: "Rotate clockwise (])",
      onClick: () => {
        viewer.rotateClockwise();
      },
    }).node,
    new ToolbarButton({
      className: "jp-KuusiImage-flipH",
      label: "⇋",
      tooltip: "Flip horizontally",
      onClick: () => {
        viewer.flipHorizontal();
      },
    }).node,
    new ToolbarButton({
      className: "jp-KuusiImage-flipV",
      label: "⇅",
      tooltip: "Flip vertically",
      onClick: () => {
        viewer.flipVertical();
      },
    }).node,
    new ToolbarButton({
      icon: undoIcon,
      className: "jp-KuusiImage-resetView",
      tooltip: "Reset zoom, rotation, and color (0)",
      onClick: () => {
        viewer.resetView();
      },
    }).node,
    invertBtn.node,
  );

  return wrap;
};

const createEditControl = (viewer: ImageViewer): Widget => {
  const wrap = new Widget();
  wrap.addClass("jp-KuusiImage-edit");

  const { widget: popover, dispose: disposePopover } =
    createImageEditPopover(viewer);
  popover.addClass("jp-KuusiImageEditPopover-host");
  popover.hide();

  let open = false;
  let button: ToolbarButton;

  const close = (): void => {
    open = false;
    popover.hide();
    restoreToolbarPopover(wrap.node, popover.node, button.node);
  };

  const toggle = (): void => {
    open = !open;

    if (!open) {
      close();
      return;
    }

    popover.show();
    mountToolbarPopover(button.node, popover.node, "below");
  };

  button = new ToolbarButton({
    label: "Edit",
    className: "jp-KuusiImage-editTrigger",
    tooltip: "Crop, resize, and export with size estimate",
    onClick: toggle,
  });

  wrap.node.append(button.node, popover.node);

  const onDocumentClick = (event: MouseEvent): void => {
    if (
      !open ||
      isToolbarPopoverTarget(wrap.node, popover.node, event.target as Node)
    ) {
      return;
    }

    close();
  };

  document.addEventListener("click", onDocumentClick);
  wrap.disposed.connect(() => {
    document.removeEventListener("click", onDocumentClick);
    disposePopover();
    close();
  });

  return wrap;
};

const createExportControls = (viewer: ImageViewer): Widget => {
  const wrap = new Widget();
  wrap.addClass("jp-KuusiImage-export");

  wrap.node.append(
    new ToolbarButton({
      icon: copyIcon,
      tooltip: "Copy image to clipboard",
      onClick: () => {
        void viewer.copyToClipboard();
      },
    }).node,
    new ToolbarButton({
      icon: downloadIcon,
      tooltip: "Download a copy of this image",
      onClick: () => {
        viewer.downloadCopy();
      },
    }).node,
  );

  return wrap;
};

export class ImageDocumentWidget extends DocumentWidget<ImageViewer> {
  constructor(
    options: DocumentWidget.IOptions<ImageViewer> & {
      revealInFileBrowser?: (path: string) => Promise<void>;
    },
  ) {
    super(options);
    this.addClass("jp-KuusiImageDocument");
    applyKuusiTabIcon(this.title, kuusiImageIcon, "Kuusi Image");

    const viewer = options.content;
    let rank = 0;

    this.toolbar.insertItem(rank++, "zoom", createZoomControls(viewer));
    this.toolbar.insertItem(rank++, "transform", createTransformControls(viewer));
    this.toolbar.insertItem(rank++, "edit", createEditControl(viewer));
    this.toolbar.insertItem(rank++, "export", createExportControls(viewer));
    this.toolbar.insertItem(rank++, "autoReload", createAutoReloadSwitch(viewer));
    this.toolbar.insertItem(
      rank++,
      "refresh",
      new ToolbarButton({
        icon: refreshIcon,
        tooltip: "Reload image from disk",
        onClick: () => {
          void viewer.reload(true);
        },
      }),
    );

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
}

export class ImageWidgetFactory extends ABCWidgetFactory<
  ImageDocumentWidget,
  DocumentRegistry.IModel
> {
  static readonly NAME = "Kuusi Image";

  constructor(
    private _contents: Contents.IManager,
    private _revealInFileBrowser?: (path: string) => Promise<void>,
  ) {
    super({
      name: ImageWidgetFactory.NAME,
      label: "Kuusi Image",
      modelName: "base64",
      fileTypes: [...KUUSI_IMAGE_FILE_TYPES],
      defaultFor: [...KUUSI_IMAGE_FILE_TYPES],
      readOnly: true,
    });
  }

  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>,
  ): ImageDocumentWidget {
    const viewer = new ImageViewer(context, this._contents);

    return new ImageDocumentWidget({
      content: viewer,
      context,
      revealInFileBrowser: this._revealInFileBrowser,
    });
  }
}

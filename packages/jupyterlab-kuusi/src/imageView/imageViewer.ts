import { PathExt } from "@jupyterlab/coreutils";
import type { DocumentRegistry } from "@jupyterlab/docregistry";
import { Dialog, Notification, showDialog } from "@jupyterlab/apputils";
import type { Contents } from "@jupyterlab/services";
import { Message } from "@lumino/messaging";
import { Widget } from "@lumino/widgets";
import {
  extensionForMime,
  formatFileSize,
  formatMimeShort,
} from "./imageFormat";
import { createImageCropOverlay } from "./imageCropOverlay";
import { decodeImageContent } from "./decodeImage";
import {
  blobToBase64,
  estimateRasterSize,
  rasterizeImageElement,
  type ImageCropRect,
} from "./imageRaster";
import { KUUSI_DISK_POLL_INTERVAL_MS } from "../diskPollInterval";
import { formatContentsModified } from "../formatModifiedTime";
import { isHeicPath } from "./imageFormats";
import {
  FLIP_HORIZONTAL_MATRIX,
  FLIP_VERTICAL_MATRIX,
  IDENTITY_MATRIX,
  type Matrix2,
  prodMatrix,
  prodVec,
  ROTATE_CLOCKWISE_MATRIX,
  ROTATE_COUNTERCLOCKWISE_MATRIX,
} from "./imageMatrix";

const RELOAD_DEBOUNCE_MS = 320;
const MIN_ZOOM_PERCENT = 25;
const MAX_ZOOM_PERCENT = 400;
const ZOOM_WHEEL_SENSITIVITY = 0.002;
const FIT_PADDING = 24;

export type ImageScaleMode = "manual" | "fit-width" | "fit-window";

export type ImageExportOptions = {
  outputWidth: number;
  outputHeight: number;
  mimeType: string;
  quality?: number;
  useCrop: boolean;
};

export class ImageViewer extends Widget {
  private _context: DocumentRegistry.IContext<DocumentRegistry.IModel>;
  private _contents: Contents.IManager;
  private _scroller: HTMLDivElement;
  private _stage: HTMLDivElement;
  private _img: HTMLImageElement;
  private _statusNode: HTMLSpanElement;
  private _errorNode: HTMLDivElement;
  private _autoReload = true;
  private _scaleMode: ImageScaleMode = "fit-window";
  private _manualScale = 1;
  private _pollTimer: number | null = null;
  private _reloadTimer: number | null = null;
  private _lastKnownModified = "";
  private _objectUrlRevoke: (() => void) | null = null;
  private _onScaleModeChange: (() => void) | null = null;
  private _onViewStateChange: (() => void) | null = null;
  private _viewStateListeners = new Set<() => void>();
  private _resizeObserver: ResizeObserver | null = null;
  private _matrix: Matrix2 = [...IDENTITY_MATRIX];
  private _colorInversion = 0;
  private _fileSizeBytes: number | null = null;
  private _cropOverlay: ReturnType<typeof createImageCropOverlay> | null = null;
  private _cropModeActive = false;
  private _handleKeyDown = (event: KeyboardEvent): void => {
    this._onKeyDown(event);
  };

  constructor(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>,
    contents: Contents.IManager,
  ) {
    super();
    this._context = context;
    this._contents = contents;
    this.addClass("jp-KuusiImageViewer");

    this._statusNode = document.createElement("span");
    this._statusNode.className = "jp-KuusiImageViewer-status";

    this._errorNode = document.createElement("div");
    this._errorNode.className = "jp-KuusiImageViewer-error";
    this._errorNode.hidden = true;

    this._img = document.createElement("img");
    this._img.className = "jp-KuusiImageViewer-img";
    this._img.draggable = false;
    this._img.alt = context.path;

    this._stage = document.createElement("div");
    this._stage.className = "jp-KuusiImageViewer-stage";
    this._cropOverlay = createImageCropOverlay(this._img, () => {
      this._emitViewStateChange();
    });
    this._stage.append(this._img, this._errorNode, this._cropOverlay.node);

    this._scroller = document.createElement("div");
    this._scroller.className = "jp-KuusiImageViewer-scroller";
    this._scroller.tabIndex = 0;
    this._scroller.append(this._stage);

    this.node.append(this._scroller, this._statusNode);

    this._scroller.addEventListener("wheel", this._onWheel, { passive: false });
    this._scroller.addEventListener("keydown", this._handleKeyDown);
    this._img.addEventListener("load", () => {
      this._syncTransformStyle();
      this._syncStatus();
    });

    context.ready.then(() => {
      if (this.isDisposed) {
        return;
      }

      void this.reload(false);
      context.model.contentChanged.connect(this._queueReload, this);
      context.fileChanged.connect(this._queueReload, this);
      this._startPolling();
    });

    this._resizeObserver = new ResizeObserver(() => {
      if (this._scaleMode !== "manual") {
        this._syncTransformStyle();
        this._syncStatus();
      }
    });
    this._resizeObserver.observe(this._scroller);
  }

  get autoReload(): boolean {
    return this._autoReload;
  }

  set autoReload(value: boolean) {
    this._autoReload = value;
  }

  get scaleMode(): ImageScaleMode {
    return this._scaleMode;
  }

  get zoomPercent(): number {
    return Math.round(this._effectiveScale() * 100);
  }

  get colorsInverted(): boolean {
    return this._colorInversion % 2 === 1;
  }

  get cropModeActive(): boolean {
    return this._cropModeActive;
  }

  setScaleModeChangeHandler(handler: (() => void) | null): void {
    this._onScaleModeChange = handler;
  }

  setViewStateChangeHandler(handler: (() => void) | null): void {
    this._onViewStateChange = handler;
  }

  connectViewStateChange(listener: () => void): { disconnect: () => void } {
    this._viewStateListeners.add(listener);

    return {
      disconnect: () => {
        this._viewStateListeners.delete(listener);
      },
    };
  }

  toggleCropMode(): boolean {
    this._cropModeActive = !this._cropModeActive;

    if (this._cropOverlay) {
      this._cropOverlay.node.hidden = !this._cropModeActive;

      if (!this._cropModeActive) {
        this._cropOverlay.reset();
      }
    }

    this._emitViewStateChange();
    return this._cropModeActive;
  }

  getSourcePixelSize(): { width: number; height: number } {
    const crop = this._activeCropRect();
    const naturalWidth = this._img.naturalWidth;
    const naturalHeight = this._img.naturalHeight;

    if (crop) {
      return {
        width: Math.round(crop.width),
        height: Math.round(crop.height),
      };
    }

    return {
      width: naturalWidth,
      height: naturalHeight,
    };
  }

  getEffectivePixelSize(): { width: number; height: number } {
    return this.getSourcePixelSize();
  }

  async estimateExportSize(options: ImageExportOptions): Promise<number> {
    return estimateRasterSize(this._img, this._buildRasterOptions(options));
  }

  async downloadExport(options: ImageExportOptions): Promise<void> {
    const blob = await this._createExportBlob(options);
    const url = URL.createObjectURL(blob);
    const base = PathExt.basename(this._context.path);
    const ext = extensionForMime(options.mimeType);
    const stem = PathExt.basename(base, PathExt.extname(base));

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${stem}-edited${ext}`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    Notification.success(`Downloaded ${formatFileSize(blob.size)} copy.`, {
      autoClose: 2500,
    });
  }

  async saveExportOverwrite(options: ImageExportOptions): Promise<void> {
    const path = this._context.path;

    if (isHeicPath(path)) {
      Notification.warning("HEIC files cannot be overwritten from the browser.", {
        autoClose: 4000,
      });
      return;
    }

    const originalMime =
      this._context.contentsModel?.mimetype ?? "image/png";

    if (originalMime === "image/svg+xml") {
      Notification.warning(
        "Replace the SVG on the server by saving a copy as PNG instead.",
        { autoClose: 4500 },
      );
      return;
    }

    if (
      originalMime !== "image/png" &&
      originalMime !== "image/jpeg" &&
      originalMime !== "image/webp"
    ) {
      Notification.warning(
        "Use “Save copy” to store a PNG or JPEG in this folder (this format cannot be overwritten in place).",
        { autoClose: 5000 },
      );
      return;
    }

    const blob = await this._createExportBlob({
      ...options,
      mimeType: originalMime,
    });
    const name = PathExt.basename(path);

    const confirm = await showDialog({
      title: "Replace image file?",
      body: `Overwrite ${name} on the server with the edited image (${formatFileSize(blob.size)})?`,
      buttons: [Dialog.cancelButton(), Dialog.warnButton({ label: "Replace" })],
    });

    if (confirm.button.accept !== true) {
      return;
    }

    await this._writeBlobToServer(path, blob);
    Notification.success(`Saved ${name} (${formatFileSize(blob.size)}).`, {
      autoClose: 3000,
    });
  }

  async saveExportCopyInDirectory(options: ImageExportOptions): Promise<void> {
    const directory = PathExt.dirname(this._context.path);
    const stem = PathExt.basename(
      this._context.path,
      PathExt.extname(this._context.path),
    );
    const ext = extensionForMime(options.mimeType);
    const path = `${directory}/${stem}-edited${ext}`;
    const blob = await this._createExportBlob(options);

    await this._writeBlobToServer(path, blob);

    const opened = this._context.path === path;

    if (!opened) {
      Notification.success(
        `Saved ${PathExt.basename(path)} (${formatFileSize(blob.size)}).`,
        { autoClose: 3500 },
      );
      return;
    }

    Notification.success(`Saved ${PathExt.basename(path)}.`, {
      autoClose: 3000,
    });
  }

  setZoomPercent(percent: number): void {
    const clamped = Math.min(
      MAX_ZOOM_PERCENT,
      Math.max(MIN_ZOOM_PERCENT, percent),
    );
    this._scaleMode = "manual";
    this._manualScale = clamped / 100;
    this._syncTransformStyle();
    this._onScaleModeChange?.();
    this._syncStatus();
  }

  zoomIn(): void {
    this.setZoomPercent(this.zoomPercent + 10);
  }

  zoomOut(): void {
    this.setZoomPercent(this.zoomPercent - 10);
  }

  fitWidth(): void {
    this._scaleMode = "fit-width";
    this._syncTransformStyle();
    this._onScaleModeChange?.();
    this._syncStatus();
  }

  fitWindow(): void {
    this._scaleMode = "fit-window";
    this._syncTransformStyle();
    this._onScaleModeChange?.();
    this._syncStatus();
  }

  actualSize(): void {
    this._scaleMode = "manual";
    this._manualScale = 1;
    this._syncTransformStyle();
    this._onScaleModeChange?.();
    this._syncStatus();
  }

  rotateClockwise(): void {
    this._matrix = prodMatrix(this._matrix, ROTATE_CLOCKWISE_MATRIX);
    this._syncTransformStyle();
    this._emitViewStateChange();
  }

  rotateCounterclockwise(): void {
    this._matrix = prodMatrix(this._matrix, ROTATE_COUNTERCLOCKWISE_MATRIX);
    this._syncTransformStyle();
    this._emitViewStateChange();
  }

  flipHorizontal(): void {
    this._matrix = prodMatrix(this._matrix, FLIP_HORIZONTAL_MATRIX);
    this._syncTransformStyle();
    this._emitViewStateChange();
  }

  flipVertical(): void {
    this._matrix = prodMatrix(this._matrix, FLIP_VERTICAL_MATRIX);
    this._syncTransformStyle();
    this._emitViewStateChange();
  }

  toggleInvertColors(): void {
    this._colorInversion += 1;
    this._syncTransformStyle();
    this._emitViewStateChange();
  }

  resetView(): void {
    this._matrix = [...IDENTITY_MATRIX];
    this._colorInversion = 0;
    this._scaleMode = "fit-window";
    this._manualScale = 1;
    this._cropModeActive = false;
    this._cropOverlay?.reset();
    if (this._cropOverlay) {
      this._cropOverlay.node.hidden = true;
    }
    this._syncTransformStyle();
    this._onScaleModeChange?.();
    this._emitViewStateChange();
    this._syncStatus();
  }

  async copyToClipboard(): Promise<void> {
    const src = this._img.src;

    if (!src) {
      return;
    }

    try {
      const response = await fetch(src);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      Notification.success("Image copied to clipboard.", { autoClose: 2500 });
    } catch {
      Notification.error("Could not copy the image.", { autoClose: 3500 });
    }
  }

  downloadCopy(): void {
    const src = this._img.src;

    if (!src) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = src;
    anchor.download = PathExt.basename(this._context.path);
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async reload(force = false): Promise<void> {
    const context = this._context;

    if (!context.isReady) {
      await context.ready;
    }

    if (this.isDisposed) {
      return;
    }

    const cm = context.contentsModel;

    if (!cm) {
      return;
    }

    if (!force && cm.last_modified === this._lastKnownModified) {
      return;
    }

    this._lastKnownModified = cm.last_modified ?? "";
    this._fileSizeBytes =
      typeof cm.size === "number" && Number.isFinite(cm.size) ? cm.size : null;
    this._clearImageUrl();
    this._errorNode.hidden = true;
    this._errorNode.textContent = "";

    try {
      const content = context.model.toString();
      const decoded = decodeImageContent(
        context.path,
        cm.mimetype,
        cm.format as "base64" | "text" | "json",
        content,
      );
      this._objectUrlRevoke = decoded.revoke;
      this._img.src = decoded.url;
    } catch (error: unknown) {
      this._img.removeAttribute("src");
      this._errorNode.hidden = false;
      this._errorNode.textContent =
        error instanceof Error ? error.message : "Could not display this image.";
    }
  }

  dispose(): void {
    this._stopPolling();
    this._clearImageUrl();

    if (this._reloadTimer !== null) {
      window.clearTimeout(this._reloadTimer);
      this._reloadTimer = null;
    }

    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._cropOverlay?.dispose();
    this._cropOverlay = null;
    this._viewStateListeners.clear();
    this._scroller.removeEventListener("wheel", this._onWheel);
    this._scroller.removeEventListener("keydown", this._handleKeyDown);
    super.dispose();
  }

  protected onActivateRequest(msg: Message): void {
    super.onActivateRequest(msg);
    this._scroller.focus();
  }

  private _effectiveScale(): number {
    if (this._scaleMode === "manual") {
      return this._manualScale;
    }

    const naturalWidth = this._img.naturalWidth;
    const naturalHeight = this._img.naturalHeight;

    if (naturalWidth <= 0 || naturalHeight <= 0) {
      return 1;
    }

    const bounds = this._scroller.getBoundingClientRect();
    const maxW = Math.max(1, bounds.width - FIT_PADDING);
    const maxH = Math.max(1, bounds.height - FIT_PADDING);

    if (this._scaleMode === "fit-width") {
      return maxW / naturalWidth;
    }

    return Math.min(maxW / naturalWidth, maxH / naturalHeight);
  }

  private _syncTransformStyle(): void {
    const scale = this._effectiveScale();
    const [a, b, c, d] = this._matrix;
    const [tX, tY] = prodVec(this._matrix, [1, 1]);
    const matrix = `matrix(${a}, ${b}, ${c}, ${d}, 0, 0) translate(${tX < 0 ? -100 : 0}%, ${tY < 0 ? -100 : 0}%)`;
    this._img.style.transform = `scale(${scale}) ${matrix}`;
    this._img.style.filter = `invert(${this._colorInversion % 2})`;
    this._onScaleModeChange?.();
  }

  private _syncStatus(): void {
    const cm = this._context.contentsModel;
    const width = this._img.naturalWidth;
    const height = this._img.naturalHeight;
    const fileSize = formatFileSize(this._fileSizeBytes);
    const typeLabel = formatMimeShort(cm?.mimetype);
    const pixels =
      width > 0 && height > 0 ? `${width}×${height}` : "—";
    const zoom = `${this.zoomPercent}%`;
    const modifiedLabel = formatContentsModified(cm?.last_modified);
    const modified = modifiedLabel ? ` · ${modifiedLabel}` : "";

    const summary = `${fileSize} · ${typeLabel} · ${pixels} · ${zoom}${modified}`;
    this._statusNode.textContent = summary;
    this._statusNode.title = summary;
  }

  private _emitViewStateChange(): void {
    this._onViewStateChange?.();

    for (const listener of this._viewStateListeners) {
      listener();
    }

    this._syncStatus();
  }

  private _activeCropRect(): ImageCropRect | undefined {
    if (!this._cropModeActive || !this._cropOverlay) {
      return undefined;
    }

    const rect = this._cropOverlay.getRect();

    if (!rect || rect.width < 2 || rect.height < 2) {
      return undefined;
    }

    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  private async _createExportBlob(
    options: ImageExportOptions,
  ): Promise<Blob> {
    return rasterizeImageElement(this._img, this._buildRasterOptions(options));
  }

  private async _writeBlobToServer(path: string, blob: Blob): Promise<void> {
    const content = await blobToBase64(blob);

    await this._contents.save(path, {
      type: "file",
      format: "base64",
      content,
    });

    if (this._context.path === path) {
      await this._context.revert();
      this.resetView();
      await this.reload(true);
    }
  }

  private _buildRasterOptions(options: ImageExportOptions) {
    const crop = options.useCrop ? this._activeCropRect() : undefined;

    return {
      crop,
      outputWidth: options.outputWidth,
      outputHeight: options.outputHeight,
      matrix: this._matrix,
      invert: this.colorsInverted,
      mimeType: options.mimeType,
      quality: options.quality,
    };
  }

  private _clearImageUrl(): void {
    this._objectUrlRevoke?.();
    this._objectUrlRevoke = null;
  }

  private _queueReload = (): void => {
    if (this._reloadTimer !== null) {
      window.clearTimeout(this._reloadTimer);
    }

    this._reloadTimer = window.setTimeout(() => {
      this._reloadTimer = null;
      void this.reload(true);
    }, RELOAD_DEBOUNCE_MS);
  };

  private _startPolling(): void {
    this._stopPolling();

    this._pollTimer = window.setInterval(() => {
      if (!this._autoReload) {
        return;
      }

      void this._pollDiskChange();
    }, KUUSI_DISK_POLL_INTERVAL_MS);
  }

  private _stopPolling(): void {
    if (this._pollTimer !== null) {
      window.clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  private async _pollDiskChange(): Promise<void> {
    const path = this._context.path;

    try {
      const model = await this._contents.get(path, { content: false });

      if (model.last_modified && model.last_modified !== this._lastKnownModified) {
        await this._context.revert();
        void this.reload(true);
      }
    } catch {
      // Ignore transient server errors during polling.
    }
  }

  private _onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    const delta = -event.deltaY * ZOOM_WHEEL_SENSITIVITY;
    const factor = Math.exp(delta);
    const next = this.zoomPercent * factor;
    this.setZoomPercent(Math.round(next));
  };

  private _onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;

    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "+" || key === "=") {
      event.preventDefault();
      this.zoomIn();
      return;
    }

    if (key === "-" || key === "_") {
      event.preventDefault();
      this.zoomOut();
      return;
    }

    if (key === "0") {
      event.preventDefault();
      this.resetView();
      return;
    }

    if (key === "1") {
      event.preventDefault();
      this.actualSize();
      return;
    }

    if (key === "[") {
      event.preventDefault();
      this.rotateCounterclockwise();
      return;
    }

    if (key === "]") {
      event.preventDefault();
      this.rotateClockwise();
      return;
    }

    if (key === "i") {
      event.preventDefault();
      this.toggleInvertColors();
      return;
    }

    if (key === "r" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      void this.reload(true);
    }
  };
}

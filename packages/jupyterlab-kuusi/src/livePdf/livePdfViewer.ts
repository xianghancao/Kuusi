import type { DocumentRegistry } from "@jupyterlab/docregistry";
import type { Contents } from "@jupyterlab/services";
import { Message } from "@lumino/messaging";
import { Widget } from "@lumino/widgets";
import * as pdfjs from "pdfjs-dist";
import { buildPdfOutline } from "./livePdfOutline";
import { type LivePdfNavMode } from "./livePdfNavMode";
import { LivePdfNavBar } from "./livePdfNavBar";
import {
  type LivePdfBackground,
  resolveLivePdfBackgroundColor,
} from "./livePdfBackground";
import {
  cssToSyncTexPoint,
  readPdfPageMetrics,
  syncTexBoxToCss,
} from "./livePdfSyncCoords";
import { KUUSI_DISK_POLL_INTERVAL_MS } from "../diskPollInterval";
import { formatContentsModified } from "../formatModifiedTime";
import { setupPdfjsWorker } from "./setupPdfjsWorker";
import { renderPdfPageAnnotations } from "./livePdfAnnotationLayer";
import { LivePdfLinkService } from "./livePdfLinkService";
import { renderPdfPageCanvas } from "./livePdfPageCanvas";
import {
  disposePdfTextLayer,
  type PdfTextLayerResult,
  refineWhitespaceSpanSelection,
  renderPdfPageTextLayer,
} from "./livePdfTextLayer";
import {
  clearHighlights,
  findPageHighlights,
  paintHighlights,
} from "./livePdfTextSearch";
import {
  cloneHighlightMap,
  createHighlightFromSelection,
  findHighlightsForSelection,
  getSelectedTextInLayer,
  type LivePdfHighlightColor,
  paintUserHighlights,
  type PdfUserHighlight,
} from "./livePdfUserHighlight";

setupPdfjsWorker();

const RELOAD_DEBOUNCE_MS = 320;
/** PDF.js scale at which the UI shows 100% (1 CSS px ≈ 1 PDF point). */
const BASE_RENDER_SCALE = 1;
const MIN_ZOOM_SCALE = 0.5;
const MAX_ZOOM_SCALE = 2;
const ZOOM_PERCENT_STEP = 10;
const MIN_ZOOM_PERCENT = 50;
const MAX_ZOOM_PERCENT = 200;
const FIT_WIDTH_PADDING = 32;
const FIT_PAGE_PADDING = 32;
const FIT_WIDTH_RESIZE_DEBOUNCE_MS = 150;
const MIN_SCROLLER_WIDTH = 160;
const MIN_SCROLLER_HEIGHT = 120;
const NAV_THUMB_SCALE = 0.2;
const ZOOM_WHEEL_SENSITIVITY = 0.002;
const ZOOM_WHEEL_MAX_STEP = 1.12;
const ZOOM_WHEEL_DEBOUNCE_MS = 120;
const HIGHLIGHT_HISTORY_LIMIT = 100;
const AUTO_RELOAD_FLASH_MS = 1000;

export type LivePdfScaleMode = "manual" | "fit-width" | "fit-page";

const decodeBase64Pdf = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

let reloadFlashFilterCounter = 0;

export class LivePdfViewer extends Widget {
  private _context: DocumentRegistry.IContext<DocumentRegistry.IModel>;
  private _contents: Contents.IManager;
  private _scroller: HTMLDivElement;
  private _pagesHost: HTMLDivElement;
  private _statusModifiedNode: HTMLSpanElement;
  private _scrollTop = 0;
  private _autoReload = true;
  private _scaleMode: LivePdfScaleMode = "manual";
  private _manualScale = BASE_RENDER_SCALE;
  private _renderGeneration = 0;
  private _pdfDocument: pdfjs.PDFDocumentProxy | null = null;
  private _pollTimer: number | null = null;
  private _reloadTimer: number | null = null;
  private _fitWidthResizeTimer: number | null = null;
  private _lastKnownModified = "";
  private _isRendering = false;
  private _reloadQueued = false;
  private _suppressChangeReload = false;
  private _reloadFlashNode: HTMLDivElement;
  private _reloadFlashTimer: number | null = null;
  private _resizeObserver: ResizeObserver | null = null;
  private _currentPage = 1;
  private _lastRenderScale = BASE_RENDER_SCALE;
  private _syncHighlightTimer: number | null = null;
  private _scrollRaf: number | null = null;
  private _onScaleModeChange: (() => void) | null = null;
  private _onPageChange: (() => void) | null = null;
  private _readyResolve: (() => void) | null = null;
  private _ready: Promise<void>;
  private _body: HTMLDivElement;
  private _navBar: LivePdfNavBar;
  private _navVisible = true;
  private _navMode: LivePdfNavMode = "thumbnails";
  private _onNavModeChange: ((mode: LivePdfNavMode) => void) | null = null;
  private _searchQuery = "";
  private _searchGeneration = 0;
  private _thumbGeneration = 0;
  private _wheelZoomTimer: number | null = null;
  private _wheelZoomFactor = 1;
  private _wheelZoomAnchor: {
    contentX: number;
    contentY: number;
    viewportX: number;
    viewportY: number;
  } | null = null;
  private _wheelZoomOldScale = BASE_RENDER_SCALE;
  private _onNavVisibilityChange: (() => void) | null = null;
  private _linkService: LivePdfLinkService;
  private _pendingShowRerender = false;
  private _userHighlights = new Map<number, PdfUserHighlight[]>();
  private _pageTextLayerMeta = new Map<number, PdfTextLayerResult>();
  private _highlightHistory: Map<number, PdfUserHighlight[]>[] = [];
  private _highlightHistoryIndex = -1;
  private _onHighlightHistoryChange: (() => void) | null = null;
  private _handleWheel = (event: WheelEvent): void => {
    this._onWheel(event);
  };
  private _handleKeyDown = (event: KeyboardEvent): void => {
    this._onKeyDown(event);
  };
  private _handleScroll = (): void => {
    if (this._scrollRaf !== null) {
      return;
    }

    this._scrollRaf = window.requestAnimationFrame(() => {
      this._scrollRaf = null;
      this._scrollTop = this._scroller.scrollTop;
      this._syncCurrentPageFromScroll();
    });
  };
  private _onContextFileChanged = (): void => {
    this._scheduleReload();
  };
  private _onContextContentChanged = (): void => {
    this._scheduleReload();
  };

  constructor(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>,
    contents: Contents.IManager,
  ) {
    super();
    this._context = context;
    this._contents = contents;
    this._linkService = new LivePdfLinkService({
      goToPage: (page) => {
        this.goToPage(page, { behavior: "auto" });
      },
      goToDestination: (dest) => this._goToPdfDestination(dest),
      nextPage: () => {
        this.nextPage();
      },
      previousPage: () => {
        this.previousPage();
      },
      goToLastPage: () => {
        this.goToLastPage();
      },
    });
    this.addClass("jp-KuusiLivePdfViewer");
    this._syncScaleModeDataset();

    const statusBar = document.createElement("div");
    statusBar.className = "jp-KuusiLivePdf-status";
    this._statusModifiedNode = document.createElement("span");
    this._statusModifiedNode.className = "jp-KuusiLivePdf-statusModified";
    statusBar.appendChild(this._statusModifiedNode);
    this.node.appendChild(statusBar);
    this._statusModifiedNode.textContent = "Loading PDF…";

    this._body = document.createElement("div");
    this._body.className = "jp-KuusiLivePdf-body";

    this._navBar = new LivePdfNavBar({
      onPageSelect: (page) => {
        this.goToPage(page, { behavior: "auto" });
      },
      onSearchChange: (query) => {
        void this.setSearchQuery(query);
      },
      onModeChange: (mode) => {
        this._navMode = mode;
        this._onNavModeChange?.(mode);

        if (
          mode === "thumbnails" &&
          this._navVisible &&
          this._pdfDocument
        ) {
          void this._renderNavThumbnails(this._pdfDocument);
        }
      },
    });
    this._navBar.setMode(this._navMode);
    this._navBar.setVisible(this._navVisible);
    this._body.appendChild(this._navBar.node);

    this._scroller = document.createElement("div");
    this._scroller.className = "jp-KuusiLivePdf-scroll";
    this._scroller.tabIndex = 0;
    this._scroller.addEventListener("wheel", this._handleWheel, {
      passive: false,
    });
    this._scroller.addEventListener("scroll", this._handleScroll, {
      passive: true,
    });

    this._pagesHost = document.createElement("div");
    this._pagesHost.className = "jp-KuusiLivePdf-pages";
    this._scroller.appendChild(this._pagesHost);

    this._reloadFlashNode = document.createElement("div");
    this._reloadFlashNode.className = "jp-KuusiLivePdf-reloadFlash";
    this._reloadFlashNode.setAttribute("aria-hidden", "true");
    this._reloadFlashNode.appendChild(this._createReloadFlashSvg());
    this._scroller.appendChild(this._reloadFlashNode);

    this._body.appendChild(this._scroller);
    this.node.appendChild(this._body);

    const loadingPlaceholder = document.createElement("div");
    loadingPlaceholder.className = "jp-KuusiLivePdf-loading";
    loadingPlaceholder.textContent = "Rendering PDF…";
    this._pagesHost.appendChild(loadingPlaceholder);

    this._resizeObserver = new ResizeObserver(() => {
      this._scheduleAutoFitRerender();
    });
    this._resizeObserver.observe(this._scroller);

    this.node.addEventListener("keydown", this._handleKeyDown);

    this._ready = new Promise<void>((resolve) => {
      this._readyResolve = resolve;
    });

    void this._initialize();
  }

  /**
   * Resolves once the first render pass has completed, so callers can
   * safely query the rendered page DOM (e.g. for SyncTeX jumps).
   */
  get ready(): Promise<void> {
    return this._ready;
  }

  get currentPage(): number {
    return this._currentPage;
  }

  get pageCount(): number {
    return this._pdfDocument?.numPages ?? 0;
  }

  setScaleModeChangeHandler(handler: () => void): void {
    this._onScaleModeChange = handler;
  }

  setPageChangeHandler(handler: () => void): void {
    this._onPageChange = handler;
  }

  setNavVisibilityChangeHandler(handler: () => void): void {
    this._onNavVisibilityChange = handler;
  }

  setNavModeChangeHandler(handler: (mode: LivePdfNavMode) => void): void {
    this._onNavModeChange = handler;
  }

  get navMode(): LivePdfNavMode {
    return this._navMode;
  }

  setNavMode(mode: LivePdfNavMode): void {
    this._navMode = mode;
    this._navBar.setMode(mode);

    if (mode === "thumbnails" && this._navVisible && this._pdfDocument) {
      void this._renderNavThumbnails(this._pdfDocument);
    }
  }

  get navBarVisible(): boolean {
    return this._navVisible;
  }

  toggleNavBar(): void {
    this._navVisible = !this._navVisible;
    this._navBar.setVisible(this._navVisible);
    this._onNavVisibilityChange?.();

    if (this._navVisible && this._pdfDocument) {
      if (this._navMode === "thumbnails") {
        void this._renderNavThumbnails(this._pdfDocument);
      } else {
        void this._loadNavOutline(this._pdfDocument);
      }
    }
  }

  async setSearchQuery(query: string): Promise<void> {
    this._searchQuery = query;
    const generation = ++this._searchGeneration;
    await this._applySearchHighlights(generation);
  }

  get selectedText(): string {
    const selection = document.getSelection();

    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return "";
    }

    const range = selection.getRangeAt(0);

    for (const layer of Array.from(
      this.node.querySelectorAll<HTMLDivElement>(".jp-KuusiLivePdf-textLayer"),
    )) {
      if (range.intersectsNode(layer)) {
        return getSelectedTextInLayer(layer);
      }
    }

    return "";
  }

  applyHighlightToSelection(color: LivePdfHighlightColor): boolean {
    const selection = document.getSelection();

    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return false;
    }

    const range = selection.getRangeAt(0);

    for (const [pageNumber, mapping] of this._pageTextLayerMeta) {
      if (!range.intersectsNode(mapping.layer)) {
        continue;
      }

      const highlight = createHighlightFromSelection(
        mapping.layer,
        pageNumber,
        color,
        mapping,
      );

      if (!highlight) {
        return false;
      }

      const pageHighlights = this._userHighlights.get(pageNumber) ?? [];
      pageHighlights.push(highlight);
      this._userHighlights.set(pageNumber, pageHighlights);
      paintUserHighlights(mapping, pageHighlights);
      selection.removeAllRanges();
      this._commitHighlightState();
      return true;
    }

    return false;
  }

  clearSelectedHighlights(): boolean {
    const selection = document.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return false;
    }

    const range = selection.getRangeAt(0);

    for (const [pageNumber, mapping] of this._pageTextLayerMeta) {
      if (!range.intersectsNode(mapping.layer)) {
        continue;
      }

      const pageHighlights = this._userHighlights.get(pageNumber) ?? [];
      const toRemove = findHighlightsForSelection(
        mapping.layer,
        mapping,
        pageHighlights,
      );

      if (toRemove.length === 0) {
        return false;
      }

      const removeIds = new Set(toRemove.map((entry) => entry.id));
      const remaining = pageHighlights.filter(
        (entry) => !removeIds.has(entry.id),
      );
      this._userHighlights.set(pageNumber, remaining);
      paintUserHighlights(mapping, remaining);
      selection.removeAllRanges();
      this._commitHighlightState();
      return true;
    }

    return false;
  }

  get canUndoHighlight(): boolean {
    return this._highlightHistoryIndex > 0;
  }

  get canRedoHighlight(): boolean {
    return (
      this._highlightHistoryIndex >= 0 &&
      this._highlightHistoryIndex < this._highlightHistory.length - 1
    );
  }

  setHighlightHistoryChangeHandler(handler: (() => void) | null): void {
    this._onHighlightHistoryChange = handler;
  }

  undoHighlight(): boolean {
    if (!this.canUndoHighlight) {
      return false;
    }

    this._highlightHistoryIndex -= 1;
    this._applyHighlightSnapshot(
      this._highlightHistory[this._highlightHistoryIndex],
    );
    return true;
  }

  redoHighlight(): boolean {
    if (!this.canRedoHighlight) {
      return false;
    }

    this._highlightHistoryIndex += 1;
    this._applyHighlightSnapshot(
      this._highlightHistory[this._highlightHistoryIndex],
    );
    return true;
  }

  async copySelectedText(): Promise<boolean> {
    const text = this.selectedText;

    if (!text) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  get filePath(): string {
    return this._context.path;
  }

  get autoReload(): boolean {
    return this._autoReload;
  }

  set autoReload(value: boolean) {
    this._autoReload = value;
    this._updateStatus();
  }

  setBackground(background: LivePdfBackground): void {
    const color = resolveLivePdfBackgroundColor(background);

    if (color) {
      this.node.dataset.pdfBackground = background;
      this.node.style.setProperty("--kuusi-live-pdf-bg", color);
      return;
    }

    delete this.node.dataset.pdfBackground;
    this.node.style.removeProperty("--kuusi-live-pdf-bg");
  }

  get scaleMode(): LivePdfScaleMode {
    return this._scaleMode;
  }

  get zoomPercent(): number {
    return Math.round((this._manualScale / BASE_RENDER_SCALE) * 100);
  }

  get effectiveZoomPercent(): number {
    if (this._scaleMode === "manual") {
      return this.zoomPercent;
    }

    return Math.round((this._lastRenderScale / BASE_RENDER_SCALE) * 100);
  }

  zoomIn(): void {
    this.setZoomPercent(this.effectiveZoomPercent + ZOOM_PERCENT_STEP);
  }

  zoomOut(): void {
    this.setZoomPercent(this.effectiveZoomPercent - ZOOM_PERCENT_STEP);
  }

  resetZoom(): void {
    this.setZoomPercent(100);
  }

  setZoomPercent(percent: number): void {
    const snapped = Math.min(
      MAX_ZOOM_PERCENT,
      Math.max(
        MIN_ZOOM_PERCENT,
        Math.round(percent / ZOOM_PERCENT_STEP) * ZOOM_PERCENT_STEP,
      ),
    );
    this._scaleMode = "manual";
    this._manualScale = Math.min(
      MAX_ZOOM_SCALE,
      Math.max(MIN_ZOOM_SCALE, (snapped / 100) * BASE_RENDER_SCALE),
    );
    this._notifyScaleModeChange();
    void this._rerenderPages();
  }

  fitWidth(): void {
    this._scaleMode = "fit-width";
    this._notifyScaleModeChange();
    void this._rerenderPages();
  }

  fitPage(): void {
    this._scaleMode = "fit-page";
    this._notifyScaleModeChange();
    void this._rerenderPages();
  }

  previousPage(): void {
    this.goToPage(this._currentPage - 1);
  }

  nextPage(): void {
    this.goToPage(this._currentPage + 1);
  }

  goToFirstPage(): void {
    this.goToPage(1);
  }

  goToLastPage(): void {
    this.goToPage(this.pageCount);
  }

  goToPage(
    pageNumber: number,
    options: { behavior?: ScrollBehavior } = {},
  ): void {
    const total = this.pageCount;

    if (total <= 0) {
      return;
    }

    const target = Math.min(total, Math.max(1, pageNumber));
    const wrap = this._pagesHost.querySelector<HTMLElement>(
      `.jp-KuusiLivePdf-pageWrap[data-page-number="${target}"]`,
    );

    if (!wrap) {
      return;
    }

    const behavior = options.behavior ?? "smooth";

    if (behavior === "auto") {
      const wrapTop =
        wrap.getBoundingClientRect().top -
        this._scroller.getBoundingClientRect().top +
        this._scroller.scrollTop;

      this._scroller.scrollTop = Math.max(0, wrapTop - 12);
    } else {
      wrap.scrollIntoView({
        block: "start",
        behavior,
      });
    }

    this._currentPage = target;
    this._navBar.setActivePage(target);
    this._updateStatus();
    this._notifyPageChange();
  }

  private async _goToPdfDestination(
    dest: string | unknown[] | null,
  ): Promise<void> {
    const pdf = this._pdfDocument;

    if (!pdf || dest === null) {
      return;
    }

    let explicitDest: unknown = dest;

    if (typeof dest === "string") {
      explicitDest = await pdf.getDestination(dest);
    }

    if (!Array.isArray(explicitDest)) {
      return;
    }

    const destArray = explicitDest as unknown[];
    const [destRef, viewRef, ...args] = destArray;
    let pageNumber: number | null = null;

    if (destRef && typeof destRef === "object") {
      const pageRef = destRef as { num: number; gen: number };
      pageNumber = pdf.cachedPageNumber(pageRef);

      if (!pageNumber) {
        try {
          pageNumber = (await pdf.getPageIndex(pageRef)) + 1;
        } catch {
          return;
        }
      }
    } else if (typeof destRef === "number") {
      pageNumber = destRef + 1;
    }

    if (
      !pageNumber ||
      pageNumber < 1 ||
      pageNumber > pdf.numPages
    ) {
      return;
    }

    this.goToPage(pageNumber, { behavior: "auto" });

    const viewName =
      viewRef &&
      typeof viewRef === "object" &&
      "name" in viewRef &&
      typeof viewRef.name === "string"
        ? viewRef.name
        : null;

    if (viewName !== "XYZ") {
      return;
    }

    const wrap = this._pagesHost.querySelector<HTMLElement>(
      `.jp-KuusiLivePdf-pageWrap[data-page-number="${pageNumber}"]`,
    );

    if (!wrap) {
      return;
    }

    try {
      const page = await pdf.getPage(pageNumber);

      try {
        const viewport = page.getViewport({ scale: this._lastRenderScale });
        const left = typeof args[0] === "number" ? args[0] : 0;
        const top = typeof args[1] === "number" ? args[1] : viewport.height;
        const [vx, vy] = viewport.convertToViewportPoint(left, top);
        const wrapTop =
          wrap.getBoundingClientRect().top -
          this._scroller.getBoundingClientRect().top +
          this._scroller.scrollTop;

        this._scroller.scrollTop = Math.max(0, wrapTop + vy - 24);
        this._scroller.scrollLeft = Math.max(0, wrap.offsetLeft + vx - 24);
      } finally {
        page.cleanup();
      }
    } catch {
      // Ignore invalid in-document destinations.
    }
  }

  jumpToPosition(
    page: number,
    h: number,
    v: number,
    width: number,
    height: number,
    point?: { x?: number; y?: number },
  ): void {
    const wrap = this._pagesHost.querySelector<HTMLElement>(
      `.jp-KuusiLivePdf-pageWrap[data-page-number="${page}"]`,
    );

    if (!wrap) {
      return;
    }

    const metrics = readPdfPageMetrics(wrap);

    if (!metrics) {
      return;
    }

    const box = syncTexBoxToCss(metrics, h, v, width, height, point);

    if (this._syncHighlightTimer !== null) {
      window.clearTimeout(this._syncHighlightTimer);
      this._syncHighlightTimer = null;
    }

    wrap
      .querySelectorAll(".jp-KuusiLivePdf-syncHighlight")
      .forEach((node) => node.remove());

    const marker = document.createElement("div");
    marker.className = "jp-KuusiLivePdf-syncHighlight";
    marker.style.left = `${box.left}px`;
    marker.style.top = `${box.top}px`;
    marker.style.width = `${box.width}px`;
    marker.style.height = `${box.height}px`;
    wrap.appendChild(marker);

    this._currentPage = page;
    this._navBar.setActivePage(page);
    this._updateStatus();
    this._notifyPageChange();

    const targetScroll =
      wrap.offsetTop + box.top - this._scroller.clientHeight * 0.35;
    this._scroller.scrollTop = Math.max(0, targetScroll);

    this._syncHighlightTimer = window.setTimeout(() => {
      marker.remove();
      this._syncHighlightTimer = null;
    }, 1500);
  }

  getSyncAnchor(): { page: number; h: number; v: number } | null {
    const wraps = Array.from(
      this._pagesHost.querySelectorAll<HTMLElement>(".jp-KuusiLivePdf-pageWrap"),
    );

    if (wraps.length === 0) {
      return null;
    }

    const scrollerRect = this._scroller.getBoundingClientRect();
    const anchorY = scrollerRect.top + scrollerRect.height * 0.35;
    const anchorX = scrollerRect.left + scrollerRect.width * 0.5;

    let bestWrap: HTMLElement | null = null;
    let bestDistance = Infinity;

    for (const wrap of wraps) {
      const rect = wrap.getBoundingClientRect();

      if (rect.bottom < scrollerRect.top || rect.top > scrollerRect.bottom) {
        continue;
      }

      const distance = Math.abs(rect.top + rect.height * 0.35 - anchorY);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestWrap = wrap;
      }
    }

    bestWrap = bestWrap ?? wraps[0];

    const metrics = readPdfPageMetrics(bestWrap);

    if (!metrics) {
      return null;
    }

    const rect = bestWrap.getBoundingClientRect();
    const pageNumber = Number.parseInt(
      bestWrap.dataset.pageNumber ?? "1",
      10,
    );
    const point = cssToSyncTexPoint(
      metrics,
      anchorX - rect.left,
      anchorY - rect.top,
    );

    return {
      page: pageNumber,
      h: point.h,
      v: point.v,
    };
  }

  async reload(force = false): Promise<void> {
    if (force) {
      this._captureScroll();
      this._suppressChangeReload = true;

      try {
        await this._context.revert();
        await this._renderPdf();
      } finally {
        this._suppressChangeReload = false;
      }

      this._restoreScroll();
      return;
    }

    this._scheduleReload();
  }

  protected onAfterShow(msg: Message): void {
    super.onAfterShow(msg);

    if (this.isDisposed) {
      return;
    }

    if (this._scaleMode !== "manual" || this._pendingShowRerender) {
      this._pendingShowRerender = false;
      this._scheduleAutoFitRerender();
    }
  }

  dispose(): void {
    if (this._pollTimer !== null) {
      window.clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    if (this._reloadTimer !== null) {
      window.clearTimeout(this._reloadTimer);
      this._reloadTimer = null;
    }

    if (this._fitWidthResizeTimer !== null) {
      window.clearTimeout(this._fitWidthResizeTimer);
      this._fitWidthResizeTimer = null;
    }

    if (this._syncHighlightTimer !== null) {
      window.clearTimeout(this._syncHighlightTimer);
      this._syncHighlightTimer = null;
    }

    if (this._scrollRaf !== null) {
      window.cancelAnimationFrame(this._scrollRaf);
      this._scrollRaf = null;
    }

    if (this._wheelZoomTimer !== null) {
      window.clearTimeout(this._wheelZoomTimer);
      this._wheelZoomTimer = null;
    }

    if (this._reloadFlashTimer !== null) {
      window.clearTimeout(this._reloadFlashTimer);
      this._reloadFlashTimer = null;
    }

    this._scroller.removeEventListener("wheel", this._handleWheel);
    this._scroller.removeEventListener("scroll", this._handleScroll);
    this.node.removeEventListener("keydown", this._handleKeyDown);

    this._context.fileChanged.disconnect(this._onContextFileChanged, this);
    this._context.model.contentChanged.disconnect(
      this._onContextContentChanged,
      this,
    );

    this._resizeObserver?.disconnect();
    this._resizeObserver = null;

    this._disposePageTextLayers();
    this._pagesHost.replaceChildren();

    void this._pdfDocument?.destroy();
    this._pdfDocument = null;
    this._linkService.setDocument(null);
    super.dispose();
  }

  private async _initialize(): Promise<void> {
    await this._context.ready;

    if (this.isDisposed) {
      return;
    }

    this._lastKnownModified =
      this._context.contentsModel?.last_modified ?? "";

    await this._renderPdf();

    if (this.isDisposed) {
      return;
    }

    this._readyResolve?.();
    this._readyResolve = null;

    this._context.fileChanged.connect(this._onContextFileChanged, this);
    this._context.model.contentChanged.connect(
      this._onContextContentChanged,
      this,
    );

    this._pollTimer = window.setInterval(() => {
      void this._pollForChanges();
    }, KUUSI_DISK_POLL_INTERVAL_MS);

    this._updateStatus();
  }

  private _captureScroll(): void {
    this._scrollTop = this._scroller.scrollTop;
  }

  private _restoreScroll(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this.isDisposed) {
          this._scroller.scrollTop = this._scrollTop;
        }
      });
    });
  }

  private _scheduleAutoFitRerender(): void {
    if (
      this._scaleMode === "manual" ||
      this.isDisposed ||
      this._isRendering ||
      !this._scrollerHasLayout()
    ) {
      return;
    }

    if (this._fitWidthResizeTimer !== null) {
      window.clearTimeout(this._fitWidthResizeTimer);
    }

    this._fitWidthResizeTimer = window.setTimeout(() => {
      this._fitWidthResizeTimer = null;

      if (!this._scrollerHasLayout()) {
        this._pendingShowRerender = true;
        return;
      }

      void this._rerenderPages();
    }, FIT_WIDTH_RESIZE_DEBOUNCE_MS);
  }

  private _scrollerHasLayout(): boolean {
    return (
      this._scroller.clientWidth >= MIN_SCROLLER_WIDTH &&
      this._scroller.clientHeight >= MIN_SCROLLER_HEIGHT
    );
  }

  private _scheduleReload(): void {
    if (!this._autoReload || this.isDisposed || this._suppressChangeReload) {
      return;
    }

    if (this._reloadTimer !== null) {
      window.clearTimeout(this._reloadTimer);
    }

    this._reloadTimer = window.setTimeout(() => {
      this._reloadTimer = null;
      void this._reloadFromDisk();
    }, RELOAD_DEBOUNCE_MS);
  }

  private async _pollForChanges(): Promise<void> {
    if (!this._autoReload || this.isDisposed || !this._context.isReady) {
      return;
    }

    try {
      const model = await this._contents.get(this._context.path, {
        content: false,
      });

      if (model.last_modified !== this._lastKnownModified) {
        await this._reloadFromDisk();
      }
    } catch {
      // Ignore transient polling errors while the file is being rewritten.
    }
  }

  private async _reloadFromDisk(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this._captureScroll();
    this._suppressChangeReload = true;

    try {
      await this._context.revert();
    } catch {
      this._suppressChangeReload = false;
      return;
    }

    try {
      await this._renderPdf();

      if (this._autoReload) {
        this._playAutoReloadFlash();
      }
    } finally {
      this._suppressChangeReload = false;
    }

    this._restoreScroll();
  }

  private _createReloadFlashSvg(): SVGSVGElement {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "jp-KuusiLivePdf-reloadFlashSvg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");

    const filterId = `jp-KuusiLivePdf-reloadFlashGlow-${reloadFlashFilterCounter++}`;
    const defs = document.createElementNS(svgNS, "defs");
    const filter = document.createElementNS(svgNS, "filter");
    filter.setAttribute("id", filterId);
    filter.setAttribute("x", "-50%");
    filter.setAttribute("y", "-50%");
    filter.setAttribute("width", "200%");
    filter.setAttribute("height", "200%");

    const blur = document.createElementNS(svgNS, "feGaussianBlur");
    blur.setAttribute("stdDeviation", "5");
    blur.setAttribute("result", "backlight");

    filter.appendChild(blur);
    defs.appendChild(filter);
    svg.appendChild(defs);

    const light = document.createElementNS(svgNS, "rect");
    light.setAttribute("class", "jp-KuusiLivePdf-reloadFlashLight");
    light.setAttribute("filter", `url(#${filterId})`);
    light.setAttribute("x", "1.2");
    light.setAttribute("y", "1.2");
    light.setAttribute("width", "97.6");
    light.setAttribute("height", "97.6");
    light.setAttribute("rx", "0.6");
    light.setAttribute("pathLength", "100");
    svg.appendChild(light);

    return svg;
  }

  private _playAutoReloadFlash(): void {
    if (this.isDisposed) {
      return;
    }

    if (this._reloadFlashTimer !== null) {
      window.clearTimeout(this._reloadFlashTimer);
      this._reloadFlashTimer = null;
    }

    const pageWrap = this._pagesHost.querySelector<HTMLElement>(
      `.jp-KuusiLivePdf-pageWrap[data-page-number="${this._currentPage}"]`,
    );
    const host = pageWrap ?? this._scroller;

    for (const element of Array.from(
      this._pagesHost.querySelectorAll<HTMLElement>(
        ".jp-KuusiLivePdf-pageWrap-isFlashing",
      ),
    )) {
      element.classList.remove("jp-KuusiLivePdf-pageWrap-isFlashing");
    }

    if (pageWrap) {
      pageWrap.classList.add("jp-KuusiLivePdf-pageWrap-isFlashing");
    }

    if (this._reloadFlashNode.parentElement !== host) {
      host.appendChild(this._reloadFlashNode);
    }

    this._reloadFlashNode.classList.remove("is-active");
    void this._reloadFlashNode.offsetWidth;
    this._reloadFlashNode.classList.add("is-active");

    this._reloadFlashTimer = window.setTimeout(() => {
      this._reloadFlashTimer = null;

      if (!this.isDisposed) {
        this._reloadFlashNode.classList.remove("is-active");
        pageWrap?.classList.remove("jp-KuusiLivePdf-pageWrap-isFlashing");
      }
    }, AUTO_RELOAD_FLASH_MS);
  }

  private async _rerenderPages(): Promise<void> {
    if (this.isDisposed || !this._pdfDocument || this._isRendering) {
      return;
    }

    this._isRendering = true;
    this._captureScroll();
    const generation = ++this._renderGeneration;

    try {
      await this._paintPages(this._pdfDocument, generation);
      this._updateStatus();
    } finally {
      this._isRendering = false;
      this._restoreScroll();
    }
  }

  private async _resolveRenderScale(
    pdf: pdfjs.PDFDocumentProxy,
  ): Promise<number> {
    if (this._scaleMode === "manual") {
      return this._manualScale;
    }

    const pageNumber = Math.min(
      pdf.numPages,
      Math.max(1, this._currentPage),
    );
    const page = await pdf.getPage(pageNumber);

    try {
      const baseViewport = page.getViewport({ scale: 1 });

      if (!this._scrollerHasLayout()) {
        this._pendingShowRerender = true;
        return this._lastRenderScale;
      }

      const availableWidth = Math.max(
        MIN_SCROLLER_WIDTH,
        this._scroller.clientWidth - FIT_WIDTH_PADDING,
      );

      if (this._scaleMode === "fit-width") {
        return availableWidth / baseViewport.width;
      }

      const statusBar = this.node.querySelector(".jp-KuusiLivePdf-status");
      const statusHeight = statusBar?.getBoundingClientRect().height ?? 0;
      const availableHeight = Math.max(
        MIN_SCROLLER_HEIGHT,
        this._scroller.clientHeight - FIT_PAGE_PADDING - statusHeight,
      );
      const scaleW = availableWidth / baseViewport.width;
      const scaleH = availableHeight / baseViewport.height;

      return Math.min(scaleW, scaleH);
    } finally {
      page.cleanup();
    }
  }

  private _resetHighlightHistory(): void {
    this._highlightHistory = [cloneHighlightMap(this._userHighlights)];
    this._highlightHistoryIndex = 0;
    this._notifyHighlightHistoryChange();
  }

  private _commitHighlightState(): void {
    this._highlightHistory = this._highlightHistory.slice(
      0,
      this._highlightHistoryIndex + 1,
    );
    this._highlightHistory.push(cloneHighlightMap(this._userHighlights));

    if (this._highlightHistory.length > HIGHLIGHT_HISTORY_LIMIT) {
      this._highlightHistory.shift();
    } else {
      this._highlightHistoryIndex += 1;
    }

    this._notifyHighlightHistoryChange();
  }

  private _applyHighlightSnapshot(
    snapshot: Map<number, PdfUserHighlight[]>,
  ): void {
    this._userHighlights = cloneHighlightMap(snapshot);
    this._repaintAllUserHighlights();
    this._notifyHighlightHistoryChange();
  }

  private _repaintAllUserHighlights(): void {
    for (const [pageNumber, mapping] of this._pageTextLayerMeta) {
      paintUserHighlights(
        mapping,
        this._userHighlights.get(pageNumber) ?? [],
      );
    }
  }

  private _notifyHighlightHistoryChange(): void {
    this._onHighlightHistoryChange?.();
  }

  private _disposePageTextLayers(): void {
    for (const mapping of this._pageTextLayerMeta.values()) {
      disposePdfTextLayer(mapping.layer);
    }

    this._pageTextLayerMeta.clear();
  }

  private async _paintPages(
    pdf: pdfjs.PDFDocumentProxy,
    generation: number,
  ): Promise<void> {
    const renderScale = await this._resolveRenderScale(pdf);

    if (generation !== this._renderGeneration || this.isDisposed) {
      return;
    }

    this._lastRenderScale = renderScale;
    this._linkService.setDocument(pdf);
    this._disposePageTextLayers();
    const nextPages = document.createDocumentFragment();

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);

      try {
        if (generation !== this._renderGeneration || this.isDisposed) {
          return;
        }

        let canvas: HTMLCanvasElement;
        let baseViewport: pdfjs.PageViewport;
        const viewport = page.getViewport({ scale: renderScale });

        try {
          ({ canvas, baseViewport } = await renderPdfPageCanvas(page, renderScale, {
            constrainWidth: this._scaleMode !== "manual",
          }));
        } catch {
          continue;
        }

        const wrap = document.createElement("div");
        wrap.className = "jp-KuusiLivePdf-pageWrap";
        wrap.dataset.pageNumber = String(pageNumber);
        wrap.dataset.pageWidthPt = String(baseViewport.width);
        wrap.dataset.pageHeightPt = String(baseViewport.height);
        wrap.appendChild(canvas);

        try {
          const textLayerResult = await renderPdfPageTextLayer(page, viewport);
          wrap.appendChild(textLayerResult.layer);
          this._pageTextLayerMeta.set(pageNumber, textLayerResult);

          const userHighlights = this._userHighlights.get(pageNumber) ?? [];

          if (userHighlights.length > 0) {
            paintUserHighlights(textLayerResult, userHighlights);
          }
        } catch {
          // Skip broken text layers; the page image is still usable.
        }

        try {
          const annotationLayer = await renderPdfPageAnnotations(
            page,
            viewport,
            this._linkService,
          );

          if (annotationLayer) {
            wrap.appendChild(annotationLayer);
          }
        } catch {
          // Skip broken annotation layers; the page image is still usable.
        }

        nextPages.appendChild(wrap);
      } finally {
        page.cleanup();
      }
    }

    if (generation !== this._renderGeneration || this.isDisposed) {
      return;
    }

    this._pagesHost.replaceChildren(...Array.from(nextPages.children));
    window.requestAnimationFrame(() => {
      if (generation !== this._renderGeneration || this.isDisposed) {
        return;
      }

      for (const mapping of this._pageTextLayerMeta.values()) {
        refineWhitespaceSpanSelection(
          mapping.textDivs,
          mapping.textContentItemsStr,
        );
      }
    });
    this._syncCurrentPageFromScroll();
    void this._applySearchHighlights(this._searchGeneration);
  }

  private async _renderPdf(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    if (this._isRendering) {
      this._reloadQueued = true;
      return;
    }

    this._isRendering = true;
    const generation = ++this._renderGeneration;
    this._userHighlights.clear();
    this._disposePageTextLayers();
    this._resetHighlightHistory();

    try {
      const base64 = this._context.model.toString();

      if (!base64) {
        this._pagesHost.replaceChildren();
        if (this._pdfDocument) {
          await this._pdfDocument.destroy();
          this._pdfDocument = null;
        }
        this._linkService.setDocument(null);
        this._currentPage = 1;
        this._navBar.setPageCount(0);
        this._updateStatus(0);
        return;
      }

      const previousDocument = this._pdfDocument;
      this._pdfDocument = null;

      const pdf = await pdfjs.getDocument({
        data: decodeBase64Pdf(base64),
      }).promise;

      if (generation !== this._renderGeneration || this.isDisposed) {
        await pdf.destroy();
        return;
      }

      await this._paintPages(pdf, generation);

      if (generation !== this._renderGeneration || this.isDisposed) {
        await pdf.destroy();
        return;
      }

      this._pdfDocument = pdf;

      if (previousDocument) {
        await previousDocument.destroy();
      }

      this._lastKnownModified =
        this._context.contentsModel?.last_modified ?? "";
      this._navBar.setPageCount(pdf.numPages);
      this._navBar.setActivePage(this._currentPage);
      void this._loadNavOutline(pdf);

      if (this._navVisible && this._navMode === "thumbnails") {
        void this._renderNavThumbnails(pdf);
      }

      this._updateStatus(pdf.numPages);
    } finally {
      this._isRendering = false;

      if (this._reloadQueued) {
        this._reloadQueued = false;
        void this._renderPdf();
      }
    }
  }

  private _notifyScaleModeChange(): void {
    this._syncScaleModeDataset();
    this._onScaleModeChange?.();
  }

  private _syncScaleModeDataset(): void {
    this.node.dataset.scaleMode = this._scaleMode;
  }

  private _notifyPageChange(): void {
    this._onPageChange?.();
  }

  private _formatModifiedLabel(): string {
    const modified =
      this._lastKnownModified || this._context.contentsModel?.last_modified;

    return formatContentsModified(modified);
  }

  private _syncCurrentPageFromScroll(): void {
    const wraps = Array.from(
      this._pagesHost.querySelectorAll<HTMLElement>(".jp-KuusiLivePdf-pageWrap"),
    );

    if (wraps.length === 0) {
      if (this._currentPage !== 1) {
        this._currentPage = 1;
        this._updateStatus();
      }
      return;
    }

    const scrollerRect = this._scroller.getBoundingClientRect();
    const centerY = scrollerRect.top + scrollerRect.height / 2;

    let bestPage = 1;
    let bestDistance = Infinity;

    for (const wrap of wraps) {
      const rect = wrap.getBoundingClientRect();
      const pageCenter = rect.top + rect.height / 2;
      const distance = Math.abs(pageCenter - centerY);
      const pageNumber = Number.parseInt(wrap.dataset.pageNumber ?? "1", 10);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestPage = pageNumber;
      }
    }

    if (this._currentPage !== bestPage) {
      this._currentPage = bestPage;
      this._navBar.setActivePage(bestPage);
      this._updateStatus();
      this._notifyPageChange();
    }
  }

  private async _loadNavOutline(
    pdf: pdfjs.PDFDocumentProxy,
  ): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    try {
      const entries = await buildPdfOutline(pdf);

      if (this.isDisposed) {
        return;
      }

      this._navBar.setOutline(entries);
    } catch {
      if (!this.isDisposed) {
        this._navBar.setOutline([]);
      }
    }
  }

  private async _renderNavThumbnails(
    pdf: pdfjs.PDFDocumentProxy,
  ): Promise<void> {
    if (!this._navVisible || this.isDisposed || this._navMode !== "thumbnails") {
      return;
    }

    const generation = ++this._thumbGeneration;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (generation !== this._thumbGeneration || this.isDisposed) {
        return;
      }

      const page = await pdf.getPage(pageNumber);

      try {
        if (generation !== this._thumbGeneration || this.isDisposed) {
          return;
        }

        const viewport = page.getViewport({ scale: NAV_THUMB_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.className = "jp-KuusiLivePdf-navThumbImage";

        const context = canvas.getContext("2d", { alpha: false });

        if (!context) {
          continue;
        }

        await page.render({ canvasContext: context, viewport }).promise;

        if (generation !== this._thumbGeneration || this.isDisposed) {
          return;
        }

        this._navBar.setThumbnail(pageNumber, canvas);
      } finally {
        page.cleanup();
      }
    }
  }

  private async _applySearchHighlights(generation: number): Promise<void> {
    const pdf = this._pdfDocument;
    const query = this._searchQuery.trim();

    if (!pdf) {
      return;
    }

    if (!query) {
      clearHighlights(this._pagesHost);
      return;
    }

    const renderScale = this._lastRenderScale;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (generation !== this._searchGeneration || this.isDisposed) {
        return;
      }

      const wrap = this._pagesHost.querySelector<HTMLElement>(
        `.jp-KuusiLivePdf-pageWrap[data-page-number="${pageNumber}"]`,
      );

      if (!wrap) {
        continue;
      }

      const page = await pdf.getPage(pageNumber);

      try {
        if (generation !== this._searchGeneration || this.isDisposed) {
          return;
        }

        const metrics = readPdfPageMetrics(wrap);
        const highlights = await findPageHighlights(
          page,
          query,
          metrics?.displayScale ?? renderScale,
        );
        paintHighlights(wrap, highlights);
      } finally {
        page.cleanup();
      }
    }
  }

  private _onWheel(event: WheelEvent): void {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const scrollerRect = this._scroller.getBoundingClientRect();
    const viewportX = event.clientX - scrollerRect.left;
    const viewportY = event.clientY - scrollerRect.top;

    if (!this._wheelZoomAnchor) {
      this._wheelZoomAnchor = {
        contentX: this._scroller.scrollLeft + viewportX,
        contentY: this._scroller.scrollTop + viewportY,
        viewportX,
        viewportY,
      };
      this._wheelZoomOldScale = this._lastRenderScale;
    }

    let normalizedDelta = event.deltaY;

    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      normalizedDelta *= 16;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      normalizedDelta *= 400;
    }

    const rawFactor = Math.exp(-normalizedDelta * ZOOM_WHEEL_SENSITIVITY);
    const step = Math.min(
      ZOOM_WHEEL_MAX_STEP,
      Math.max(1 / ZOOM_WHEEL_MAX_STEP, rawFactor),
    );
    this._wheelZoomFactor *= step;

    if (this._wheelZoomTimer !== null) {
      window.clearTimeout(this._wheelZoomTimer);
    }

    this._wheelZoomTimer = window.setTimeout(() => {
      this._wheelZoomTimer = null;
      void this._commitWheelZoom();
    }, ZOOM_WHEEL_DEBOUNCE_MS);
  }

  private async _commitWheelZoom(): Promise<void> {
    const anchor = this._wheelZoomAnchor;

    if (!anchor || this._wheelZoomFactor === 1 || !this._pdfDocument) {
      this._wheelZoomFactor = 1;
      this._wheelZoomAnchor = null;
      return;
    }

    const oldScale = this._wheelZoomOldScale;
    this._scaleMode = "manual";
    this._manualScale = Math.min(
      MAX_ZOOM_SCALE,
      Math.max(MIN_ZOOM_SCALE, this._manualScale * this._wheelZoomFactor),
    );
    this._wheelZoomFactor = 1;
    this._wheelZoomAnchor = null;
    this._notifyScaleModeChange();

    await this._rerenderPages();

    if (this.isDisposed || oldScale <= 0) {
      return;
    }

    const ratio = this._lastRenderScale / oldScale;
    this._scroller.scrollLeft = anchor.contentX * ratio - anchor.viewportX;
    this._scroller.scrollTop = anchor.contentY * ratio - anchor.viewportY;
  }

  private _onKeyDown(event: KeyboardEvent): void {
    if (this.isDisposed || event.altKey || event.metaKey || event.ctrlKey) {
      return;
    }

    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }

    switch (event.key) {
      case "+":
      case "=":
        event.preventDefault();
        this.zoomIn();
        break;
      case "-":
      case "_":
        event.preventDefault();
        this.zoomOut();
        break;
      case "r":
      case "R":
        event.preventDefault();
        void this.reload(true);
        break;
      case "Home":
        event.preventDefault();
        this.goToFirstPage();
        break;
      case "End":
        event.preventDefault();
        this.goToLastPage();
        break;
      case "PageUp":
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        this.previousPage();
        break;
      case "PageDown":
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        this.nextPage();
        break;
      default:
        break;
    }
  }

  private _updateStatus(pageCount = this._pdfDocument?.numPages ?? 0): void {
    if (pageCount <= 0) {
      this._statusModifiedNode.textContent = this._formatModifiedLabel()
        ? `Modified ${this._formatModifiedLabel()}`
        : "No pages";
      return;
    }

    const modifiedLabel = this._formatModifiedLabel();
    this._statusModifiedNode.textContent = modifiedLabel
      ? `Modified ${modifiedLabel}`
      : "";
  }
}

import {
  CENTER_FOLLOW_MS,
  CENTER_VIEWPORT_STABLE_MS,
  OPEN_CENTER_MIN_NODE_PX,
  OPEN_CENTER_MIN_VIEWPORT_PX,
  VIEWPORT_PAN_LOCK_MS,
} from "./notebookMindMapTypes";

export type MindMapViewportHost = {
  isDisposed: boolean;
  viewport: HTMLElement;
  /** Widget root — observed with the viewport for dock split resizes. */
  root: HTMLElement;
  cellNodes: Map<string, HTMLElement>;
  panX: number;
  panY: number;
  zoom: number;
  setPan: (x: number, y: number) => void;
  applyTransform: () => void;
  pendingFocusCellIndex: number | null;
  pendingFocusCenter: boolean;
};

/**
 * Open-center follow + pan lock for the mind-map canvas.
 * Owns the settle timers so NotebookMindMapWidget does not scatter them.
 */
export class MindMapViewportController {
  private readonly _host: MindMapViewportHost;

  private _heldPan: { x: number; y: number } | null = null;
  private _heldPanClearTimer: number | null = null;
  private _panLockUntil = 0;

  private _pendingOpenCenterIndex: number | null = null;
  private _openCentered = false;
  private _centerFollowUntil = 0;
  private _centerFollowViewportKey = "";
  private _centerFollowViewportStableSince = 0;
  private _centerGeneration = 0;
  /** True once an open-center request actually landed on screen. */
  private _everCentered = false;
  /** User pan/zoom/drag supersedes any pending automatic centering. */
  private _userNavigated = false;
  private _lastRequestedIndex: number | null = null;
  private _rafChainId = 0;

  /** Single settle chain while open-center follow is active (no 50…3200 storm). */
  private _followPulseTimer: number | null = null;
  private _rafCenterActive = false;
  private _viewportSizeObserver: ResizeObserver | null = null;

  constructor(host: MindMapViewportHost) {
    this._host = host;
  }

  get openCentered(): boolean {
    return this._openCentered;
  }

  /**
   * Cell whose open-center never landed (e.g. the map opened in a hidden tab
   * with a 0×0 viewport and the follow window expired), or null.
   */
  get unfulfilledCenterIndex(): number | null {
    return !this._everCentered && !this._userNavigated
      ? this._lastRequestedIndex
      : null;
  }

  get pendingOpenCenterIndex(): number | null {
    return this._pendingOpenCenterIndex;
  }

  get heldPan(): { x: number; y: number } | null {
    return this._heldPan;
  }

  isPanLocked(): boolean {
    return (
      this._heldPan !== null || performance.now() < this._panLockUntil
    );
  }

  lockPan(ms: number): void {
    this._panLockUntil = Math.max(
      this._panLockUntil,
      performance.now() + ms,
    );
  }

  /** Keep camera fixed through post-drop relayout + delayed notebook sync. */
  holdPan(): void {
    this._heldPan = { x: this._host.panX, y: this._host.panY };

    if (this._heldPanClearTimer !== null) {
      window.clearTimeout(this._heldPanClearTimer);
    }

    this._heldPanClearTimer = window.setTimeout(() => {
      this._heldPanClearTimer = null;
      this._heldPan = null;
    }, VIEWPORT_PAN_LOCK_MS);
  }

  clearHeldPan(): void {
    this._heldPan = null;
    if (this._heldPanClearTimer !== null) {
      window.clearTimeout(this._heldPanClearTimer);
      this._heldPanClearTimer = null;
    }
  }

  /**
   * Track a cell for repeated centering until dock/markdown layout settles.
   */
  beginCenterFollow(cellIndex: number): void {
    this._stopFollowPulse();
    this._openCentered = false;
    this._everCentered = false;
    this._userNavigated = false;
    this._lastRequestedIndex = cellIndex;
    this._pendingOpenCenterIndex = cellIndex;
    this._centerFollowUntil = performance.now() + CENTER_FOLLOW_MS;
    this._centerFollowViewportKey = "";
    this._centerFollowViewportStableSince = 0;
    this.ensureSizeObserver();
    this._armFollowPulse();
  }

  /** User navigation always wins over automatic open/selection centering. */
  cancelCenterFollow(): void {
    this._userNavigated = true;
    this._teardownFollow();
  }

  /**
   * Stop timers while the map is hidden without forgetting an unfinished
   * open-center, so showing it again can retry.
   */
  pauseCenterFollow(): void {
    this._teardownFollow();
  }

  private _teardownFollow(): void {
    this._centerGeneration += 1;
    this._rafChainId += 1;
    this._pendingOpenCenterIndex = null;
    this._openCentered = true;
    this._centerFollowUntil = 0;
    this._centerFollowViewportKey = "";
    this._centerFollowViewportStableSince = 0;
    this._stopFollowPulse();
    this._rafCenterActive = false;
  }

  /**
   * Try to center now; if layout is not ready, rely on the follow pulse + rAF.
   */
  centerOrSchedule(index: number): void {
    if (this.centerCell(index)) {
      this._noteCenterFollowSuccess(index);
    }
    this._startRafCenter(index);
    this._armFollowPulse();
  }

  /**
   * Re-center the followed cell while the settle window is open. Extends the
   * window when the viewport is still changing size (split dock animation).
   */
  followIfNeeded(): void {
    if (this._pendingOpenCenterIndex === null) {
      return;
    }

    const host = this._host;
    const now = performance.now();
    const viewKey = `${host.viewport.clientWidth}x${host.viewport.clientHeight}`;

    if (viewKey !== this._centerFollowViewportKey) {
      this._centerFollowViewportKey = viewKey;
      this._centerFollowViewportStableSince = now;
      this._centerFollowUntil = Math.max(
        this._centerFollowUntil,
        now + CENTER_VIEWPORT_STABLE_MS + 400,
      );
    }

    const viewportStable =
      now - this._centerFollowViewportStableSince >= CENTER_VIEWPORT_STABLE_MS;

    if (now > this._centerFollowUntil && viewportStable) {
      this._openCentered = true;
      this._pendingOpenCenterIndex = null;
      this._stopFollowPulse();
      return;
    }

    const index = this._pendingOpenCenterIndex;

    if (this.centerCell(index)) {
      this._noteCenterFollowSuccess(index);
      return;
    }

    this._startRafCenter(index);
  }

  centerCell(index: number): boolean {
    if (this.isPanLocked()) {
      return false;
    }

    const host = this._host;
    const allowCenter =
      this._pendingOpenCenterIndex === index ||
      (host.pendingFocusCellIndex === index && host.pendingFocusCenter);

    if (!allowCenter) {
      return false;
    }

    const node = host.cellNodes.get(`cell-${index}`);

    if (!node || node.style.display === "none") {
      return false;
    }

    if (node.style.left === "" || node.style.top === "") {
      return false;
    }

    const viewW = host.viewport.clientWidth;
    const viewH = host.viewport.clientHeight;

    if (
      viewW < OPEN_CENTER_MIN_VIEWPORT_PX ||
      viewH < OPEN_CENTER_MIN_VIEWPORT_PX
    ) {
      return false;
    }

    const worldX = Number.parseFloat(node.style.left) || 0;
    const worldY = Number.parseFloat(node.style.top) || 0;
    const nodeW =
      node.offsetWidth || Number.parseFloat(node.style.width) || 0;
    const nodeH = node.offsetHeight || 0;

    if (nodeW < OPEN_CENTER_MIN_NODE_PX || nodeH < OPEN_CENTER_MIN_NODE_PX) {
      return false;
    }

    const nextPanX = viewW / 2 - (worldX + nodeW / 2) * host.zoom;
    const nextPanY = viewH / 2 - (worldY + nodeH / 2) * host.zoom;

    if (
      Math.abs(nextPanX - host.panX) < 0.5 &&
      Math.abs(nextPanY - host.panY) < 0.5
    ) {
      this._everCentered = true;
      return true;
    }

    host.setPan(nextPanX, nextPanY);
    host.applyTransform();
    this._everCentered = true;
    return true;
  }

  ensureSizeObserver(): void {
    if (
      this._viewportSizeObserver ||
      typeof ResizeObserver === "undefined" ||
      this._host.isDisposed
    ) {
      return;
    }

    this._viewportSizeObserver = new ResizeObserver(() => {
      if (
        this._host.isDisposed ||
        this._pendingOpenCenterIndex === null ||
        this.isPanLocked()
      ) {
        return;
      }

      this.followIfNeeded();
    });
    this._viewportSizeObserver.observe(this._host.viewport);
    this._viewportSizeObserver.observe(this._host.root);
  }

  dispose(): void {
    this.cancelCenterFollow();
    this.clearHeldPan();
    this._viewportSizeObserver?.disconnect();
    this._viewportSizeObserver = null;
  }

  private _noteCenterFollowSuccess(index: number): void {
    if (this._pendingOpenCenterIndex !== index) {
      return;
    }

    const now = performance.now();
    this._centerFollowUntil = Math.max(
      this._centerFollowUntil,
      now + CENTER_VIEWPORT_STABLE_MS + 200,
    );
    this._armFollowPulse();
  }

  /** One pulse chain for the whole follow window (replaces 50…3200 timeouts). */
  private _armFollowPulse(): void {
    if (this._pendingOpenCenterIndex === null) {
      return;
    }

    if (this._followPulseTimer !== null) {
      return;
    }

    const tick = (): void => {
      this._followPulseTimer = null;

      if (this._host.isDisposed || this._pendingOpenCenterIndex === null) {
        return;
      }

      this.followIfNeeded();

      if (this._pendingOpenCenterIndex === null) {
        return;
      }

      // followIfNeeded / noteSuccess may already have armed the next pulse.
      if (this._followPulseTimer !== null) {
        return;
      }

      const remaining = this._centerFollowUntil - performance.now();
      // Keep pulsing while follow is open; slow down once past the deadline
      // so viewport-stability can finish without a busy loop.
      const delay =
        remaining > 0 ? Math.min(250, Math.max(50, remaining)) : 280;

      this._followPulseTimer = window.setTimeout(tick, delay);
    };

    this._followPulseTimer = window.setTimeout(tick, 50);
  }

  private _stopFollowPulse(): void {
    if (this._followPulseTimer !== null) {
      window.clearTimeout(this._followPulseTimer);
      this._followPulseTimer = null;
    }
  }

  /** Retry centering on animation frames until the node/viewport are ready. */
  private _startRafCenter(index: number, attempts = 120): void {
    if (this._rafCenterActive) {
      return;
    }

    const generation = this._centerGeneration;
    const chain = ++this._rafChainId;
    this._rafCenterActive = true;
    // A superseded chain must not clear the flag of the chain that replaced it.
    const finish = (): void => {
      if (chain === this._rafChainId) {
        this._rafCenterActive = false;
      }
    };

    const tick = (left: number): void => {
      if (
        this._host.isDisposed ||
        generation !== this._centerGeneration ||
        this._pendingOpenCenterIndex !== index
      ) {
        finish();
        return;
      }

      if (this.centerCell(index)) {
        this._noteCenterFollowSuccess(index);
        finish();
        return;
      }

      if (left <= 0) {
        finish();
        return;
      }

      window.requestAnimationFrame(() => {
        tick(left - 1);
      });
    };

    window.requestAnimationFrame(() => {
      tick(attempts);
    });
  }
}

import { MessageLoop } from "@lumino/messaging";
import { Widget } from "@lumino/widgets";
import {
  collapseIcon,
  expandIcon,
  runIcon,
  stopIcon,
} from "@jupyterlab/ui-components";

import type { KuusiTranslator } from "./kuusiI18n";

export type KuusiCornerAction = "fullscreen" | "play";

export const findKuusiDocumentWidget = (
  start: Widget,
  className?: string,
): Widget | null => {
  let widget: Widget | null = start;

  while (widget) {
    const { classList } = widget.node;

    if (className && classList.contains(className)) {
      return widget;
    }

    if (
      classList.contains("jp-Document") ||
      classList.contains("jp-KuusiNotebookMindMapDocument") ||
      classList.contains("jp-KuusiMarkdownSlidesDocument") ||
      classList.contains("jp-KuusiNotebookArticle") ||
      classList.contains("jp-MarkdownViewer-Document") ||
      classList.contains("jp-NotebookPanel")
    ) {
      return widget;
    }

    widget = widget.parent;
  }

  return null;
};

/** Applied to the document itself while it fills the screen. */
const VIEW_FULLSCREEN_CLASS = "jp-KuusiViewFullscreen";

export type KuusiDocumentFullscreenOptions = {
  getDocumentWidget: () => Widget | null;
  onLayout?: () => void;
  /** Called when Kuusi fullscreen / slideshow play state changes. */
  onActiveChange?: (active: boolean) => void;
  t: KuusiTranslator;
};

/**
 * Lab-level helpers remain available; the corner control is a single
 * view-fullscreen button (Kuusi window). Corner action `"play"` shows a
 * slideshow start/stop control instead.
 */
export class KuusiDocumentFullscreen {
  private _kuusiButton: HTMLButtonElement | null = null;

  /** Document currently filling the screen, if any. */
  private _target: Widget | null = null;

  private _liftedContainment: Array<{
    node: HTMLElement;
    contain: string;
    zIndex: string;
  }> = [];

  private _kuusiSession = false;

  private _kuusiEntering = false;

  private _kuusiNative = false;

  private _cornerAction: KuusiCornerAction = "fullscreen";

  private _lastActive: boolean | null = null;

  private _hiddenChrome: Widget[] = [];

  constructor(private _options: KuusiDocumentFullscreenOptions) {}

  createButtons(cornerAction: KuusiCornerAction = "fullscreen"): HTMLElement {
    this._cornerAction = cornerAction;

    const wrapper = document.createElement("div");
    wrapper.className =
      "jp-KuusiCornerControl jp-KuusiNotebookMindMap-status-fullscreen";

    if (cornerAction === "play") {
      const playButton = document.createElement("button");
      playButton.type = "button";
      playButton.className =
        "jp-KuusiCornerBtn jp-KuusiNotebookMindMap-status-fullscreen-btn jp-KuusiNotebookMindMap-status-fullscreen-btn-play";
      this._kuusiButton = playButton;
      playButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this._toggleKuusi();
      });
      wrapper.append(playButton);
    } else {
      // Single control: view (document) fullscreen only — no JupyterLab fullscreen.
      const kuusiButton = document.createElement("button");
      kuusiButton.type = "button";
      kuusiButton.className =
        "jp-KuusiCornerBtn jp-KuusiNotebookMindMap-status-fullscreen-btn jp-KuusiNotebookMindMap-status-fullscreen-btn-kuusi";
      this._kuusiButton = kuusiButton;
      kuusiButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this._toggleKuusi();
      });
      wrapper.append(kuusiButton);
    }

    this.syncButtons();
    wrapper.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("fullscreenchange", this._onFullscreenChange);
    document.addEventListener(
      "webkitfullscreenchange",
      this._onFullscreenChange,
    );

    return wrapper;
  }

  syncButtons(): void {
    const t = this._options.t;
    const kuusiActive = this._isKuusiFullscreen();

    this._syncPresentationClass(kuusiActive);

    if (this._cornerAction === "play") {
      if (this._kuusiButton) {
        const label = kuusiActive ? t.stopSlideshow() : t.startSlideshow();
        this._kuusiButton.title = label;
        this._kuusiButton.setAttribute("aria-label", label);
        this._kuusiButton.classList.toggle("is-active", kuusiActive);
        this._kuusiButton.replaceChildren();
        (kuusiActive ? stopIcon : runIcon).render(this._kuusiButton);
      }

      this._emitActiveChange(kuusiActive);
      return;
    }

    if (this._kuusiButton) {
      const label = kuusiActive ? t.exitFullscreen() : t.enterFullscreen();
      this._kuusiButton.title = label;
      this._kuusiButton.setAttribute("aria-label", label);
      this._kuusiButton.classList.toggle("is-active", kuusiActive);
      this._kuusiButton.replaceChildren();
      (kuusiActive ? collapseIcon : expandIcon).render(this._kuusiButton);
    }

    this._emitActiveChange(kuusiActive);
  }

  dispose(): void {
    document.removeEventListener("fullscreenchange", this._onFullscreenChange);
    document.removeEventListener(
      "webkitfullscreenchange",
      this._onFullscreenChange,
    );
    window.removeEventListener("resize", this._onWindowResize);
    window.removeEventListener("keydown", this._onWindowKeyDown, true);
    void this._exitElementFullscreen().catch(() => undefined);
    this._restoreDocument();
    this._syncPresentationClass(false);
    this._emitActiveChange(false);
    this._kuusiButton = null;
  }

  private _emitActiveChange(active: boolean): void {
    if (this._lastActive === active) {
      return;
    }

    this._lastActive = active;
    this._options.onActiveChange?.(active);
  }

  private _syncPresentationClass(active: boolean): void {
    if (this._cornerAction !== "play") {
      return;
    }

    const doc = this._options.getDocumentWidget();
    doc?.node.classList.toggle("is-kuusi-playing", active);
  }

  private _onFullscreenChange = (): void => {
    if (this._kuusiSession && this._target) {
      this._watchFullscreenSize(this._target);
    }

    if (this._kuusiEntering) {
      this.syncButtons();
      this._syncLayout();
      return;
    }

    // Esc / browser UI left fullscreen: drop the Kuusi session too.
    if (
      this._kuusiSession &&
      this._kuusiNative &&
      this._fullscreenElement() !== this._target?.node
    ) {
      this._restoreDocument();
    }

    this.syncButtons();
    this._syncLayout();
  };

  private _sizeObserver: ResizeObserver | null = null;
  private _settleTimers: number[] = [];

  /**
   * Entering fullscreen is animated on macOS (and in JupyterLab Desktop): the
   * `fullscreenchange` event and the first resize arrive while the window is
   * still the old size, and the final size does not always fire another window
   * `resize`. A layout pass taken then leaves the document's contents at the old
   * dock-slot size, with the fullscreen background showing around them. So keep
   * watching the fullscreen element and lay out again whenever it changes size,
   * plus a few delayed passes while the animation settles.
   */
  private _watchFullscreenSize(doc: Widget): void {
    this._unwatchFullscreenSize();

    if (typeof ResizeObserver !== "undefined") {
      let last = "";
      this._sizeObserver = new ResizeObserver(() => {
        const key = `${doc.node.offsetWidth}x${doc.node.offsetHeight}`;

        if (key === last) {
          return;
        }

        last = key;
        this._syncLayout();
      });
      this._sizeObserver.observe(doc.node);
    }

    this._settleTimers = [250, 700, 1400].map((delay) =>
      window.setTimeout(() => {
        if (this._kuusiSession) {
          this._syncLayout();
        }
      }, delay),
    );
  }

  private _unwatchFullscreenSize(): void {
    this._sizeObserver?.disconnect();
    this._sizeObserver = null;
    this._settleTimers.forEach((timer) => window.clearTimeout(timer));
    this._settleTimers = [];
  }

  private _syncLayout(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const doc = this._options.getDocumentWidget();
        let widget: Widget | null = doc ?? null;

        if (doc) {
          MessageLoop.sendMessage(doc, Widget.ResizeMessage.UnknownSize);
        }

        while (widget) {
          widget.update();
          widget = widget.parent;
        }

        this._options.onLayout?.();
      });
    });
  }

  private _fullscreenElement(): Element | null {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      mozFullScreenElement?: Element | null;
      msFullscreenElement?: Element | null;
    };

    return (
      document.fullscreenElement ??
      doc.webkitFullscreenElement ??
      doc.mozFullScreenElement ??
      doc.msFullscreenElement ??
      null
    );
  }

  private _isKuusiFullscreen(): boolean {
    if (!this._kuusiSession) {
      return false;
    }

    return Boolean(this._target?.hasClass(VIEW_FULLSCREEN_CLASS));
  }

  private _onWindowKeyDown = (event: KeyboardEvent): void => {
    if (
      event.key === "Escape" &&
      this._kuusiSession &&
      !this._kuusiNative &&
      !event.defaultPrevented
    ) {
      event.preventDefault();
      event.stopPropagation();
      void this._toggleKuusi();
    }
  };

  private _onWindowResize = (): void => {
    if (this._kuusiSession) {
      this._syncLayout();
    }
  };

  /**
   * Lift `contain` and raise stacking contexts on ancestors so a fixed overlay
   * escapes the dock and paints above the Lab top bar.
   */
  private _liftAncestorContainment(doc: Widget): void {
    let node = doc.node.parentElement;

    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      const contained = style.contain !== "none";
      const stacked = style.position !== "static" && style.zIndex !== "auto";

      if (contained || stacked) {
        this._liftedContainment.push({
          node,
          contain: node.style.contain,
          zIndex: node.style.zIndex,
        });

        if (contained) {
          node.style.contain = "none";
        }

        if (stacked) {
          node.style.zIndex = "100000";
        }
      }

      node = node.parentElement;
    }
  }

  private _restoreAncestorContainment(): void {
    for (const { node, contain, zIndex } of this._liftedContainment) {
      node.style.contain = contain;
      node.style.zIndex = zIndex;
    }

    this._liftedContainment = [];
  }

  private _hideDocumentChrome(doc: Widget): void {
    doc.addClass("is-kuusi-view-fullscreen");

    for (const child of doc.children()) {
      if (child.hasClass("jp-Toolbar") && !child.isHidden) {
        child.hide();
        this._hiddenChrome.push(child);
      }
    }
  }

  private _restoreDocumentChrome(): void {
    this._options.getDocumentWidget()?.removeClass("is-kuusi-view-fullscreen");

    for (const child of this._hiddenChrome) {
      if (!child.isDisposed) {
        child.show();
      }
    }

    this._hiddenChrome = [];
  }

  private _restoreDocument(): void {
    this._unwatchFullscreenSize();
    this._restoreDocumentChrome();

    const doc = this._target;
    this._target = null;
    this._kuusiSession = false;
    this._kuusiNative = false;

    if (!doc) {
      return;
    }

    doc.removeClass(VIEW_FULLSCREEN_CLASS);
    this._restoreAncestorContainment();
    window.removeEventListener("resize", this._onWindowResize);
    window.removeEventListener("keydown", this._onWindowKeyDown, true);

    if (!doc.isDisposed && doc.parent) {
      // Ask the dock to remeasure this document's slot. Prefer ResizeMessage
      // over parent.fit() so we do not cascade layout across the whole shell.
      MessageLoop.sendMessage(doc.parent, Widget.ResizeMessage.UnknownSize);
    }
  }

  private _requestElementFullscreen(element: HTMLElement): Promise<void> {
    const el = element as HTMLElement & {
      webkitRequestFullscreen?: () => void;
      webkitRequestFullScreen?: () => void;
      mozRequestFullScreen?: () => void;
      msRequestFullscreen?: () => void;
    };

    if (typeof el.requestFullscreen === "function") {
      return el.requestFullscreen().then(() => undefined);
    }

    if (typeof el.webkitRequestFullscreen === "function") {
      el.webkitRequestFullscreen();
      return Promise.resolve();
    }

    if (typeof el.webkitRequestFullScreen === "function") {
      el.webkitRequestFullScreen();
      return Promise.resolve();
    }

    if (typeof el.mozRequestFullScreen === "function") {
      el.mozRequestFullScreen();
      return Promise.resolve();
    }

    if (typeof el.msRequestFullscreen === "function") {
      el.msRequestFullscreen();
      return Promise.resolve();
    }

    return Promise.reject(new Error("Fullscreen API unavailable"));
  }

  private _exitElementFullscreen(): Promise<void> {
    const doc = document as Document & {
      webkitExitFullscreen?: () => void;
      webkitCancelFullScreen?: () => void;
      mozCancelFullScreen?: () => void;
      msExitFullscreen?: () => void;
    };

    if (!this._fullscreenElement()) {
      return Promise.resolve();
    }

    if (typeof document.exitFullscreen === "function") {
      return document.exitFullscreen().then(() => undefined);
    }

    if (typeof doc.webkitExitFullscreen === "function") {
      doc.webkitExitFullscreen();
      return Promise.resolve();
    }

    if (typeof doc.webkitCancelFullScreen === "function") {
      doc.webkitCancelFullScreen();
      return Promise.resolve();
    }

    if (typeof doc.mozCancelFullScreen === "function") {
      doc.mozCancelFullScreen();
      return Promise.resolve();
    }

    if (typeof doc.msExitFullscreen === "function") {
      doc.msExitFullscreen();
      return Promise.resolve();
    }

    return Promise.resolve();
  }

  private async _toggleKuusi(): Promise<void> {
    const doc = this._options.getDocumentWidget();

    if (!doc) {
      console.warn("[kuusi] fullscreen document widget not found");
      return;
    }

    this._kuusiEntering = true;

    try {
      if (this._isKuusiFullscreen()) {
        if (this._kuusiNative) {
          await this._exitElementFullscreen();
        }

        this._restoreDocument();
        this.syncButtons();
        this._syncLayout();
        return;
      }

      if (this._fullscreenElement()) {
        await this._exitElementFullscreen();
      }

      this._target = doc;
      this._kuusiSession = true;
      this._liftAncestorContainment(doc);
      doc.addClass(VIEW_FULLSCREEN_CLASS);
      this._hideDocumentChrome(doc);
      window.addEventListener("resize", this._onWindowResize);
      window.addEventListener("keydown", this._onWindowKeyDown, true);
      this._watchFullscreenSize(doc);

      try {
        await this._requestElementFullscreen(doc.node);
        this._kuusiNative = true;
      } catch (error) {
        // Fixed overlay over the Lab window still shows only this view.
        console.warn("[kuusi] fullscreen request failed", error);
        this._kuusiNative = false;
      }
    } finally {
      this._kuusiEntering = false;
    }

    this.syncButtons();
    this._syncLayout();
    this._focusContent(doc);
  }

  /** Keyboard navigation (slides, mind map) needs focus inside the view. */
  private _focusContent(doc: Widget): void {
    const content = (doc as Widget & { content?: Widget }).content;
    const node = content?.node ?? doc.node;
    const target =
      node.hasAttribute("tabindex")
        ? node
        : node.querySelector<HTMLElement>('[tabindex="0"]:not(button)');
    target?.focus({ preventScroll: true });
  }
}

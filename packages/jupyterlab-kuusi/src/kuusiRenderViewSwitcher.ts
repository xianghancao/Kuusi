import type { JupyterFrontEnd } from "@jupyterlab/application";
import type { IToolbarWidgetRegistry } from "@jupyterlab/apputils";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import type { TranslationBundle } from "@jupyterlab/translation";
import { Widget } from "@lumino/widgets";

import {
  FACTORY_KUUSI_MARKDOWN_BOOK,
  FACTORY_KUUSI_MARKDOWN_MIND_MAP,
  FACTORY_KUUSI_MARKDOWN_SLIDES,
  FACTORY_KUUSI_NOTEBOOK,
  FACTORY_KUUSI_NOTEBOOK_ARTICLE,
  FACTORY_KUUSI_NOTEBOOK_BOOK,
  FACTORY_KUUSI_NOTEBOOK_SLIDES,
  FACTORY_MARKDOWN_PREVIEW,
} from "./defaultOpeners/constants";
import {
  relayoutDocumentToolbar,
} from "./documentToolbarLayout";
import { getKuusiBundle } from "./kuusiI18n";
import {
  getWorkspaceSpecForPath,
  isEditorFactory,
  renderViewForFactory,
  resolveWorkspacePath,
  translateRenderViewSpec,
  type KuusiRenderViewId,
  type KuusiRenderViewSpec,
  type KuusiWorkspaceSpec,
} from "./kuusiRenderViews";
import { SWITCH_KUUSI_RENDER_VIEW_COMMAND } from "./kuusiCommands";
import {
  isRenderViewEnabled,
  onEnabledRenderViewsChanged,
  onRenderViewOrderChanged,
} from "./renderViewOrder";

export const KUUSI_RENDER_VIEW_SWITCHER_ITEM = "kuusi-render-view-switcher";

const switchersByDocument = new WeakMap<
  IDocumentWidget,
  KuusiRenderViewSwitcherWidget
>();

export class KuusiRenderViewSwitcherWidget extends Widget {
  private _buttons = new Map<KuusiRenderViewId, HTMLButtonElement>();

  private _thumb: HTMLDivElement;

  private _group: HTMLDivElement;

  private _sync: (() => void) | null = null;

  constructor(private _app: JupyterFrontEnd) {
    super();
    this.addClass("jp-KuusiRenderViewSwitcher");
    this.addClass("jp-KuusiMarkdownViewSwitcher");

    this._group = document.createElement("div");
    this._group.className =
      "jp-KuusiRenderViewSwitcher-group jp-KuusiMarkdownViewSwitcher-group";
    this._group.setAttribute("role", "group");
    const trans = getKuusiBundle();
    this._group.setAttribute("aria-label", trans.__("Render view"));

    this._thumb = document.createElement("div");
    this._thumb.className = "jp-KuusiRenderViewSwitcher-thumb";
    this._thumb.setAttribute("aria-hidden", "true");
    this._group.appendChild(this._thumb);

    this.node.appendChild(this._group);
  }

  /** Re-run path/factory visibility sync after dock settle. */
  refresh(): void {
    this._sync?.();
  }

  bindSync(sync: () => void): void {
    this._sync = sync;
  }

  setViews(
    views: KuusiRenderViewSpec[],
    getWorkspacePath: () => string,
    getActiveViewId: () => KuusiRenderViewId | null,
  ): void {
    this._buttons.clear();

    while (this._group.childNodes.length > 1) {
      this._group.removeChild(this._group.lastChild!);
    }

    const trans = getKuusiBundle();
    views.forEach((view) => {
      const localized = translateRenderViewSpec(view, trans);
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "jp-KuusiRenderViewSwitcher-button jp-KuusiMarkdownViewSwitcher-button";
      button.textContent = localized.label;
      button.title = localized.title;
      button.setAttribute("aria-pressed", "false");
      button.dataset.viewId = view.id;

      button.addEventListener("click", () => {
        const path = getWorkspacePath();

        if (!path) {
          return;
        }

        void this._app.commands.execute(SWITCH_KUUSI_RENDER_VIEW_COMMAND, {
          path,
          viewId: view.id,
        });
      });

      this._buttons.set(view.id, button);
      this._group.appendChild(button);
    });

    this.syncActiveView(getActiveViewId());
  }

  syncActiveView(viewId: KuusiRenderViewId | null): void {
    this._buttons.forEach((button, id) => {
      const active = viewId !== null && id === viewId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    requestAnimationFrame(() => this._positionThumb(viewId));
  }

  private _positionThumb(viewId: KuusiRenderViewId | null): void {
    if (viewId === null) {
      this._thumb.style.opacity = "0";
      return;
    }

    const button = this._buttons.get(viewId);

    if (!button) {
      this._thumb.style.opacity = "0";
      return;
    }

    const groupRect = this._group.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();

    this._thumb.style.opacity = "1";
    this._thumb.style.width = `${buttonRect.width}px`;
    this._thumb.style.height = `${buttonRect.height}px`;
    this._thumb.style.transform = `translate(${buttonRect.left - groupRect.left}px, ${buttonRect.top - groupRect.top}px)`;
  }
}

/** When path is empty at first paint, still resolve workspace from the factory. */
const inferWorkspaceSpecForFactory = (
  factoryName: string,
): KuusiWorkspaceSpec | null => {
  const markdownFactories = new Set([
    FACTORY_MARKDOWN_PREVIEW,
    FACTORY_KUUSI_MARKDOWN_BOOK,
    FACTORY_KUUSI_MARKDOWN_MIND_MAP,
    FACTORY_KUUSI_MARKDOWN_SLIDES,
  ]);
  if (markdownFactories.has(factoryName)) {
    return getWorkspaceSpecForPath("doc.md");
  }

  const notebookFactories = new Set([
    FACTORY_KUUSI_NOTEBOOK,
    FACTORY_KUUSI_NOTEBOOK_ARTICLE,
    FACTORY_KUUSI_NOTEBOOK_BOOK,
    FACTORY_KUUSI_NOTEBOOK_SLIDES,
  ]);
  if (notebookFactories.has(factoryName)) {
    return getWorkspaceSpecForPath("doc.ipynb");
  }

  return null;
};

const shouldShowRenderSwitcher = (
  workspacePath: string,
  widgetFactory: string,
): boolean => {
  const spec =
    getWorkspaceSpecForPath(workspacePath) ??
    inferWorkspaceSpecForFactory(widgetFactory);

  if (!spec || isEditorFactory(spec, widgetFactory)) {
    return false;
  }

  return spec.renderViews.length >= 1;
};

const bindRenderViewSwitcher = (
  app: JupyterFrontEnd,
  widget: IDocumentWidget,
  factoryName: string,
  switcher: KuusiRenderViewSwitcherWidget,
): void => {
  const workspacePath = (): string =>
    resolveWorkspacePath(widget.context.path, factoryName);

  const sync = (): void => {
    const path = workspacePath();
    const visible = shouldShowRenderSwitcher(path, factoryName);
    switcher.setHidden(!visible);

    if (!visible) {
      return;
    }

    const spec =
      getWorkspaceSpecForPath(path) ??
      inferWorkspaceSpecForFactory(factoryName);

    if (!spec) {
      return;
    }

    const activeId =
      renderViewForFactory(spec, factoryName)?.id ?? spec.defaultRenderId;

    const activeNow =
      renderViewForFactory(spec, factoryName)?.id ?? spec.defaultRenderId;
    // Keep the currently open view visible even if it was disabled in Settings.
    const shown = spec.renderViews.filter(
      (view) => isRenderViewEnabled(view.id) || view.id === activeNow,
    );

    switcher.setViews(
      shown,
      () => workspacePath() || path,
      () =>
        renderViewForFactory(spec, factoryName)?.id ?? spec.defaultRenderId,
    );
    switcher.syncActiveView(activeId);
  };

  switcher.bindSync(sync);
  sync();
  widget.context.pathChanged.connect(sync);

  const onCommandChanged = (): void => {
    sync();
  };

  app.commands.commandChanged.connect(onCommandChanged);
  const onViewsChanged = (): void => {
    sync();
    relayoutDocumentToolbar(widget);
  };
  const orderSub = onRenderViewOrderChanged(onViewsChanged);
  const enabledSub = onEnabledRenderViewsChanged(onViewsChanged);

  // Re-sync after the document is revealed — path / layout may not be ready
  // at the first toolbar factory call, which can leave the switcher hidden.
  const revealed = (widget as { revealed?: Promise<void> }).revealed;
  if (revealed) {
    void revealed.then(() => {
      if (!widget.isDisposed) {
        sync();
        relayoutDocumentToolbar(widget);
      }
    });
  }

  widget.disposed.connect(() => {
    widget.context.pathChanged.disconnect(sync);
    app.commands.commandChanged.disconnect(onCommandChanged);
    orderSub.disconnect();
    enabledSub.disconnect();
  });
};

const isRenderViewSwitcher = (
  widget: Widget,
): widget is KuusiRenderViewSwitcherWidget =>
  // Prefer classList — federated bundles can load duplicate class copies so
  // `instanceof` fails across chunks.
  widget.node.classList.contains("jp-KuusiRenderViewSwitcher") ||
  widget instanceof KuusiRenderViewSwitcherWidget;

const findRenderViewSwitcher = (
  widget: IDocumentWidget,
): KuusiRenderViewSwitcherWidget | null => {
  const layout = widget.toolbar.layout;
  if (!layout || !("widgets" in layout)) {
    return null;
  }

  for (const child of (layout as { widgets: readonly Widget[] }).widgets) {
    if (isRenderViewSwitcher(child)) {
      return child;
    }
  }

  // ReactiveToolbar may have parked the switcher in the overflow popup.
  const parked = widget.toolbar.node.querySelector(
    ".jp-KuusiRenderViewSwitcher, .jp-KuusiMarkdownViewSwitcher",
  );
  if (!(parked instanceof HTMLElement)) {
    return null;
  }

  for (const child of (layout as { widgets: readonly Widget[] }).widgets) {
    if (child.node.contains(parked) || child.node === parked) {
      return isRenderViewSwitcher(child) ? child : null;
    }
  }

  return null;
};

export const createKuusiRenderViewSwitcher = (
  app: JupyterFrontEnd,
  widget: IDocumentWidget,
  factoryName: string,
): KuusiRenderViewSwitcherWidget => {
  const existing = switchersByDocument.get(widget);
  if (existing && !existing.isDisposed) {
    existing.refresh();
    return existing;
  }

  const switcher = new KuusiRenderViewSwitcherWidget(app);
  switchersByDocument.set(widget, switcher);
  bindRenderViewSwitcher(app, widget, factoryName, switcher);
  widget.disposed.connect(() => {
    switchersByDocument.delete(widget);
  });
  return switcher;
};

/**
 * Force the switcher onto the main toolbar (not overflow) and visible.
 * Safe to call repeatedly after view switches / dock resizes.
 */
export const pinKuusiRenderViewSwitcher = (
  widget: IDocumentWidget,
  rank = 0,
): void => {
  if (widget.isDisposed) {
    return;
  }

  const switcher =
    switchersByDocument.get(widget) ?? findRenderViewSwitcher(widget);
  if (!switcher || switcher.isDisposed) {
    return;
  }

  switchersByDocument.set(widget, switcher);
  switcher.setHidden(false);
  switcher.refresh();

  const names = Array.from(widget.toolbar.names());
  const onToolbar = names.includes(KUUSI_RENDER_VIEW_SWITCHER_ITEM);
  if (!onToolbar || switcher.parent !== widget.toolbar) {
    widget.toolbar.insertItem(rank, KUUSI_RENDER_VIEW_SWITCHER_ITEM, switcher);
  }

  relayoutDocumentToolbar(widget);
};

/** Insert the render view switcher on a document toolbar (right-hand render panels). */
export const ensureKuusiRenderViewSwitcherOnToolbar = (
  app: JupyterFrontEnd,
  widget: IDocumentWidget,
  factoryName: string,
  rank = 0,
): void => {
  const names = Array.from(widget.toolbar.names());
  const known = switchersByDocument.get(widget);

  if (known && !known.isDisposed) {
    pinKuusiRenderViewSwitcher(widget, rank);
    return;
  }

  if (names.includes(KUUSI_RENDER_VIEW_SWITCHER_ITEM)) {
    findRenderViewSwitcher(widget)?.refresh();
    pinKuusiRenderViewSwitcher(widget, rank);
    return;
  }

  const switcher = createKuusiRenderViewSwitcher(app, widget, factoryName);
  widget.toolbar.insertItem(rank, KUUSI_RENDER_VIEW_SWITCHER_ITEM, switcher);
  pinKuusiRenderViewSwitcher(widget, rank);
};

export const registerKuusiRenderViewSwitcherToolbars = (
  app: JupyterFrontEnd,
  toolbarRegistry: IToolbarWidgetRegistry,
  _trans: TranslationBundle,
  factoryNames: string[],
): void => {
  factoryNames.forEach((factoryName) => {
    toolbarRegistry.addFactory<IDocumentWidget>(
      factoryName,
      KUUSI_RENDER_VIEW_SWITCHER_ITEM,
      (widget) => createKuusiRenderViewSwitcher(app, widget, factoryName),
    );
  });
};

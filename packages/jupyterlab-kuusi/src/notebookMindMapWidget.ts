import type { ICellModel } from "@jupyterlab/cells";
import { Cell, CodeCell, MarkdownCell } from "@jupyterlab/cells";
import type { IEditorMimeTypeService } from "@jupyterlab/codeeditor";
import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
} from "@jupyterlab/docregistry";
import { CommandRegistry } from "@lumino/commands";
import type { INotebookContent } from "@jupyterlab/nbformat";
import type { INotebookModel } from "@jupyterlab/notebook";
import { Notebook, NotebookPanel } from "@jupyterlab/notebook";
import type { CellList } from "@jupyterlab/notebook/lib/celllist";
import type { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import type { IObservableList } from "@jupyterlab/observables";
import { Message } from "@lumino/messaging";
import { Widget } from "@lumino/widgets";
import { CommandToolbarButton, collapseIcon, expandIcon } from "@jupyterlab/ui-components";
import {
  buildNotebookOutline,
  buildMindMapEdgePath,
  collectOutlineEdges,
  countOutlineDescendants,
  getLayoutGapsForDensity,
  getVisibleOutlineNodeIds,
  layoutOutlineTree,
  LAYOUT_NODE_WIDTH,
  moveOutlineNode,
  resolveDropTarget,
  applyNodeFrameToElement,
  type DropZone,
  type LayoutPosition,
  type NotebookCell,
  type OutlineNode,
  type LayoutDensity,
  type TreeDirection,
} from "kuusi-kernel";
import { applyOutlineToNotebook } from "./notebookSync";
import { createFormatToolbar, type FormatToolbarHandle } from "./formatToolbar";
import { handleFormatShortcut } from "./formatKeyboard";
import { isMindMapEditingText } from "./mindMapKeyboard";
import {
  applyAppearanceToScene,
  appendEdgeArrowDefs,
  createAppearanceToolbar,
  DEFAULT_APPEARANCE,
  parseEdgeWidthPx,
  type AppearanceSettings,
  type AppearanceToolbarHandle,
} from "./appearanceToolbar";
import { createLayoutToolbar } from "./layoutToolbar";
import {
  readCellNodeFill,
  writeCellNodeFill,
} from "./nodeFrameStyle";
import {
  applyFontToScene,
  createFontToolbar,
  DEFAULT_MIND_MAP_FONT,
  DEFAULT_MIND_MAP_FONT_SIZE,
  type MindMapFont,
  type MindMapFontSize,
} from "./fontToolbar";
import {
  applyBackgroundToViewport,
  createBackgroundToolbar,
  DEFAULT_MIND_MAP_BACKGROUND,
  DEFAULT_MIND_MAP_BACKGROUND_COLOR,
  DEFAULT_MIND_MAP_BACKGROUND_PATTERN,
  type MindMapBackground,
} from "./backgroundToolbar";
import {
  applyThemeToScene,
  buildThemeSettingsUpdate,
  createStyleToolbar,
  DEFAULT_MIND_MAP_THEME,
  type MindMapTheme,
} from "./styleToolbar";
import { createProductMenu } from "./productMenu";
import { createPageToolbar, type PageToolbarItem } from "./pageToolbar";
import { closeKuusiDropdownMenus } from "./formatToolbar";
import {
  handleMindMapShortcut,
  pasteMindMapClipboard,
} from "./mindMapKeyboard";
import {
  MindMapSettingsManager,
  type MindMapUserSettings,
} from "./mindMapSettings";
import {
  clampNodeWidth,
  readCellNodeWidth,
  writeCellNodeWidth,
} from "./nodeWidth";
import { createKuusiTranslator, type KuusiTranslator } from "./kuusiI18n";
import type { ITranslator } from "@jupyterlab/translation";

export const KUUSI_ADD_MINDMAP_COMMAND = "jupyterlab-kuusi:add-mindmap";

const TREE_DIRECTION_LABELS: Record<TreeDirection, string> = {
  TB: "↓",
  BT: "↑",
  LR: "→",
  RL: "←",
};

const DRAG_THRESHOLD_PX = 6;
/** Display 100% equals this internal CSS scale (former 50%). */
const ZOOM_BASE = 0.5;
const MIN_ZOOM_PERCENT = 20;
const MAX_ZOOM_PERCENT = 200;
const ZOOM_PERCENT_STEP = 10;
const ZOOM_TICK_STEP = 20;
/** Visual length of the vertical zoom track (px); keep in sync with CSS. */
const ZOOM_TRACK_PX = 186;
/** Zoom thumb diameter (px); keep in sync with CSS. */
const ZOOM_THUMB_PX = 12;
const MIN_ZOOM = (MIN_ZOOM_PERCENT / 100) * ZOOM_BASE;
const MAX_ZOOM = (MAX_ZOOM_PERCENT / 100) * ZOOM_BASE;
/** Pinch / ctrl+wheel zoom intensity (lower = slower). Tuned for trackpad deltas. */
const ZOOM_WHEEL_SENSITIVITY = 0.0048;
/** Cap per-event zoom so a large delta cannot jump too far. */
const ZOOM_WHEEL_MAX_STEP = 1.18;

const getDropZoneFromPointer = (
  rect: DOMRect,
  clientX: number,
  clientY: number,
  direction: TreeDirection,
): DropZone => {
  const horizontal = direction === "LR" || direction === "RL";

  if (horizontal) {
    const relative = (clientX - rect.left) / Math.max(rect.width, 1);

    if (relative < 0.25) {
      return direction === "LR" ? "before" : "after";
    }

    if (relative > 0.75) {
      return direction === "LR" ? "after" : "before";
    }

    return "inside";
  }

  const relative = (clientY - rect.top) / Math.max(rect.height, 1);

  if (relative < 0.25) {
    return direction === "TB" ? "before" : "after";
  }

  if (relative > 0.75) {
    return direction === "TB" ? "after" : "before";
  }

  return "inside";
};

const collectVisibleCellIndices = (
  outline: OutlineNode,
  visibleIds: ReadonlySet<string>,
  collapsedIds: ReadonlySet<string>,
): Set<number> => {
  const indices = new Set<number>();

  const visit = (node: OutlineNode) => {
    if (!visibleIds.has(node.id)) {
      return;
    }

    if (node.cellIndex !== null) {
      indices.add(node.cellIndex);
    }

    if (collapsedIds.has(node.id)) {
      return;
    }

    node.children.forEach(visit);
  };

  visit(outline);
  return indices;
};

export class NotebookMindMapWidget extends Widget {
  private _notebook: Notebook;
  private _notebookMount: HTMLElement;
  private _viewport: HTMLElement;
  private _scene: HTMLElement;
  private _edgesSvg: SVGSVGElement | null = null;
  private _cellNodes = new Map<string, HTMLElement>();
  private _directionTrigger: HTMLButtonElement | null = null;
  private _directionMenu: HTMLElement | null = null;
  private _directionMenuItems = new Map<TreeDirection, HTMLButtonElement>();
  private _treeDirection: TreeDirection = "LR";
  private _layoutDensity: LayoutDensity = "normal";
  private _siblingGap = 22;
  private _childGap = 52;
  private _equalNodeWidth = false;
  private _nodeWidth: number = LAYOUT_NODE_WIDTH.default;
  private _collapsedNodes = new Set<string>();
  private _applyingNotebookChange = false;
  private _dragState: {
    nodeId: string;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null = null;
  private _resizeState: {
    nodeId: string;
    pointerId: number;
    startX: number;
    startWidth: number;
    currentWidth: number;
  } | null = null;
  private _resizeLayoutRaf: number | null = null;
  private _dragGhost: HTMLElement | null = null;
  private _dropTargetNodeId: string | null = null;
  private _dropZone: DropZone | null = null;
  private _panX = 0;
  private _panY = 0;
  private _zoom = ZOOM_BASE;
  private _isPanning = false;
  private _panPointerId: number | null = null;
  private _panStart = { x: 0, y: 0, panX: 0, panY: 0 };
  private _revealCellInNotebook: ((cellIndex: number) => void) | null = null;
  private _syncMarkdownToNotebook: ((cellIndex: number) => void) | null = null;
  private _getSourceActiveCellIndex: (() => number) | null = null;
  private _notebookAttached = false;
  private _contentChangeTimer: number | null = null;
  private _statusNodeEl: HTMLElement;
  private _zoomLabel: HTMLElement | null = null;
  private _zoomTrigger: HTMLButtonElement | null = null;
  private _zoomTrack: HTMLElement | null = null;
  private _zoomThumb: HTMLElement | null = null;
  private _zoomSliderWrap: HTMLElement | null = null;
  private _fullscreenButton: HTMLButtonElement | null = null;
  private _edgeMarkerAttrs: { markerStart?: string; markerEnd?: string } | null =
    null;
  private _formatToolbar: FormatToolbarHandle | null = null;
  private _appearanceToolbar: AppearanceToolbarHandle | null = null;
  private _addMindMapButton: CommandToolbarButton | null = null;
  private _appearanceSettings: AppearanceSettings = { ...DEFAULT_APPEARANCE };
  private _mindMapTheme: MindMapTheme = DEFAULT_MIND_MAP_THEME;
  private _mindMapBackground: MindMapBackground = DEFAULT_MIND_MAP_BACKGROUND;
  private _mindMapBackgroundPattern = DEFAULT_MIND_MAP_BACKGROUND_PATTERN;
  private _mindMapBackgroundColor = DEFAULT_MIND_MAP_BACKGROUND_COLOR;
  private _mindMapEditFont: MindMapFont = DEFAULT_MIND_MAP_FONT;
  private _mindMapDisplayFont: MindMapFont = DEFAULT_MIND_MAP_FONT;
  private _mindMapEditFontSize: MindMapFontSize = DEFAULT_MIND_MAP_FONT_SIZE;
  private _mindMapDisplayFontSize: MindMapFontSize = DEFAULT_MIND_MAP_FONT_SIZE;
  private _layoutGeneration = 0;
  private _layoutFrame: number | null = null;
  private _lastLayoutDimensions = new Map<
    string,
    { width: number; height: number }
  >();
  private _dimensionCacheByModelId = new Map<
    string,
    { width: number; height: number }
  >();
  private _measureHost: HTMLElement | null = null;
  private _resizeObserver: ResizeObserver | null = null;
  private _resizeLayoutTimer: number | null = null;
  private _headerEl: HTMLElement | null = null;
  private _pageToolbarNode: HTMLElement | null = null;
  private _formatCluster: HTMLElement | null = null;
  private _headerLayoutObserver: ResizeObserver | null = null;
  private _headerLayoutRaf: number | null = null;
  private _formatToolbarVertical = false;
  private _pendingFocusCellIndex: number | null = null;
  private _pendingFocusCenter = false;
  /** After insert: pan only along this axis to reveal the new node. */
  private _pendingFocusRevealAxis: "x" | "y" | "xy" = "xy";
  /**
   * One-shot: center the active cell after open/startup layout settles.
   * Cleared once centering succeeds; not used for later selection sync.
   */
  private _pendingOpenCenterIndex: number | null = null;
  private _openCentered = false;
  /**
   * Cell index that should enter edit after insert. Set synchronously so layout
   * measurement does not force-render markdown before mode flips to edit.
   */
  private _pendingEditCellIndex: number | null = null;
  /** Keep a node fixed on screen across layout (e.g. collapse/expand). */
  private _viewportAnchor: {
    nodeId: string;
    screenX: number;
    screenY: number;
  } | null = null;
  private _t: KuusiTranslator;
  private _settingsManager: MindMapSettingsManager;
  private _settingsConn: { disconnect: () => void } | null = null;

  constructor(
    private _context: DocumentRegistry.IContext<INotebookModel>,
    private _rendermime: IRenderMimeRegistry,
    private _contentFactory: NotebookPanel.IContentFactory,
    private _mimeTypeService: IEditorMimeTypeService,
    private _commands: CommandRegistry,
    settingsManager: MindMapSettingsManager,
    translator: ITranslator,
  ) {
    super();
    this._settingsManager = settingsManager;
    this._t = createKuusiTranslator(translator.load("jupyterlab"));
    this.addClass("jp-KuusiNotebookMindMap");
    this.title.label = this._context.path.split("/").pop() ?? "Notebook";
    this.title.closable = true;

    const header = document.createElement("header");
    header.className = "jp-KuusiNotebookMindMap-header";

    const headerLeft = document.createElement("div");
    headerLeft.className = "jp-KuusiNotebookMindMap-header-left";

    this._addMindMapButton = new CommandToolbarButton({
      commands: this._commands,
      id: KUUSI_ADD_MINDMAP_COMMAND,
    });

    this._appearanceToolbar = createAppearanceToolbar(
      this.node,
      () => this._appearanceSettings,
      (settings) => {
        void this._settingsManager.update({ appearance: settings });
      },
      {
        hasSelection: () =>
          Boolean(this._notebook && this._notebook.activeCellIndex >= 0),
        getSelectedFill: () => {
          const cell = this._notebook?.activeCell;
          return cell ? (readCellNodeFill(cell.model) ?? "") : "";
        },
        setSelectedFill: (color) => {
          this._setSelectedNodeFill(color);
        },
      },
      {
        getState: () => ({
          equalNodeWidth: this._equalNodeWidth,
          nodeWidth: this._nodeWidth,
        }),
        onChange: (widthState) => {
          void this._settingsManager.update(widthState);
        },
      },
      this._t,
    );

    const pageItems: PageToolbarItem[] = [
      {
        id: "brand",
        group: "brand",
        order: 10,
        create: () => createProductMenu(this.node, this._t),
      },
      {
        id: "add-node",
        group: "structure",
        order: 10,
        create: () => this._addMindMapButton!.node,
      },
      {
        id: "tree",
        group: "structure",
        order: 20,
        create: () => this._createDirectionToolbar(),
      },
      {
        id: "layout",
        group: "structure",
        order: 30,
        create: () =>
          createLayoutToolbar(
            this.node,
            () => ({
              density: this._layoutDensity,
              siblingGap: this._siblingGap,
              childGap: this._childGap,
            }),
            (density) => {
              const gaps = getLayoutGapsForDensity(density);
              void this._settingsManager.update({
                layoutDensity: density,
                siblingGap: gaps.siblingGap,
                childGap: gaps.childGap,
              });
            },
            (gaps) => {
              void this._settingsManager.update(gaps);
            },
            this._t,
          ),
      },
      {
        id: "style",
        group: "appearance",
        order: 10,
        create: () =>
          createStyleToolbar(
            this.node,
            () => this._mindMapTheme,
            (theme) => {
              void this._settingsManager.update(
                buildThemeSettingsUpdate(theme),
              );
            },
            this._t,
          ),
      },
      {
        id: "font",
        group: "appearance",
        order: 20,
        create: () =>
          createFontToolbar(
            this.node,
            () => this._mindMapEditFont,
            (editFont) => {
              void this._settingsManager.update({ editFont });
            },
            () => this._mindMapEditFontSize,
            (editFontSize) => {
              void this._settingsManager.update({ editFontSize });
            },
            () => this._mindMapDisplayFont,
            (displayFont) => {
              void this._settingsManager.update({ displayFont });
            },
            () => this._mindMapDisplayFontSize,
            (displayFontSize) => {
              void this._settingsManager.update({ displayFontSize });
            },
            this._t,
          ),
      },
      {
        id: "line-node",
        group: "appearance",
        order: 30,
        create: () => this._appearanceToolbar!.node,
      },
      {
        id: "background",
        group: "appearance",
        order: 40,
        create: () =>
          createBackgroundToolbar(
            this.node,
            () => ({
              background: this._mindMapBackground,
              backgroundPattern: this._mindMapBackgroundPattern,
              backgroundColor: this._mindMapBackgroundColor,
            }),
            (state) => {
              void this._settingsManager.update({
                background: state.background,
                backgroundPattern: state.backgroundPattern,
                backgroundColor: state.backgroundColor,
              });
            },
            this._t,
          ),
      },
    ];

    const pageToolbar = createPageToolbar(pageItems, this._t);
    this._pageToolbarNode = pageToolbar.node;
    headerLeft.appendChild(pageToolbar.node);
    header.appendChild(headerLeft);

    const headerRight = document.createElement("div");
    headerRight.className = "jp-KuusiNotebookMindMap-header-right";

    const formatCluster = document.createElement("div");
    formatCluster.className =
      "jp-KuusiToolbarCluster jp-KuusiToolbarCluster--format";
    formatCluster.setAttribute("role", "toolbar");
    formatCluster.setAttribute("aria-label", this._t.markdownFormatting());
    this._formatCluster = formatCluster;
    headerRight.appendChild(formatCluster);
    header.appendChild(headerRight);
    this._headerEl = header;
    this.node.appendChild(header);
    this._updateDirectionButtons();
    this._bindHeaderLayout();

    this._viewport = document.createElement("div");
    this._viewport.className = "jp-KuusiNotebookMindMap-viewport";
    this._viewport.tabIndex = -1;

    this._scene = document.createElement("div");
    this._scene.className =
      "jp-KuusiNotebookMindMap-scene jp-Notebook jp-KuusiMindMapNotebook-scene";
    this._viewport.appendChild(this._scene);
    this._applyScenePresentation();
    this._applyBackground();

    const statusBar = document.createElement("div");
    statusBar.className = "jp-KuusiNotebookMindMap-status";
    this._statusNodeEl = document.createElement("span");
    this._statusNodeEl.className = "jp-KuusiNotebookMindMap-status-node";
    statusBar.append(
      this._statusNodeEl,
      this._createZoomControl(),
      this._createFullscreenControl(),
    );
    this._viewport.appendChild(statusBar);
    this._updateStatusBar();

    this.node.appendChild(this._viewport);

    this._notebook = this._contentFactory.createNotebook({
      rendermime: this._rendermime.clone({ resolver: this._context.urlResolver }),
      contentFactory: this._contentFactory,
      mimeTypeService: this._mimeTypeService,
      notebookConfig: {
        ...Notebook.defaultNotebookConfig,
        windowingMode: "none",
        scrollPastEnd: false,
        showMinimap: false,
        autoRenderMarkdownCells: false,
        showEditorForReadOnlyMarkdown: true,
      },
    });
    this._notebook.model = this._context.model;
    this._notebook.addClass("jp-KuusiMindMapNotebook");
    this._bindNotebookEditState();
    this._appearanceToolbar?.refresh();
    formatCluster.appendChild(this._createFormatToolbar());
    this._scheduleHeaderLayoutSync();

    this._notebookMount = document.createElement("div");
    this._notebookMount.className = "jp-KuusiMindMapNotebook-mount";
    this.node.appendChild(this._notebookMount);

    this._bindViewportEvents();
    this._bindCellInteractionEvents();
    this._bindKeyboardEvents();
    document.addEventListener("fullscreenchange", this._onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", this._onFullscreenChange);

    this._context.model.cells.changed.connect(this._onCellsChanged, this);
    this._context.model.contentChanged.connect(this._onModelContentChanged, this);

    this._applyUserSettings(this._settingsManager.settings);
    this._settingsConn = this._settingsManager.changed.connect((settings) => {
      this._applyUserSettings(settings);
    });
  }

  private _applyUserSettings(settings: MindMapUserSettings): void {
    const displayFontChanged =
      settings.displayFont !== this._mindMapDisplayFont ||
      settings.displayFontSize !== this._mindMapDisplayFontSize;
    const fontChanged =
      displayFontChanged ||
      settings.editFont !== this._mindMapEditFont ||
      settings.editFontSize !== this._mindMapEditFontSize;
    const widthChanged =
      settings.equalNodeWidth !== this._equalNodeWidth ||
      settings.nodeWidth !== this._nodeWidth;

    this._mindMapTheme = settings.theme;
    this._mindMapEditFont = settings.editFont;
    this._mindMapDisplayFont = settings.displayFont;
    this._mindMapEditFontSize = settings.editFontSize;
    this._mindMapDisplayFontSize = settings.displayFontSize;
    this._layoutDensity = settings.layoutDensity;
    this._siblingGap = settings.siblingGap;
    this._childGap = settings.childGap;
    this._equalNodeWidth = settings.equalNodeWidth;
    this._nodeWidth = settings.nodeWidth;
    this._treeDirection = settings.treeDirection;
    this._mindMapBackground = settings.background;
    this._mindMapBackgroundPattern = settings.backgroundPattern;
    this._mindMapBackgroundColor = settings.backgroundColor;
    this._appearanceSettings = { ...settings.appearance };
    this._updateDirectionButtons();
    this._applyScenePresentation();
    this._applyBackground();
    this._syncSceneEditMode();

    if (fontChanged || widthChanged) {
      // Font/width changes alter node sizes; drop caches so layout remeasures.
      this._dimensionCacheByModelId.clear();
      this._lastLayoutDimensions.clear();
    }

    // Edit-only font tweaks can skip full layout while typing so focus stays.
    // Display font/size changes must always relayout — otherwise cards overlap.
    if (
      this._notebook.mode === "edit" &&
      fontChanged &&
      !displayFontChanged &&
      !widthChanged
    ) {
      return;
    }

    if (fontChanged || widthChanged) {
      void this._relayoutAfterPresentationChange();
      return;
    }

    this._applyLayout();
  }

  /** Wait for CSS font/size to reflow, then measure and lay out. */
  private async _relayoutAfterPresentationChange(): Promise<void> {
    const generation = ++this._layoutGeneration;

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    if (this.isDisposed || generation !== this._layoutGeneration) {
      return;
    }

    // Force style recalc before measuring node heights.
    void this._scene.offsetHeight;
    await this._applyLayoutAsync(generation);
  }

  /** Resolved card width for a cell (global equal width, else per-node override). */
  private _resolveNodeWidth(cell: ICellModel, nodeId?: string): number {
    if (this._resizeState) {
      if (
        this._equalNodeWidth ||
        (nodeId !== undefined && nodeId === this._resizeState.nodeId)
      ) {
        return this._resizeState.currentWidth;
      }
    }

    if (this._equalNodeWidth) {
      return this._nodeWidth;
    }

    return readCellNodeWidth(cell) ?? this._nodeWidth;
  }

  private _onModelContentChanged(): void {
    if (this._applyingNotebookChange) {
      return;
    }

    if (this._notebook.mode === "edit") {
      return;
    }

    const activeCell = this._notebook.activeCell;

    if (activeCell) {
      this._dimensionCacheByModelId.delete(activeCell.model.id);
    }

    this._scheduleLayoutAfterContentChange();
  }

  private _scheduleLayoutAfterContentChange(): void {
    if (this._contentChangeTimer !== null) {
      window.clearTimeout(this._contentChangeTimer);
    }

    this._contentChangeTimer = window.setTimeout(() => {
      this._contentChangeTimer = null;

      if (!this.isDisposed && this._notebook.mode !== "edit") {
        this._scheduleLayout();
      }
    }, 250);
  }

  get notebook(): Notebook {
    return this._notebook;
  }

  bindRevealCellInNotebook(handler: (cellIndex: number) => void): void {
    this._revealCellInNotebook = handler;
  }

  bindSyncMarkdownToNotebook(handler: (cellIndex: number) => void): void {
    this._syncMarkdownToNotebook = handler;
  }

  /** Optional: read the standard notebook editor’s active cell for open/show focus. */
  bindSourceActiveCellIndex(getter: () => number): void {
    this._getSourceActiveCellIndex = getter;
  }

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    this._ensureNotebookAttached();
  }

  protected onAfterShow(msg: Message): void {
    super.onAfterShow(msg);
    this._ensureNotebookAttached();

    // Only auto-center on the first show of this widget instance.
    if (this._openCentered) {
      return;
    }

    const sourceIndex = this._getSourceActiveCellIndex?.() ?? -1;
    const index =
      sourceIndex >= 0 ? sourceIndex : this._notebook.activeCellIndex;

    if (index >= 0) {
      this.requestOpenCenter(index);
    }
  }

  /**
   * Center the given cell once after open/startup (retries until layout-ready).
   * Subsequent notebook selection sync does not re-center.
   */
  requestOpenCenter(cellIndex: number): void {
    if (cellIndex < 0 || cellIndex >= this._context.model.cells.length) {
      return;
    }

    this._openCentered = false;
    this._pendingOpenCenterIndex = cellIndex;
    this.syncActiveCellFromNotebook(cellIndex, { center: true });
  }

  private _ensureNotebookAttached(): void {
    if (this._notebookAttached || this.isDisposed) {
      return;
    }

    if (!this._notebookMount.isConnected) {
      return;
    }

    Widget.attach(this._notebook, this._notebookMount);
    this._notebookAttached = true;
    this._scheduleLayout();
  }

  private _scheduleLayout(): void {
    if (!this._notebookAttached) {
      return;
    }

    if (this._layoutFrame !== null) {
      return;
    }

    this._layoutFrame = requestAnimationFrame(() => {
      this._layoutFrame = null;

      if (this.isDisposed) {
        return;
      }

      if (
        this._notebook.widgets.length <
        this._context.model.cells.length
      ) {
        this._scheduleLayout();
        return;
      }

      void this._applyLayoutAsync(++this._layoutGeneration);
    });
  }

  dispose(): void {
    this._context.model.cells.changed.disconnect(this._onCellsChanged, this);
    this._context.model.contentChanged.disconnect(this._onModelContentChanged, this);

    if (this._contentChangeTimer !== null) {
      window.clearTimeout(this._contentChangeTimer);
      this._contentChangeTimer = null;
    }

    if (this._resizeLayoutRaf !== null) {
      window.cancelAnimationFrame(this._resizeLayoutRaf);
      this._resizeLayoutRaf = null;
    }

    if (this._resizeLayoutTimer !== null) {
      window.clearTimeout(this._resizeLayoutTimer);
      this._resizeLayoutTimer = null;
    }

    if (this._layoutFrame !== null) {
      cancelAnimationFrame(this._layoutFrame);
      this._layoutFrame = null;
    }

    this._measureHost?.remove();
    this._measureHost = null;
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._headerLayoutObserver?.disconnect();
    this._headerLayoutObserver = null;
    if (this._headerLayoutRaf !== null) {
      window.cancelAnimationFrame(this._headerLayoutRaf);
      this._headerLayoutRaf = null;
    }
    this._headerEl = null;
    this._pageToolbarNode = null;
    this._formatCluster = null;
    document.removeEventListener("fullscreenchange", this._onFullscreenChange);
    document.removeEventListener(
      "webkitfullscreenchange",
      this._onFullscreenChange,
    );
    void this._exitElementFullscreen().catch(() => undefined);
    this._unbindViewportEvents();
    this._unbindCellInteractionEvents();
    this._unbindKeyboardEvents();
    this._clearDragUi();

    if (this._notebookAttached && this._notebook.isAttached) {
      Widget.detach(this._notebook);
    }

    this._addMindMapButton?.dispose();
    this._addMindMapButton = null;
    this._settingsConn?.disconnect();
    this._settingsConn = null;
    this._notebook.dispose();
    super.dispose();
  }

  private _onCellsChanged(
    _sender: CellList,
    args: IObservableList.IChangedArgs<ICellModel>,
  ): void {
    if (this._applyingNotebookChange) {
      return;
    }

    if (
      args.type === "add" ||
      args.type === "remove" ||
      args.type === "move" ||
      args.type === "set"
    ) {
      if (args.type === "remove") {
        (args.oldValues ?? []).forEach((model) => {
          this._dimensionCacheByModelId.delete(model.id);
        });
      }

      requestAnimationFrame(() => {
        if (!this.isDisposed) {
          this._scheduleLayout();
        }
      });
    }
  }

  private _createDirectionToolbar(): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = "jp-KuusiNotebookMindMap-direction-toolbar";

    const dropdown = document.createElement("div");
    dropdown.className = "jp-KuusiFormatDropdown jp-KuusiDirectionDropdown";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className =
      "jp-KuusiNotebookMindMap-direction-btn jp-KuusiDirectionDropdown-trigger";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-label", this._t.tree());
    this._directionTrigger = trigger;

    const menu = document.createElement("div");
    menu.className =
      "jp-KuusiFormatDropdown-menu jp-KuusiDirectionDropdown-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", this._t.tree());
    this._directionMenu = menu;

    (Object.keys(TREE_DIRECTION_LABELS) as TreeDirection[]).forEach((value) => {
      const label = TREE_DIRECTION_LABELS[value];
      const optionTitle = this._getTreeDirectionTitle(value);
      const item = document.createElement("button");
      item.type = "button";
      item.className = "jp-KuusiFormatDropdown-item jp-KuusiDirectionDropdown-item";
      item.setAttribute("role", "menuitem");
      item.setAttribute("aria-label", optionTitle);
      item.title = optionTitle;
      item.textContent = label;
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        void this._settingsManager.update({ treeDirection: value });
      });
      this._directionMenuItems.set(value, item);
      menu.appendChild(item);
    });

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = menu.classList.contains("is-open");
      this._closeDirectionMenu();
      this._closeZoomSlider();
      closeKuusiDropdownMenus(this.node);

      if (!isOpen) {
        menu.classList.add("is-open");
      }
    });

    dropdown.appendChild(trigger);
    dropdown.appendChild(menu);
    toolbar.appendChild(dropdown);

    document.addEventListener("click", () => {
      this._closeDirectionMenu();
    });

    return toolbar;
  }

  private _createFormatToolbar(): HTMLElement {
    this._formatToolbar = createFormatToolbar({
      getEditor: () => this._notebook.activeCell?.editor ?? null,
      getActiveMarkdownCell: () => {
        const cell = this._notebook.activeCell;

        return cell instanceof MarkdownCell ? cell.model : null;
      },
      isEnabled: () => this._isFormatToolbarEnabled(),
      getDisabledReason: () => this._getFormatToolbarDisabledReason(),
    });

    return this._formatToolbar.node;
  }

  private _isFormatToolbarEnabled(): boolean {
    const cell = this._notebook.activeCell;

    return (
      this._notebook.mode === "edit" &&
      this._notebook.activeCellIndex >= 0 &&
      cell instanceof MarkdownCell
    );
  }

  private _getFormatToolbarDisabledReason(): string | null {
    const cell = this._notebook.activeCell;

    if (this._notebook.mode !== "edit" || this._notebook.activeCellIndex < 0) {
      return this._t.editModeHint();
    }

    if (cell instanceof CodeCell) {
      return this._t.formatNotesCodeCell();
    }

    return null;
  }

  private _updateFormatToolbar(): void {
    this._formatToolbar?.syncEnabled();
    this._formatToolbar?.syncActiveStates();
  }

  /** Persist per-node fill and re-apply frame CSS on the selected cell node. */
  private _setSelectedNodeFill(color: string): void {
    const cell = this._notebook.activeCell;
    const index = this._notebook.activeCellIndex;

    if (!cell || index < 0) {
      return;
    }

    writeCellNodeFill(cell.model, color || null);

    const notebook = this._context.model.toJSON() as INotebookContent;
    const outline = buildNotebookOutline(
      (notebook.cells ?? []) as NotebookCell[],
    );
    const nodeId = `cell-${index}`;
    const outlineNode = this._findOutlineNodeById(outline, nodeId);
    const notebookCell = cell.model.toJSON() as NotebookCell;

    applyNodeFrameToElement(
      cell.node,
      notebookCell,
      outlineNode?.headingLevel ?? null,
    );
  }

  private _closeDirectionMenu(): void {
    this._directionMenu?.classList.remove("is-open");
  }

  private _closeZoomSlider(): void {
    this._zoomSliderWrap?.classList.remove("is-open");
    this.node
      .querySelector(".jp-KuusiNotebookMindMap-status-zoom")
      ?.classList.remove("is-open");
    this._zoomTrigger?.setAttribute("aria-expanded", "false");
  }

  private _zoomTickPercents(): number[] {
    const ticks: number[] = [];

    for (
      let percent = MIN_ZOOM_PERCENT;
      percent <= MAX_ZOOM_PERCENT;
      percent += ZOOM_TICK_STEP
    ) {
      ticks.push(percent);
    }

    if (ticks[ticks.length - 1] !== MAX_ZOOM_PERCENT) {
      ticks.push(MAX_ZOOM_PERCENT);
    }

    return ticks;
  }

  private _formatZoomLabel(percent: number): string {
    return `${this._t.zoom()}: ${percent}%`;
  }

  /** Bottom offset (px) for tick/thumb centers along the shared track. */
  private _zoomPercentToTrackBottom(percent: number): number {
    const snapped = this._snapZoomPercent(percent);
    const fraction =
      (snapped - MIN_ZOOM_PERCENT) / (MAX_ZOOM_PERCENT - MIN_ZOOM_PERCENT);
    return fraction * ZOOM_TRACK_PX;
  }

  private _zoomPercentFromTrackClientY(clientY: number): number {
    const track = this._zoomTrack;

    if (!track) {
      return this._zoomToPercent(this._zoom);
    }

    const rect = track.getBoundingClientRect();
    const height = Math.max(rect.height, 1);
    const fromBottom = rect.bottom - clientY;
    const fraction = Math.min(1, Math.max(0, fromBottom / height));
    return MIN_ZOOM_PERCENT + fraction * (MAX_ZOOM_PERCENT - MIN_ZOOM_PERCENT);
  }

  private _syncZoomThumb(percent: number): void {
    const snapped = this._snapZoomPercent(percent);

    if (this._zoomThumb) {
      this._zoomThumb.style.bottom = `${this._zoomPercentToTrackBottom(snapped)}px`;
    }

    if (this._zoomTrack) {
      this._zoomTrack.setAttribute("aria-valuenow", String(snapped));
      this._zoomTrack.setAttribute("aria-valuetext", `${snapped}%`);
      this._zoomTrack.title = this._t.zoomSlider();
      this._zoomTrack.setAttribute("aria-label", this._formatZoomLabel(snapped));
    }
  }

  private _toggleZoomSlider(wrapper: HTMLElement): void {
    const isOpen = this._zoomSliderWrap?.classList.contains("is-open") ?? false;
    this._closeDirectionMenu();
    closeKuusiDropdownMenus(this.node);

    if (isOpen) {
      this._closeZoomSlider();
      return;
    }

    this._zoomSliderWrap?.classList.add("is-open");
    wrapper.classList.add("is-open");
    this._zoomTrigger?.setAttribute("aria-expanded", "true");
    this._syncZoomThumb(this._zoomToPercent(this._zoom));
  }

  private _createZoomControl(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "jp-KuusiNotebookMindMap-status-zoom";

    const sliderWrap = document.createElement("div");
    sliderWrap.className = "jp-KuusiNotebookMindMap-status-zoom-slider-wrap";
    sliderWrap.style.setProperty("--kuusi-zoom-track", `${ZOOM_TRACK_PX}px`);
    sliderWrap.style.setProperty("--kuusi-zoom-thumb", `${ZOOM_THUMB_PX}px`);
    this._zoomSliderWrap = sliderWrap;

    const rail = document.createElement("div");
    rail.className = "jp-KuusiNotebookMindMap-status-zoom-rail";

    const ticks = document.createElement("div");
    ticks.className = "jp-KuusiNotebookMindMap-status-zoom-ticks";

    this._zoomTickPercents().forEach((percent) => {
      const tick = document.createElement("button");
      tick.type = "button";
      tick.className = "jp-KuusiNotebookMindMap-status-zoom-tick";
      tick.textContent = `${percent}%`;
      tick.title = `${percent}%`;
      tick.style.bottom = `${this._zoomPercentToTrackBottom(percent)}px`;
      tick.addEventListener("click", (event) => {
        event.stopPropagation();
        this._setZoomPercent(percent);
      });
      ticks.appendChild(tick);
    });

    const track = document.createElement("div");
    track.className = "jp-KuusiNotebookMindMap-status-zoom-track";
    track.setAttribute("role", "slider");
    track.tabIndex = 0;
    track.setAttribute("aria-orientation", "vertical");
    track.setAttribute("aria-valuemin", String(MIN_ZOOM_PERCENT));
    track.setAttribute("aria-valuemax", String(MAX_ZOOM_PERCENT));
    this._zoomTrack = track;

    const trackLine = document.createElement("div");
    trackLine.className = "jp-KuusiNotebookMindMap-status-zoom-track-line";
    trackLine.setAttribute("aria-hidden", "true");

    const thumb = document.createElement("div");
    thumb.className = "jp-KuusiNotebookMindMap-status-zoom-thumb";
    thumb.setAttribute("aria-hidden", "true");
    this._zoomThumb = thumb;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "jp-KuusiNotebookMindMap-status-zoom-btn";
    trigger.textContent = this._formatZoomLabel(this._zoomToPercent(this._zoom));
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", this._t.zoom());
    trigger.title = this._t.zoomSlider();
    this._zoomTrigger = trigger;
    this._zoomLabel = trigger;

    const applyFromPointer = (clientY: number): void => {
      this._setZoomPercent(this._zoomPercentFromTrackClientY(clientY));
    };

    track.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      track.setPointerCapture(event.pointerId);
      applyFromPointer(event.clientY);
    });

    track.addEventListener("pointermove", (event) => {
      if (!track.hasPointerCapture(event.pointerId)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      applyFromPointer(event.clientY);
    });

    track.addEventListener("pointerup", (event) => {
      if (track.hasPointerCapture(event.pointerId)) {
        track.releasePointerCapture(event.pointerId);
      }
    });

    track.addEventListener("keydown", (event) => {
      let next: number | null = null;
      const current = this._snapZoomPercent(this._zoomToPercent(this._zoom));

      if (event.key === "ArrowUp" || event.key === "ArrowRight") {
        next = current + ZOOM_PERCENT_STEP;
      } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
        next = current - ZOOM_PERCENT_STEP;
      } else if (event.key === "Home") {
        next = MAX_ZOOM_PERCENT;
      } else if (event.key === "End") {
        next = MIN_ZOOM_PERCENT;
      }

      if (next === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this._setZoomPercent(next);
    });

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      this._toggleZoomSlider(wrapper);
    });

    wrapper.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    // Keep the slider open while adjusting so users can compare levels.
    wrapper.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    wrapper.addEventListener("wheel", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", () => {
      this._closeZoomSlider();
    });

    track.append(trackLine, thumb);
    rail.append(ticks, track);
    sliderWrap.appendChild(rail);
    wrapper.append(sliderWrap, trigger);
    this._syncZoomThumb(this._zoomToPercent(this._zoom));
    return wrapper;
  }

  private _createFullscreenControl(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "jp-KuusiNotebookMindMap-status-fullscreen";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "jp-KuusiNotebookMindMap-status-fullscreen-btn";
    button.title = this._t.enterFullscreen();
    button.setAttribute("aria-label", this._t.enterFullscreen());
    this._fullscreenButton = button;
    this._updateFullscreenButton();

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this._onFullscreenButtonClick();
    });

    wrapper.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    wrapper.appendChild(button);
    return wrapper;
  }

  /**
   * Resolve the element to put in fullscreen. Prefer the document widget
   * node (already styled for :fullscreen). Avoid `instanceof` — JupyterLab
   * federated bundles can load duplicate class copies so instanceof fails
   * and the old path silently no-oped.
   */
  private _getFullscreenTarget(): HTMLElement {
    const fromDom = this.node.closest(
      ".jp-KuusiNotebookMindMapDocument",
    ) as HTMLElement | null;

    if (fromDom) {
      return fromDom;
    }

    let widget: Widget | null = this.parent;

    while (widget) {
      if (widget.node.classList.contains("jp-KuusiNotebookMindMapDocument")) {
        return widget.node;
      }

      widget = widget.parent;
    }

    return this.node;
  }

  private _onFullscreenChange = (): void => {
    this._updateFullscreenButton();
    this._syncFullscreenLayout();
  };

  private _syncFullscreenLayout(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.isDisposed) {
          return;
        }

        let widget: Widget | null = this;

        while (widget) {
          widget.update();
          widget = widget.parent;
        }

        this._applyLayout();

        const index = this._notebook.activeCellIndex;

        if (index >= 0) {
          this._ensureCellVisibleInViewport(index);
        }
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
    const fullscreen = this._fullscreenElement();

    if (!fullscreen) {
      return false;
    }

    const target = this._getFullscreenTarget();

    return fullscreen === target || fullscreen === this.node;
  }

  private _updateFullscreenButton(): void {
    if (!this._fullscreenButton) {
      return;
    }

    const isFullscreen = this._isKuusiFullscreen();
    const label = isFullscreen
      ? this._t.exitFullscreen()
      : this._t.enterFullscreen();

    this._fullscreenButton.title = label;
    this._fullscreenButton.setAttribute("aria-label", label);
    this._fullscreenButton.replaceChildren();
    (isFullscreen ? collapseIcon : expandIcon).render(this._fullscreenButton);
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

  private _onFullscreenButtonClick = (): void => {
    if (this._isKuusiFullscreen()) {
      void this._exitFullscreen();
      return;
    }

    // Call requestFullscreen in the same turn as the click so the
    // user-gesture requirement is satisfied (no prior await).
    const target = this._getFullscreenTarget();
    void this._requestElementFullscreen(target)
      .then(() => {
        this._updateFullscreenButton();
        this._syncFullscreenLayout();
      })
      .catch((error) => {
        console.warn("[kuusi] fullscreen request failed", error);
        this._updateFullscreenButton();
      });
  };

  private async _exitFullscreen(): Promise<void> {
    try {
      await this._exitElementFullscreen();
    } catch {
      // ignore — button state still refreshes below
    }

    this._updateFullscreenButton();
    this._syncFullscreenLayout();
  }

  private _zoomToPercent(zoom: number): number {
    return Math.round((zoom / ZOOM_BASE) * 100);
  }

  private _percentToZoom(percent: number): number {
    return (percent / 100) * ZOOM_BASE;
  }

  private _snapZoomPercent(percent: number): number {
    const snapped =
      Math.round(percent / ZOOM_PERCENT_STEP) * ZOOM_PERCENT_STEP;
    return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, snapped));
  }

  private _setZoomPercent(percent: number): void {
    this._setZoomLevel(this._percentToZoom(this._snapZoomPercent(percent)));
  }

  private _setZoomLevel(level: number): void {
    const rect = this._viewport.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (centerX - this._panX) / this._zoom;
    const worldY = (centerY - this._panY) / this._zoom;
    const nextZoom = this._clampZoom(level);

    this._panX = centerX - worldX * nextZoom;
    this._panY = centerY - worldY * nextZoom;
    this._zoom = nextZoom;
    this._applyTransform();
  }

  private _applyAppearance(): void {
    applyAppearanceToScene(this._scene, this._appearanceSettings);
  }

  private _applyTheme(): void {
    applyThemeToScene(this._scene, this._mindMapTheme);
  }

  private _applyFont(): void {
    applyFontToScene(
      this._scene,
      this._mindMapEditFont,
      this._mindMapDisplayFont,
      this._mindMapEditFontSize,
      this._mindMapDisplayFontSize,
    );
  }

  private _applyBackground(): void {
    applyBackgroundToViewport(
      this._viewport,
      this._mindMapBackground,
      this._mindMapBackgroundPattern,
      this._mindMapBackgroundColor,
    );
  }

  private _applyScenePresentation(): void {
    this._applyTheme();
    this._applyAppearance();
    this._applyFont();
  }

  private _updateZoomControl(): void {
    const percent = this._zoomToPercent(this._zoom);
    const snapped = this._snapZoomPercent(percent);
    const label = this._formatZoomLabel(percent);

    if (this._zoomTrigger) {
      this._zoomTrigger.textContent = label;
      this._zoomTrigger.title = this._t.zoomSlider();
      this._zoomTrigger.setAttribute("aria-label", label);
    }

    if (this._zoomLabel && this._zoomLabel !== this._zoomTrigger) {
      this._zoomLabel.textContent = label;
    }

    this._syncZoomThumb(snapped);
  }

  private _bindKeyboardEvents(): void {
    this.node.addEventListener("keydown", this._onFormatKeyDown, {
      capture: true,
    });
    this.node.addEventListener("keydown", this._onKeyDown, { capture: true });
  }

  private _unbindKeyboardEvents(): void {
    this.node.removeEventListener("keydown", this._onFormatKeyDown, {
      capture: true,
    });
    this.node.removeEventListener("keydown", this._onKeyDown, { capture: true });
  }

  private _onFormatKeyDown = (event: KeyboardEvent): void => {
    if (!isMindMapEditingText(this._notebook)) {
      return;
    }

    const activeCell = this._notebook.activeCell;

    if (!(activeCell instanceof MarkdownCell)) {
      return;
    }

    const editor = activeCell.editor;

    if (editor && handleFormatShortcut(editor, event)) {
      event.preventDefault();
      event.stopPropagation();
      this._formatToolbar?.syncActiveStates();
    }
  };

  private _focusViewport(): void {
    this._viewport.focus({ preventScroll: true });
  }

  private _scrollActiveCellIntoView(): void {
    const index = this._notebook.activeCellIndex;

    if (index < 0) {
      return;
    }

    this._ensureCellVisibleInViewport(index);
  }

  private _centerCellInViewport(index: number): boolean {
    const node = this._cellNodes.get(`cell-${index}`);

    if (!node || node.style.display === "none") {
      return false;
    }

    const nodeLeft = Number.parseFloat(node.style.left) || 0;
    const nodeTop = Number.parseFloat(node.style.top) || 0;
    const nodeWidth = Number.parseFloat(node.style.width) || node.offsetWidth;
    const nodeHeight =
      node.offsetHeight || Number.parseFloat(node.style.height) || 0;
    const rect = this._viewport.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0 || nodeWidth <= 0) {
      return false;
    }

    // Need a laid-out position; empty left/top means layout has not run yet.
    if (node.style.left === "" || node.style.top === "") {
      return false;
    }

    const centerX = nodeLeft + nodeWidth / 2;
    const centerY = nodeTop + Math.max(nodeHeight, 1) / 2;

    this._panX = rect.width / 2 - centerX * this._zoom;
    this._panY = rect.height / 2 - centerY * this._zoom;
    this._applyTransform();
    return true;
  }

  /**
   * Retry centering until the viewport/node are ready (open can race layout).
   */
  private _scheduleCenterOnCell(index: number, attempts = 24): void {
    const tryCenter = (left: number): void => {
      if (this.isDisposed || left <= 0) {
        return;
      }

      if (this._centerCellInViewport(index)) {
        if (this._pendingOpenCenterIndex === index) {
          this._openCentered = true;
          this._pendingOpenCenterIndex = null;
        }
        return;
      }

      window.requestAnimationFrame(() => {
        tryCenter(left - 1);
      });
    };

    window.requestAnimationFrame(() => {
      tryCenter(attempts);
    });
  }

  /** After layout, finish one-shot open centering if still pending. */
  private _finishOpenCenterIfNeeded(): void {
    if (this._openCentered || this._pendingOpenCenterIndex === null) {
      return;
    }

    const index = this._pendingOpenCenterIndex;

    if (this._centerCellInViewport(index)) {
      this._openCentered = true;
      this._pendingOpenCenterIndex = null;
      return;
    }

    this._scheduleCenterOnCell(index);
  }

  private _ensureCellVisibleInViewport(
    index: number,
    margin = 48,
    axis: "x" | "y" | "xy" = "xy",
  ): void {
    const node = this._cellNodes.get(`cell-${index}`);

    if (!node || node.style.display === "none") {
      return;
    }

    const nodeLeft = Number.parseFloat(node.style.left) || 0;
    const nodeTop = Number.parseFloat(node.style.top) || 0;
    const nodeWidth = Number.parseFloat(node.style.width) || node.offsetWidth;
    const nodeHeight = node.offsetHeight;
    const rect = this._viewport.getBoundingClientRect();
    const padding = margin / this._zoom;
    const viewLeft = -this._panX / this._zoom;
    const viewTop = -this._panY / this._zoom;
    const viewWidth = rect.width / this._zoom;
    const viewHeight = rect.height / this._zoom;
    let nextPanX = this._panX;
    let nextPanY = this._panY;
    const panX = axis === "x" || axis === "xy";
    const panY = axis === "y" || axis === "xy";

    if (panX) {
      if (nodeLeft < viewLeft + padding) {
        nextPanX = -(nodeLeft - padding) * this._zoom;
      } else if (nodeLeft + nodeWidth > viewLeft + viewWidth - padding) {
        nextPanX = -(nodeLeft + nodeWidth - viewWidth + padding) * this._zoom;
      }
    }

    if (panY) {
      if (nodeTop < viewTop + padding) {
        nextPanY = -(nodeTop - padding) * this._zoom;
      } else if (nodeTop + nodeHeight > viewTop + viewHeight - padding) {
        nextPanY = -(nodeTop + nodeHeight - viewHeight + padding) * this._zoom;
      }
    }

    if (nextPanX !== this._panX || nextPanY !== this._panY) {
      this._panX = nextPanX;
      this._panY = nextPanY;
      this._applyTransform();
    }
  }

  private _getNodeWorldCenter(
    node: HTMLElement,
  ): { x: number; y: number } | null {
    const left = Number.parseFloat(node.style.left) || 0;
    const top = Number.parseFloat(node.style.top) || 0;
    const width = Number.parseFloat(node.style.width) || node.offsetWidth;
    const height =
      node.offsetHeight || Number.parseFloat(node.style.height) || 0;

    if (width <= 0) {
      return null;
    }

    return {
      x: left + width / 2,
      y: top + Math.max(height, 1) / 2,
    };
  }

  /**
   * Remember where a node sits on screen so pan can be corrected after relayout.
   */
  private _captureViewportAnchor(nodeId: string): void {
    const node = this._cellNodes.get(nodeId);

    if (!node || node.style.display === "none") {
      this._viewportAnchor = null;
      return;
    }

    const center = this._getNodeWorldCenter(node);

    if (!center) {
      this._viewportAnchor = null;
      return;
    }

    this._viewportAnchor = {
      nodeId,
      screenX: center.x * this._zoom + this._panX,
      screenY: center.y * this._zoom + this._panY,
    };
  }

  /** Re-apply pan so the anchored node stays at the same screen position. */
  private _restoreViewportAnchor(): void {
    const anchor = this._viewportAnchor;
    this._viewportAnchor = null;

    if (!anchor) {
      return;
    }

    const node = this._cellNodes.get(anchor.nodeId);

    if (!node || node.style.display === "none") {
      return;
    }

    const center = this._getNodeWorldCenter(node);

    if (!center) {
      return;
    }

    this._panX = anchor.screenX - center.x * this._zoom;
    this._panY = anchor.screenY - center.y * this._zoom;
    this._applyTransform();
  }

  /**
   * Expand collapsed ancestors so the notebook cursor cell is visible on the map.
   * Returns true when collapse state changed (caller should relayout).
   */
  private _expandAncestorsForCell(cellIndex: number): boolean {
    const nodeId = `cell-${cellIndex}`;
    const notebook = this._context.model.toJSON() as INotebookContent;
    const outline = buildNotebookOutline(
      (notebook.cells ?? []) as NotebookCell[],
    );
    const visibleIds = getVisibleOutlineNodeIds(outline, this._collapsedNodes);

    if (visibleIds.has(nodeId)) {
      return false;
    }

    let changed = false;

    const expandPath = (node: OutlineNode): boolean => {
      if (node.id === nodeId) {
        return true;
      }

      for (const child of node.children) {
        if (!expandPath(child)) {
          continue;
        }

        if (this._collapsedNodes.has(node.id)) {
          this._collapsedNodes.delete(node.id);
          changed = true;
        }

        return true;
      }

      return false;
    };

    expandPath(outline);
    return changed;
  }

  /** Sync selection and viewport from the standard notebook editor view. */
  syncActiveCellFromNotebook(
    cellIndex: number,
    options: { center?: boolean } = {},
  ): void {
    if (cellIndex < 0 || cellIndex >= this._context.model.cells.length) {
      return;
    }

    const center = Boolean(options.center);

    if (this._notebook.activeCellIndex !== cellIndex) {
      this._restoreMarkdownPreview(this._notebook.activeCell);
      this._notebook.deselectAll();
      this._notebook.activeCellIndex = cellIndex;
      this._notebook.mode = "command";
      this._updateSelectedNodeHighlight();
    }

    const needsRelayout = this._expandAncestorsForCell(cellIndex);
    const node = this._cellNodes.get(`cell-${cellIndex}`);
    const nodeReady =
      Boolean(node) &&
      node!.style.display !== "none" &&
      node!.style.left !== "" &&
      node!.style.top !== "";

    if (needsRelayout || !nodeReady || !this._notebookAttached) {
      this._pendingFocusCellIndex = cellIndex;
      this._pendingFocusCenter = center;
      this._scheduleLayout();
      return;
    }

    if (center) {
      if (!this._centerCellInViewport(cellIndex)) {
        this._scheduleCenterOnCell(cellIndex);
      }
    } else {
      this._ensureCellVisibleInViewport(cellIndex);
    }
  }

  private _onKeyDown = (event: KeyboardEvent): void => {
    if (!this._shouldHandleKeyboard(event)) {
      return;
    }

    if (event.key === "F2") {
      if (this._notebook.activeCellIndex >= 0) {
        void this._enterCellEditMode(this._notebook.activeCellIndex);
      }

      event.preventDefault();
      return;
    }

    if (event.key === " " && this._notebook.mode === "command") {
      const index = this._notebook.activeCellIndex;

      if (index >= 0) {
        this._toggleCollapse(`cell-${index}`);
        event.preventDefault();
        return;
      }
    }

    const outline = buildNotebookOutline(
      ((this._context.model.toJSON() as INotebookContent).cells ??
        []) as NotebookCell[],
    );
    const visibleIds = getVisibleOutlineNodeIds(outline, this._collapsedNodes);
    const anchorBeforeInsert =
      event.key === "Tab" || event.key === "Enter"
        ? this._notebook.activeCellIndex
        : -1;
    const result = handleMindMapShortcut(
      this._notebook,
      this._context.model,
      event,
      visibleIds,
      this._collapsedNodes,
    );

    if (result === "paste") {
      void pasteMindMapClipboard(this._notebook, this._context.model).then(
        (kind) => {
          if (!kind || this.isDisposed) {
            return;
          }

          const index = this._notebook.activeCellIndex;
          this._pendingFocusCellIndex = index;
          this._pendingFocusCenter = false;
          this._pendingFocusRevealAxis = "xy";
          this._scheduleLayout();
        },
      );
      return;
    }

    if (
      result === "insert-edit-child" ||
      result === "insert-edit-sibling"
    ) {
      const index = this._notebook.activeCellIndex;

      if (anchorBeforeInsert >= 0) {
        this._captureViewportAnchor(`cell-${anchorBeforeInsert}`);
      }

      this._pendingFocusCellIndex = index;
      this._pendingFocusCenter = false;
      this._pendingFocusRevealAxis =
        result === "insert-edit-child" ? "x" : "y";
      // Mark before any await so concurrent layout won't force-render markdown.
      this._pendingEditCellIndex = index;
      void this._enterCellEditModeWhenReady(index);
      this._scheduleLayout();
      return;
    }

    if (result === "commit-stay") {
      this._scrollActiveCellIntoView();
      this._scheduleLayoutAfterContentChange();
      return;
    }

    if (result === "default") {
      this._scrollActiveCellIntoView();
    }
  };

  private _shouldHandleKeyboard(event: KeyboardEvent): boolean {
    if (event.defaultPrevented || event.isComposing) {
      return false;
    }

    const target = event.target;

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      return false;
    }

    if (target instanceof HTMLElement && target.closest(".jp-Toolbar")) {
      return false;
    }

    return this.node.contains(target as Node) || this._viewport === target;
  }

  private _getTreeDirectionTitle(direction: TreeDirection): string {
    switch (direction) {
      case "TB":
        return this._t.treeTopToBottom();
      case "BT":
        return this._t.treeBottomToTop();
      case "LR":
        return this._t.treeLeftToRight();
      case "RL":
        return this._t.treeRightToLeft();
      default:
        return this._t.tree();
    }
  }

  private _updateDirectionButtons(): void {
    const currentTitle = this._getTreeDirectionTitle(this._treeDirection);

    if (this._directionTrigger) {
      this._directionTrigger.textContent = this._t.tree();
      this._directionTrigger.title = currentTitle;
    }

    this._directionMenuItems.forEach((item, direction) => {
      item.classList.toggle("is-active", direction === this._treeDirection);
    });
  }

  private _bindHeaderLayout(): void {
    if (typeof ResizeObserver === "undefined" || !this._headerEl) {
      return;
    }

    this._headerLayoutObserver?.disconnect();
    this._headerLayoutObserver = new ResizeObserver(() => {
      this._scheduleHeaderLayoutSync();
    });
    this._headerLayoutObserver.observe(this._headerEl);
    if (this._pageToolbarNode) {
      this._headerLayoutObserver.observe(this._pageToolbarNode);
    }
    if (this._formatCluster) {
      this._headerLayoutObserver.observe(this._formatCluster);
    }
  }

  private _scheduleHeaderLayoutSync(): void {
    if (this._headerLayoutRaf !== null) {
      window.cancelAnimationFrame(this._headerLayoutRaf);
    }

    this._headerLayoutRaf = window.requestAnimationFrame(() => {
      this._headerLayoutRaf = null;
      this._syncFormatToolbarLayout();
    });
  }

  /**
   * When the page + Aa toolbars no longer fit side-by-side, stack Aa vertically
   * on the right and open its menus to the left. Widen again to restore row layout.
   */
  private _syncFormatToolbarLayout(): void {
    const header = this._headerEl;
    const page = this._pageToolbarNode;
    const format = this._formatCluster;

    if (!header || !page || !format) {
      return;
    }

    const styles = window.getComputedStyle(header);
    const padX =
      (Number.parseFloat(styles.paddingLeft) || 0) +
      (Number.parseFloat(styles.paddingRight) || 0);
    const gap =
      (Number.parseFloat(styles.columnGap || styles.gap) || 10) + 10;
    const available = Math.max(0, header.clientWidth - padX);

    // Measure both clusters in horizontal layout.
    header.classList.remove("jp-KuusiNotebookMindMap-header--formatVertical");
    format.classList.remove("is-vertical");

    const pageWidth = page.scrollWidth;
    const formatWidth = format.scrollWidth;
    const needed = pageWidth + formatWidth + gap;
    const hysteresis = 28;

    if (this._formatToolbarVertical) {
      this._formatToolbarVertical = needed + hysteresis > available;
    } else {
      this._formatToolbarVertical = needed > available;
    }

    header.classList.toggle(
      "jp-KuusiNotebookMindMap-header--formatVertical",
      this._formatToolbarVertical,
    );
    format.classList.toggle("is-vertical", this._formatToolbarVertical);
  }

  private _bindViewportEvents(): void {
    this._viewport.addEventListener("wheel", this._onWheel, {
      capture: true,
      passive: false,
    });
    this._viewport.addEventListener("pointerdown", this._onPointerDown);
    this._viewport.addEventListener("pointermove", this._onPointerMove);
    this._viewport.addEventListener("pointerup", this._onPointerUp);
    this._viewport.addEventListener("pointercancel", this._onPointerUp);
  }

  private _unbindViewportEvents(): void {
    this._viewport.removeEventListener("wheel", this._onWheel, { capture: true });
    this._viewport.removeEventListener("pointerdown", this._onPointerDown);
    this._viewport.removeEventListener("pointermove", this._onPointerMove);
    this._viewport.removeEventListener("pointerup", this._onPointerUp);
    this._viewport.removeEventListener("pointercancel", this._onPointerUp);
  }

  private _bindCellInteractionEvents(): void {
    this._scene.addEventListener(
      "pointerdown",
      this._onCellPointerDownCapture,
      true,
    );
    this._scene.addEventListener("click", this._onCellClick, true);
    this._scene.addEventListener("dblclick", this._onCellDblClick, true);
  }

  private _unbindCellInteractionEvents(): void {
    this._scene.removeEventListener(
      "pointerdown",
      this._onCellPointerDownCapture,
      true,
    );
    this._scene.removeEventListener("click", this._onCellClick, true);
    this._scene.removeEventListener("dblclick", this._onCellDblClick, true);
  }

  private _getCellIndexFromTarget(target: EventTarget | null): number {
    if (!(target instanceof HTMLElement)) {
      return -1;
    }

    if (target.closest(".jp-KuusiNotebookMindMap-dragHandle")) {
      return -1;
    }

    const cellNode = target.closest(".jp-KuusiNotebookMindMap-cellNode");

    if (!(cellNode instanceof HTMLElement)) {
      return -1;
    }

    const nodeId = cellNode.dataset.nodeId;

    if (!nodeId?.startsWith("cell-")) {
      return -1;
    }

    const index = Number.parseInt(nodeId.slice("cell-".length), 10);

    return Number.isFinite(index) ? index : -1;
  }

  private _isCellInputTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(
      target.closest(".jp-CodeMirrorEditor") ||
        target.closest(".jp-InputArea-editor") ||
        target.closest(".jp-InputArea") ||
        target.closest(".jp-OutputArea"),
    );
  }

  private async _enterCellEditMode(index: number): Promise<void> {
    const cell = this._notebook.widgets[index];

    if (!cell) {
      return;
    }

    this._pendingEditCellIndex = index;
    this._notebook.deselectAll();
    this._notebook.activeCellIndex = index;
    cell.inputHidden = false;
    // Flip mode before unrendering so layout treats this cell as editing.
    this._notebook.mode = "edit";
    this._syncSceneEditMode();

    await cell.ready;

    if (this.isDisposed || cell.isDisposed) {
      if (this._pendingEditCellIndex === index) {
        this._pendingEditCellIndex = null;
      }
      return;
    }

    if (cell instanceof MarkdownCell) {
      await this._showMarkdownEditor(cell);
    }

    if (this.isDisposed || cell.isDisposed) {
      if (this._pendingEditCellIndex === index) {
        this._pendingEditCellIndex = null;
      }
      return;
    }

    if (cell instanceof CodeCell) {
      cell.outputHidden = false;
    }

    cell.editorWidget?.update();
    this._notebook.mode = "edit";
    this._syncSceneEditMode();
    this._updateSelectedNodeHighlight();
    this._updateFormatToolbar();

    requestAnimationFrame(() => {
      if (this.isDisposed || cell.isDisposed) {
        return;
      }

      if (
        this._notebook.activeCellIndex !== index ||
        this._notebook.mode !== "edit"
      ) {
        return;
      }

      cell.editor?.focus();

      if (this._pendingEditCellIndex === index) {
        this._pendingEditCellIndex = null;
      }
    });
  }

  private async _showMarkdownEditor(cell: MarkdownCell): Promise<void> {
    if (cell.rendered) {
      cell.rendered = false;
      await new Promise<void>((resolve) => {
        if (!cell.rendered || cell.isDisposed) {
          resolve();
          return;
        }

        const onRenderedChanged = (_sender: MarkdownCell, rendered: boolean) => {
          if (!rendered) {
            cell.renderedChanged.disconnect(onRenderedChanged);
            resolve();
          }
        };

        cell.renderedChanged.connect(onRenderedChanged);
      });
    }

    if (this.isDisposed || cell.isDisposed) {
      return;
    }

    cell.editorWidget?.update();
  }

  private _restoreMarkdownPreview(cell: Cell | null | undefined): void {
    if (!(cell instanceof MarkdownCell) || cell.isDisposed) {
      return;
    }

    const syncAndRelayout = () => {
      if (this.isDisposed || cell.isDisposed) {
        return;
      }

      this._dimensionCacheByModelId.delete(cell.model.id);
      const index = this._notebook.widgets.indexOf(cell);

      if (index >= 0) {
        this._syncMarkdownToNotebook?.(index);
      }

      this._scheduleLayout();
    };

    if (!cell.rendered) {
      const onRendered = (_sender: MarkdownCell, rendered: boolean) => {
        if (!rendered) {
          return;
        }

        cell.renderedChanged.disconnect(onRendered);
        syncAndRelayout();
      };

      cell.renderedChanged.connect(onRendered);
      cell.rendered = true;
      return;
    }

    syncAndRelayout();
  }

  private _previousActiveCell: Cell | null = null;

  private _bindNotebookEditState(): void {
    this._notebook.activeCellChanged.connect((_sender, cell) => {
      if (this._previousActiveCell instanceof MarkdownCell) {
        this._restoreMarkdownPreview(this._previousActiveCell);
      }

      this._previousActiveCell = cell;
      this._updateSelectedNodeHighlight();
      this._updateFormatToolbar();
      this._appearanceToolbar?.refresh();
      this._syncSceneEditMode();
    });

    this._notebook.stateChanged.connect((_sender, args) => {
      if (args.name === "mode") {
        if (args.newValue === "command") {
          this._restoreMarkdownPreview(this._notebook.activeCell);
        }

        this._syncSceneEditMode();
        this._updateFormatToolbar();
      }
    });

    this._syncSceneEditMode();
  }

  /**
   * Notebook puts `jp-mod-editMode` on its own node (off-screen mount).
   * Cells live under `_scene`, so mirror the mode class there for CSS.
   */
  private _syncSceneEditMode(): void {
    const editing = this._notebook.mode === "edit";
    this._scene.classList.toggle("jp-mod-editMode", editing);
    this._scene.classList.toggle("jp-mod-commandMode", !editing);
  }

  private _updateSelectedNodeHighlight(): void {
    const activeIndex = this._notebook.activeCellIndex;

    this._cellNodes.forEach((node, nodeId) => {
      const index = Number.parseInt(nodeId.slice("cell-".length), 10);
      node.classList.toggle(
        "is-selected",
        activeIndex >= 0 && index === activeIndex,
      );
    });
  }

  private _locateCellInNotebook(index: number): void {
    this._selectCell(index);
    this._revealCellInNotebook?.(index);
  }

  private _getCellIndexFromNodeId(nodeId: string): number {
    if (!nodeId.startsWith("cell-")) {
      return -1;
    }

    const index = Number.parseInt(nodeId.slice("cell-".length), 10);

    return Number.isFinite(index) ? index : -1;
  }

  private _selectCell(index: number): void {
    this._pendingEditCellIndex = null;

    if (this._notebook.activeCellIndex !== index) {
      this._restoreMarkdownPreview(this._notebook.activeCell);
    }

    this._notebook.deselectAll();
    this._notebook.activeCellIndex = index;
    this._notebook.mode = "command";
    this._blurCellEditors();
    this._focusViewport();
    this._updateSelectedNodeHighlight();
    this._updateFormatToolbar();
  }

  /** Keep caret out of cell editors unless we explicitly enter edit mode. */
  private _blurCellEditors(): void {
    const active = document.activeElement;

    if (
      active instanceof HTMLElement &&
      active.closest(".jp-KuusiNotebookMindMap-cellNode")
    ) {
      active.blur();
    }

    const cell = this._notebook.activeCell;
    const editor = cell?.editor as { blur?: () => void } | null | undefined;
    editor?.blur?.();
  }

  private _onCellPointerDownCapture = (event: PointerEvent): void => {
    if (event.button !== 0 || !(event.target instanceof Element)) {
      return;
    }

    if (
      event.target.closest(".jp-KuusiNotebookMindMap-collapse") ||
      event.target.closest(".jp-KuusiNotebookMindMap-dragHandle") ||
      event.target.closest(".jp-KuusiNotebookMindMap-resizeHandle")
    ) {
      return;
    }

    const index = this._getCellIndexFromTarget(event.target);

    if (index === -1) {
      return;
    }

    // While editing this cell, allow the editor to receive the caret.
    if (
      this._notebook.mode === "edit" &&
      this._notebook.activeCellIndex === index &&
      this._isCellInputTarget(event.target)
    ) {
      return;
    }

    // Single-click select must not place a caret inside code/markdown editors.
    if (this._isCellInputTarget(event.target)) {
      event.preventDefault();
    }
  };

  private _onCellClick = (event: MouseEvent): void => {
    if (event.button !== 0 || event.detail > 1) {
      return;
    }

    if (!(event.target instanceof Element)) {
      return;
    }

    // Capture-phase listener would otherwise steal clicks from the collapse control.
    const collapse = event.target.closest(
      ".jp-KuusiNotebookMindMap-collapse",
    );

    if (collapse) {
      const host = collapse.closest(".jp-KuusiNotebookMindMap-cellNode");
      const nodeId =
        host instanceof HTMLElement ? host.dataset.nodeId ?? null : null;

      if (nodeId) {
        this._toggleCollapse(nodeId);
      }

      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (
      event.target.closest(".jp-KuusiNotebookMindMap-dragHandle") ||
      event.target.closest(".jp-KuusiNotebookMindMap-resizeHandle")
    ) {
      return;
    }

    const index = this._getCellIndexFromTarget(event.target);

    if (index === -1) {
      return;
    }

    if (
      this._notebook.mode === "edit" &&
      this._notebook.activeCellIndex === index &&
      this._isCellInputTarget(event.target)
    ) {
      return;
    }

    this._selectCell(index);
    event.preventDefault();
    event.stopPropagation();
  };

  private _onCellDblClick = (event: MouseEvent): void => {
    if (
      event.target instanceof Element &&
      (event.target.closest(".jp-KuusiNotebookMindMap-collapse") ||
        event.target.closest(".jp-KuusiNotebookMindMap-resizeHandle") ||
        event.target.closest(".jp-KuusiNotebookMindMap-dragHandle"))
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const index = this._getCellIndexFromTarget(event.target);

    if (index === -1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void this._enterCellEditMode(index);
  };

  private _isCellDragTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(target.closest(".jp-KuusiNotebookMindMap-dragHandle"));
  }

  private _isCellResizeTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(target.closest(".jp-KuusiNotebookMindMap-resizeHandle"));
  }

  private _canPanDrag(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return !target.closest(
      ".jp-KuusiNotebookMindMap-cellNode, .jp-KuusiNotebookMindMap-dragHandle, .jp-KuusiNotebookMindMap-resizeHandle, .jp-KuusiNotebookMindMap-collapse, .jp-KuusiNotebookMindMap-status",
    );
  }

  private _prepareCellForDisplay(cell: Cell, index: number): void {
    cell.inputHidden = false;

    void cell.ready.then(() => {
      if (this.isDisposed || cell.isDisposed) {
        return;
      }

      if (cell instanceof MarkdownCell) {
        if (!this._isCellEditingMarkdown(cell, index) && !cell.rendered) {
          cell.rendered = true;
        }
      }

      if (cell instanceof CodeCell) {
        cell.outputHidden = false;
      }
    });
  }

  private _ensureDragHandle(cellNode: HTMLElement): void {
    if (cellNode.querySelector(":scope > .jp-KuusiNotebookMindMap-dragHandle")) {
      return;
    }

    const handle = document.createElement("div");
    handle.className = "jp-KuusiNotebookMindMap-dragHandle";
    handle.title = this._t.dragHandleTitle();
    handle.setAttribute("aria-label", this._t.dragHandleTitle());
    cellNode.prepend(handle);
  }

  private _ensureResizeHandle(cellNode: HTMLElement): void {
    if (
      cellNode.querySelector(":scope > .jp-KuusiNotebookMindMap-resizeHandle")
    ) {
      return;
    }

    const handle = document.createElement("div");
    handle.className = "jp-KuusiNotebookMindMap-resizeHandle";
    handle.title = this._t.resizeHandleTitle();
    handle.setAttribute("aria-label", this._t.resizeHandleTitle());
    cellNode.appendChild(handle);
  }

  private _applyTransform(): void {
    this._scene.style.transform = `translate(${this._panX}px, ${this._panY}px) scale(${this._zoom})`;
    this._updateStatusBar();
  }

  private _updateStatusBar(nodeCount = this._cellNodes.size): void {
    this._statusNodeEl.textContent = `Node: ${nodeCount}`;
    this._updateZoomControl();
  }

  private _clampZoom(value: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }

  private _zoomAtPointer(
    clientX: number,
    clientY: number,
    deltaY: number,
    deltaMode: number = 0,
  ): void {
    const rect = this._viewport.getBoundingClientRect();
    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;
    const worldX = (pointerX - this._panX) / this._zoom;
    const worldY = (pointerY - this._panY) / this._zoom;

    let normalizedDelta = deltaY;

    if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
      normalizedDelta *= 16;
    } else if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      normalizedDelta *= 400;
    }

    const rawFactor = Math.exp(-normalizedDelta * ZOOM_WHEEL_SENSITIVITY);
    const factor = Math.min(
      ZOOM_WHEEL_MAX_STEP,
      Math.max(1 / ZOOM_WHEEL_MAX_STEP, rawFactor),
    );
    const nextZoom = this._clampZoom(this._zoom * factor);

    this._panX = pointerX - worldX * nextZoom;
    this._panY = pointerY - worldY * nextZoom;
    this._zoom = nextZoom;
    this._applyTransform();
  }

  private _panBy(deltaX: number, deltaY: number): void {
    this._panX += deltaX;
    this._panY += deltaY;
    this._applyTransform();
  }

  private _shouldCellHandleWheel(event: WheelEvent): boolean {
    if (this._notebook.mode !== "edit") {
      return false;
    }

    const index = this._getCellIndexFromTarget(event.target);

    if (index !== this._notebook.activeCellIndex) {
      return false;
    }

    if (!(event.target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(event.target.closest(".jp-CodeMirrorEditor"));
  }

  private _onWheel = (event: WheelEvent): void => {
    if (this._shouldCellHandleWheel(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.ctrlKey || event.metaKey) {
      this._zoomAtPointer(
        event.clientX,
        event.clientY,
        event.deltaY,
        event.deltaMode,
      );
      return;
    }

    this._panBy(-event.deltaX, -event.deltaY);
  };

  private _onPointerDown = (event: PointerEvent): void => {
    if (this._isCellResizeTarget(event.target)) {
      const host = (event.target as HTMLElement).closest(
        ".jp-KuusiNotebookMindMap-cellNode",
      );

      if (host instanceof HTMLElement && host.dataset.nodeId) {
        const nodeId = host.dataset.nodeId;
        const index = this._getCellIndexFromNodeId(nodeId);
        const cell = index >= 0 ? this._notebook.widgets[index] : null;
        const startWidth = cell
          ? this._resolveNodeWidth(cell.model)
          : this._nodeWidth;

        this._resizeState = {
          nodeId,
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth,
          currentWidth: startWidth,
        };
        host.classList.add("is-resizing");
        this._viewport.classList.add("is-node-resizing");
        this._viewport.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    if (this._isCellDragTarget(event.target)) {
      const host = (event.target as HTMLElement).closest(
        ".jp-KuusiNotebookMindMap-cellNode",
      );

      if (host instanceof HTMLElement && host.dataset.nodeId) {
        this._dragState = {
          nodeId: host.dataset.nodeId,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          active: false,
        };
        this._viewport.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }

    if (!this._canPanDrag(event.target)) {
      return;
    }

    this._restoreMarkdownPreview(this._notebook.activeCell);

    if (event.button !== 0 && event.button !== 1) {
      return;
    }

    if (event.button === 1) {
      event.preventDefault();
    }

    this._isPanning = true;
    this._panPointerId = event.pointerId;
    this._focusViewport();
    this._panStart = {
      x: event.clientX,
      y: event.clientY,
      panX: this._panX,
      panY: this._panY,
    };
    this._viewport.setPointerCapture(event.pointerId);
    this._viewport.classList.add("is-panning");
  };

  private _onPointerMove = (event: PointerEvent): void => {
    if (this._resizeState && this._resizeState.pointerId === event.pointerId) {
      const resize = this._resizeState;
      const deltaWorld = (event.clientX - resize.startX) / this._zoom;
      const nextWidth = clampNodeWidth(resize.startWidth + deltaWorld);
      this._applyResizeWidth(resize.nodeId, nextWidth);
      return;
    }

    if (this._dragState && this._dragState.pointerId === event.pointerId) {
      const drag = this._dragState;
      const distance = Math.hypot(
        event.clientX - drag.startX,
        event.clientY - drag.startY,
      );

      if (!drag.active && distance >= DRAG_THRESHOLD_PX) {
        drag.active = true;
        this._startDragGhost(drag.nodeId, event.clientX, event.clientY);
        this._viewport.classList.add("is-node-dragging");
      }

      if (drag.active) {
        this._updateDragTarget(event.clientX, event.clientY);
        this._moveDragGhost(event.clientX, event.clientY);
      }

      return;
    }

    if (!this._isPanning || this._panPointerId !== event.pointerId) {
      return;
    }

    this._panX = this._panStart.panX + (event.clientX - this._panStart.x);
    this._panY = this._panStart.panY + (event.clientY - this._panStart.y);
    this._applyTransform();
  };

  private _onPointerUp = (event: PointerEvent): void => {
    if (this._resizeState && this._resizeState.pointerId === event.pointerId) {
      this._finishResize();
      this._viewport.releasePointerCapture(event.pointerId);
      return;
    }

    if (this._dragState && this._dragState.pointerId === event.pointerId) {
      const drag = this._dragState;

      if (drag.active) {
        this._completeNodeDrag(drag.nodeId);
      } else {
        const index = this._getCellIndexFromNodeId(drag.nodeId);

        if (index >= 0) {
          this._locateCellInNotebook(index);
        }
      }

      this._clearDragUi();
      this._dragState = null;
      this._viewport.releasePointerCapture(event.pointerId);
      return;
    }

    if (!this._isPanning || this._panPointerId !== event.pointerId) {
      return;
    }

    this._isPanning = false;
    this._panPointerId = null;
    this._viewport.releasePointerCapture(event.pointerId);
    this._viewport.classList.remove("is-panning");
  };

  private _applyResizeWidth(nodeId: string, width: number): void {
    if (!this._resizeState || this._resizeState.nodeId !== nodeId) {
      return;
    }

    if (this._resizeState.currentWidth === width) {
      return;
    }

    this._resizeState.currentWidth = width;

    if (this._equalNodeWidth) {
      this._dimensionCacheByModelId.clear();
    } else {
      const index = this._getCellIndexFromNodeId(nodeId);
      const cell = index >= 0 ? this._notebook.widgets[index] : null;

      if (cell) {
        this._dimensionCacheByModelId.delete(cell.model.id);
      }
    }

    this._scheduleResizeLayout();
  }

  private _scheduleResizeLayout(): void {
    if (this._resizeLayoutRaf !== null) {
      return;
    }

    this._resizeLayoutRaf = window.requestAnimationFrame(() => {
      this._resizeLayoutRaf = null;
      this._applyLayout();
    });
  }

  private _finishResize(): void {
    if (this._resizeLayoutRaf !== null) {
      window.cancelAnimationFrame(this._resizeLayoutRaf);
      this._resizeLayoutRaf = null;
    }

    const resize = this._resizeState;
    this._resizeState = null;
    this._viewport.classList.remove("is-node-resizing");

    if (resize) {
      this._cellNodes.get(resize.nodeId)?.classList.remove("is-resizing");
    }

    if (!resize) {
      return;
    }

    const width = resize.currentWidth;

    if (this._equalNodeWidth) {
      this._nodeWidth = width;
      void this._settingsManager.update({ nodeWidth: width });
      return;
    }

    const index = this._getCellIndexFromNodeId(resize.nodeId);
    const cell = index >= 0 ? this._notebook.widgets[index] : null;

    if (cell) {
      writeCellNodeWidth(cell.model, width);
      this._dimensionCacheByModelId.delete(cell.model.id);
    }

    this._applyLayout();
  }

  private _pruneCollapsedNodes(outline: OutlineNode): void {
    const validIds = new Set<string>();

    const visit = (node: OutlineNode) => {
      if (node.children.length > 0) {
        validIds.add(node.id);
      }

      node.children.forEach(visit);
    };

    visit(outline);

    Array.from(this._collapsedNodes).forEach((nodeId) => {
      if (!validIds.has(nodeId)) {
        this._collapsedNodes.delete(nodeId);
      }
    });
  }

  /**
   * Toggle branch collapse for a heading node that has children.
   * Returns true when the node was toggled.
   */
  private _toggleCollapse(nodeId: string): boolean {
    const notebook = this._context.model.toJSON() as INotebookContent;
    const outline = buildNotebookOutline(
      (notebook.cells ?? []) as NotebookCell[],
    );
    // findOutlineNode returns null for the outline root; resolve it directly.
    const node = this._findOutlineNodeById(outline, nodeId);

    if (!node || node.children.length === 0) {
      return false;
    }

    if (this._collapsedNodes.has(nodeId)) {
      this._collapsedNodes.delete(nodeId);
    } else {
      this._collapsedNodes.add(nodeId);

      // If the active cell is now hidden, keep selection on the collapsed parent.
      const activeId = `cell-${this._notebook.activeCellIndex}`;
      const visibleIds = getVisibleOutlineNodeIds(outline, this._collapsedNodes);

      if (!visibleIds.has(activeId) && node.cellIndex !== null) {
        this._notebook.activeCellIndex = node.cellIndex;
        this._notebook.mode = "command";
      }
    }

    // Collapse/expand shifts dagre coordinates; keep this node fixed on screen.
    this._captureViewportAnchor(nodeId);
    this._applyLayout();
    return true;
  }

  private _ensureCollapseControl(
    cellNode: HTMLElement,
    outlineNode: OutlineNode | null,
  ): void {
    const existing = cellNode.querySelector(
      ":scope > .jp-KuusiNotebookMindMap-collapse",
    );

    const childCount = outlineNode?.children.length ?? 0;

    if (!outlineNode || childCount === 0) {
      existing?.remove();
      cellNode.classList.remove("has-children", "is-collapsed");
      return;
    }

    cellNode.classList.add("has-children");
    const collapsed = this._collapsedNodes.has(outlineNode.id);
    cellNode.classList.toggle("is-collapsed", collapsed);

    let button =
      existing instanceof HTMLButtonElement
        ? existing
        : document.createElement("button");

    if (!(existing instanceof HTMLButtonElement)) {
      button.type = "button";
      button.className = "jp-KuusiNotebookMindMap-collapse";
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = cellNode.dataset.nodeId;

        if (id) {
          this._toggleCollapse(id);
        }
      });
      cellNode.prepend(button);
    }

    const hiddenCount = collapsed
      ? countOutlineDescendants(outlineNode)
      : 0;
    const label = collapsed
      ? this._t.expandBranch(hiddenCount)
      : this._t.collapseBranch();

    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    button.textContent = collapsed ? `▸${hiddenCount > 0 ? ` ${hiddenCount}` : ""}` : "▾";
  }

  private _startDragGhost(
    nodeId: string,
    clientX: number,
    clientY: number,
  ): void {
    const source = this._cellNodes.get(nodeId);

    if (!source) {
      return;
    }

    const ghost = document.createElement("div");
    ghost.className = "jp-KuusiNotebookMindMap-drag-ghost";
    ghost.textContent =
      source.querySelector(".jp-InputPrompt")?.textContent?.trim() ||
      source.textContent?.trim().slice(0, 80) ||
      nodeId;
    document.body.appendChild(ghost);
    this._dragGhost = ghost;
    this._moveDragGhost(clientX, clientY);
  }

  private _moveDragGhost(clientX: number, clientY: number): void {
    if (!this._dragGhost) {
      return;
    }

    this._dragGhost.style.left = `${clientX + 12}px`;
    this._dragGhost.style.top = `${clientY + 12}px`;
  }

  private _updateDragTarget(clientX: number, clientY: number): void {
    this._cellNodes.forEach((node) => {
      node.classList.remove(
        "is-drop-before",
        "is-drop-inside",
        "is-drop-after",
      );
    });

    this._dropTargetNodeId = null;
    this._dropZone = null;

    const draggedId = this._dragState?.nodeId;

    if (!draggedId) {
      return;
    }

    const element = document.elementFromPoint(clientX, clientY);

    if (!(element instanceof HTMLElement)) {
      return;
    }

    const targetHost = element.closest(".jp-KuusiNotebookMindMap-cellNode");

    if (!(targetHost instanceof HTMLElement) || !targetHost.dataset.nodeId) {
      return;
    }

    const targetNodeId = targetHost.dataset.nodeId;

    if (targetNodeId === draggedId) {
      return;
    }

    const zone = getDropZoneFromPointer(
      targetHost.getBoundingClientRect(),
      clientX,
      clientY,
      this._treeDirection,
    );

    this._dropTargetNodeId = targetNodeId;
    this._dropZone = zone;
    targetHost.classList.add(
      zone === "before"
        ? "is-drop-before"
        : zone === "after"
          ? "is-drop-after"
          : "is-drop-inside",
    );
  }

  private _completeNodeDrag(draggedId: string): void {
    if (!this._dropTargetNodeId || !this._dropZone) {
      return;
    }

    const notebook = this._context.model.toJSON() as INotebookContent;
    const cells = (notebook.cells ?? []) as NotebookCell[];
    const outline = buildNotebookOutline(cells);
    const dropTarget = resolveDropTarget(
      outline,
      draggedId,
      this._dropTargetNodeId,
      this._dropZone,
    );

    if (!dropTarget) {
      return;
    }

    const movedOutline = moveOutlineNode(
      outline,
      draggedId,
      dropTarget.parentId,
      dropTarget.insertIndex,
    );

    if (!movedOutline) {
      return;
    }

    this._applyingNotebookChange = true;

    try {
      applyOutlineToNotebook(this._context.model, movedOutline, cells);
    } finally {
      this._applyingNotebookChange = false;
    }

    this._applyLayout();
  }

  private _clearDragUi(): void {
    this._dragGhost?.remove();
    this._dragGhost = null;
    this._dropTargetNodeId = null;
    this._dropZone = null;
    this._viewport.classList.remove("is-node-dragging");
    this._cellNodes.forEach((node) => {
      node.classList.remove(
        "is-drop-before",
        "is-drop-inside",
        "is-drop-after",
      );
    });
  }

  private _resolveLayoutPosition(
    layout: LayoutPosition,
    nodeId: string,
  ): LayoutPosition {
    const node = this._cellNodes.get(nodeId);
    const height = node?.offsetHeight ?? layout.height;

    return {
      ...layout,
      height,
    };
  }

  private _renderEdges(
    outline: OutlineNode,
    positions: Map<string, LayoutPosition>,
  ): void {
    const edges = collectOutlineEdges(outline, this._collapsedNodes);
    const ns = "http://www.w3.org/2000/svg";

    if (!this._edgesSvg) {
      this._edgesSvg = document.createElementNS(ns, "svg");
      this._edgesSvg.classList.add("jp-KuusiNotebookMindMap-edges");
      this._scene.insertBefore(this._edgesSvg, this._scene.firstChild);
    }

    const svg = this._edgesSvg;
    let defs = svg.querySelector("defs");
    const paths = Array.from(
      svg.querySelectorAll(":scope > path.jp-KuusiNotebookMindMap-edge"),
    );
    const direction = this._appearanceSettings.edgeArrowDirection;
    const style = this._appearanceSettings.edgeArrowStyle;
    const edgeWidth = this._appearanceSettings.edgeWidth;
    const markerKey = `${direction}:${style}:${edgeWidth}`;
    const edgeWidthPx = parseEdgeWidthPx(edgeWidth);

    if (!defs || svg.dataset.kuusiMarkerKey !== markerKey) {
      defs?.remove();
      const markers = appendEdgeArrowDefs(svg, this._appearanceSettings);
      this._edgeMarkerAttrs = markers;
      svg.dataset.kuusiMarkerKey = markerKey;
    }

    const markers = this._edgeMarkerAttrs ?? {};
    const pathData: string[] = [];

    edges.forEach(({ fromId, toId }) => {
      const fromLayout = positions.get(fromId);
      const toLayout = positions.get(toId);

      if (!fromLayout || !toLayout) {
        return;
      }

      const from = this._resolveLayoutPosition(fromLayout, fromId);
      const to = this._resolveLayoutPosition(toLayout, toId);
      pathData.push(buildMindMapEdgePath(from, to, this._treeDirection));
    });

    pathData.forEach((d, index) => {
      let path = paths[index];

      if (!path) {
        path = document.createElementNS(ns, "path");
        path.setAttribute("class", "jp-KuusiNotebookMindMap-edge");
        svg.appendChild(path);
      }

      path.setAttribute("d", d);
      // Keep stroke width in SVG user units so markers stay aligned under zoom.
      path.setAttribute("stroke-width", String(edgeWidthPx));

      if (markers.markerStart) {
        path.setAttribute("marker-start", markers.markerStart);
      } else {
        path.removeAttribute("marker-start");
      }

      if (markers.markerEnd) {
        path.setAttribute("marker-end", markers.markerEnd);
      } else {
        path.removeAttribute("marker-end");
      }
    });

    for (let index = pathData.length; index < paths.length; index += 1) {
      paths[index]?.remove();
    }
  }

  private _applyLayout(): void {
    void this._applyLayoutAsync(++this._layoutGeneration);
  }

  private async _applyLayoutAsync(generation: number): Promise<void> {
    if (this._applyingNotebookChange || !this._notebookAttached) {
      return;
    }

    // Skip layout while editing, unless we still need to place a newly
    // inserted/focused cell on the canvas.
    if (
      this._notebook.mode === "edit" &&
      this._pendingFocusCellIndex === null
    ) {
      return;
    }

    const notebook = this._context.model.toJSON() as INotebookContent;
    const outline = buildNotebookOutline(
      (notebook.cells ?? []) as NotebookCell[],
    );
    this._pruneCollapsedNodes(outline);
    const visibleIds = getVisibleOutlineNodeIds(outline, this._collapsedNodes);
    const visibleCellIndices = collectVisibleCellIndices(
      outline,
      visibleIds,
      this._collapsedNodes,
    );
    const orderedCells = (notebook.cells ?? []) as NotebookCell[];
    let nodeDimensions = await this._collectNodeDimensions(
      visibleCellIndices,
      orderedCells,
      outline,
    );

    if (generation !== this._layoutGeneration || this.isDisposed) {
      return;
    }

    for (let pass = 0; pass < 6; pass += 1) {
      const positions = this._computeLayoutPositions(outline, nodeDimensions);
      const canvasSize = this._positionVisibleCells(
        visibleCellIndices,
        orderedCells,
        outline,
        positions,
      );

      this._renderEdges(outline, positions);
      this._updateCanvasSize(canvasSize.width, canvasSize.height);

      const remeasured = this._remeasureVisibleNodes(visibleCellIndices);
      let changed = false;

      remeasured.forEach((dim, nodeId) => {
        const previous = nodeDimensions.get(nodeId);

        if (
          !previous ||
          Math.abs(dim.height - previous.height) > 2 ||
          Math.abs(dim.width - previous.width) > 2
        ) {
          changed = true;
          nodeDimensions.set(nodeId, dim);
        }
      });

      if (!changed) {
        break;
      }

      if (generation !== this._layoutGeneration || this.isDisposed) {
        return;
      }
    }

    this._lastLayoutDimensions = new Map(nodeDimensions);
    this._syncDimensionCache(
      visibleCellIndices,
      orderedCells,
      nodeDimensions,
    );
    this._updateStatusBar(this._cellNodes.size);
    this._updateSelectedNodeHighlight();
    this._applyTransform();
    this._observeCellNodesForResize();

    // Prefer open focus centering over collapse anchor when both are set.
    if (this._pendingFocusCellIndex !== null) {
      const index = this._pendingFocusCellIndex;
      const shouldCenter = this._pendingFocusCenter;
      const revealAxis = this._pendingFocusRevealAxis;
      this._pendingFocusCellIndex = null;
      this._pendingFocusCenter = false;
      this._pendingFocusRevealAxis = "xy";

      // Keep the pre-insert node fixed through relayout, then nudge only if
      // the new node sits outside the viewport on the relevant axis.
      this._restoreViewportAnchor();

      if (shouldCenter) {
        this._viewportAnchor = null;

        if (!this._centerCellInViewport(index)) {
          this._scheduleCenterOnCell(index);
        } else if (this._pendingOpenCenterIndex === index) {
          this._openCentered = true;
          this._pendingOpenCenterIndex = null;
        }
      } else {
        this._ensureCellVisibleInViewport(index, 48, revealAxis);
      }

      // Layout can move the DOM after edit focus; re-enter if still pending.
      if (this._pendingEditCellIndex === index) {
        void this._enterCellEditMode(index);
      } else if (
        this._notebook.mode === "edit" &&
        this._notebook.activeCellIndex === index
      ) {
        const cell = this._notebook.widgets[index];
        requestAnimationFrame(() => {
          if (
            !this.isDisposed &&
            cell &&
            !cell.isDisposed &&
            this._notebook.mode === "edit" &&
            this._notebook.activeCellIndex === index
          ) {
            cell.editor?.focus();
          }
        });
      }
    } else {
      this._restoreViewportAnchor();
    }

    // Font/settings relayout after open must not leave the startup cell off-center.
    this._finishOpenCenterIfNeeded();
  }

  private async _enterCellEditModeWhenReady(index: number): Promise<void> {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (this.isDisposed) {
        return;
      }

      const cell = this._notebook.widgets[index];

      if (cell && !cell.isDisposed) {
        await this._enterCellEditMode(index);
        return;
      }

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, attempt < 4 ? 0 : 16);
      });
    }

    if (this._pendingEditCellIndex === index) {
      this._pendingEditCellIndex = null;
    }
  }

  private _computeLayoutPositions(
    outline: OutlineNode,
    nodeDimensions: Map<string, { width: number; height: number }>,
  ): Map<string, LayoutPosition> {
    return new Map(
      layoutOutlineTree(outline, {
        direction: this._treeDirection,
        collapsedIds: this._collapsedNodes,
        density: this._layoutDensity,
        siblingGap: this._siblingGap,
        childGap: this._childGap,
        nodeDimensions,
      }).map((item) => [item.id, item]),
    );
  }

  private _positionVisibleCells(
    visibleCellIndices: Set<number>,
    orderedCells: NotebookCell[],
    outline: OutlineNode,
    positions: Map<string, LayoutPosition>,
  ): { width: number; height: number } {
    this._cellNodes.clear();
    let maxX = 0;
    let maxY = 0;

    this._notebook.widgets.forEach((cell, index) => {
      const nodeId = `cell-${index}`;
      const layout = positions.get(nodeId);
      const show = visibleCellIndices.has(index) && layout;
      const notebookCell = orderedCells[index];

      if (!show) {
        cell.node.style.display = "none";
        return;
      }

      if (cell.node.parentElement !== this._scene) {
        this._scene.appendChild(cell.node);
      }

      cell.node.dataset.nodeId = nodeId;
      cell.node.classList.add("jp-KuusiNotebookMindMap-cellNode");
      this._prepareCellForDisplay(cell, index);
      this._ensureDragHandle(cell.node);
      this._ensureResizeHandle(cell.node);

      if (notebookCell) {
        const outlineNode = this._findOutlineNodeById(outline, nodeId);
        applyNodeFrameToElement(
          cell.node,
          notebookCell,
          outlineNode?.headingLevel ?? null,
        );
        this._ensureCollapseControl(cell.node, outlineNode);
      } else {
        this._ensureCollapseControl(cell.node, null);
      }

      cell.node.style.display = "";
      cell.node.style.position = "absolute";
      cell.node.style.visibility = "visible";
      cell.node.style.left = `${layout.x}px`;
      cell.node.style.top = `${layout.y}px`;
      cell.node.style.width = `${layout.width}px`;
      cell.node.style.margin = "0";
      cell.node.style.zIndex = "1";

      const renderedHeight = this._measureNodeHeight(cell.node);

      maxX = Math.max(maxX, layout.x + layout.width);
      maxY = Math.max(maxY, layout.y + renderedHeight);
      this._cellNodes.set(nodeId, cell.node);
      cell.editorWidget?.update();
    });

    return {
      width: Math.max(maxX + 48, 800),
      height: Math.max(maxY + 48, 600),
    };
  }

  private _updateCanvasSize(width: number, height: number): void {
    if (this._edgesSvg) {
      this._edgesSvg.setAttribute("width", String(width));
      this._edgesSvg.setAttribute("height", String(height));
      this._edgesSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    this._scene.style.width = `${width}px`;
    this._scene.style.height = `${height}px`;
  }

  private _measureNodeHeight(node: HTMLElement): number {
    return Math.max(node.offsetHeight, node.scrollHeight);
  }

  private _isCellEditingMarkdown(cell: Cell, index: number): boolean {
    if (!(cell instanceof MarkdownCell)) {
      return false;
    }

    // Protect insert→edit races: layout must not force-render this cell.
    if (this._pendingEditCellIndex === index) {
      return true;
    }

    return (
      this._notebook.activeCellIndex === index &&
      this._notebook.mode === "edit" &&
      !cell.rendered
    );
  }

  private async _ensureCellReadyForMeasure(
    cell: Cell,
    index: number,
  ): Promise<void> {
    await cell.ready;

    if (cell instanceof MarkdownCell && !this._isCellEditingMarkdown(cell, index)) {
      if (!cell.rendered) {
        await new Promise<void>((resolve) => {
          const handler = (_sender: MarkdownCell, rendered: boolean) => {
            if (rendered) {
              cell.renderedChanged.disconnect(handler);
              resolve();
            }
          };

          cell.renderedChanged.connect(handler);
          cell.rendered = true;
        });
      }
    }

    if (cell instanceof CodeCell) {
      cell.outputHidden = false;
    }

    cell.editorWidget?.update();

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }

  private _getMeasureHost(): HTMLElement {
    if (!this._measureHost) {
      this._measureHost = document.createElement("div");
      this._measureHost.className = "jp-KuusiMindMap-measure-host";
      this._viewport.appendChild(this._measureHost);
    }

    return this._measureHost;
  }

  private _syncDimensionCache(
    visibleCellIndices: Set<number>,
    orderedCells: NotebookCell[],
    nodeDimensions: Map<string, { width: number; height: number }>,
  ): void {
    this._notebook.widgets.forEach((cell, index) => {
      if (!visibleCellIndices.has(index)) {
        return;
      }

      const dimensions = nodeDimensions.get(`cell-${index}`);

      if (dimensions) {
        this._dimensionCacheByModelId.set(cell.model.id, dimensions);
      }
    });
  }

  private async _measureCellDimensions(
    cell: Cell,
    index: number,
    outline: OutlineNode,
    orderedCells: NotebookCell[],
    defaultWidth: number,
  ): Promise<{ width: number; height: number } | null> {
    const node = cell.node;
    const nodeId = `cell-${index}`;

    // Prefer measuring in place. Moving nodes into the off-screen measure host
    // detaches them from the scene for a few frames and causes visible flash
    // when syncing notebook edits in a split view.
    if (
      node.isConnected &&
      node.parentElement !== this._measureHost &&
      node.parentElement !== null
    ) {
      return this._measureConnectedCellDimensions(
        cell,
        index,
        outline,
        orderedCells,
        defaultWidth,
      );
    }

    const host = this._getMeasureHost();
    const parent = node.parentElement;
    const snapshot = {
      display: node.style.display,
      position: node.style.position,
      visibility: node.style.visibility,
      left: node.style.left,
      top: node.style.top,
      width: node.style.width,
      margin: node.style.margin,
    };

    host.appendChild(node);
    node.dataset.nodeId = nodeId;
    node.classList.add("jp-KuusiNotebookMindMap-cellNode");

    const notebookCell = orderedCells[index];

    if (notebookCell) {
      const outlineNode = this._findOutlineNodeById(outline, nodeId);
      applyNodeFrameToElement(
        node,
        notebookCell,
        outlineNode?.headingLevel ?? null,
      );
    }

    node.style.display = "";
    node.style.position = "absolute";
    node.style.visibility = "hidden";
    node.style.left = "0";
    node.style.top = "0";
    node.style.width = `${defaultWidth}px`;
    node.style.margin = "0";

    await this._ensureCellReadyForMeasure(cell, index);

    const height = this._measureNodeHeight(node);
    const dimensions =
      height > 0 ? { width: defaultWidth, height } : null;

    if (parent) {
      parent.appendChild(node);
    }

    node.style.display = snapshot.display;
    node.style.position = snapshot.position;
    node.style.visibility = snapshot.visibility;
    node.style.left = snapshot.left;
    node.style.top = snapshot.top;
    node.style.width = snapshot.width;
    node.style.margin = snapshot.margin;

    return dimensions;
  }

  private async _measureConnectedCellDimensions(
    cell: Cell,
    index: number,
    outline: OutlineNode,
    orderedCells: NotebookCell[],
    defaultWidth: number,
  ): Promise<{ width: number; height: number } | null> {
    const node = cell.node;
    const nodeId = `cell-${index}`;
    const notebookCell = orderedCells[index];
    const previousWidth = node.style.width;

    node.dataset.nodeId = nodeId;
    node.classList.add("jp-KuusiNotebookMindMap-cellNode");

    if (notebookCell) {
      const outlineNode = this._findOutlineNodeById(outline, nodeId);
      applyNodeFrameToElement(
        node,
        notebookCell,
        outlineNode?.headingLevel ?? null,
      );
    }

    if (cell instanceof MarkdownCell && !this._isCellEditingMarkdown(cell, index)) {
      if (!cell.rendered) {
        await new Promise<void>((resolve) => {
          const handler = (_sender: MarkdownCell, rendered: boolean) => {
            if (rendered) {
              cell.renderedChanged.disconnect(handler);
              resolve();
            }
          };

          cell.renderedChanged.connect(handler);
          cell.rendered = true;
        });
      }
    }

    if (cell instanceof CodeCell) {
      cell.outputHidden = false;
    }

    node.style.width = `${defaultWidth}px`;

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const height = this._measureNodeHeight(node);

    // Keep the measured width — layout will set the same default width next.
    // Restoring a stale empty width can flash the node during split-view sync.
    if (!previousWidth) {
      node.style.width = `${defaultWidth}px`;
    } else {
      node.style.width = previousWidth;
    }

    return height > 0 ? { width: defaultWidth, height } : null;
  }

  private async _collectNodeDimensions(
    visibleCellIndices: Set<number>,
    orderedCells: NotebookCell[],
    outline: OutlineNode,
  ): Promise<Map<string, { width: number; height: number }>> {
    const dimensions = new Map<string, { width: number; height: number }>();
    const measureTasks: Promise<void>[] = [];

    this._notebook.widgets.forEach((cell, index) => {
      if (!visibleCellIndices.has(index)) {
        return;
      }

      const nodeId = `cell-${index}`;
      const resolvedWidth = this._resolveNodeWidth(cell.model, nodeId);
      const cached = this._dimensionCacheByModelId.get(cell.model.id);

      if (cached && cached.width === resolvedWidth) {
        dimensions.set(nodeId, cached);
        return;
      }

      measureTasks.push(
        this._measureCellDimensions(
          cell,
          index,
          outline,
          orderedCells,
          resolvedWidth,
        ).then((measured) => {
          if (measured) {
            dimensions.set(nodeId, measured);
            this._dimensionCacheByModelId.set(cell.model.id, measured);
          }
        }),
      );
    });

    await Promise.all(measureTasks);

    return dimensions;
  }

  private _remeasureVisibleNodes(
    visibleCellIndices: Set<number>,
  ): Map<string, { width: number; height: number }> {
    const dimensions = new Map<string, { width: number; height: number }>();

    this._notebook.widgets.forEach((cell, index) => {
      if (!visibleCellIndices.has(index)) {
        return;
      }

      const nodeId = `cell-${index}`;
      const width = this._resolveNodeWidth(cell.model, nodeId);
      const height = this._measureNodeHeight(cell.node);

      if (height > 0) {
        const measured = { width, height };
        dimensions.set(nodeId, measured);
        this._dimensionCacheByModelId.set(cell.model.id, measured);
      }
    });

    return dimensions;
  }

  private _observeCellNodesForResize(): void {
    if (!this._resizeObserver) {
      this._resizeObserver = new ResizeObserver((entries) => {
        if (this._applyingNotebookChange) {
          return;
        }

        let needsRelayout = false;

        for (const entry of entries) {
          const node = entry.target as HTMLElement;
          const nodeId = node.dataset.nodeId;

          if (!nodeId) {
            continue;
          }

          const layoutHeight = this._lastLayoutDimensions.get(nodeId)?.height ?? 0;
          const contentHeight = entry.contentRect.height;

          if (Math.abs(contentHeight - layoutHeight) > 4) {
            const index = Number.parseInt(nodeId.slice("cell-".length), 10);
            const cell = this._notebook.widgets[index];

            if (cell) {
              this._dimensionCacheByModelId.delete(cell.model.id);
            }

            needsRelayout = true;
            break;
          }
        }

        if (needsRelayout) {
          this._scheduleResizeRelayout();
        }
      });
    }

    this._resizeObserver.disconnect();

    this._cellNodes.forEach((node) => {
      this._resizeObserver?.observe(node);
    });
  }

  private _scheduleResizeRelayout(): void {
    if (this._notebook.mode === "edit") {
      return;
    }

    if (this._resizeLayoutTimer !== null) {
      window.clearTimeout(this._resizeLayoutTimer);
    }

    this._resizeLayoutTimer = window.setTimeout(() => {
      this._resizeLayoutTimer = null;

      if (!this.isDisposed && this._notebook.mode !== "edit") {
        void this._applyLayoutAsync(++this._layoutGeneration);
      }
    }, 150);
  }

  private _findOutlineNodeById(
    root: OutlineNode,
    nodeId: string,
  ): OutlineNode | null {
    const visit = (node: OutlineNode): OutlineNode | null => {
      if (node.id === nodeId) {
        return node;
      }

      for (const child of node.children) {
        const found = visit(child);

        if (found) {
          return found;
        }
      }

      return null;
    };

    return visit(root);
  }
}

export class NotebookMindMapDocumentWidget extends DocumentWidget<NotebookMindMapWidget> {
  constructor(options: DocumentWidget.IOptions<NotebookMindMapWidget>) {
    super(options);
    this.addClass("jp-KuusiNotebookMindMapDocument");
    this.toolbar.addClass("jp-NotebookPanel-toolbar");
  }
}

export class NotebookMindMapWidgetFactory extends ABCWidgetFactory<
  NotebookMindMapDocumentWidget,
  INotebookModel
> {
  static readonly NAME = "Kuusi Mind Map";

  constructor(
    private _rendermime: IRenderMimeRegistry,
    private _contentFactory: NotebookPanel.IContentFactory,
    private _mimeTypeService: IEditorMimeTypeService,
    private _commands: CommandRegistry,
    private _settingsManager: MindMapSettingsManager,
    private _kuusiTranslator: ITranslator,
    toolbarFactory?: (
      widget: NotebookMindMapDocumentWidget,
    ) =>
      | DocumentRegistry.IToolbarItem[]
      | IObservableList<DocumentRegistry.IToolbarItem>,
  ) {
    super({
      name: NotebookMindMapWidgetFactory.NAME,
      modelName: "notebook",
      fileTypes: ["notebook"],
      toolbarFactory,
      preferKernel: true,
      canStartKernel: true,
    });
  }

  protected createNewWidget(
    context: DocumentRegistry.IContext<INotebookModel>,
  ): NotebookMindMapDocumentWidget {
    const content = new NotebookMindMapWidget(
      context,
      this._rendermime,
      this._contentFactory,
      this._mimeTypeService,
      this._commands,
      this._settingsManager,
      this._kuusiTranslator,
    );
    return new NotebookMindMapDocumentWidget({ content, context });
  }
}

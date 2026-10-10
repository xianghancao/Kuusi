import type { ICellModel } from "@jupyterlab/cells";
import { Cell, CodeCell, MarkdownCell } from "@jupyterlab/cells";
import type { IEditorMimeTypeService } from "@jupyterlab/codeeditor";
import {
  DocumentRegistry,
} from "@jupyterlab/docregistry";
import { CommandRegistry } from "@lumino/commands";
import type { INotebookModel } from "@jupyterlab/notebook";
import { Notebook, NotebookActions, NotebookPanel } from "@jupyterlab/notebook";
import { Notification } from "@jupyterlab/apputils";
import type { CellList } from "@jupyterlab/notebook/lib/celllist";
import type { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import {
  type DocumentContextResolver,
  refreshMarkdownImageSources,
  wrapDocumentUrlResolver,
} from "./markdownResourceUrls";
import type { IObservableList } from "@jupyterlab/observables";
import type { Contents } from "@jupyterlab/services";
import { Message, MessageLoop } from "@lumino/messaging";
import { Widget } from "@lumino/widgets";
import {
  CommandToolbarButton,
  redoIcon,
  undoIcon,
} from "@jupyterlab/ui-components";
import {
  buildNotebookOutline,
  buildMindMapEdgePath,
  collectOutlineEdges,
  countOutlineDescendants,
  getLayoutGapsForDensity,
  getVisibleOutlineNodeIds,
  layoutOutlineTree,
  LAYOUT_NODE_WIDTH,
  collectOutlineSelectionRoots,
  resolveDropTarget,
  findSpatialNavigationTarget,
  outlineVisualHeadingLevel,
  applyNodeFrameToElement,
  type LayoutPosition,
  type NotebookCell,
  type OutlineNode,
  type LayoutDensity,
  type TreeDirection,
} from "kuusi-kernel";
import {
  snapshotCellModel,
  snapshotNotebookCells,
} from "./notebookCells";
import { createFormatToolbar, type FormatToolbarHandle } from "./formatToolbar";
import { handleFormatShortcut } from "./formatKeyboard";
import {
  applyAppearanceToScene,
  appendEdgeArrowDefs,
  createAppearanceToolbar,
  DEFAULT_APPEARANCE,
  parseEdgeWidthPx,
  resolveNodeBorderRadius,
  resolveNodeForeground,
  type AppearanceSettings,
  type AppearanceToolbarHandle,
} from "./appearanceToolbar";
import { createMindMapLayoutToolbar } from "./mindMapLayoutCapsule";
import { createKeyedReset } from "./menuFooter";
import { getMindMapRootNode } from "kuusi-kernel";
import { applyLevelStyleToNode, levelIdForDepth } from "./levelStyles";
import {
  DEFAULT_VIEW_BEHAVIOR,
  loadSavedView,
  saveView,
  type ViewBehaviorSettings,
} from "./viewBehavior";
import {
  branchEdgeColor,
  computeEdgeInfo,
  taperedEdgeWidth,
} from "./edgeStyling";
import {
  readCellFrameStyle,
  readCellNodeFill,
  writeCellNodeFill,
} from "./nodeFrameStyle";
import {
  DEFAULT_BODY_FONT_SIZE_PX,
  DEFAULT_MIND_MAP_FONT,
  type BodyFontSizePx,
  type MindMapFont,
} from "./fontToolbar";
import { createMindMapTypographyModel } from "./mindMapMenus";
import { createTypographyCapsuleItems } from "./typographyCapsule";
import {
  applyBackgroundToViewport,
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
  getThemePresetSettings,
  type MindMapTheme,
} from "./styleToolbar";
import { presetMatches } from "./themeRestore";
import { formatContentsModified } from "./formatModifiedTime";
import { attachNotebookAutoReload } from "./notebookAutoReload";
import {
  getNotebookAutoReloadEnabled,
  registerNotebookAutoReloadListener,
} from "./notebookAutoReloadRegistry";
import { createMindMapShortcutMenu } from "./keyboardGuide";
import { createPageToolbar, type PageToolbarItem } from "./pageToolbar";
import { closeKuusiDropdownMenus, positionKuusiDropdownMenu } from "./formatToolbar";
import { modKeyLabel } from "./keyboardGuide";
import {
  commitActiveMindMapCell,
  ensureMindMapRoot,
  handleMindMapShortcut,
  isMindMapEditingText,
  pasteMindMapClipboard,
} from "./mindMapKeyboard";
import {
  applyMindMapTypography,
  DEFAULT_MIND_MAP_USER_SETTINGS,
  mindMapTypographyGeometryKey,
  MindMapSettingsManager,
  scopeSettingsManager,
  type MindMapUserSettings,
} from "./mindMapSettings";
import {
  clampNodeWidth,
  readCellNodeWidth,
  writeCellNodeWidth,
} from "./nodeWidth";
import { createKuusiTranslator, type KuusiTranslator } from "./kuusiI18n";
import {
  dragHasFiles,
  imageFilesFromDrop,
  imageMarkdown,
  saveImageNextToDocument,
} from "./mindMapImageDrop";
import type { RenderViewChromeHandle } from "./renderViewChrome";
import { mountRenderViewChrome } from "./renderViewChrome";
import { countTextStats, resolveFileBytes } from "./statusStats";
import type { ITranslator } from "@jupyterlab/translation";

import {
  CELL_DOUBLE_TAP_MS,
  CELL_EDIT_ENTRY_GUARD_MS,
  DRAG_THRESHOLD_PX,
  TOUCH_DRAG_HOLD_MS,
  KUUSI_ADD_MINDMAP_COMMAND,
  KUUSI_OPEN_MARKDOWN_EDITOR_COMMAND,
  TREE_DIRECTION_LABELS,
  VIEWPORT_PAN_LOCK_AFTER_PAN_MS,
  VIEWPORT_PAN_LOCK_MS,
  ZOOM_BASE,
  ZOOM_PERCENT_STEP,
  ZOOM_WHEEL_MAX_STEP,
  ZOOM_WHEEL_SENSITIVITY,
  appearanceEquals,
  collectVisibleCellIndices,
  percentToZoom,
  zoomToPercent,
  type MindMapSourceKind,
} from "./notebookMindMapTypes";
import {
  MindMapNodeDragController,
  type MindMapDragState,
} from "./mindMapNodeDrag";
import { MindMapViewportController } from "./mindMapViewportController";

export {
  KUUSI_ADD_MINDMAP_COMMAND,
  KUUSI_OPEN_MARKDOWN_EDITOR_COMMAND,
  KUUSI_OPEN_NOTEBOOK_VIEW_COMMAND,
  type MindMapSourceKind,
} from "./notebookMindMapTypes";

const setIfChanged = (el: Element, name: string, value: string): void => {
  if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
};

export class NotebookMindMapWidget extends Widget {
  private _notebook: Notebook;
  private _notebookMount: HTMLElement;
  private _viewport: HTMLElement;
  private _scene: HTMLElement;
  private _edgesSvg: SVGSVGElement | null = null;
  private _cellNodes = new Map<string, HTMLElement>();

  private _imageDropNode: HTMLElement | null = null;
  private _treeDirection: TreeDirection = "LR";
  private _layoutDensity: LayoutDensity = "normal";
  private _siblingGap = 22;
  private _childGap = 52;
  private _equalNodeWidth = false;
  private _adaptiveNodeWidth = false;
  private _nodeWidth: number = LAYOUT_NODE_WIDTH.default;
  /** Last adaptive widths by node id (content-fit, capped by `_nodeWidth`). */
  private _resolvedAdaptiveWidths = new Map<string, number>();
  private _collapsedNodes = new Set<string>();
  private _applyingNotebookChange = false;
  private _drag!: MindMapNodeDragController;
  private _resizeState: {
    nodeId: string;
    pointerId: number;
    startX: number;
    startWidth: number;
    currentWidth: number;
  } | null = null;
  private _resizeLayoutRaf: number | null = null;
  /** Used when pointer capture steals the target from scene dblclick. */
  private _lastCellTap: { nodeId: string; at: number } | null = null;
  /** Ignore the synthetic click that follows a completed node drag. */
  private _suppressCellClickUntil = 0;
  /** Block preview restore while a double-click edit session is mounting. */
  private _editEntryGuardIndex = -1;
  private _editEntryGuardUntil = 0;
  private _enterCellEditModeTarget = -1;
  private _enterCellEditModePromise: Promise<void> | null = null;
  /**
   * Keep pan fixed across the post-drop relayout (and notebook sync that would
   * otherwise scroll the dragged node into view).
   * Held pan / open-center follow / pan lock live on {@link _viewportCtrl}.
   */
  private _viewportCtrl!: MindMapViewportController;
  private _dragWindowListening = false;
  private _touchPoints = new Map<number, { x: number; y: number }>();
  private _pinch: {
    distance: number;
    zoom: number;
    worldX: number;
    worldY: number;
  } | null = null;
  private _panX = 0;
  private _panY = 0;
  private _zoom = ZOOM_BASE;
  private _viewBehavior: ViewBehaviorSettings = { ...DEFAULT_VIEW_BEHAVIOR };
  /** The first open-center request decides the initial camera (see openView). */
  private _openViewApplied = false;
  private _pendingFit = false;
  private _viewSavingEnabled = false;
  private _viewSaveTimer: number | null = null;
  private _isPanning = false;
  private _panPointerId: number | null = null;
  private _panStart = { x: 0, y: 0, panX: 0, panY: 0 };
  private _revealCellInNotebook: ((cellIndex: number) => void) | null = null;
  private _syncMarkdownToNotebook: ((cellIndex: number) => void) | null = null;
  private _getSourceActiveCellIndex: (() => number) | null = null;
  private _notebookAttached = false;
  private _contentChangeTimer: number | null = null;
  private _statusModifiedEl: HTMLElement;
  private _showUpdatedTimestamp = true;
  private _showNodeCount = true;
  private _showTextCount = false;
  private _showPageCount = false;
  private _showFileSize = false;
  private _renderChrome: RenderViewChromeHandle | null = null;
  /** Cache the owning document tab widget (used for Kuusi-window fullscreen). */
  private _documentWidget: Widget | null = null;
  private _edgeMarkerAttrs: { markerStart?: string; markerEnd?: string } | null =
    null;
  private _formatToolbar: FormatToolbarHandle | null = null;
  private _appearanceToolbar: AppearanceToolbarHandle | null = null;
  private _addMindMapButton: CommandToolbarButton | null = null;
  private _openNotebookButton: CommandToolbarButton | null = null;
  private _undoButton: HTMLButtonElement | null = null;
  private _redoButton: HTMLButtonElement | null = null;
  private _undoManagerCleanup: (() => void) | null = null;
  private _appearanceSettings: AppearanceSettings = { ...DEFAULT_APPEARANCE };
  private _mindMapTheme: MindMapTheme = DEFAULT_MIND_MAP_THEME;
  private _mindMapBackground: MindMapBackground = DEFAULT_MIND_MAP_BACKGROUND;
  private _mindMapBackgroundPattern = DEFAULT_MIND_MAP_BACKGROUND_PATTERN;
  private _mindMapBackgroundColor = DEFAULT_MIND_MAP_BACKGROUND_COLOR;
  private _mindMapEditFont: MindMapFont = DEFAULT_MIND_MAP_FONT;
  private _mindMapDisplayFont: MindMapFont = DEFAULT_MIND_MAP_FONT;
  private _mindMapEditFontSize: BodyFontSizePx = DEFAULT_BODY_FONT_SIZE_PX;
  private _mindMapDisplayFontSize: BodyFontSizePx = DEFAULT_BODY_FONT_SIZE_PX;
  private _unifyEditDisplayFont = false;
  private _matchNotebookFont = false;
  private _typographyGeometryKey = mindMapTypographyGeometryKey(
    DEFAULT_MIND_MAP_USER_SETTINGS,
  );
  private _layoutGeneration = 0;
  private _layoutFrame: number | null = null;
  /** Avoid re-seeding if an empty notebook somehow still has no H1 after mutate. */
  private _mindMapRootSeeded = false;
  private _lastLayoutDimensions = new Map<
    string,
    { width: number; height: number }
  >();
  private _lastOutline: OutlineNode | null = null;
  private _lastLayoutPositions: Map<string, LayoutPosition> | null = null;
  private _cachedOutlineCells: NotebookCell[] | null = null;
  private _cachedOutline: OutlineNode | null = null;
  private _previousVisibleCellIndices = new Set<number>();
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
  /** Accumulated wheel deltas applied once per animation frame. */
  private _wheelPanPending = { dx: 0, dy: 0 };
  private _wheelPanFrame: number | null = null;
  private _t: KuusiTranslator;
  private _settingsManager: MindMapSettingsManager;
  private _disposeSettingsScope: (() => void) | null = null;
  private _contentVisibleObserver: ResizeObserver | null = null;
  private _contentVisibleTimer: number | null = null;
  private _settingsConn: { disconnect: () => void } | null = null;
  private _autoReloadListenerDispose: (() => void) | null = null;
  private _autoReloadHandle: ReturnType<typeof attachNotebookAutoReload> | null =
    null;
  private _lastModifiedLabel = "";
  private _sourceKind: MindMapSourceKind;
  private _documentUrlResolver: DocumentContextResolver;


  private _createDragHost(): import("./mindMapNodeDrag").MindMapDragHost {
    const self = this;
    return {
      get cellNodes() {
        return self._cellNodes;
      },
      get scene() {
        return self._scene;
      },
      get viewport() {
        return self._viewport;
      },
      get zoom() {
        return self._zoom;
      },
      get panX() {
        return self._panX;
      },
      get panY() {
        return self._panY;
      },
      get treeDirection() {
        return self._treeDirection;
      },
      get siblingGap() {
        return self._siblingGap;
      },
      get childGap() {
        return self._childGap;
      },
      get notebook() {
        return self._notebook;
      },
      get context() {
        return self._context;
      },
      get applyingNotebookChange() {
        return self._applyingNotebookChange;
      },
      get pendingFocusCellIndex() {
        return self._pendingFocusCellIndex;
      },
      get pendingFocusCenter() {
        return self._pendingFocusCenter;
      },
      get viewportAnchor() {
        return self._viewportAnchor;
      },
      getOutlineSnapshot: () => self._getOutlineSnapshot(),
      getSelectedNodeIds: () => self._getSelectedNodeIds(),
      getCellIndexFromNodeId: (id) => self._getCellIndexFromNodeId(id),
      applyLayout: () => self._applyLayout(),
      invalidateOutlineCache: () => self._invalidateOutlineCache(),
      refreshEdgesFromCache: () => self._refreshEdgesFromCache(),
      selectCellsByModelIds: (ids, active) =>
        self._selectCellsByModelIds(ids, active),
      cancelCenterFollow: () => self._viewportCtrl.cancelCenterFollow(),
      holdViewportPan: () => self._viewportCtrl.holdPan(),
      lockViewportPan: (ms) => self._viewportCtrl.lockPan(ms),
      setApplyingNotebookChange: (v) => {
        self._applyingNotebookChange = v;
      },
      setPendingFocusCellIndex: (v) => {
        self._pendingFocusCellIndex = v;
      },
      setPendingFocusCenter: (v) => {
        self._pendingFocusCenter = v;
      },
      setViewportAnchor: (v) => {
        self._viewportAnchor = v;
      },
    };
  }

  constructor(
    private _context: DocumentRegistry.IContext<INotebookModel>,
    private _rendermime: IRenderMimeRegistry,
    private _contentFactory: NotebookPanel.IContentFactory,
    private _mimeTypeService: IEditorMimeTypeService,
    private _commands: CommandRegistry,
    settingsManager: MindMapSettingsManager,
    translator: ITranslator,
    private _contents: Contents.IManager,
    sourceKind: MindMapSourceKind = "notebook",
  ) {
    super();
    this._drag = new MindMapNodeDragController(this._createDragHost());
    this._sourceKind = sourceKind;
    const scoped = scopeSettingsManager(settingsManager);
    this._settingsManager = scoped.manager;
    this._disposeSettingsScope = scoped.dispose;
    this._t = createKuusiTranslator();
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

    // ipynb views: no "Notebook" switch button. Markdown keeps "Editor".
    if (this._sourceKind === "markdown") {
      this._openNotebookButton = new CommandToolbarButton({
        commands: this._commands,
        id: KUUSI_OPEN_MARKDOWN_EDITOR_COMMAND,
        args: { path: this._context.path },
      });
      this._openNotebookButton.addClass("jp-KuusiNotebookOpenButton");
    }

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
          adaptiveNodeWidth: this._adaptiveNodeWidth,
          nodeWidth: this._nodeWidth,
        }),
        onChange: (widthState) => {
          void this._settingsManager.update(widthState);
        },
      },
      this._t,
    );

    const typography = createMindMapTypographyModel(this._settingsManager);
    const pageItems: PageToolbarItem[] = [
      {
        id: "brand",
        group: "brand",
        order: 10,
        create: () => createMindMapShortcutMenu(this.node, this._t),
      },
      ...(this._openNotebookButton
        ? [
            {
              id: "open-notebook",
              group: "brand" as const,
              order: 12,
              create: () => this._openNotebookButton!.node,
            },
          ]
        : []),
      {
        id: "add-node",
        group: "structure",
        order: 10,
        create: () => this._addMindMapButton!.node,
      },
      {
        id: "history",
        group: "structure",
        order: 15,
        create: () => this._createHistoryToolbar(),
      },
      {
        id: "layout",
        group: "structure",
        order: 30,
        create: () =>
          createMindMapLayoutToolbar(
            this.node,
            {
              viewBehavior: {
                get: () => this._viewBehavior,
                update: (partial) => {
                  void this._settingsManager.update(partial);
                },
              },
              customization: (() => {
                const layoutReset = createKeyedReset<MindMapUserSettings>({
                  keys: [
                    "treeDirection",
                    "layoutDensity",
                    "siblingGap",
                    "childGap",
                    "background",
                    "backgroundPattern",
                    "backgroundColor",
                  ],
                  getSettings: () => this._settingsManager.settings,
                  baseline: (settings) => ({
                    ...DEFAULT_MIND_MAP_USER_SETTINGS,
                    ...getThemePresetSettings(settings.theme),
                  }),
                  update: (partial) => this._settingsManager.update(partial),
                });

                return {
                  ...layoutReset,
                  connect: (listener: () => void) =>
                    this._settingsManager.changed.connect(listener),
                };
              })(),
              getTreeDirection: () => this._treeDirection,
              onTreeDirectionChange: (treeDirection) => {
                void this._settingsManager.update({ treeDirection });
              },
              directionOptions: (
                Object.keys(TREE_DIRECTION_LABELS) as TreeDirection[]
              ).map((value) => ({
                value,
                label: TREE_DIRECTION_LABELS[value],
                title: this._getTreeDirectionTitle(value),
              })),
              getLayoutState: () => ({
                density: this._layoutDensity,
                siblingGap: this._siblingGap,
                childGap: this._childGap,
              }),
              onDensityChange: (density) => {
                const gaps = getLayoutGapsForDensity(density);
                void this._settingsManager.update({
                  layoutDensity: density,
                  siblingGap: gaps.siblingGap,
                  childGap: gaps.childGap,
                });
              },
              onGapChange: (gaps) => {
                void this._settingsManager.update(gaps);
              },
              getBackgroundState: () => ({
                background: this._mindMapBackground,
                backgroundPattern: this._mindMapBackgroundPattern,
                backgroundColor: this._mindMapBackgroundColor,
              }),
              onBackgroundChange: (state) => {
                void this._settingsManager.update({
                  background: state.background,
                  backgroundPattern: state.backgroundPattern,
                  backgroundColor: state.backgroundColor,
                });
              },
              backgroundDisplay: {
                getShowUpdatedTimestamp: () => this._showUpdatedTimestamp,
                onShowUpdatedTimestampChange: (show) => {
                  void this._settingsManager.update({
                    showUpdatedTimestamp: show,
                  });
                },
                getShowNodeCount: () => this._showNodeCount,
                onShowNodeCountChange: (show) => {
                  void this._settingsManager.update({ showNodeCount: show });
                },
                getShowTextCount: () => this._showTextCount,
                onShowTextCountChange: (show) => {
                  void this._settingsManager.update({ showTextCount: show });
                },
                getShowPageCount: () => this._showPageCount,
                onShowPageCountChange: (show) => {
                  void this._settingsManager.update({ showPageCount: show });
                },
                getShowFileSize: () => this._showFileSize,
                onShowFileSizeChange: (show) => {
                  void this._settingsManager.update({ showFileSize: show });
                },
              },
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
            {
              isCustomized: () =>
                !presetMatches(
                  this._settingsManager.settings,
                  getThemePresetSettings(this._mindMapTheme),
                ),
              preview: (theme) =>
                this._settingsManager.setPreview(
                  theme ? buildThemeSettingsUpdate(theme) : null,
                ),
              connect: (listener) =>
                this._settingsManager.changed.connect(listener),
            },
          ),
      },
      ...createTypographyCapsuleItems(this.node, typography, this._t, {
        orderStart: 20,
        orderStep: 2,
      }),
      {
        id: "node",
        group: "appearance",
        order: 30,
        create: () => this._appearanceToolbar!.node,
      },
      {
        id: "line",
        group: "appearance",
        order: 32,
        create: () => this._appearanceToolbar!.lineNode,
      },
    ];

    // Keep room for the vertical Aa strip (44 px) plus its gap.
    const pageToolbar = createPageToolbar(pageItems, this._t, undefined, {
      menuRoot: this.node,
      reserveRight: 54,
    });
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
    this._bindHeaderLayout();

    this._viewport = document.createElement("div");
    this._viewport.className = "jp-KuusiNotebookMindMap-viewport";
    this._viewport.tabIndex = -1;
    {
      const widget = this;
      this._viewportCtrl = new MindMapViewportController({
        get isDisposed() {
          return widget.isDisposed;
        },
        get viewport() {
          return widget._viewport;
        },
        get root() {
          return widget.node;
        },
        get cellNodes() {
          return widget._cellNodes;
        },
        get panX() {
          return widget._panX;
        },
        get panY() {
          return widget._panY;
        },
        get zoom() {
          return widget._zoom;
        },
        setPan: (x, y) => {
          widget._panX = x;
          widget._panY = y;
        },
        applyTransform: () => widget._applyTransform(),
        get pendingFocusCellIndex() {
          return widget._pendingFocusCellIndex;
        },
        get pendingFocusCenter() {
          return widget._pendingFocusCenter;
        },
      });
    }
    this._viewportCtrl.ensureSizeObserver();

    this._scene = document.createElement("div");
    this._scene.className =
      "jp-KuusiNotebookMindMap-scene jp-Notebook jp-KuusiMindMapNotebook-scene";
    this._viewport.appendChild(this._scene);
    this._watchContentVisible();
    this._applyScenePresentation();
    this._applyBackground();

    this._statusModifiedEl = document.createElement("div");
    this._statusModifiedEl.className =
      "jp-KuusiNotebookMindMap-status-updated";
    this._statusModifiedEl.setAttribute("aria-live", "polite");
    this._viewport.appendChild(this._statusModifiedEl);

    this._renderChrome = mountRenderViewChrome({
      host: this._viewport,
      owner: this,
      t: this._t,
      showNodeCount: this._showNodeCount,
      showTextCount: this._showTextCount,
      showPageCount: this._showPageCount,
      showFileSize: this._showFileSize,
      documentClassName: "jp-KuusiNotebookMindMapDocument",
      getZoomPercent: () => this._zoomToPercent(this._zoom),
      setZoomPercent: (percent) => {
        this._setZoomPercent(percent);
      },
      minZoom: this._viewBehavior.zoomMinPercent,
      maxZoom: this._viewBehavior.zoomMaxPercent,
      onFit: () => {
        this.fitToView();
      },
      onCloseMenus: () => {
            closeKuusiDropdownMenus(this.node);
      },
      onLayout: () => {
        this._applyLayout();
        const index = this._notebook.activeCellIndex;

        if (index >= 0) {
          this._ensureCellVisibleInViewport(index);
        }
      },
      getDocumentWidget: () =>
        this._documentWidget ?? this._findDocumentWidget(),
    });

    this._lastModifiedLabel =
      this._context.contentsModel?.last_modified ?? this._lastModifiedLabel;
    this._updateStatusBar();

    this.node.appendChild(this._viewport);

    this._documentUrlResolver = wrapDocumentUrlResolver(
      this._context.urlResolver as DocumentContextResolver,
      this._contents,
    );

    this._notebook = this._contentFactory.createNotebook({
      rendermime: this._rendermime.clone({
        resolver: this._documentUrlResolver,
      }),
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
    this._bindHistoryButtons();
    this._appearanceToolbar?.refresh();
    formatCluster.appendChild(this._createFormatToolbar());
    this._scheduleHeaderLayoutSync();

    this._notebookMount = document.createElement("div");
    this._notebookMount.className = "jp-KuusiMindMapNotebook-mount";
    this.node.appendChild(this._notebookMount);

    this._bindViewportEvents();
    this._bindCellInteractionEvents();
    this._bindKeyboardEvents();
    document.addEventListener("click", this._onDocumentClick);

    this._context.model.cells.changed.connect(this._onCellsChanged, this);
    this._context.model.contentChanged.connect(this._onModelContentChanged, this);

    this._applyUserSettings(this._settingsManager.settings);
    this._settingsConn = this._settingsManager.changed.connect((settings) => {
      this._applyUserSettings(settings);
    });

    const notebookPath = this._context.path;

    if (this._sourceKind !== "markdown") {
      this._autoReloadHandle = attachNotebookAutoReload(
        this._context,
        this._contents,
        {
          getEnabled: () => getNotebookAutoReloadEnabled(notebookPath),
          onLastModified: (lastModified) => {
            this._lastModifiedLabel = lastModified;
            this._updateStatusBar();
          },
          onReverted: () => {
            this._invalidateOutlineCache();
            this._scheduleLayout();
          },
        },
      );

      this._autoReloadListenerDispose = registerNotebookAutoReloadListener(
        notebookPath,
        this._autoReloadHandle,
      );
    }
  }

  private _applyUserSettings(settings: MindMapUserSettings): void {
    const displayFontChanged =
      settings.displayFont !== this._mindMapDisplayFont ||
      settings.displayFontSize !== this._mindMapDisplayFontSize;
    const nextTypographyGeometry = mindMapTypographyGeometryKey(settings);
    const typographyGeometryChanged =
      nextTypographyGeometry !== this._typographyGeometryKey;
    const fontChanged =
      displayFontChanged ||
      typographyGeometryChanged ||
      settings.editFont !== this._mindMapEditFont ||
      settings.editFontSize !== this._mindMapEditFontSize ||
      settings.unifyEditDisplayFont !== this._unifyEditDisplayFont ||
      settings.matchNotebookFont !== this._matchNotebookFont;
    const widthChanged =
      settings.equalNodeWidth !== this._equalNodeWidth ||
      settings.adaptiveNodeWidth !== this._adaptiveNodeWidth ||
      settings.nodeWidth !== this._nodeWidth;
    const layoutGeometryChanged =
      settings.layoutDensity !== this._layoutDensity ||
      settings.siblingGap !== this._siblingGap ||
      settings.childGap !== this._childGap ||
      settings.treeDirection !== this._treeDirection;
    const appearanceChanged = !appearanceEquals(
      settings.appearance,
      this._appearanceSettings,
    );
    const levelStylesChanged =
      JSON.stringify(settings.appearance.levelStyles) !==
      JSON.stringify(this._appearanceSettings.levelStyles);
    // Card insets change node sizes, so they need a remeasure like width does.
    const paddingChanged =
      settings.appearance.nodePaddingX !== this._appearanceSettings.nodePaddingX ||
      settings.appearance.nodePaddingY !== this._appearanceSettings.nodePaddingY;

    this._mindMapTheme = settings.theme;
    this._mindMapEditFont = settings.editFont;
    this._mindMapDisplayFont = settings.displayFont;
    this._mindMapEditFontSize = settings.editFontSize;
    this._mindMapDisplayFontSize = settings.displayFontSize;
    this._unifyEditDisplayFont = settings.unifyEditDisplayFont;
    this._matchNotebookFont = settings.matchNotebookFont;
    this._typographyGeometryKey = nextTypographyGeometry;
    this._layoutDensity = settings.layoutDensity;
    this._siblingGap = settings.siblingGap;
    this._childGap = settings.childGap;
    this._equalNodeWidth = settings.equalNodeWidth;
    this._adaptiveNodeWidth = settings.adaptiveNodeWidth;
    this._nodeWidth = settings.nodeWidth;
    this._treeDirection = settings.treeDirection;
    this._mindMapBackground = settings.background;
    this._mindMapBackgroundPattern = settings.backgroundPattern;
    this._mindMapBackgroundColor = settings.backgroundColor;
    this._showUpdatedTimestamp = settings.showUpdatedTimestamp;
    this._showNodeCount = settings.showNodeCount;
    this._showTextCount = settings.showTextCount;
    this._showPageCount = settings.showPageCount;
    this._showFileSize = settings.showFileSize;
    this._renderChrome?.setStatVisibility({
      nodes: this._showNodeCount,
      text: this._showTextCount,
      pages: this._showPageCount,
      fileSize: this._showFileSize,
    });
    this._appearanceSettings = { ...settings.appearance };
    this._applyViewBehavior(settings);
    this._updateModifiedTimestamp();
    this._updateStatusBar();
    this._applyScenePresentation();
    this._applyBackground();
    this._syncSceneEditMode();

    const geometryChanged =
      fontChanged || widthChanged || paddingChanged || layoutGeometryChanged;

    if (fontChanged || widthChanged || paddingChanged) {
      // Font/width/padding changes alter node sizes; drop caches so layout remeasures.
      this._dimensionCacheByModelId.clear();
      this._lastLayoutDimensions.clear();
      this._resolvedAdaptiveWidths.clear();
    }

    // Edit-only font tweaks can skip full layout while typing so focus stays.
    // Display font/size changes must always relayout — otherwise cards overlap.
    if (
      this._notebook.mode === "edit" &&
      fontChanged &&
      !displayFontChanged &&
      !widthChanged &&
      !layoutGeometryChanged
    ) {
      return;
    }

    if (geometryChanged) {
      if (fontChanged || widthChanged || paddingChanged) {
        void this._relayoutAfterPresentationChange();
        return;
      }

      this._applyLayout();
      return;
    }

    // Theme / background / line style: CSS (+ edge paths) only — no remeasure.
    if (appearanceChanged) {
      if (levelStylesChanged) {
        // Border width / radius per level can change card sizes.
        this._dimensionCacheByModelId.clear();
        this._lastLayoutDimensions.clear();
        this._applyLayout();
        return;
      }

      this._refreshEdgesFromCache();
    }
  }

  private _applyViewBehavior(settings: MindMapUserSettings): void {
    const previous = this._viewBehavior;
    this._viewBehavior = {
      zoomMinPercent: settings.zoomMinPercent,
      zoomMaxPercent: settings.zoomMaxPercent,
      wheelZoomSpeed: settings.wheelZoomSpeed,
      wheelBehavior: settings.wheelBehavior,
      openView: settings.openView,
    };

    if (
      previous.zoomMinPercent !== settings.zoomMinPercent ||
      previous.zoomMaxPercent !== settings.zoomMaxPercent
    ) {
      this._renderChrome?.setZoomRange?.(
        settings.zoomMinPercent,
        settings.zoomMaxPercent,
      );

      // A narrower range can leave the current zoom outside it.
      if (this._clampZoom(this._zoom) !== this._zoom) {
        this._setZoomLevel(this._zoom);
      }
    }
  }

  private _scheduleViewSave(): void {
    if (!this._viewSavingEnabled || this.isDisposed) {
      return;
    }

    if (this._viewSaveTimer !== null) {
      window.clearTimeout(this._viewSaveTimer);
    }

    this._viewSaveTimer = window.setTimeout(() => {
      this._viewSaveTimer = null;
      this._saveViewNow();
    }, 500);
  }

  private _saveViewNow(): void {
    const path = this._context.path;

    if (!this._viewSavingEnabled || !path) {
      return;
    }

    try {
      saveView(window.localStorage, path, {
        zoom: this._zoom,
        panX: this._panX,
        panY: this._panY,
      });
    } catch {
      // localStorage can be unavailable; the view is simply not remembered.
    }
  }

  /** Redraw connectors from the last layout without remeasuring nodes. */
  private _refreshEdgesFromCache(): void {
    if (!this._lastOutline || !this._lastLayoutPositions) {
      this._applyLayout();
      return;
    }

    this._renderEdges(this._lastOutline, this._lastLayoutPositions);
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

  /**
   * Resolved card width for a cell.
   * Adaptive: content-fit (optionally equalized), capped by `_nodeWidth`.
   * Else: global equal width, or per-node override.
   */
  private _resolveNodeWidth(cell: ICellModel, nodeId?: string): number {
    if (this._resizeState) {
      if (
        this._equalNodeWidth ||
        (nodeId !== undefined && nodeId === this._resizeState.nodeId)
      ) {
        return this._resizeState.currentWidth;
      }
    }

    if (this._adaptiveNodeWidth) {
      if (nodeId !== undefined) {
        const adaptive = this._resolvedAdaptiveWidths.get(nodeId);

        if (adaptive !== undefined) {
          return adaptive;
        }
      }

      const cached = this._dimensionCacheByModelId.get(cell.id);

      if (cached) {
        return Math.min(cached.width, this._nodeWidth);
      }

      return this._nodeWidth;
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

    this._invalidateOutlineCache();

    // Drop size cache even while editing so the post-render layout measures
    // the new card size (otherwise edges keep anchoring to the old center).
    if (this._adaptiveNodeWidth && this._equalNodeWidth) {
      this._dimensionCacheByModelId.clear();
      this._resolvedAdaptiveWidths.clear();
    } else {
      const activeCell = this._notebook.activeCell;

      if (activeCell) {
        this._dimensionCacheByModelId.delete(activeCell.model.id);
      }
    }

    if (this._notebook.mode === "edit") {
      return;
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

  /** Keep keyboard focus on the mind-map viewport (e.g. after notebook sync). */
  focusMapViewport(): void {
    this._focusViewport();
  }

  bindSyncMarkdownToNotebook(handler: (cellIndex: number) => void): void {
    this._syncMarkdownToNotebook = handler;
  }

  /** Optional: read the standard notebook editor’s active cell for open/show focus. */
  bindSourceActiveCellIndex(getter: () => number): void {
    this._getSourceActiveCellIndex = getter;
  }

  /** Cache the owning document tab widget (used for Kuusi-window fullscreen). */
  bindDocumentWidget(widget: Widget): void {
    this._documentWidget = widget;
  }

  /** Re-layout after the backing `.md` file changed in the text editor. */
  applyTextDocumentSnapshot(): void {
    if (this._sourceKind !== "markdown") {
      return;
    }

    this._invalidateOutlineCache();
    this._scheduleLayout();
  }

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    if (!this._documentWidget) {
      this._documentWidget = this._findDocumentWidget();
    }
    this._ensureNotebookAttached();
  }

  protected onAfterShow(msg: Message): void {
    super.onAfterShow(msg);
    this._ensureNotebookAttached();

    const index =
      this._getSourceActiveCellIndex?.() ?? this._notebook.activeCellIndex;

    // Opened while hidden: the follow window expired before the viewport had a
    // size, so the map never got centered. Retry now that it is visible.
    const unfulfilled = this._viewportCtrl.unfulfilledCenterIndex;

    if (unfulfilled !== null) {
      this.requestOpenCenter(unfulfilled);
      return;
    }

    // Tab revisit: layout only — do not restart the open-center follow loop.
    if (this._viewportCtrl.openCentered) {
      if (index >= 0) {
        this._scheduleLayout();
        this._ensureCellVisibleInViewport(index);
      }
      return;
    }

    if (index >= 0) {
      this.requestOpenCenter(index);
    }
  }

  protected onBeforeHide(msg: Message): void {
    this._viewportCtrl.pauseCenterFollow();
    super.onBeforeHide(msg);
  }

  /**
   * Center the given cell after open/startup, and keep correcting pan while
   * the split pane / markdown layout settles.
   */
  requestOpenCenter(cellIndex: number): void {
    if (cellIndex < 0 || cellIndex >= this._context.model.cells.length) {
      return;
    }

    // Open-center must win over drag/insert camera freezes.
    this._viewportCtrl.clearHeldPan();
    this._viewportAnchor = null;

    // The first request decides the initial camera; later ones (selection
    // sync, tab revisits) always center the requested node.
    const mode = this._openViewApplied ? "selected" : this._viewBehavior.openView;
    this._openViewApplied = true;
    this._viewSavingEnabled = true;

    if (mode === "last") {
      const saved = loadSavedView(window.localStorage, this._context.path);

      if (saved) {
        this._zoom = this._clampZoom(saved.zoom);
        this._panX = saved.panX;
        this._panY = saved.panY;
        this._viewportCtrl.cancelCenterFollow();
        this._applyTransform();
        return;
      }
    } else if (mode === "root") {
      const rootIndex = getMindMapRootNode(this._getOutlineSnapshot().outline)
        ?.cellIndex;

      if (typeof rootIndex === "number" && rootIndex >= 0) {
        cellIndex = rootIndex;
      }
    } else if (mode === "fit") {
      this._pendingFit = true;
    }

    this._viewportCtrl.beginCenterFollow(cellIndex);
    this.syncActiveCellFromNotebook(cellIndex, { center: true });
  }

  private _clearWheelPanMomentum(): void {
    if (this._wheelPanFrame !== null) {
      cancelAnimationFrame(this._wheelPanFrame);
      this._wheelPanFrame = null;
    }

    this._wheelPanPending = { dx: 0, dy: 0 };
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

      // Empty notebooks have no H1, so the outline is blank — seed a root first.
      if (
        !this._mindMapRootSeeded &&
        ensureMindMapRoot(this._notebook, this._context.model)
      ) {
        this._mindMapRootSeeded = true;
        this._invalidateOutlineCache();
        this.requestOpenCenter(0);
        this._scheduleLayout();
        return;
      }

      void this._applyLayoutAsync(++this._layoutGeneration);
    });
  }

  dispose(): void {
    if (this._viewSaveTimer !== null) {
      window.clearTimeout(this._viewSaveTimer);
      this._viewSaveTimer = null;
    }
    this._saveViewNow();
    this._autoReloadListenerDispose?.();
    this._autoReloadListenerDispose = null;
    this._autoReloadHandle?.dispose();
    this._autoReloadHandle = null;

    // The context (and its model) can already be disposed when a view is
    // closed by a view switch; an uncaught throw here aborts the rest of
    // dispose() and leaves a half-torn-down widget behind.
    const model = this._context.model;
    model?.cells?.changed.disconnect(this._onCellsChanged, this);
    model?.contentChanged.disconnect(this._onModelContentChanged, this);

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

    this._clearWheelPanMomentum();

    this._measureHost?.remove();
    this._measureHost = null;
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._viewportCtrl.dispose();
    this._contentVisibleObserver?.disconnect();
    this._contentVisibleObserver = null;

    if (this._contentVisibleTimer !== null) {
      window.clearTimeout(this._contentVisibleTimer);
      this._contentVisibleTimer = null;
    }

    this._headerLayoutObserver?.disconnect();
    this._headerLayoutObserver = null;
    if (this._headerLayoutRaf !== null) {
      window.cancelAnimationFrame(this._headerLayoutRaf);
      this._headerLayoutRaf = null;
    }
    this._headerEl = null;
    this._pageToolbarNode = null;
    this._formatCluster = null;
    document.removeEventListener("click", this._onDocumentClick);
    this._renderChrome?.dispose();
    this._renderChrome = null;
    this._unbindViewportEvents();
    this._unbindCellInteractionEvents();
    this._unbindKeyboardEvents();
    this._drag.clearUi();

    if (this._notebookAttached && this._notebook.isAttached) {
      if (this._notebook.node.isConnected) {
        Widget.detach(this._notebook);
      } else {
        // Closing a tab removes our node first; Widget.detach() would throw and
        // abort the rest of dispose(), leaking the whole mind map.
        MessageLoop.sendMessage(this._notebook, Widget.Msg.BeforeDetach);
        this._notebook.node.remove();
        MessageLoop.sendMessage(this._notebook, Widget.Msg.AfterDetach);
      }
    }
    this._notebookAttached = false;

    this._addMindMapButton?.dispose();
    this._addMindMapButton = null;
    this._undoManagerCleanup?.();
    this._undoManagerCleanup = null;
    this._undoButton = null;
    this._redoButton = null;
    this._settingsConn?.disconnect();
    this._settingsConn = null;
    this._disposeSettingsScope?.();
    this._disposeSettingsScope = null;
    this._unbindAllMarkdownAnchorStrips();
    this._unbindNotebookEditState();
    // StaticNotebook.dispose() leaves cells (and their CodeMirror views) alive;
    // only a model swap removes and disposes every cell widget.
    // JupyterLab 4.6's Notebook throws from that setter (it reads the new
    // model's signals). An escape here skipped `super.dispose()`, so the
    // widget never emitted `disposed` and the document manager kept every
    // closed Mind Map alive; always finish tearing down.
    try {
      this._notebook.model = null;
    } catch {
      // Fall through to disposing the cells by hand.
    }

    for (const cell of [...this._notebook.widgets]) {
      if (!cell.isDisposed) {
        cell.dispose();
      }
    }

    try {
      this._notebook.dispose();
    } catch {
      // A child that still believes it is attached (our node is already out of
      // the document) throws from Widget.detach; the rest is torn down below.
    }

    super.dispose();
    // JupyterLab keeps a reference to a closed main-area widget's toolbar
    // element, which keeps this subtree alive as detached DOM. Empty it so
    // what is left behind is a few nodes, not a whole mind map.
    this.node.replaceChildren();
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
      this._invalidateOutlineCache();

      if (args.type === "remove") {
        (args.oldValues ?? []).forEach((model) => {
          if (model) {
            this._dimensionCacheByModelId.delete(model.id);
          }
        });
      }

      requestAnimationFrame(() => {
        if (!this.isDisposed) {
          this._scheduleLayout();
        }
      });
    }
  }

  /** Drop cached outline after structure/source/metadata changes. */
  private _invalidateOutlineCache(): void {
    this._cachedOutline = null;
    this._cachedOutlineCells = null;
  }

  /**
   * Lightweight cells + outline for layout/drag/keyboard paths.
   * Avoids full notebook `toJSON()` (skips outputs and unrelated metadata).
   */
  private _getOutlineSnapshot(): {
    cells: NotebookCell[];
    outline: OutlineNode;
  } {
    if (this._cachedOutline && this._cachedOutlineCells) {
      return {
        cells: this._cachedOutlineCells,
        outline: this._cachedOutline,
      };
    }

    const cells = snapshotNotebookCells(this._context.model);
    const outline = buildNotebookOutline(cells);
    this._cachedOutlineCells = cells;
    this._cachedOutline = outline;
    return { cells, outline };
  }

  private _createHistoryToolbar(): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = "jp-KuusiNotebookMindMap-history-toolbar";
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", `${this._t.undo()} / ${this._t.redo()}`);

    const redoShortcut = /Mac|iPod|iPhone|iPad/.test(
      typeof navigator !== "undefined" ? navigator.platform : "",
    )
      ? `${modKeyLabel}+Shift+Z`
      : `${modKeyLabel}+Y`;

    const undoButton = document.createElement("button");
    undoButton.type = "button";
    undoButton.className =
      "jp-KuusiNotebookMindMap-format-btn jp-KuusiNotebookMindMap-history-btn";
    undoButton.title = `${this._t.undo()} (${modKeyLabel}+Z)`;
    undoButton.setAttribute("aria-label", this._t.undo());
    undoIcon.render(undoButton);
    undoButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      NotebookActions.undo(this._notebook);
      this._syncHistoryButtons();
    });
    this._undoButton = undoButton;

    const redoButton = document.createElement("button");
    redoButton.type = "button";
    redoButton.className =
      "jp-KuusiNotebookMindMap-format-btn jp-KuusiNotebookMindMap-history-btn";
    redoButton.title = `${this._t.redo()} (${redoShortcut})`;
    redoButton.setAttribute("aria-label", this._t.redo());
    redoIcon.render(redoButton);
    redoButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      NotebookActions.redo(this._notebook);
      this._syncHistoryButtons();
    });
    this._redoButton = redoButton;

    toolbar.append(undoButton, redoButton);
    this._syncHistoryButtons();
    return toolbar;
  }

  private _bindHistoryButtons(): void {
    this._undoManagerCleanup?.();
    this._undoManagerCleanup = null;

    const undoManager = (
      this._context.model.sharedModel as {
        undoManager?: {
          on: (event: string, handler: () => void) => void;
          off: (event: string, handler: () => void) => void;
        };
      }
    ).undoManager;

    if (!undoManager) {
      this._syncHistoryButtons();
      return;
    }

    const sync = (): void => {
      this._syncHistoryButtons();
    };

    undoManager.on("stack-item-added", sync);
    undoManager.on("stack-item-popped", sync);
    undoManager.on("stack-cleared", sync);

    this._undoManagerCleanup = () => {
      undoManager.off("stack-item-added", sync);
      undoManager.off("stack-item-popped", sync);
      undoManager.off("stack-cleared", sync);
    };

    this._syncHistoryButtons();
  }

  private _syncHistoryButtons(): void {
    const undoManager = (
      this._context.model.sharedModel as {
        undoManager?: {
          undoStack?: unknown[];
          redoStack?: unknown[];
        };
      }
    ).undoManager;

    const canUndo = (undoManager?.undoStack?.length ?? 0) > 0;
    const canRedo = (undoManager?.redoStack?.length ?? 0) > 0;

    if (this._undoButton) {
      this._undoButton.disabled = !canUndo;
    }

    if (this._redoButton) {
      this._redoButton.disabled = !canRedo;
    }
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

  /** Persist fill on every selected cell and re-apply frame CSS. */
  private _setSelectedNodeFill(color: string): void {
    const { outline } = this._getOutlineSnapshot();
    const selected = this._getSelectedNodeIds();
    const indices =
      selected.length > 0
        ? selected
            .map((nodeId) => this._getCellIndexFromNodeId(nodeId))
            .filter((index) => index >= 0)
        : this._notebook.activeCellIndex >= 0
          ? [this._notebook.activeCellIndex]
          : [];

    indices.forEach((index) => {
      const cell = this._notebook.widgets[index];

      if (!cell) {
        return;
      }

      writeCellNodeFill(cell.model, color || null);

      const nodeId = `cell-${index}`;
      const outlineNode = this._findOutlineNodeById(outline, nodeId);

      applyNodeFrameToElement(
        cell.node,
        snapshotCellModel(cell.model),
        outlineVisualHeadingLevel(outlineNode?.headingLevel ?? null),
      );
    });

    // The frame reset cleared level variables on these nodes; restamp them.
    this._applyLevelStyles(outline);
  }

  /** ⌘ on Mac / Ctrl on Windows & Linux — multi-select modifier. */
  private _isMultiSelectModifier(
    event: Pick<MouseEvent, "metaKey" | "ctrlKey">,
  ): boolean {
    return event.metaKey || event.ctrlKey;
  }

  private _getSelectedNodeIds(): string[] {
    if (!this._notebook) {
      return [];
    }

    const ids: string[] = [];

    this._notebook.widgets.forEach((cell, index) => {
      if (this._notebook.isSelectedOrActive(cell)) {
        ids.push(`cell-${index}`);
      }
    });

    return ids;
  }

  private _closeFloatingMenus(): void {
    this._closeZoomSlider();
    closeKuusiDropdownMenus(this.node);
  }

  private _onDocumentClick = (event: MouseEvent): void => {
    const target = event.target;
    const el =
      target instanceof Element
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;

    if (el?.closest(".jp-KuusiFormatDropdown-menu.is-open")) {
      return;
    }

    if (
      el?.closest(
        // Menu triggers toggle themselves; other capsule parts (gaps, dividers,
        // plain buttons) should dismiss open menus like any outside click.
        ".jp-KuusiNotebookMindMap-format-btn, [aria-haspopup], .jp-KuusiRenderChrome",
      )
    ) {
      return;
    }

    this._closeFloatingMenus();
  };

  private _closeZoomSlider(): void {
    this._renderChrome?.closeZoomSlider();
  }

  /**
   * Resolve the document widget that owns this mind-map content.
   * Avoid `instanceof` — JupyterLab federated bundles can load duplicate
   * class copies so instanceof fails.
   */
  private _findDocumentWidget(): Widget | null {
    let widget: Widget | null = this.parent;

    while (widget) {
      if (widget.node.classList.contains("jp-KuusiNotebookMindMapDocument")) {
        return widget;
      }

      widget = widget.parent;
    }

    return null;
  }

  private _zoomToPercent(zoom: number): number {
    return zoomToPercent(zoom);
  }

  private _percentToZoom(percent: number): number {
    return percentToZoom(percent);
  }

  private _snapZoomPercent(percent: number): number {
    const snapped = Math.round(percent / ZOOM_PERCENT_STEP) * ZOOM_PERCENT_STEP;

    return Math.min(
      this._viewBehavior.zoomMaxPercent,
      Math.max(this._viewBehavior.zoomMinPercent, snapped),
    );
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
    applyMindMapTypography(this._scene, this._settingsManager.settings);
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
    this._renderChrome?.setZoomPercent(this._zoomToPercent(this._zoom));
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

  private _collectSpatialNodeBounds(): Array<{
    nodeId: string;
    cellIndex: number;
    centerX: number;
    centerY: number;
  }> {
    const bounds: Array<{
      nodeId: string;
      cellIndex: number;
      centerX: number;
      centerY: number;
    }> = [];

    this._cellNodes.forEach((node, nodeId) => {
      if (node.style.display === "none") {
        return;
      }

      const left = Number.parseFloat(node.style.left) || 0;
      const top = Number.parseFloat(node.style.top) || 0;
      const width =
        node.offsetWidth || Number.parseFloat(node.style.width) || 0;
      const height = node.offsetHeight || 0;

      if (width <= 0 || height <= 0) {
        return;
      }

      const cellIndex = Number.parseInt(nodeId.slice("cell-".length), 10);

      if (!Number.isFinite(cellIndex)) {
        return;
      }

      bounds.push({
        nodeId,
        cellIndex,
        centerX: left + width / 2,
        centerY: top + height / 2,
      });
    });

    return bounds;
  }

  private _navigateSpatialSelection(
    direction: "up" | "down" | "left" | "right",
  ): number | null {
    const index = this._notebook.activeCellIndex;

    if (index < 0) {
      return null;
    }

    const target = findSpatialNavigationTarget(
      `cell-${index}`,
      this._collectSpatialNodeBounds(),
      direction,
    );

    return target?.cellIndex ?? null;
  }

  private _ensureCellVisibleInViewport(
    index: number,
    margin = 48,
    axis: "x" | "y" | "xy" = "xy",
  ): void {
    if (this._viewportCtrl.isPanLocked()) {
      return;
    }

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

    if (!anchor || this._viewportCtrl.isPanLocked()) {
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
    const { outline } = this._getOutlineSnapshot();
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

    // Default: center. Keep open-center intent even if a caller passes false.
    let center =
      options.center !== false || this._viewportCtrl.pendingOpenCenterIndex === cellIndex;

    if (center && this._viewportCtrl.isPanLocked()) {
      center = false;
    }

    if (this._notebook.activeCellIndex !== cellIndex) {
      if (!this._isEditEntryProtected(cellIndex)) {
        this._restoreMarkdownPreview(this._notebook.activeCell);
      }

      this._notebook.deselectAll();
      this._notebook.activeCellIndex = cellIndex;

      if (!this._isEditEntryProtected(cellIndex)) {
        this._notebook.mode = "command";
      }

      this._updateSelectedNodeHighlight();
    } else if (this._isEditEntryProtected(cellIndex)) {
      return;
    }

    const needsRelayout = this._expandAncestorsForCell(cellIndex);
    const node = this._cellNodes.get(`cell-${cellIndex}`);
    const nodeReady =
      Boolean(node) &&
      node!.style.display !== "none" &&
      node!.style.left !== "" &&
      node!.style.top !== "";

    if (center) {
      // Follow through markdown reflow / dock resize — a single pan is not enough.
      this._viewportCtrl.beginCenterFollow(cellIndex);
    }

    if (needsRelayout || !nodeReady || !this._notebookAttached) {
      this._pendingFocusCellIndex = cellIndex;
      this._pendingFocusCenter = center;
      this._scheduleLayout();
      return;
    }

    if (center) {
      // Always schedule follow-up nudges; first paint often precedes final size.
      this._viewportCtrl.centerOrSchedule(cellIndex);
    } else {
      this._ensureCellVisibleInViewport(cellIndex);
    }
  }

  private _onKeyDown = (event: KeyboardEvent): void => {
    if (!this._shouldHandleKeyboard(event)) {
      return;
    }

    // Shift+1: fit the whole map (command mode only, so "!" can still be typed).
    if (
      event.code === "Digit1" &&
      event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      this._notebook.mode === "command"
    ) {
      this.fitToView();
      event.preventDefault();
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

    const { outline } = this._getOutlineSnapshot();
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
      (direction) => this._navigateSpatialSelection(direction),
    );

    if (result === "paste") {
      void pasteMindMapClipboard(
        this._notebook,
        this._context.model,
        this._sourceKind === "markdown",
      ).then(
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

      this._viewportCtrl.cancelCenterFollow();

      // Pin the parent only for sibling insert; child insert should pan to the
      // new node without fighting a parent anchor.
      if (result === "insert-edit-sibling" && anchorBeforeInsert >= 0) {
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
      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight"
      ) {
        this._viewportCtrl.cancelCenterFollow();
      }

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

    const formatToolbar = format.querySelector(
      ".jp-KuusiNotebookMindMap-format-toolbar",
    );
    const menuRoot =
      formatToolbar instanceof HTMLElement ? formatToolbar : format;

    format
      .querySelectorAll(".jp-KuusiFormatDropdown-menu.is-open")
      .forEach((menu) => {
        if (menu instanceof HTMLElement) {
          positionKuusiDropdownMenu(menu, menuRoot);
        }
      });
  }

  private _bindViewportEvents(): void {
    this._viewport.addEventListener("wheel", this._onWheel, {
      capture: true,
      passive: false,
    });
    this._viewport.addEventListener("dragover", this._onImageDragOver);
    this._viewport.addEventListener("dragleave", this._onImageDragLeave);
    this._viewport.addEventListener("drop", this._onImageDrop);
    this._viewport.addEventListener("pointerdown", this._onPointerDown);
    this._viewport.addEventListener("pointermove", this._onPointerMove);
    this._viewport.addEventListener("pointerup", this._onPointerUp);
    this._viewport.addEventListener("pointercancel", this._onPointerCancel);
  }

  private _unbindViewportEvents(): void {
    this._viewport.removeEventListener("wheel", this._onWheel, { capture: true });
    this._viewport.removeEventListener("dragover", this._onImageDragOver);
    this._viewport.removeEventListener("dragleave", this._onImageDragLeave);
    this._viewport.removeEventListener("drop", this._onImageDrop);
    this._viewport.removeEventListener("pointerdown", this._onPointerDown);
    this._viewport.removeEventListener("pointermove", this._onPointerMove);
    this._viewport.removeEventListener("pointerup", this._onPointerUp);
    this._viewport.removeEventListener("pointercancel", this._onPointerCancel);
    this._unbindDragWindowListeners();
  }

  private _bindDragWindowListeners(): void {
    if (this._dragWindowListening) {
      return;
    }

    this._dragWindowListening = true;
    window.addEventListener("pointermove", this._onPointerMove, true);
    window.addEventListener("pointerup", this._onPointerUp, true);
    window.addEventListener("pointercancel", this._onPointerCancel, true);
    window.addEventListener("keydown", this._onDragKeyDown, true);
  }

  private _unbindDragWindowListeners(): void {
    if (!this._dragWindowListening) {
      return;
    }

    this._dragWindowListening = false;
    window.removeEventListener("pointermove", this._onPointerMove, true);
    window.removeEventListener("pointerup", this._onPointerUp, true);
    window.removeEventListener("pointercancel", this._onPointerCancel, true);
    window.removeEventListener("keydown", this._onDragKeyDown, true);
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

  private _setImageDropTarget(node: HTMLElement | null): void {
    if (this._imageDropNode === node) {
      return;
    }

    this._imageDropNode?.classList.remove("is-image-drop");
    this._imageDropNode = node;
    node?.classList.add("is-image-drop");
  }

  private _onImageDragOver = (event: DragEvent): void => {
    if (!dragHasFiles(event)) {
      return;
    }

    // Without preventDefault the browser opens the dropped file in the tab.
    event.preventDefault();
    const index = this._getCellIndexFromTarget(event.target);
    const node =
      index >= 0 ? (this._cellNodes.get(`cell-${index}`) ?? null) : null;

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = node ? "copy" : "none";
    }

    this._setImageDropTarget(node);
  };

  private _onImageDragLeave = (event: DragEvent): void => {
    const next = event.relatedTarget;

    if (!(next instanceof Node) || !this._viewport.contains(next)) {
      this._setImageDropTarget(null);
    }
  };

  private _onImageDrop = (event: DragEvent): void => {
    if (!dragHasFiles(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this._setImageDropTarget(null);

    const index = this._getCellIndexFromTarget(event.target);
    const files = imageFilesFromDrop(event);

    if (index < 0 || files.length === 0) {
      return;
    }

    void this._insertDroppedImages(index, files);
  };

  /** Save next to the document and link from the node's cell (relative path). */
  private async _insertDroppedImages(index: number, files: File[]): Promise<void> {
    let markdown: string;

    try {
      const saved = [];

      for (const file of files) {
        saved.push(
          await saveImageNextToDocument(this._contents, this._context.path, file),
        );
      }

      markdown = imageMarkdown(saved);
    } catch (error) {
      console.error("[kuusi] saving dropped image failed", error);
      Notification.error(this._t.imageDropFailed(), { autoClose: 5000 });
      return;
    }

    if (this.isDisposed) {
      return;
    }

    const model = this._context.model;
    const cell = model.cells.get(index);

    if (!cell) {
      return;
    }

    if (cell.type === "markdown") {
      const source = cell.sharedModel.getSource().replace(/\s+$/, "");
      cell.sharedModel.setSource(source ? `${source}\n\n${markdown}` : markdown);
    } else {
      model.sharedModel.insertCell(index + 1, {
        cell_type: "markdown",
        source: markdown,
      });
    }

    this._invalidateOutlineCache();
    this._scheduleLayout();
  }

  private _getCellIndexFromTarget(target: EventTarget | null): number {
    if (!(target instanceof HTMLElement)) {
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
    if (
      this._notebook.mode === "edit" &&
      this._notebook.activeCellIndex === index &&
      this._pendingEditCellIndex === null
    ) {
      const cell = this._notebook.widgets[index];

      if (cell instanceof MarkdownCell && !cell.rendered) {
        cell.editor?.focus();
        return;
      }
    }

    if (
      this._enterCellEditModeTarget === index &&
      this._enterCellEditModePromise
    ) {
      return this._enterCellEditModePromise;
    }

    this._enterCellEditModeTarget = index;
    this._enterCellEditModePromise = this._enterCellEditModeImpl(index).finally(
      () => {
        if (this._enterCellEditModeTarget === index) {
          this._enterCellEditModeTarget = -1;
          this._enterCellEditModePromise = null;
        }
      },
    );

    return this._enterCellEditModePromise;
  }

  private _beginEditEntryGuard(index: number): void {
    this._editEntryGuardIndex = index;
    this._editEntryGuardUntil = performance.now() + CELL_EDIT_ENTRY_GUARD_MS;
  }

  private _clearEditEntryGuard(): void {
    this._editEntryGuardIndex = -1;
    this._editEntryGuardUntil = 0;
  }

  private _isEditEntryProtected(index: number): boolean {
    return (
      this._editEntryGuardIndex === index &&
      performance.now() < this._editEntryGuardUntil
    );
  }

  private async _enterCellEditModeImpl(index: number): Promise<void> {
    const cell = this._notebook.widgets[index];

    if (!cell) {
      return;
    }

    this._beginEditEntryGuard(index);
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

    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (this.isDisposed || cell.isDisposed) {
        return;
      }

      if (
        this._notebook.activeCellIndex !== index ||
        this._notebook.mode !== "edit"
      ) {
        if (this._isEditEntryProtected(index)) {
          this._notebook.activeCellIndex = index;
          this._notebook.mode = "edit";
          this._syncSceneEditMode();
        } else {
          return;
        }
      }

      cell.editor?.focus();

      const active = document.activeElement;

      if (
        active instanceof HTMLElement &&
        active.closest(".jp-KuusiNotebookMindMap-cellNode") &&
        this._isCellInputTarget(active)
      ) {
        break;
      }

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }

    if (this._pendingEditCellIndex === index) {
      this._pendingEditCellIndex = null;
    }
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

        if (this.isDisposed || cell.isDisposed) {
          cell.renderedChanged.disconnect(onRenderedChanged);
          resolve();
        }
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

    const index = this._notebook.widgets.indexOf(cell);

    if (index >= 0 && this._isEditEntryProtected(index)) {
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
      // Markdown paint can finish a frame after layout starts; retarget edges
      // once the card’s final height is in the DOM.
      window.requestAnimationFrame(() => {
        if (!this.isDisposed) {
          this._refreshEdgesFromCache();

          if (!cell.isDisposed) {
            this._stripInternalHeadingAnchors(cell.node);
          }
        }
      });
    };

    if (!cell.rendered) {
      const onRendered = (_sender: MarkdownCell, rendered: boolean) => {
        if (!rendered) {
          return;
        }

        cell.renderedChanged.disconnect(onRendered);

        if (this.isDisposed || cell.isDisposed) {
          return;
        }

        syncAndRelayout();
      };

      cell.renderedChanged.connect(onRendered);
      cell.rendered = true;
      return;
    }

    syncAndRelayout();
  }

  /** User finished editing (canvas click, card select, Esc, etc.). */
  private _commitActiveCellEdit(): void {
    this._clearEditEntryGuard();
    this._pendingEditCellIndex = null;
    commitActiveMindMapCell(this._notebook);
    this._blurCellEditors();
    this._syncSceneEditMode();
    this._updateFormatToolbar();
  }

  private _previousActiveCell: Cell | null = null;
  private _notebookEditStateBound = false;
  private _anchorStripBindings = new WeakMap<
    MarkdownCell,
    {
      onRenderedChanged: (_sender: MarkdownCell, rendered: boolean) => void;
      onContentChanged: () => void;
      onCellDisposed: () => void;
    }
  >();

  private _onNotebookActiveCellChanged = (
    _sender: Notebook,
    cell: Cell | null,
  ): void => {
    if (this._previousActiveCell instanceof MarkdownCell) {
      this._restoreMarkdownPreview(this._previousActiveCell);
    }

    this._previousActiveCell = cell;
    this._updateSelectedNodeHighlight();
    this._updateFormatToolbar();
    this._appearanceToolbar?.syncSelection();
    this._syncSceneEditMode();
  };

  private _onNotebookSelectionChanged = (): void => {
    this._updateSelectedNodeHighlight();
    this._appearanceToolbar?.syncSelection();
  };

  private _onNotebookStateChanged = (
    _sender: Notebook,
    args: { name: string; newValue: unknown; oldValue: unknown },
  ): void => {
    if (args.name === "mode") {
      if (args.newValue === "command") {
        const index = this._notebook.activeCellIndex;

        if (index >= 0 && this._isEditEntryProtected(index)) {
          // Notebook can briefly drop to command while the editor mounts.
          queueMicrotask(() => {
            if (
              this.isDisposed ||
              this._notebook.activeCellIndex !== index ||
              !this._isEditEntryProtected(index)
            ) {
              return;
            }

            this._notebook.mode = "edit";
            this._syncSceneEditMode();
          });
          return;
        }

        this._restoreMarkdownPreview(this._notebook.activeCell);
      }

      this._syncSceneEditMode();
      this._updateFormatToolbar();
    }
  };

  private _bindNotebookEditState(): void {
    if (this._notebookEditStateBound) {
      return;
    }

    this._notebook.activeCellChanged.connect(this._onNotebookActiveCellChanged);
    this._notebook.selectionChanged.connect(this._onNotebookSelectionChanged);
    this._notebook.stateChanged.connect(this._onNotebookStateChanged);
    this._notebookEditStateBound = true;
    this._syncSceneEditMode();
  }

  private _unbindNotebookEditState(): void {
    if (!this._notebookEditStateBound || this._notebook.isDisposed) {
      return;
    }

    this._notebook.activeCellChanged.disconnect(this._onNotebookActiveCellChanged);
    this._notebook.selectionChanged.disconnect(this._onNotebookSelectionChanged);
    this._notebook.stateChanged.disconnect(this._onNotebookStateChanged);
    this._notebookEditStateBound = false;
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
    const selected = new Set(this._getSelectedNodeIds());

    this._cellNodes.forEach((node, nodeId) => {
      node.classList.toggle("is-selected", selected.has(nodeId));
    });
  }

  private _getCellIndexFromNodeId(nodeId: string): number {
    if (!nodeId.startsWith("cell-")) {
      return -1;
    }

    const index = Number.parseInt(nodeId.slice("cell-".length), 10);

    return Number.isFinite(index) ? index : -1;
  }

  private _selectCell(index: number): void {
    if (this._notebook.mode === "edit") {
      this._commitActiveCellEdit();
    } else {
      this._clearEditEntryGuard();
      this._pendingEditCellIndex = null;

      if (this._notebook.activeCellIndex !== index) {
        this._restoreMarkdownPreview(this._notebook.activeCell);
      }
    }

    this._notebook.deselectAll();
    this._notebook.activeCellIndex = index;

    if (this._notebook.mode !== "command") {
      this._notebook.mode = "command";
    }

    this._blurCellEditors();
    this._focusViewport();
    this._updateSelectedNodeHighlight();
    this._updateFormatToolbar();
    this._appearanceToolbar?.syncSelection();
  }

  /**
   * Restore selection after a cell reorder. Node ids (`cell-N`) change with
   * indices, so track by model id. `activeModelId` becomes the notebook cursor.
   */
  private _selectCellsByModelIds(
    modelIds: readonly string[],
    activeModelId: string,
  ): void {
    if (modelIds.length === 0) {
      return;
    }

    const idSet = new Set(modelIds);
    const indices: number[] = [];
    let activeIndex = -1;

    this._notebook.widgets.forEach((cell, index) => {
      if (!idSet.has(cell.model.id)) {
        return;
      }

      indices.push(index);

      if (cell.model.id === activeModelId) {
        activeIndex = index;
      }
    });

    if (indices.length === 0) {
      return;
    }

    if (activeIndex < 0) {
      activeIndex = indices[0]!;
    }

    this._pendingEditCellIndex = null;
    this._restoreMarkdownPreview(this._notebook.activeCell);
    this._notebook.deselectAll();
    this._notebook.activeCellIndex = activeIndex;

    const active = this._notebook.activeCell;

    if (active) {
      this._notebook.select(active);
    }

    indices.forEach((index) => {
      if (index === activeIndex) {
        return;
      }

      const cell = this._notebook.widgets[index];

      if (cell) {
        this._notebook.select(cell);
      }
    });

    this._notebook.mode = "command";
    this._blurCellEditors();
    this._focusViewport();
    this._updateSelectedNodeHighlight();
    this._updateFormatToolbar();
    this._appearanceToolbar?.syncSelection();
  }

  /**
   * Toggle a cell in the multi-selection (⌘/Ctrl+click).
   * Keeps other selected nodes so a later drag can move them together.
   */
  private _toggleCellSelection(index: number): void {
    const cell = this._notebook.widgets[index];

    if (!cell) {
      return;
    }

    if (this._notebook.mode === "edit") {
      this._commitActiveCellEdit();
    } else {
      this._clearEditEntryGuard();
      this._pendingEditCellIndex = null;
      this._restoreMarkdownPreview(this._notebook.activeCell);
    }

    const alreadySelected = this._notebook.isSelectedOrActive(cell);
    const selectedCount = this._getSelectedNodeIds().length;

    if (alreadySelected && selectedCount > 1) {
      if (this._notebook.activeCellIndex === index) {
        // Active stays "selected" via isSelectedOrActive — move focus first.
        const others = this._getSelectedNodeIds().filter(
          (nodeId) => nodeId !== `cell-${index}`,
        );
        const nextIndex = this._getCellIndexFromNodeId(others[others.length - 1]!);

        if (nextIndex >= 0) {
          const previous = cell;
          this._notebook.activeCellIndex = nextIndex;
          const active = this._notebook.activeCell;

          if (active) {
            this._notebook.select(active);
          }

          this._notebook.deselect(previous);
        }
      } else {
        this._notebook.deselect(cell);
      }
    } else if (!alreadySelected) {
      const active = this._notebook.activeCell;

      if (active) {
        this._notebook.select(active);
      }

      this._notebook.select(cell);
      this._notebook.activeCellIndex = index;
    } else {
      // Sole selection — keep it (⌘/Ctrl+click alone does not clear).
      this._notebook.activeCellIndex = index;
    }

    this._notebook.mode = "command";
    this._blurCellEditors();
    this._focusViewport();
    this._updateSelectedNodeHighlight();
    this._updateFormatToolbar();
    this._appearanceToolbar?.syncSelection();
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

    // Editors are pointer-events:none in command mode; do not preventDefault
    // here or browsers will suppress click/dblclick (breaks double-click edit).
  };

  private _onCellClick = (event: MouseEvent): void => {
    if (event.button !== 0 || event.detail > 1) {
      return;
    }

    if (performance.now() < this._suppressCellClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!(event.target instanceof Element)) {
      return;
    }

    // Collapse chip is toggled here (capture runs before cell selection).
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
      event.stopImmediatePropagation();
      return;
    }

    if (event.target.closest(".jp-KuusiNotebookMindMap-resizeHandle")) {
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

    if (this._isMultiSelectModifier(event)) {
      this._toggleCellSelection(index);
    } else {
      this._selectCell(index);
      // Sync left notebook selection quietly; keep Kuusi focused for shortcuts.
      this._revealCellInNotebook?.(index);
      this._focusViewport();
    }

    event.preventDefault();
    event.stopPropagation();
  };

  private _onCellDblClick = (event: MouseEvent): void => {
    if (
      event.target instanceof Element &&
      (event.target.closest(".jp-KuusiNotebookMindMap-collapse") ||
        event.target.closest(".jp-KuusiNotebookMindMap-resizeHandle"))
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
    this._lastCellTap = null;
    this._suppressCellClickUntil = performance.now() + 500;
    void this._enterCellEditMode(index);
  };

  private _isCellDragTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    // Collapse / right-edge resize stay exclusive; everything else on the card
    // can start a reorder drag.
    if (
      target.closest(".jp-KuusiNotebookMindMap-collapse") ||
      target.closest(".jp-KuusiNotebookMindMap-resizeHandle")
    ) {
      return false;
    }

    const host = target.closest(".jp-KuusiNotebookMindMap-cellNode");

    if (!(host instanceof HTMLElement) || !host.dataset.nodeId) {
      return false;
    }

    const index = this._getCellIndexFromNodeId(host.dataset.nodeId);

    // Keep the caret while editing this cell's editor.
    if (
      index >= 0 &&
      this._notebook.mode === "edit" &&
      this._notebook.activeCellIndex === index &&
      this._isCellInputTarget(target)
    ) {
      return false;
    }

    return true;
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
      ".jp-KuusiNotebookMindMap-cellNode, .jp-KuusiNotebookMindMap-resizeHandle, .jp-KuusiNotebookMindMap-collapse, .jp-KuusiNotebookMindMap-status, .jp-KuusiNotebookMindMap-status-updated",
    );
  }

  private _prepareCellForDisplay(cell: Cell, index: number): void {
    cell.inputHidden = false;

    void cell.ready.then(() => {
      if (this.isDisposed || cell.isDisposed) {
        return;
      }

      if (cell instanceof MarkdownCell) {
        this._bindMarkdownAnchorStrip(cell);

        if (!this._isCellEditingMarkdown(cell, index) && !cell.rendered) {
          cell.rendered = true;
        }

        if (cell.rendered) {
          this._stripInternalHeadingAnchors(cell.node);
        }
      }

      if (cell instanceof CodeCell) {
        cell.outputHidden = false;
      }
    });
  }

  private _unbindMarkdownAnchorStrip(cell: MarkdownCell): void {
    const bindings = this._anchorStripBindings.get(cell);

    if (!bindings) {
      return;
    }

    // `disposed` fires after the cell released its model, so this also runs
    // with `cell.model === null`.
    cell.renderedChanged.disconnect(bindings.onRenderedChanged);
    cell.model?.contentChanged.disconnect(bindings.onContentChanged);
    cell.disposed.disconnect(bindings.onCellDisposed);
    delete cell.node.dataset.kuusiAnchorStripBound;
    this._anchorStripBindings.delete(cell);
  }

  private _unbindAllMarkdownAnchorStrips(): void {
    for (const cell of this._notebook.widgets) {
      if (cell instanceof MarkdownCell) {
        this._unbindMarkdownAnchorStrip(cell);
      }
    }
  }

  private _bindMarkdownAnchorStrip(cell: MarkdownCell): void {
    if (cell.node.dataset.kuusiAnchorStripBound === "1") {
      return;
    }

    cell.node.dataset.kuusiAnchorStripBound = "1";

    const refreshRenderedMarkdown = (): void => {
      if (this.isDisposed || cell.isDisposed || !cell.rendered) {
        return;
      }

      this._stripInternalHeadingAnchors(cell.node);
      void refreshMarkdownImageSources(
        cell.node,
        this._documentUrlResolver,
      ).then(() => {
        if (!this.isDisposed && !cell.isDisposed) {
          this._scheduleLayoutAfterContentChange();
        }
      });
    };

    const onRenderedChanged = (_sender: MarkdownCell, rendered: boolean) => {
      if (rendered) {
        refreshRenderedMarkdown();
      }
    };
    const onContentChanged = (): void => {
      window.requestAnimationFrame(refreshRenderedMarkdown);
    };
    const onCellDisposed = (): void => {
      this._unbindMarkdownAnchorStrip(cell);
    };

    cell.renderedChanged.connect(onRenderedChanged);
    cell.model.contentChanged.connect(onContentChanged);
    cell.disposed.connect(onCellDisposed);
    this._anchorStripBindings.set(cell, {
      onRenderedChanged,
      onContentChanged,
      onCellDisposed,
    });
  }

  /** JupyterLab ¶ heading anchors are not useful on the mind-map canvas. */
  private _stripInternalHeadingAnchors(root: HTMLElement): void {
    root.querySelectorAll("a.jp-InternalAnchorLink").forEach((anchor) => {
      anchor.remove();
    });
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
    this._scheduleViewSave();
  }

  private _updateModifiedTimestamp(): void {
    const modifiedLabel = formatContentsModified(this._lastModifiedLabel);
    const show =
      this._showUpdatedTimestamp && Boolean(modifiedLabel);

    this._statusModifiedEl.hidden = !show;
    this._statusModifiedEl.textContent = show
      ? `Updated ${modifiedLabel}`
      : "";
  }

  private _notebookSourceText(): string {
    const cells = this._context.model.cells;
    const parts: string[] = [];

    for (let i = 0; i < cells.length; i += 1) {
      parts.push(cells.get(i).sharedModel.getSource());
    }

    return parts.join("\n");
  }

  private _updateStatusBar(nodeCount = this._cellNodes.size): void {
    const source = this._notebookSourceText();
    const text = countTextStats(source);
    const fileBytes = resolveFileBytes(
      this._context.contentsModel?.size,
      source,
    );

    this._renderChrome?.setStats({
      nodes: nodeCount,
      characters: text.characters,
      words: text.words,
      pages: 1,
      fileBytes,
    });
    this._updateModifiedTimestamp();
    this._updateZoomControl();
  }

  /**
   * Zoom and pan so every visible node fits in the window, centered with a
   * small margin. Small maps stay at 100% rather than blowing up.
   */
  /**
   * When the viewport changes size (fullscreen, a dock drag, a window resize)
   * the pan can end up pointing at empty canvas, leaving only a blank view.
   * Once the size settles, if no node is on screen, fit the whole map.
   */
  private _watchContentVisible(): void {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    this._contentVisibleObserver = new ResizeObserver(() => {
      if (this._contentVisibleTimer !== null) {
        window.clearTimeout(this._contentVisibleTimer);
      }

      this._contentVisibleTimer = window.setTimeout(() => {
        this._contentVisibleTimer = null;
        this._ensureContentVisible();
      }, 350);
    });
    this._contentVisibleObserver.observe(this._viewport);
  }

  private _ensureContentVisible(): void {
    if (
      this.isDisposed ||
      !this.isVisible ||
      this._isPanning ||
      this._notebook.mode === "edit"
    ) {
      return;
    }

    const viewW = this._viewport.clientWidth;
    const viewH = this._viewport.clientHeight;

    if (viewW <= 0 || viewH <= 0) {
      return;
    }

    let seen = false;
    let any = false;

    this._cellNodes.forEach((node) => {
      if (seen || node.style.display === "none") {
        return;
      }

      const left = Number.parseFloat(node.style.left);
      const top = Number.parseFloat(node.style.top);

      if (!Number.isFinite(left) || !Number.isFinite(top)) {
        return;
      }

      any = true;
      const x = this._panX + left * this._zoom;
      const y = this._panY + top * this._zoom;
      const w = node.offsetWidth * this._zoom;
      const h = node.offsetHeight * this._zoom;

      if (x < viewW && x + w > 0 && y < viewH && y + h > 0) {
        seen = true;
      }
    });

    if (any && !seen) {
      this.fitToView();
    }
  }

  fitToView(): boolean {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    this._cellNodes.forEach((node) => {
      if (node.style.display === "none") {
        return;
      }

      const left = Number.parseFloat(node.style.left);
      const top = Number.parseFloat(node.style.top);

      if (!Number.isFinite(left) || !Number.isFinite(top)) {
        return;
      }

      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, left + node.offsetWidth);
      maxY = Math.max(maxY, top + node.offsetHeight);
    });

    const viewW = this._viewport.clientWidth;
    const viewH = this._viewport.clientHeight;

    if (!Number.isFinite(minX) || viewW <= 0 || viewH <= 0) {
      return false;
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const margin = 0.06;
    const fit = Math.min(
      (viewW * (1 - margin * 2)) / width,
      (viewH * (1 - margin * 2)) / height,
    );
    const zoom = this._clampZoom(Math.min(fit, this._percentToZoom(100)));

    // An explicit user action: stop any automatic open-center follow.
    this._viewportCtrl.cancelCenterFollow();
    this._zoom = zoom;
    this._panX = viewW / 2 - (minX + width / 2) * zoom;
    this._panY = viewH / 2 - (minY + height / 2) * zoom;
    this._applyTransform();
    return true;
  }

  private _clampZoom(value: number): number {
    return Math.min(
      this._percentToZoom(this._viewBehavior.zoomMaxPercent),
      Math.max(this._percentToZoom(this._viewBehavior.zoomMinPercent), value),
    );
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

    const rawFactor = Math.exp(
      -normalizedDelta *
        ZOOM_WHEEL_SENSITIVITY *
        this._viewBehavior.wheelZoomSpeed,
    );
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

  /** Batch wheel deltas into one transform per frame for smoother panning. */
  private _panByWheel(deltaX: number, deltaY: number): void {
    this._wheelPanPending.dx += deltaX;
    this._wheelPanPending.dy += deltaY;

    if (this._wheelPanFrame !== null) {
      return;
    }

    this._wheelPanFrame = requestAnimationFrame(() => {
      this._wheelPanFrame = null;
      const { dx, dy } = this._wheelPanPending;
      this._wheelPanPending = { dx: 0, dy: 0 };

      if (dx !== 0 || dy !== 0) {
        this._panBy(dx, dy);
      }
    });
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

    this._viewportCtrl.cancelCenterFollow();
    event.preventDefault();
    event.stopPropagation();

    // Pinch / ctrl+wheel always zooms. In "zoom" mode the plain wheel zooms too
    // and Shift+wheel pans.
    const zoomGesture =
      event.ctrlKey ||
      event.metaKey ||
      (this._viewBehavior.wheelBehavior === "zoom" && !event.shiftKey);

    if (zoomGesture) {
      this._zoomAtPointer(
        event.clientX,
        event.clientY,
        event.deltaY,
        event.deltaMode,
      );
      return;
    }

    this._panByWheel(-event.deltaX, -event.deltaY);
  };

  private _beginPinch(): void {
    const [a, b] = Array.from(this._touchPoints.values());

    if (!a || !b) {
      return;
    }

    // A second finger turns any single-finger gesture into a pinch.
    this._cancelNodeDrag();
    this._isPanning = false;
    this._panPointerId = null;
    this._viewport.classList.remove("is-panning");

    const rect = this._viewport.getBoundingClientRect();
    const centerX = (a.x + b.x) / 2 - rect.left;
    const centerY = (a.y + b.y) / 2 - rect.top;

    this._pinch = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom: this._zoom,
      worldX: (centerX - this._panX) / this._zoom,
      worldY: (centerY - this._panY) / this._zoom,
    };
  }

  private _updatePinch(): void {
    const pinch = this._pinch;
    const [a, b] = Array.from(this._touchPoints.values());

    if (!pinch || !a || !b) {
      return;
    }

    const rect = this._viewport.getBoundingClientRect();
    const centerX = (a.x + b.x) / 2 - rect.left;
    const centerY = (a.y + b.y) / 2 - rect.top;
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const nextZoom = this._clampZoom(pinch.zoom * (distance / pinch.distance));

    // Keep the world point first under the fingers glued to their midpoint:
    // zooms around the pinch and pans with a two-finger drag.
    this._panX = centerX - pinch.worldX * nextZoom;
    this._panY = centerY - pinch.worldY * nextZoom;
    this._zoom = nextZoom;
    this._applyTransform();
  }

  private _releaseTouchPoint(event: PointerEvent): void {
    if (event.pointerType !== "touch") {
      return;
    }

    this._touchPoints.delete(event.pointerId);

    if (this._touchPoints.size < 2) {
      this._pinch = null;
    }
  }

  private _onPointerDown = (event: PointerEvent): void => {
    // Once the user touches the canvas, never fight their pan/zoom with the
    // startup centering loop.
    this._viewportCtrl.cancelCenterFollow();

    if (event.pointerType === "touch") {
      this._touchPoints.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (this._touchPoints.size === 2) {
        this._beginPinch();
        event.preventDefault();
        return;
      }

      if (this._touchPoints.size > 2) {
        return;
      }
    }

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

    // Only the primary button drags; right / middle click must not start a move.
    if (event.button === 0 && this._isCellDragTarget(event.target)) {
      const host = (event.target as HTMLElement).closest(
        ".jp-KuusiNotebookMindMap-cellNode",
      );

      if (host instanceof HTMLElement && host.dataset.nodeId) {
        const nodeId = host.dataset.nodeId;
        this._drag.dragState = {
          nodeId,
          nodeIds: this._drag.resolveDragNodeIds(nodeId),
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          active: false,
          holdUntil:
            event.pointerType === "touch"
              ? performance.now() + TOUCH_DRAG_HOLD_MS
              : 0,
        };
        // Delay pointer capture until the drag activates. Capturing on
        // pointerdown retargets click/dblclick to the viewport and breaks
        // double-click-to-edit. Window listeners keep tracking meanwhile.
        this._bindDragWindowListeners();
        return;
      }
    }

    if (!this._canPanDrag(event.target)) {
      return;
    }

    if (this._notebook.mode === "edit") {
      this._commitActiveCellEdit();
    } else {
      this._restoreMarkdownPreview(this._notebook.activeCell);
    }

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
    if (event.pointerType === "touch" && this._touchPoints.has(event.pointerId)) {
      this._touchPoints.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (this._pinch) {
        this._updatePinch();
        return;
      }
    }

    if (this._resizeState && this._resizeState.pointerId === event.pointerId) {
      const resize = this._resizeState;
      const deltaWorld = (event.clientX - resize.startX) / this._zoom;
      const nextWidth = clampNodeWidth(resize.startWidth + deltaWorld);
      this._applyResizeWidth(resize.nodeId, nextWidth);
      return;
    }

    if (this._drag.dragState && this._drag.dragState.pointerId === event.pointerId) {
      const drag = this._drag.dragState;
      const distance = Math.hypot(
        event.clientX - drag.startX,
        event.clientY - drag.startY,
      );

      // Avoid accidental text selection while the pointer is deciding
      // between click and drag.
      if (distance > 2) {
        event.preventDefault();
      }

      if (
        !drag.active &&
        distance >= DRAG_THRESHOLD_PX &&
        drag.holdUntil &&
        performance.now() < drag.holdUntil
      ) {
        // Touch swipe before the long-press elapsed: pan the canvas instead.
        this._startPanFromDrag(event, drag);
        return;
      }

      if (!drag.active && distance >= DRAG_THRESHOLD_PX) {
        drag.active = true;
        this._lastCellTap = null;
        this._viewportCtrl.cancelCenterFollow();
        this._viewportCtrl.lockPan(VIEWPORT_PAN_LOCK_MS);

        const index = this._getCellIndexFromNodeId(drag.nodeId);
        const selected = this._getSelectedNodeIds();

        if (index >= 0 && !selected.includes(drag.nodeId)) {
          // Dragging an unselected card clears multi-select (desktop convention).
          this._selectCell(index);
          drag.nodeIds = [drag.nodeId];
        } else {
          drag.nodeIds = this._drag.resolveDragNodeIds(drag.nodeId);
        }

        try {
          this._viewport.setPointerCapture(event.pointerId);
        } catch {
          // Capture can fail if the pointer was already released.
        }

        this._drag.captureBasePositions();
        this._drag.startGhost(drag.nodeId, event.clientX, event.clientY);
        drag.nodeIds.forEach((nodeId) => {
          this._cellNodes.get(nodeId)?.classList.add("is-drag-source");
        });
        this._viewport.classList.add("is-node-dragging");
        this._drag.updateDropTarget(event.clientX, event.clientY);
      }

      if (drag.active) {
        this._drag.updateDropTarget(event.clientX, event.clientY);
        this._drag.moveGhost(event.clientX, event.clientY);
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

  /** Hand a not-yet-active touch drag over to canvas panning. */
  private _startPanFromDrag(event: PointerEvent, drag: MindMapDragState): void {
    this._drag.dragState = null;
    this._unbindDragWindowListeners();

    if (this._notebook.mode === "edit") {
      this._commitActiveCellEdit();
    }

    this._isPanning = true;
    this._panPointerId = event.pointerId;
    this._panStart = {
      x: drag.startX,
      y: drag.startY,
      panX: this._panX,
      panY: this._panY,
    };
    this._suppressCellClickUntil = performance.now() + 500;

    try {
      this._viewport.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail if the pointer was already released.
    }

    this._viewport.classList.add("is-panning");
    this._panX = this._panStart.panX + (event.clientX - drag.startX);
    this._panY = this._panStart.panY + (event.clientY - drag.startY);
    this._applyTransform();
  }

  /** Abort an in-flight node drag without dropping (Esc, pointercancel). */
  private _cancelNodeDrag(): void {
    const drag = this._drag.dragState;

    if (!drag) {
      return;
    }

    this._drag.dragState = null;
    this._unbindDragWindowListeners();

    if (drag.active) {
      this._suppressCellClickUntil = performance.now() + 500;
    }

    this._drag.clearUi();

    try {
      if (this._viewport.hasPointerCapture(drag.pointerId)) {
        this._viewport.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // Ignore release errors when capture was never taken.
    }
  }

  private _onPointerCancel = (event: PointerEvent): void => {
    this._releaseTouchPoint(event);
    const drag = this._drag.dragState;

    if (drag && drag.pointerId === event.pointerId) {
      this._cancelNodeDrag();
      return;
    }

    this._onPointerUp(event);
  };

  private _onDragKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this._drag.dragState) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this._cancelNodeDrag();
  };

  private _onPointerUp = (event: PointerEvent): void => {
    this._releaseTouchPoint(event);

    if (this._resizeState && this._resizeState.pointerId === event.pointerId) {
      this._finishResize();
      this._viewport.releasePointerCapture(event.pointerId);
      return;
    }

    if (this._drag.dragState && this._drag.dragState.pointerId === event.pointerId) {
      const drag = this._drag.dragState;
      // Clear first so a second listener (viewport + window) is a no-op.
      this._drag.dragState = null;
      this._unbindDragWindowListeners();

      if (drag.active) {
        this._suppressCellClickUntil = performance.now() + 500;
        this._drag.completeNodeDrag(drag.nodeIds);
        this._lastCellTap = null;
      } else {
        const index = this._getCellIndexFromNodeId(drag.nodeId);

        if (index >= 0) {
          const now = performance.now();
          const doubleTap =
            this._lastCellTap !== null &&
            this._lastCellTap.nodeId === drag.nodeId &&
            now - this._lastCellTap.at <= CELL_DOUBLE_TAP_MS;

          if (doubleTap) {
            this._lastCellTap = null;
            this._suppressCellClickUntil = performance.now() + 500;
            void this._enterCellEditMode(index);
          } else {
            this._lastCellTap = { nodeId: drag.nodeId, at: now };
            // Selection is handled in _onCellClick (supports ⌘/Ctrl multi-select).
          }
        }
      }

      this._drag.clearUi();

      try {
        if (this._viewport.hasPointerCapture(event.pointerId)) {
          this._viewport.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore release errors when capture was never taken.
      }

      return;
    }

    if (!this._isPanning || this._panPointerId !== event.pointerId) {
      return;
    }

    this._isPanning = false;
    this._panPointerId = null;
    this._viewport.releasePointerCapture(event.pointerId);
    this._viewport.classList.remove("is-panning");
    this._clearWheelPanMomentum();
    this._viewportCtrl.lockPan(VIEWPORT_PAN_LOCK_AFTER_PAN_MS);
  };

  private _applyResizeWidth(nodeId: string, width: number): void {
    if (!this._resizeState || this._resizeState.nodeId !== nodeId) {
      return;
    }

    if (this._resizeState.currentWidth === width) {
      return;
    }

    this._resizeState.currentWidth = width;

    if (this._equalNodeWidth || this._adaptiveNodeWidth) {
      this._dimensionCacheByModelId.clear();
      this._resolvedAdaptiveWidths.clear();
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

    // Equal and/or Fit content: drag updates the global (max) width setting.
    if (this._equalNodeWidth || this._adaptiveNodeWidth) {
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
    const { outline } = this._getOutlineSnapshot();
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
      // Capture phase: beat viewport pointerdown / right-edge resize before bubble.
      button.addEventListener(
        "pointerdown",
        (event) => {
          if (event.button !== 0) {
            return;
          }

          event.stopPropagation();
          event.stopImmediatePropagation();
        },
        true,
      );
      cellNode.prepend(button);
    }

    const hiddenCount = collapsed
      ? countOutlineDescendants(outlineNode)
      : 0;
    const label = collapsed
      ? this._t.expandBranch(hiddenCount)
      : this._t.collapseBranch();

    // Update in place: this runs on every layout pass, and replacing the
    // children while the pointer is down drops the click (the press started on
    // a node that no longer exists), so only a very quick tap would register.
    setIfChanged(button, "title", label);
    setIfChanged(button, "aria-label", label);
    setIfChanged(button, "aria-expanded", collapsed ? "false" : "true");

    let arrow = button.querySelector<HTMLElement>(
      ":scope > .jp-KuusiNotebookMindMap-collapse-arrow",
    );

    if (!arrow) {
      arrow = document.createElement("span");
      arrow.className = "jp-KuusiNotebookMindMap-collapse-arrow";
      button.prepend(arrow);
    }

    const arrowText = collapsed ? "▸" : "▾";

    if (arrow.textContent !== arrowText) {
      arrow.textContent = arrowText;
    }

    let count = button.querySelector<HTMLElement>(
      ":scope > .jp-KuusiNotebookMindMap-collapse-count",
    );

    if (collapsed && hiddenCount > 0) {
      if (!count) {
        count = document.createElement("span");
        count.className = "jp-KuusiNotebookMindMap-collapse-count";
        button.appendChild(count);
      }

      if (count.textContent !== String(hiddenCount)) {
        count.textContent = String(hiddenCount);
      }
    } else {
      count?.remove();
    }

    // Keep the control’s corner in lockstep with Node → Corner (and radius).
    const corner = this._appearanceSettings.nodeBorderCorner;
    button.style.borderRadius =
      corner === "ellipse"
        ? "999px"
        : resolveNodeBorderRadius(this._appearanceSettings);
  }

  private _resolveLayoutPosition(
    layout: LayoutPosition,
    nodeId: string,
  ): LayoutPosition {
    const node = this._cellNodes.get(nodeId);

    if (!node) {
      return layout;
    }

    // Prefer live geometry so arrows stay on the card center after text
    // reflow / markdown render, even before the next full dagre pass.
    // Include drag-preview translates so connectors follow the placeholder.
    const left = Number.parseFloat(node.style.left);
    const top = Number.parseFloat(node.style.top);
    const translate = this._drag.readCssTranslate(node);

    return {
      ...layout,
      x: (Number.isFinite(left) ? left : layout.x) + translate.x,
      y: (Number.isFinite(top) ? top : layout.y) + translate.y,
      width: node.offsetWidth || layout.width,
      height: node.offsetHeight || layout.height,
    };
  }

  /**
   * While dragging, rewire incoming edges of the moved roots onto the
   * prospective drop parent so the translucent placeholder shows a connector.
   */
  private _collectEdgesForRender(outline: OutlineNode) {
    const edges = collectOutlineEdges(outline, this._collapsedNodes);
    const draggedIds = this._drag.dragState?.nodeIds ?? [];

    if (
      !this._drag.dragState?.active ||
      draggedIds.length === 0 ||
      !this._drag.dropTargetNodeId ||
      !this._drag.dropZone
    ) {
      return edges;
    }

    const primaryId = draggedIds[0]!;
    const drop = resolveDropTarget(
      outline,
      primaryId,
      this._drag.dropTargetNodeId,
      this._drag.dropZone,
    );

    if (!drop) {
      return edges;
    }

    const roots = collectOutlineSelectionRoots(outline, draggedIds);
    const rootSet = new Set(roots.length > 0 ? roots : [primaryId]);
    const filtered = edges.filter(({ toId }) => !rootSet.has(toId));

    // Top-level drop under the synthetic outline root has no parent edge.
    if (drop.parentId !== "root" && drop.parentId !== outline.id) {
      rootSet.forEach((nodeId) => {
        filtered.push({ fromId: drop.parentId, toId: nodeId });
      });
    }

    return filtered;
  }

  /**
   * Stamp every node with its depth bucket's fill / border overrides. Runs
   * after the per-node frame so a node's own fill keeps priority.
   */
  private _applyLevelStyles(outline: OutlineNode | null): void {
    if (!outline) {
      return;
    }

    const levels = this._appearanceSettings.levelStyles;
    const info = computeEdgeInfo(
      collectOutlineEdges(outline, this._collapsedNodes),
    );

    this._cellNodes.forEach((node, nodeId) => {
      const level = levelIdForDepth(info.get(nodeId)?.depth ?? 0);
      const index = this._getCellIndexFromNodeId(nodeId);
      const cell = index >= 0 ? this._notebook.widgets[index] : null;

      applyLevelStyleToNode(
        node,
        level,
        levels[level],
        cell ? readCellFrameStyle(cell.model) : {},
        resolveNodeForeground,
      );
    });
  }

  private _renderEdges(
    outline: OutlineNode,
    positions: Map<string, LayoutPosition>,
  ): void {
    const edges = this._collectEdgesForRender(outline);
    const ns = "http://www.w3.org/2000/svg";

    if (!this._edgesSvg) {
      this._edgesSvg = document.createElementNS(ns, "svg");
      this._edgesSvg.classList.add("jp-KuusiNotebookMindMap-edges");
      this._edgesSvg.setAttribute("overflow", "visible");
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
    const pathMeta: Array<{ depth: number; branch: number } | undefined> = [];
    const edgeInfo = computeEdgeInfo(edges);
    const { edgeTaper, edgeMinWidth, edgeBranchColors } =
      this._appearanceSettings;
    const edgeMinWidthPx = parseEdgeWidthPx(edgeMinWidth);

    edges.forEach(({ fromId, toId }) => {
      const fromLayout = positions.get(fromId);
      const toLayout = positions.get(toId);

      if (!fromLayout || !toLayout) {
        return;
      }

      const from = this._resolveLayoutPosition(fromLayout, fromId);
      const to = this._resolveLayoutPosition(toLayout, toId);
      pathMeta.push(edgeInfo.get(toId));
      pathData.push(
        buildMindMapEdgePath(
          from,
          to,
          this._treeDirection,
          this._appearanceSettings.edgeRoute,
        ),
      );
    });

    pathData.forEach((d, index) => {
      let path = paths[index];

      if (!path) {
        path = document.createElementNS(ns, "path");
        path.setAttribute("class", "jp-KuusiNotebookMindMap-edge");
        svg.appendChild(path);
      }

      path.setAttribute("d", d);
      const meta = pathMeta[index];
      // Keep stroke width in SVG user units so markers stay aligned under zoom.
      path.setAttribute(
        "stroke-width",
        String(
          edgeTaper && meta
            ? taperedEdgeWidth(edgeWidthPx, edgeMinWidthPx, meta.depth)
            : edgeWidthPx,
        ),
      );

      if (edgeBranchColors !== "off" && meta) {
        // Arrow markers use context-stroke, so they follow this color.
        (path as SVGElement).style.stroke = branchEdgeColor(
          edgeBranchColors,
          meta.branch,
        );
      } else {
        (path as SVGElement).style.removeProperty("stroke");
      }

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

    const { cells: orderedCells, outline } = this._getOutlineSnapshot();
    this._pruneCollapsedNodes(outline);
    const visibleIds = getVisibleOutlineNodeIds(outline, this._collapsedNodes);
    const visibleCellIndices = collectVisibleCellIndices(
      outline,
      visibleIds,
      this._collapsedNodes,
    );
    const { dimensions: collected, measuredFresh } =
      await this._collectNodeDimensions(
        visibleCellIndices,
        orderedCells,
        outline,
      );
    let nodeDimensions = collected;

    if (generation !== this._layoutGeneration || this.isDisposed) {
      return;
    }

    let finalPositions: Map<string, LayoutPosition> | null = null;
    // Warm (cached) layouts still get one correction pass: markdown render /
    // font reflow often change height after the previous cache entry.
    const maxPasses = measuredFresh ? 6 : 2;

    for (let pass = 0; pass < maxPasses; pass += 1) {
      const positions = this._computeLayoutPositions(outline, nodeDimensions);
      finalPositions = positions;
      const canvasSize = this._positionVisibleCells(
        visibleCellIndices,
        orderedCells,
        outline,
        positions,
      );

      this._applyLevelStyles(outline);
      this._renderEdges(outline, positions);
      this._updateCanvasSize(canvasSize.width, canvasSize.height);

      if (pass >= maxPasses - 1) {
        break;
      }

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

    if (this._pendingFit && this.fitToView()) {
      this._pendingFit = false;
    }

    this._lastOutline = outline;
    this._lastLayoutPositions = finalPositions;
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

        this._viewportCtrl.centerOrSchedule(index);
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

    const heldPan = this._viewportCtrl.heldPan;
    if (heldPan) {
      this._panX = heldPan.x;
      this._panY = heldPan.y;
      this._applyTransform();
    }

    if (!this._viewportCtrl.isPanLocked()) {
      // Font/settings / markdown reflow after open or notebook sync.
      this._viewportCtrl.followIfNeeded();
    }
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

    // Only rewrite display:none for nodes that just left the visible set.
    // First layout has an empty previous set — hide every non-visible widget.
    if (this._previousVisibleCellIndices.size === 0) {
      this._notebook.widgets.forEach((cell, index) => {
        if (!visibleCellIndices.has(index)) {
          cell.node.style.display = "none";
        }
      });
    } else {
      this._previousVisibleCellIndices.forEach((index) => {
        if (visibleCellIndices.has(index)) {
          return;
        }

        const cell = this._notebook.widgets[index];

        if (cell && !cell.isDisposed) {
          cell.node.style.display = "none";
        }
      });
    }

    visibleCellIndices.forEach((index) => {
      const cell = this._notebook.widgets[index];

      if (!cell || cell.isDisposed) {
        return;
      }

      const nodeId = `cell-${index}`;
      const layout = positions.get(nodeId);

      if (!layout) {
        cell.node.style.display = "none";
        return;
      }

      const notebookCell = orderedCells[index];

      if (cell.node.parentElement !== this._scene) {
        this._scene.appendChild(cell.node);
      }

      cell.node.dataset.nodeId = nodeId;
      cell.node.classList.add("jp-KuusiNotebookMindMap-cellNode");
      this._prepareCellForDisplay(cell, index);
      this._ensureResizeHandle(cell.node);

      if (notebookCell) {
        const outlineNode = this._findOutlineNodeById(outline, nodeId);
        applyNodeFrameToElement(
          cell.node,
          notebookCell,
          outlineVisualHeadingLevel(outlineNode?.headingLevel ?? null),
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

    this._previousVisibleCellIndices = new Set(visibleCellIndices);

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

  /**
   * Preferred single-line content width (uncapped by user max).
   * Avoids `width:100%` children collapsing `max-content` to min-content,
   * which was wrapping short titles onto two lines.
   */
  private _measureIntrinsicNodeWidth(node: HTMLElement): number {
    const previous = {
      width: node.style.width,
      maxWidth: node.style.maxWidth,
      minWidth: node.style.minWidth,
    };

    const nowrapRestores: Array<{
      el: HTMLElement;
      whiteSpace: string;
      width: string;
    }> = [];

    node
      .querySelectorAll(
        ".jp-MarkdownOutput, .jp-RenderedHTMLCommon, .cm-content, .cm-line",
      )
      .forEach((el) => {
        if (!(el instanceof HTMLElement)) {
          return;
        }

        nowrapRestores.push({
          el,
          whiteSpace: el.style.whiteSpace,
          width: el.style.width,
        });
        // Force unwrapped preferred width so short titles aren't measured narrow.
        el.style.whiteSpace = "nowrap";
        el.style.width = "max-content";
      });

    node.style.width = "max-content";
    node.style.maxWidth = "none";
    node.style.minWidth = "max-content";
    void node.offsetWidth;

    let contentSpan = 0;

    nowrapRestores.forEach(({ el }) => {
      contentSpan = Math.max(contentSpan, el.scrollWidth, el.offsetWidth);
    });

    const styles = window.getComputedStyle(node);
    const chromeX =
      (Number.parseFloat(styles.paddingLeft) || 0) +
      (Number.parseFloat(styles.paddingRight) || 0) +
      (Number.parseFloat(styles.borderLeftWidth) || 0) +
      (Number.parseFloat(styles.borderRightWidth) || 0);

    // +8px slack: subpixel rounding / border-box otherwise wraps the last glyph.
    const measured = Math.ceil(
      Math.max(
        node.offsetWidth,
        node.scrollWidth,
        contentSpan + chromeX,
        LAYOUT_NODE_WIDTH.min,
      ) + 8,
    );

    nowrapRestores.forEach(({ el, whiteSpace, width }) => {
      el.style.whiteSpace = whiteSpace;
      el.style.width = width;
    });

    node.style.width = previous.width;
    node.style.maxWidth = previous.maxWidth;
    node.style.minWidth = previous.minWidth;

    return clampNodeWidth(measured);
  }

  private _capAdaptiveWidth(intrinsic: number): number {
    return Math.min(intrinsic, this._nodeWidth);
  }

  private _isCellEditingMarkdown(cell: Cell, index: number): boolean {
    if (!(cell instanceof MarkdownCell)) {
      return false;
    }

    // Protect insert→edit races: layout must not force-render this cell.
    if (this._pendingEditCellIndex === index) {
      return true;
    }

    if (this._isEditEntryProtected(index)) {
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
          if (this.isDisposed || cell.isDisposed) {
            resolve();
            return;
          }

          const handler = (_sender: MarkdownCell, rendered: boolean) => {
            cell.renderedChanged.disconnect(handler);

            if (rendered) {
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
        outlineVisualHeadingLevel(outlineNode?.headingLevel ?? null),
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
        outlineVisualHeadingLevel(outlineNode?.headingLevel ?? null),
      );
    }

    if (cell instanceof MarkdownCell && !this._isCellEditingMarkdown(cell, index)) {
      if (!cell.rendered) {
        await new Promise<void>((resolve) => {
          if (this.isDisposed || cell.isDisposed) {
            resolve();
            return;
          }

          const handler = (_sender: MarkdownCell, rendered: boolean) => {
            cell.renderedChanged.disconnect(handler);

            if (rendered) {
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
  ): Promise<{
    dimensions: Map<string, { width: number; height: number }>;
    measuredFresh: boolean;
  }> {
    if (this._adaptiveNodeWidth) {
      return this._collectAdaptiveNodeDimensions(
        visibleCellIndices,
        orderedCells,
        outline,
      );
    }

    this._resolvedAdaptiveWidths.clear();

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

    return {
      dimensions,
      measuredFresh: measureTasks.length > 0,
    };
  }

  /**
   * Fit-content widths: each node = min(content, max); with Equal width,
   * all share min(max(content), max).
   */
  private async _collectAdaptiveNodeDimensions(
    visibleCellIndices: Set<number>,
    orderedCells: NotebookCell[],
    outline: OutlineNode,
  ): Promise<{
    dimensions: Map<string, { width: number; height: number }>;
    measuredFresh: boolean;
  }> {
    const dimensions = new Map<string, { width: number; height: number }>();
    const naturalByNodeId = new Map<string, number>();
    const visible: Array<{ cell: Cell; index: number; nodeId: string }> = [];

    this._notebook.widgets.forEach((cell, index) => {
      if (!visibleCellIndices.has(index)) {
        return;
      }

      visible.push({ cell, index, nodeId: `cell-${index}` });
    });

    await Promise.all(
      visible.map(async ({ cell, index, nodeId }) => {
        const node = cell.node;
        const notebookCell = orderedCells[index];

        node.dataset.nodeId = nodeId;
        node.classList.add("jp-KuusiNotebookMindMap-cellNode");

        if (notebookCell) {
          const outlineNode = this._findOutlineNodeById(outline, nodeId);
          applyNodeFrameToElement(
            node,
            notebookCell,
            outlineVisualHeadingLevel(outlineNode?.headingLevel ?? null),
          );
          // Reserve collapse padding before measuring, or short titles wrap.
          this._ensureCollapseControl(node, outlineNode);
        } else {
          this._ensureCollapseControl(node, null);
        }

        await this._ensureCellReadyForMeasure(cell, index);

        if (this.isDisposed || cell.isDisposed) {
          return;
        }

        naturalByNodeId.set(nodeId, this._measureIntrinsicNodeWidth(node));
      }),
    );

    let sharedWidth: number | null = null;

    if (this._equalNodeWidth) {
      let widest: number = LAYOUT_NODE_WIDTH.min;

      naturalByNodeId.forEach((natural) => {
        widest = Math.max(widest, natural);
      });

      sharedWidth = this._capAdaptiveWidth(widest);
    }

    this._resolvedAdaptiveWidths.clear();

    const measureTasks = visible.map(async ({ cell, index, nodeId }) => {
      const natural = naturalByNodeId.get(nodeId) ?? this._nodeWidth;
      let width =
        sharedWidth !== null
          ? sharedWidth
          : this._capAdaptiveWidth(natural);

      if (
        this._resizeState &&
        (this._equalNodeWidth || this._resizeState.nodeId === nodeId)
      ) {
        width = this._resizeState.currentWidth;
      }

      this._resolvedAdaptiveWidths.set(nodeId, width);

      const measured = await this._measureCellDimensions(
        cell,
        index,
        outline,
        orderedCells,
        width,
      );

      if (measured) {
        dimensions.set(nodeId, measured);
        this._dimensionCacheByModelId.set(cell.model.id, measured);
      }
    });

    await Promise.all(measureTasks);

    return {
      dimensions,
      measuredFresh: true,
    };
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
          // Same measure the layout used (border box). `contentRect` leaves out
          // the node's padding and border, so it never matched `layoutHeight`
          // and every layout pass scheduled another one, indefinitely.
          const contentHeight = this._measureNodeHeight(node);

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
          // Snap connectors to the live card center immediately; full packing
          // follows on the debounced relayout.
          this._refreshEdgesFromCache();
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

import type { ICellModel } from "@jupyterlab/cells";
import { Cell, CodeCell, MarkdownCell } from "@jupyterlab/cells";
import type { IEditorMimeTypeService } from "@jupyterlab/codeeditor";
import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
} from "@jupyterlab/docregistry";
import { CommandRegistry } from "@lumino/commands";
import type { INotebookModel } from "@jupyterlab/notebook";
import { Notebook, NotebookActions, NotebookPanel } from "@jupyterlab/notebook";
import type { CellList } from "@jupyterlab/notebook/lib/celllist";
import type { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import type { IObservableList } from "@jupyterlab/observables";
import { Message } from "@lumino/messaging";
import { PanelLayout, Widget } from "@lumino/widgets";
import {
  CommandToolbarButton,
  collapseIcon,
  expandIcon,
  jupyterIcon,
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
  isOutlineDescendant,
  moveOutlineNodes,
  resolveDropTarget,
  getDropZoneFromPointer,
  resolveSiblingGapDrop,
  findOutlineNode,
  findSpatialNavigationTarget,
  outlineVisualHeadingLevel,
  applyNodeFrameToElement,
  type DropZone,
  type LayoutPosition,
  type NotebookCell,
  type OutlineNode,
  type LayoutDensity,
  type TreeDirection,
} from "kuusi-kernel";
import { applyOutlineToNotebook } from "./notebookSync";
import { extendQuietNotebookSync } from "./notebookViewSync";
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
import { closeKuusiDropdownMenus, openKuusiDropdownMenu, positionKuusiDropdownMenu } from "./formatToolbar";
import { modKeyLabel } from "./keyboardGuide";
import {
  commitActiveMindMapCell,
  ensureMindMapRoot,
  handleMindMapShortcut,
  isMindMapEditingText,
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
import { kuusiIcon } from "./kuusiIcon";
import type { ITranslator } from "@jupyterlab/translation";

export const KUUSI_ADD_MINDMAP_COMMAND = "jupyterlab-kuusi:add-mindmap";

const TREE_DIRECTION_LABELS: Record<TreeDirection, string> = {
  TB: "↓",
  BT: "↑",
  LR: "→",
  RL: "←",
};

const DRAG_THRESHOLD_PX = 6;
/**
 * Ignore open-centering against a still-docking / zero-ish split pane.
 * Lumino often reports a tiny non-zero box before the final size lands.
 */
const OPEN_CENTER_MIN_VIEWPORT_PX = 80;
/**
 * After open / notebook sync, keep re-centering through dock resize and
 * markdown reflow so an early pan is not left stale.
 */
const CENTER_FOLLOW_MS = 4000;
/** Require viewport size unchanged this long before ending open-center follow. */
const CENTER_VIEWPORT_STABLE_MS = 280;
/** After drag / manual pan, block auto-recentering this long. */
const VIEWPORT_PAN_LOCK_MS = 1800;
const VIEWPORT_PAN_LOCK_AFTER_PAN_MS = 900;
/** Node must be at least this large before we treat a center attempt as real. */
const OPEN_CENTER_MIN_NODE_PX = 8;
/** Max interval between two taps on the same card to enter edit mode. */
const CELL_DOUBLE_TAP_MS = 450;
/** Ignore transient command-mode flips while the editor is mounting. */
const CELL_EDIT_ENTRY_GUARD_MS = 750;
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

const appearanceEquals = (
  left: AppearanceSettings,
  right: AppearanceSettings,
): boolean =>
  left.edgeStyle === right.edgeStyle &&
  left.edgeRoute === right.edgeRoute &&
  left.edgeArrowDirection === right.edgeArrowDirection &&
  left.edgeArrowStyle === right.edgeArrowStyle &&
  left.edgeWidth === right.edgeWidth &&
  left.edgeColor === right.edgeColor &&
  left.nodeFillColor === right.nodeFillColor &&
  left.nodeBorderStyle === right.nodeBorderStyle &&
  left.nodeBorderWidth === right.nodeBorderWidth &&
  left.nodeBorderColor === right.nodeBorderColor &&
  left.nodeBorderCorner === right.nodeBorderCorner &&
  left.nodeBorderRadius === right.nodeBorderRadius &&
  left.selectionGlowColor === right.selectionGlowColor &&
  left.selectionGlowWidth === right.selectionGlowWidth;

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
  private _adaptiveNodeWidth = false;
  private _nodeWidth: number = LAYOUT_NODE_WIDTH.default;
  /** Last adaptive widths by node id (content-fit, capped by `_nodeWidth`). */
  private _resolvedAdaptiveWidths = new Map<string, number>();
  private _collapsedNodes = new Set<string>();
  private _applyingNotebookChange = false;
  private _dragState: {
    nodeId: string;
    /** Roots moved together (Cmd/Ctrl multi-select). */
    nodeIds: string[];
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
  /** Card geometry at drag start — used for iOS-style sibling gap preview. */
  private _dragBasePositions = new Map<
    string,
    { left: number; top: number; width: number; height: number }
  >();
  private _dragSlotPreviewKey: string | null = null;
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
   */
  private _heldViewportPan: { x: number; y: number } | null = null;
  private _heldViewportPanClearTimer: number | null = null;
  /** Block ensure-visible / open-center while user just panned or dropped a drag. */
  private _viewportPanLockUntil = 0;
  private _centerScheduleGeneration = 0;
  private _dragWindowListening = false;
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
  private _labFullscreenButton: HTMLButtonElement | null = null;
  private _kuusiFullscreenButton: HTMLButtonElement | null = null;
  /** Host that owns the document widget during Kuusi-window fullscreen. */
  private _fullscreenShell: Widget | null = null;
  private _fullscreenRestoreParent: Widget | null = null;
  private _fullscreenRestoreIndex = -1;
  /** True while the Kuusi document lives in the body-level fullscreen shell. */
  private _kuusiFullscreenSession = false;
  /** Guards fullscreenchange while the browser is entering Kuusi fullscreen. */
  private _kuusiFullscreenEntering = false;
  /** Whether the shell currently owns the browser Fullscreen API. */
  private _kuusiNativeFullscreenActive = false;
  private _fullscreenDocInlineStyles: {
    top: string;
    left: string;
    right: string;
    bottom: string;
    width: string;
    height: string;
    position: string;
    zIndex: string;
  } | null = null;
  private _documentWidget: Widget | null = null;
  private _edgeMarkerAttrs: { markerStart?: string; markerEnd?: string } | null =
    null;
  private _formatToolbar: FormatToolbarHandle | null = null;
  private _appearanceToolbar: AppearanceToolbarHandle | null = null;
  private _addMindMapButton: CommandToolbarButton | null = null;
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
  private _mindMapEditFontSize: MindMapFontSize = DEFAULT_MIND_MAP_FONT_SIZE;
  private _mindMapDisplayFontSize: MindMapFontSize = DEFAULT_MIND_MAP_FONT_SIZE;
  private _unifyEditDisplayFont = false;
  private _matchNotebookFont = false;
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
   * One-shot: center the active cell after open/startup layout settles.
   * Cleared once centering succeeds; not used for later selection sync.
   */
  private _pendingOpenCenterIndex: number | null = null;
  private _openCentered = false;
  /** Wall-clock deadline while we keep correcting pan onto `_pendingOpenCenterIndex`. */
  private _centerFollowUntil = 0;
  private _openCenterSettleTimer: number | null = null;
  private _viewportSizeObserver: ResizeObserver | null = null;
  /** Last viewport size seen while open-centering (stability gate). */
  private _centerFollowViewportKey = "";
  private _centerFollowViewportStableSince = 0;
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
        id: "history",
        group: "structure",
        order: 15,
        create: () => this._createHistoryToolbar(),
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
              const patch: Partial<MindMapUserSettings> = {
                editFont,
                matchNotebookFont:
                  editFont === "notebook" ? this._matchNotebookFont : false,
              };

              if (this._unifyEditDisplayFont) {
                patch.displayFont = editFont;
              }

              void this._settingsManager.update(patch);
            },
            () => this._mindMapEditFontSize,
            (editFontSize) => {
              const patch: Partial<MindMapUserSettings> = { editFontSize };

              if (this._unifyEditDisplayFont) {
                patch.displayFontSize = editFontSize;
              }

              void this._settingsManager.update(patch);
            },
            () => this._mindMapDisplayFont,
            (displayFont) => {
              const patch: Partial<MindMapUserSettings> = {
                displayFont,
                matchNotebookFont:
                  displayFont === "notebook" ? this._matchNotebookFont : false,
              };

              if (this._unifyEditDisplayFont) {
                patch.editFont = displayFont;
              }

              void this._settingsManager.update(patch);
            },
            () => this._mindMapDisplayFontSize,
            (displayFontSize) => {
              const patch: Partial<MindMapUserSettings> = { displayFontSize };

              if (this._unifyEditDisplayFont) {
                patch.editFontSize = displayFontSize;
              }

              void this._settingsManager.update(patch);
            },
            () => this._unifyEditDisplayFont,
            (unifyEditDisplayFont) => {
              const patch: Partial<MindMapUserSettings> = {
                unifyEditDisplayFont,
              };

              if (unifyEditDisplayFont) {
                patch.displayFont = this._mindMapEditFont;
                patch.displayFontSize = this._mindMapEditFontSize;
              }

              void this._settingsManager.update(patch);
            },
            () => this._matchNotebookFont,
            (matchNotebookFont) => {
              const patch: Partial<MindMapUserSettings> = {
                matchNotebookFont,
              };

              if (matchNotebookFont) {
                patch.editFont = "notebook";
                patch.displayFont = "notebook";
              }

              void this._settingsManager.update(patch);
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
    this._ensureViewportSizeObserver();

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

    this._mindMapTheme = settings.theme;
    this._mindMapEditFont = settings.editFont;
    this._mindMapDisplayFont = settings.displayFont;
    this._mindMapEditFontSize = settings.editFontSize;
    this._mindMapDisplayFontSize = settings.displayFontSize;
    this._unifyEditDisplayFont = settings.unifyEditDisplayFont;
    this._matchNotebookFont = settings.matchNotebookFont;
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
    this._appearanceSettings = { ...settings.appearance };
    this._updateDirectionButtons();
    this._applyScenePresentation();
    this._applyBackground();
    this._syncSceneEditMode();

    const geometryChanged =
      fontChanged || widthChanged || layoutGeometryChanged;

    if (fontChanged || widthChanged) {
      // Font/width changes alter node sizes; drop caches so layout remeasures.
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
      if (fontChanged || widthChanged) {
        void this._relayoutAfterPresentationChange();
        return;
      }

      this._applyLayout();
      return;
    }

    // Theme / background / line style: CSS (+ edge paths) only — no remeasure.
    if (appearanceChanged) {
      this._refreshEdgesFromCache();
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

    // Tab revisit: layout only — do not restart the open-center follow loop.
    if (this._openCentered) {
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
    this._cancelCenterFollow();
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
    this._heldViewportPan = null;
    this._viewportAnchor = null;
    this._beginCenterFollow(cellIndex);
    this.syncActiveCellFromNotebook(cellIndex, { center: true });
  }

  /**
   * Track a cell for repeated centering until dock/markdown layout settles.
   * Used for both Kuusi open and notebook → mind-map selection sync.
   */
  private _beginCenterFollow(cellIndex: number): void {
    if (this._openCenterSettleTimer !== null) {
      window.clearTimeout(this._openCenterSettleTimer);
      this._openCenterSettleTimer = null;
    }

    this._openCentered = false;
    this._pendingOpenCenterIndex = cellIndex;
    this._centerFollowUntil = performance.now() + CENTER_FOLLOW_MS;
    this._centerFollowViewportKey = "";
    this._centerFollowViewportStableSince = 0;
    this._ensureViewportSizeObserver();
  }

  /** User navigation always wins over automatic open/selection centering. */
  private _cancelCenterFollow(): void {
    this._centerScheduleGeneration += 1;
    this._pendingOpenCenterIndex = null;
    this._openCentered = true;
    this._centerFollowUntil = 0;
    this._centerFollowViewportKey = "";
    this._centerFollowViewportStableSince = 0;

    if (this._openCenterSettleTimer !== null) {
      window.clearTimeout(this._openCenterSettleTimer);
      this._openCenterSettleTimer = null;
    }
  }

  private _isViewportPanLocked(): boolean {
    return (
      this._heldViewportPan !== null ||
      performance.now() < this._viewportPanLockUntil
    );
  }

  private _lockViewportPan(ms: number): void {
    this._viewportPanLockUntil = Math.max(
      this._viewportPanLockUntil,
      performance.now() + ms,
    );
  }

  /** Keep camera fixed through post-drop relayout + delayed notebook sync. */
  private _holdViewportPan(): void {
    this._heldViewportPan = { x: this._panX, y: this._panY };

    if (this._heldViewportPanClearTimer !== null) {
      window.clearTimeout(this._heldViewportPanClearTimer);
    }

    this._heldViewportPanClearTimer = window.setTimeout(() => {
      this._heldViewportPanClearTimer = null;
      this._heldViewportPan = null;
    }, VIEWPORT_PAN_LOCK_MS);
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
    this._viewportSizeObserver?.disconnect();
    this._viewportSizeObserver = null;
    if (this._openCenterSettleTimer !== null) {
      window.clearTimeout(this._openCenterSettleTimer);
      this._openCenterSettleTimer = null;
    }
    if (this._heldViewportPanClearTimer !== null) {
      window.clearTimeout(this._heldViewportPanClearTimer);
      this._heldViewportPanClearTimer = null;
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
    document.removeEventListener("fullscreenchange", this._onFullscreenChange);
    document.removeEventListener(
      "webkitfullscreenchange",
      this._onFullscreenChange,
    );
    void this._exitElementFullscreen().catch(() => undefined);
    this._restoreDocumentFromFullscreen();
    if (this._fullscreenShell && !this._fullscreenShell.isDisposed) {
      this._fullscreenShell.dispose();
      this._fullscreenShell = null;
    }
    this._unbindViewportEvents();
    this._unbindCellInteractionEvents();
    this._unbindKeyboardEvents();
    this._clearDragUi();

    if (this._notebookAttached && this._notebook.isAttached) {
      Widget.detach(this._notebook);
    }

    this._addMindMapButton?.dispose();
    this._addMindMapButton = null;
    this._undoManagerCleanup?.();
    this._undoManagerCleanup = null;
    this._undoButton = null;
    this._redoButton = null;
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
      this._invalidateOutlineCache();

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
        openKuusiDropdownMenu(menu, this.node);
      }
    });

    dropdown.appendChild(trigger);
    dropdown.appendChild(menu);
    toolbar.appendChild(dropdown);

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

  /** Node ids to move when dragging `nodeId` (multi-select → selection roots). */
  private _resolveDragNodeIds(nodeId: string): string[] {
    const selected = this._getSelectedNodeIds();

    if (selected.length <= 1 || !selected.includes(nodeId)) {
      return [nodeId];
    }

    const { outline } = this._getOutlineSnapshot();
    const roots = collectOutlineSelectionRoots(outline, selected);

    return roots.length > 0 ? roots : [nodeId];
  }

  private _isDraggedRelatedNode(
    outline: OutlineNode,
    draggedIds: readonly string[],
    nodeId: string,
  ): boolean {
    return draggedIds.some(
      (draggedId) =>
        draggedId === nodeId ||
        isOutlineDescendant(outline, draggedId, nodeId),
    );
  }

  private _closeDirectionMenu(): void {
    this._directionMenu?.classList.remove("is-open");
  }

  /** Close tree / zoom / toolbar dropdowns (single document click handler). */
  private _closeFloatingMenus(): void {
    this._closeDirectionMenu();
    this._closeZoomSlider();
    closeKuusiDropdownMenus(this.node);
  }

  private _onDocumentClick = (): void => {
    this._closeFloatingMenus();
  };

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

    const labButton = document.createElement("button");
    labButton.type = "button";
    labButton.className =
      "jp-KuusiNotebookMindMap-status-fullscreen-btn jp-KuusiNotebookMindMap-status-fullscreen-btn-lab";
    this._labFullscreenButton = labButton;
    labButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this._onLabFullscreenClick();
    });

    const kuusiButton = document.createElement("button");
    kuusiButton.type = "button";
    kuusiButton.className =
      "jp-KuusiNotebookMindMap-status-fullscreen-btn jp-KuusiNotebookMindMap-status-fullscreen-btn-kuusi";
    this._kuusiFullscreenButton = kuusiButton;
    kuusiButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this._onKuusiFullscreenClick();
    });

    this._updateFullscreenButtons();

    wrapper.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    wrapper.append(labButton, kuusiButton);
    return wrapper;
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

  private _getDocumentWidget(): Widget | null {
    return this._documentWidget ?? this._findDocumentWidget();
  }

  private _rememberDockInlineGeometry(doc: Widget): void {
    const style = doc.node.style;
    this._fullscreenDocInlineStyles = {
      top: style.top,
      left: style.left,
      right: style.right,
      bottom: style.bottom,
      width: style.width,
      height: style.height,
      position: style.position,
      zIndex: style.zIndex,
    };
  }

  private _clearDockInlineGeometry(doc: Widget): void {
    const style = doc.node.style;
    style.top = "";
    style.left = "";
    style.right = "";
    style.bottom = "";
    style.width = "";
    style.height = "";
    style.position = "";
    style.zIndex = "";
  }

  private _restoreDockInlineGeometry(doc: Widget): void {
    const saved = this._fullscreenDocInlineStyles;

    if (!saved) {
      return;
    }

    const style = doc.node.style;
    style.top = saved.top;
    style.left = saved.left;
    style.right = saved.right;
    style.bottom = saved.bottom;
    style.width = saved.width;
    style.height = saved.height;
    style.position = saved.position;
    style.zIndex = saved.zIndex;
    this._fullscreenDocInlineStyles = null;
  }

  /** Whole JupyterLab shell (or documentElement) for Lab-level fullscreen. */
  private _getLabFullscreenTarget(): HTMLElement {
    return (
      (document.getElementById("jp-main-app") as HTMLElement | null) ??
      (document.querySelector(".jp-LabShell") as HTMLElement | null) ??
      document.documentElement
    );
  }

  /**
   * Dedicated host for Kuusi-window fullscreen. Reparenting the document
   * out of the Lumino dock avoids absolute positioning fighting :fullscreen.
   */
  private _getFullscreenShell(): Widget {
    if (!this._fullscreenShell || this._fullscreenShell.isDisposed) {
      const shell = new Widget();
      shell.addClass("jp-KuusiFullscreenShell");
      shell.layout = new PanelLayout();
      Widget.attach(shell, document.body);
      this._fullscreenShell = shell;
    }

    return this._fullscreenShell;
  }

  /** Show the body-level shell that hosts the reparented document widget. */
  private _showKuusiFullscreenShell(): void {
    const shell = this._getFullscreenShell();
    shell.addClass("is-kuusi-fullscreen-active");
    shell.show();
    shell.node.style.display = "flex";
    shell.node.style.visibility = "visible";
    shell.node.style.pointerEvents = "auto";
  }

  /** Hide the body-level shell after restoring the document to the dock. */
  private _hideKuusiFullscreenShell(): void {
    const shell = this._fullscreenShell;

    if (!shell || shell.isDisposed) {
      return;
    }

    shell.removeClass("is-kuusi-fullscreen-active");
    shell.removeClass("is-kuusi-maximized");
    shell.node.style.display = "";
    shell.node.style.visibility = "";
    shell.node.style.pointerEvents = "";
    shell.hide();
  }

  private _restoreDocumentFromFullscreen(): void {
    const doc = this._getDocumentWidget();
    const restoreParent = this._fullscreenRestoreParent;
    const restoreIndex = this._fullscreenRestoreIndex;
    const shell = this._fullscreenShell;

    if (!doc || !restoreParent || !shell || doc.parent !== shell) {
      return;
    }

    const layout = restoreParent.layout as PanelLayout | null;

    if (layout) {
      // PanelLayout.insert/addWidget reparents a child safely. Widget.detach()
      // is only valid for root widgets attached with Widget.attach().
      if (restoreIndex >= 0 && restoreIndex <= layout.widgets.length) {
        layout.insertWidget(restoreIndex, doc);
      } else {
        layout.addWidget(doc);
      }
    }

    this._fullscreenRestoreParent = null;
    this._fullscreenRestoreIndex = -1;
    this._kuusiFullscreenSession = false;
    this._kuusiNativeFullscreenActive = false;
    this._restoreDockInlineGeometry(doc);
    this._hideKuusiFullscreenShell();
  }

  private _onFullscreenChange = (): void => {
    if (this._kuusiFullscreenEntering) {
      this._updateFullscreenButtons();
      this._syncFullscreenLayout();
      return;
    }

    const shell = this._fullscreenShell;

    if (
      this._kuusiFullscreenSession &&
      this._kuusiNativeFullscreenActive &&
      shell &&
      this._fullscreenElement() !== shell.node
    ) {
      this._restoreDocumentFromFullscreen();
    }

    this._updateFullscreenButtons();
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

        const shell = this._fullscreenShell;
        const doc = this._getDocumentWidget();

        if (
          shell &&
          (this._fullscreenElement() === shell.node ||
            shell.node.classList.contains("is-kuusi-fullscreen-active"))
        ) {
          shell.update();
          doc?.update();
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
    if (!this._kuusiFullscreenSession) {
      return false;
    }

    const shell = this._fullscreenShell;

    return Boolean(
      shell &&
        (this._fullscreenElement() === shell.node ||
          shell.node.classList.contains("is-kuusi-maximized") ||
          shell.node.classList.contains("is-kuusi-fullscreen-active")),
    );
  }

  private _isLabFullscreen(): boolean {
    const fullscreen = this._fullscreenElement();

    if (!fullscreen || this._isKuusiFullscreen()) {
      return false;
    }

    const lab = this._getLabFullscreenTarget();

    return (
      fullscreen === lab ||
      fullscreen === document.documentElement ||
      fullscreen === document.body ||
      (fullscreen instanceof HTMLElement &&
        (fullscreen.id === "jp-main-app" ||
          fullscreen.classList.contains("jp-LabShell")))
    );
  }

  private _updateFullscreenButtons(): void {
    const labActive = this._isLabFullscreen();
    const kuusiActive = this._isKuusiFullscreen();

    if (this._labFullscreenButton) {
      const label = labActive
        ? this._t.exitLabFullscreen()
        : this._t.enterLabFullscreen();
      this._labFullscreenButton.title = label;
      this._labFullscreenButton.setAttribute("aria-label", label);
      this._labFullscreenButton.classList.toggle("is-active", labActive);
      this._labFullscreenButton.replaceChildren();
      (labActive ? collapseIcon : jupyterIcon).render(this._labFullscreenButton);
    }

    if (this._kuusiFullscreenButton) {
      const label = kuusiActive
        ? this._t.exitKuusiFullscreen()
        : this._t.enterKuusiFullscreen();
      this._kuusiFullscreenButton.title = label;
      this._kuusiFullscreenButton.setAttribute("aria-label", label);
      this._kuusiFullscreenButton.classList.toggle("is-active", kuusiActive);
      this._kuusiFullscreenButton.replaceChildren();
      (kuusiActive ? collapseIcon : expandIcon).render(
        this._kuusiFullscreenButton,
      );
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

  /**
   * Enter Lab fullscreen from a click. Exit any current fullscreen first
   * (and restore the document if it was reparented into the Kuusi shell)
   * so the browser still treats the chain as a user gesture.
   */
  private async _enterLabFullscreen(): Promise<void> {
    try {
      if (this._fullscreenElement()) {
        await this._exitElementFullscreen();
      }

      this._restoreDocumentFromFullscreen();
      await this._requestElementFullscreen(this._getLabFullscreenTarget());
    } catch (error) {
      console.warn("[kuusi] fullscreen request failed", error);
    }

    this._updateFullscreenButtons();
    this._syncFullscreenLayout();
  }

  /**
   * Kuusi-window fullscreen: reparent the document into a body-level shell,
   * then fullscreen that shell. Direct document fullscreen fights Lumino dock
   * absolute positioning and leaves a broken layout.
   */
  private async _toggleKuusiFullscreen(): Promise<void> {
    const doc = this._getDocumentWidget();

    if (!doc) {
      console.warn("[kuusi] fullscreen document widget not found");
      return;
    }

    const shell = this._getFullscreenShell();

    this._kuusiFullscreenEntering = true;

    try {
      if (this._isKuusiFullscreen()) {
        if (this._kuusiNativeFullscreenActive) {
          await this._exitElementFullscreen();
        }

        this._restoreDocumentFromFullscreen();
        return;
      }

      if (this._fullscreenElement()) {
        await this._exitElementFullscreen();
      }

      if (doc.parent && doc.parent !== shell) {
        const parent = doc.parent;
        const parentLayout = parent.layout as PanelLayout | null;
        this._fullscreenRestoreParent = parent;
        this._fullscreenRestoreIndex = parentLayout
          ? parentLayout.widgets.indexOf(doc)
          : -1;
        (shell.layout as PanelLayout).addWidget(doc);
      } else if (!this._fullscreenRestoreParent) {
        console.warn(
          "[kuusi] fullscreen restore parent missing; cannot reparent document",
        );
        return;
      }

      this._kuusiFullscreenSession = true;
      this._rememberDockInlineGeometry(doc);
      this._clearDockInlineGeometry(doc);
      this._showKuusiFullscreenShell();
      shell.addClass("is-kuusi-maximized");
      doc.update();

      try {
        await this._requestElementFullscreen(shell.node);
        this._kuusiNativeFullscreenActive = true;
      } catch (error) {
        console.warn("[kuusi] fullscreen request failed", error);
        this._kuusiNativeFullscreenActive = false;
      }
    } finally {
      this._kuusiFullscreenEntering = false;
    }

    this._updateFullscreenButtons();
    this._syncFullscreenLayout();
  }

  private _onLabFullscreenClick = (): void => {
    if (this._isLabFullscreen()) {
      void this._exitFullscreen();
      return;
    }

    void this._enterLabFullscreen();
  };

  private _onKuusiFullscreenClick = (): void => {
    void this._toggleKuusiFullscreen();
  };

  private async _exitFullscreen(): Promise<void> {
    try {
      await this._exitElementFullscreen();
    } catch {
      // ignore — restore + button state still run below
    }

    this._restoreDocumentFromFullscreen();
    this._updateFullscreenButtons();
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

  private _centerCellInViewport(index: number): boolean {
    if (this._isViewportPanLocked()) {
      return false;
    }

    const allowCenter =
      this._pendingOpenCenterIndex === index ||
      (this._pendingFocusCellIndex === index && this._pendingFocusCenter);

    if (!allowCenter) {
      return false;
    }

    const node = this._cellNodes.get(`cell-${index}`);

    if (!node || node.style.display === "none") {
      return false;
    }

    // Need a laid-out position; empty left/top means layout has not run yet.
    if (node.style.left === "" || node.style.top === "") {
      return false;
    }

    const viewW = this._viewport.clientWidth;
    const viewH = this._viewport.clientHeight;

    if (
      viewW < OPEN_CENTER_MIN_VIEWPORT_PX ||
      viewH < OPEN_CENTER_MIN_VIEWPORT_PX
    ) {
      return false;
    }

    const worldX = Number.parseFloat(node.style.left) || 0;
    const worldY = Number.parseFloat(node.style.top) || 0;
    // Prefer live box; fall back to width style while markdown is measuring.
    const nodeW =
      node.offsetWidth || Number.parseFloat(node.style.width) || 0;
    const nodeH = node.offsetHeight || 0;

    if (nodeW < OPEN_CENTER_MIN_NODE_PX || nodeH < OPEN_CENTER_MIN_NODE_PX) {
      return false;
    }

    // Absolute pan from layout coords (transform-origin 0 0). More stable than
    // incremental getBoundingClientRect deltas while the dock is still resizing.
    const nextPanX = viewW / 2 - (worldX + nodeW / 2) * this._zoom;
    const nextPanY = viewH / 2 - (worldY + nodeH / 2) * this._zoom;

    if (
      Math.abs(nextPanX - this._panX) < 0.5 &&
      Math.abs(nextPanY - this._panY) < 0.5
    ) {
      return true;
    }

    this._panX = nextPanX;
    this._panY = nextPanY;
    this._applyTransform();
    return true;
  }

  /**
   * Retry centering until the viewport/node are ready (open can race layout).
   */
  private _scheduleCenterOnCell(index: number, attempts = 120): void {
    const generation = this._centerScheduleGeneration;

    const tryCenter = (): boolean => {
      if (this.isDisposed || generation !== this._centerScheduleGeneration) {
        return true;
      }

      if (!this._centerCellInViewport(index)) {
        return false;
      }

      this._noteCenterFollowSuccess(index);
      return true;
    };

    const tick = (left: number): void => {
      if (tryCenter() || left <= 0) {
        return;
      }

      window.requestAnimationFrame(() => {
        tick(left - 1);
      });
    };

    window.requestAnimationFrame(() => {
      tick(attempts);
    });

    // Markdown / dock resize often land after the rAF budget — nudge again.
    [50, 120, 250, 500, 1000, 2000, 3200].forEach((delayMs) => {
      window.setTimeout(() => {
        tryCenter();
      }, delayMs);
    });
  }

  /**
   * Re-center the followed cell while the settle window is open. Extends the
   * window when the viewport is still changing size (split dock animation).
   */
  private _centerFollowIfNeeded(): void {
    if (this._pendingOpenCenterIndex === null) {
      return;
    }

    const now = performance.now();
    const viewKey = `${this._viewport.clientWidth}x${this._viewport.clientHeight}`;

    if (viewKey !== this._centerFollowViewportKey) {
      this._centerFollowViewportKey = viewKey;
      this._centerFollowViewportStableSince = now;
      // Dock still moving — keep following past the base deadline.
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
      return;
    }

    const index = this._pendingOpenCenterIndex;

    if (this._centerCellInViewport(index)) {
      this._noteCenterFollowSuccess(index);
      return;
    }

    this._scheduleCenterOnCell(index);
  }

  private _noteCenterFollowSuccess(index: number): void {
    if (this._pendingOpenCenterIndex !== index) {
      return;
    }

    const now = performance.now();
    // Keep following so late markdown reflow / dock resize can still correct.
    this._centerFollowUntil = Math.max(
      this._centerFollowUntil,
      now + CENTER_VIEWPORT_STABLE_MS + 200,
    );

    if (this._openCenterSettleTimer !== null) {
      window.clearTimeout(this._openCenterSettleTimer);
    }

    const remaining = Math.max(0, this._centerFollowUntil - now);
    this._openCenterSettleTimer = window.setTimeout(() => {
      this._openCenterSettleTimer = null;
      this._centerFollowIfNeeded();
    }, remaining + 16);
  }

  private _ensureViewportSizeObserver(): void {
    if (
      this._viewportSizeObserver ||
      typeof ResizeObserver === "undefined" ||
      this.isDisposed
    ) {
      return;
    }

    this._viewportSizeObserver = new ResizeObserver(() => {
      if (
        this.isDisposed ||
        this._pendingOpenCenterIndex === null ||
        this._isViewportPanLocked()
      ) {
        return;
      }

      // Split-right docking and markdown-driven size changes.
      this._centerFollowIfNeeded();
    });
    this._viewportSizeObserver.observe(this._viewport);
    this._viewportSizeObserver.observe(this.node);
  }

  private _ensureCellVisibleInViewport(
    index: number,
    margin = 48,
    axis: "x" | "y" | "xy" = "xy",
  ): void {
    if (this._isViewportPanLocked()) {
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

    if (!anchor || this._isViewportPanLocked()) {
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
      options.center !== false || this._pendingOpenCenterIndex === cellIndex;

    if (center && this._isViewportPanLocked()) {
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
      this._beginCenterFollow(cellIndex);
    }

    if (needsRelayout || !nodeReady || !this._notebookAttached) {
      this._pendingFocusCellIndex = cellIndex;
      this._pendingFocusCenter = center;
      this._scheduleLayout();
      return;
    }

    if (center) {
      // Always schedule follow-up nudges; first paint often precedes final size.
      if (!this._centerCellInViewport(cellIndex)) {
        this._scheduleCenterOnCell(cellIndex);
      } else {
        this._noteCenterFollowSuccess(cellIndex);
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

      this._cancelCenterFollow();

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
        this._cancelCenterFollow();
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
    this._unbindDragWindowListeners();
  }

  private _bindDragWindowListeners(): void {
    if (this._dragWindowListening) {
      return;
    }

    this._dragWindowListening = true;
    window.addEventListener("pointermove", this._onPointerMove, true);
    window.addEventListener("pointerup", this._onPointerUp, true);
    window.addEventListener("pointercancel", this._onPointerUp, true);
  }

  private _unbindDragWindowListeners(): void {
    if (!this._dragWindowListening) {
      return;
    }

    this._dragWindowListening = false;
    window.removeEventListener("pointermove", this._onPointerMove, true);
    window.removeEventListener("pointerup", this._onPointerUp, true);
    window.removeEventListener("pointercancel", this._onPointerUp, true);
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

  private _bindNotebookEditState(): void {
    this._notebook.activeCellChanged.connect((_sender, cell) => {
      if (this._previousActiveCell instanceof MarkdownCell) {
        this._restoreMarkdownPreview(this._previousActiveCell);
      }

      this._previousActiveCell = cell;
      this._updateSelectedNodeHighlight();
      this._updateFormatToolbar();
      this._appearanceToolbar?.syncSelection();
      this._syncSceneEditMode();
    });

    this._notebook.selectionChanged.connect(() => {
      this._updateSelectedNodeHighlight();
      this._appearanceToolbar?.syncSelection();
    });

    this._notebook.stateChanged.connect((_sender, args) => {
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
      ".jp-KuusiNotebookMindMap-cellNode, .jp-KuusiNotebookMindMap-resizeHandle, .jp-KuusiNotebookMindMap-collapse, .jp-KuusiNotebookMindMap-status",
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

  private _bindMarkdownAnchorStrip(cell: MarkdownCell): void {
    if (cell.node.dataset.kuusiAnchorStripBound === "1") {
      return;
    }

    cell.node.dataset.kuusiAnchorStripBound = "1";

    const strip = (): void => {
      if (this.isDisposed || cell.isDisposed || !cell.rendered) {
        return;
      }

      this._stripInternalHeadingAnchors(cell.node);
    };

    cell.renderedChanged.connect(strip);
    cell.model.contentChanged.connect(() => {
      window.requestAnimationFrame(strip);
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

    this._cancelCenterFollow();
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

    this._panByWheel(-event.deltaX, -event.deltaY);
  };

  private _onPointerDown = (event: PointerEvent): void => {
    // Once the user touches the canvas, never fight their pan/zoom with the
    // startup centering loop.
    this._cancelCenterFollow();

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
        const nodeId = host.dataset.nodeId;
        this._dragState = {
          nodeId,
          nodeIds: this._resolveDragNodeIds(nodeId),
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          active: false,
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

      // Avoid accidental text selection while the pointer is deciding
      // between click and drag.
      if (distance > 2) {
        event.preventDefault();
      }

      if (!drag.active && distance >= DRAG_THRESHOLD_PX) {
        drag.active = true;
        this._lastCellTap = null;
        this._cancelCenterFollow();
        this._lockViewportPan(VIEWPORT_PAN_LOCK_MS);

        const index = this._getCellIndexFromNodeId(drag.nodeId);
        const selected = this._getSelectedNodeIds();

        if (index >= 0 && !selected.includes(drag.nodeId)) {
          // Dragging an unselected card clears multi-select (desktop convention).
          this._selectCell(index);
          drag.nodeIds = [drag.nodeId];
        } else {
          drag.nodeIds = this._resolveDragNodeIds(drag.nodeId);
        }

        try {
          this._viewport.setPointerCapture(event.pointerId);
        } catch {
          // Capture can fail if the pointer was already released.
        }

        this._captureDragBasePositions();
        this._startDragGhost(drag.nodeId, event.clientX, event.clientY);
        drag.nodeIds.forEach((nodeId) => {
          this._cellNodes.get(nodeId)?.classList.add("is-drag-source");
        });
        this._viewport.classList.add("is-node-dragging");
        this._updateDragTarget(event.clientX, event.clientY);
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
      // Clear first so a second listener (viewport + window) is a no-op.
      this._dragState = null;
      this._unbindDragWindowListeners();

      if (drag.active) {
        this._suppressCellClickUntil = performance.now() + 500;
        this._completeNodeDrag(drag.nodeIds);
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

      this._clearDragUi();

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
    this._lockViewportPan(VIEWPORT_PAN_LOCK_AFTER_PAN_MS);
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

    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    button.replaceChildren();

    const arrow = document.createElement("span");
    arrow.className = "jp-KuusiNotebookMindMap-collapse-arrow";
    arrow.textContent = collapsed ? "▸" : "▾";
    button.appendChild(arrow);

    if (collapsed && hiddenCount > 0) {
      const count = document.createElement("span");
      count.className = "jp-KuusiNotebookMindMap-collapse-count";
      count.textContent = String(hiddenCount);
      button.appendChild(count);
    }

    // Keep the control’s corner in lockstep with Node → Corner (and radius).
    const corner = this._appearanceSettings.nodeBorderCorner;
    button.style.borderRadius =
      corner === "ellipse"
        ? "999px"
        : resolveNodeBorderRadius(this._appearanceSettings);
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

    this._dragGhost?.remove();

    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.classList.add("jp-KuusiNotebookMindMap-drag-ghost");
    ghost.classList.remove(
      "is-selected",
      "is-drag-source",
      "is-drop-before",
      "is-drop-inside",
      "is-drop-after",
      "is-slot-neighbor",
      "is-resizing",
      "jp-mod-active",
    );
    ghost.removeAttribute("id");
    ghost.querySelectorAll(
      ".jp-KuusiNotebookMindMap-collapse, .jp-KuusiNotebookMindMap-resizeHandle",
    ).forEach((el) => el.remove());

    // Keep layout size; screen size comes from canvas zoom via transform.
    ghost.style.width = `${source.offsetWidth}px`;
    ghost.style.height = `${source.offsetHeight}px`;
    ghost.style.left = "0";
    ghost.style.top = "0";
    ghost.style.margin = "0";
    ghost.style.zIndex = "10000";
    ghost.style.pointerEvents = "none";
    ghost.style.transformOrigin = "top left";

    // Ghost lives on document.body — copy scene tokens so fonts/colors match.
    const sceneStyle = getComputedStyle(this._scene);
    for (let i = 0; i < sceneStyle.length; i += 1) {
      const name = sceneStyle.item(i);

      if (
        name.startsWith("--kuusi-") ||
        name.startsWith("--jp-content-font") ||
        name.startsWith("--jp-code-font") ||
        name.startsWith("--jp-ui-font") ||
        name.startsWith("--jp-mirror-editor")
      ) {
        ghost.style.setProperty(name, sceneStyle.getPropertyValue(name));
      }
    }

    if (this._scene.dataset.kuusiNodeContrast === "1") {
      const fg =
        source.style.getPropertyValue("--kuusi-node-foreground") ||
        sceneStyle.getPropertyValue("--kuusi-node-foreground");

      if (fg) {
        ghost.style.setProperty("--kuusi-node-foreground", fg);
        ghost.style.color = fg;
      }
    }

    document.body.appendChild(ghost);
    this._dragGhost = ghost;
    this._moveDragGhost(clientX, clientY);
  }

  private _moveDragGhost(clientX: number, clientY: number): void {
    if (!this._dragGhost) {
      return;
    }

    const zoom = this._zoom;
    this._dragGhost.style.transform = `translate(${clientX + 12}px, ${clientY + 12}px) scale(${zoom})`;
  }

  private _updateDragTarget(clientX: number, clientY: number): void {
    this._cellNodes.forEach((node) => {
      node.classList.remove(
        "is-drop-before",
        "is-drop-inside",
        "is-drop-after",
        "is-slot-neighbor",
      );
    });

    this._dropTargetNodeId = null;
    this._dropZone = null;

    const draggedIds = this._dragState?.nodeIds ?? [];

    if (draggedIds.length === 0) {
      return;
    }

    // Hit-test against pre-drag layout boxes in scene space so sibling gap
    // transforms do not move the drop bands under the cursor.
    const viewportRect = this._viewport.getBoundingClientRect();
    const sceneX = (clientX - viewportRect.left - this._panX) / this._zoom;
    const sceneY = (clientY - viewportRect.top - this._panY) / this._zoom;

    const resolved = this._resolveDropAtScene(draggedIds, sceneX, sceneY);

    if (!resolved) {
      this._updateDragSlotPreview(draggedIds, sceneX, sceneY);
      return;
    }

    this._dropTargetNodeId = resolved.targetNodeId;
    this._dropZone = resolved.zone;

    const targetHost = this._cellNodes.get(resolved.targetNodeId);

    // Sibling slots use live gap animation; only "inside" keeps a ring hint.
    if (resolved.zone === "inside" && targetHost) {
      targetHost.classList.add("is-drop-inside");
    }

    this._updateDragSlotPreview(draggedIds, sceneX, sceneY);
  }

  /**
   * Resolve drop target from scene coordinates: card bands first, then the
   * empty gap between sibling cards (so the pointer can sit between two nodes).
   */
  private _resolveDropAtScene(
    draggedIds: readonly string[],
    sceneX: number,
    sceneY: number,
  ): { targetNodeId: string; zone: DropZone } | null {
    const { outline } = this._getOutlineSnapshot();
    let targetNodeId: string | null = null;
    let targetBase:
      | { left: number; top: number; width: number; height: number }
      | null = null;

    this._dragBasePositions.forEach((base, nodeId) => {
      if (
        this._isDraggedRelatedNode(outline, draggedIds, nodeId) ||
        !this._cellNodes.has(nodeId)
      ) {
        return;
      }

      if (
        sceneX >= base.left &&
        sceneX <= base.left + base.width &&
        sceneY >= base.top &&
        sceneY <= base.top + base.height
      ) {
        if (
          !targetBase ||
          base.width * base.height < targetBase.width * targetBase.height
        ) {
          targetNodeId = nodeId;
          targetBase = base;
        }
      }
    });

    if (targetNodeId && targetBase) {
      return {
        targetNodeId,
        zone: getDropZoneFromPointer(
          targetBase,
          sceneX,
          sceneY,
          this._treeDirection,
        ),
      };
    }

    const alongY =
      this._treeDirection === "LR" || this._treeDirection === "RL";
    const axis = alongY ? sceneY : sceneX;
    const cross = alongY ? sceneX : sceneY;
    const primaryId = draggedIds[0]!;
    const origin = findOutlineNode(outline, primaryId);
    const draggedSet = new Set(draggedIds);

    const candidates: Array<{
      targetNodeId: string;
      zone: "before" | "after";
      score: number;
    }> = [];

    const considerParent = (parent: OutlineNode, prefer: boolean) => {
      const items = parent.children
        .filter((child) => !draggedSet.has(child.id))
        .map((child) => {
          const base = this._dragBasePositions.get(child.id);

          if (!base) {
            return null;
          }

          return {
            id: child.id,
            start: alongY ? base.top : base.left,
            end: alongY ? base.top + base.height : base.left + base.width,
            crossStart: alongY ? base.left : base.top,
            crossEnd: alongY
              ? base.left + base.width
              : base.top + base.height,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const gap = resolveSiblingGapDrop(items, axis, cross, {
        // Stay in the sibling column; past the first/last sibling any distance
        // along the stack still means insert at top / bottom.
        crossPad: 64,
        extremeAxisPad: Number.POSITIVE_INFINITY,
      });

      if (!gap) {
        return;
      }

      candidates.push({
        targetNodeId: gap.targetNodeId,
        zone: gap.zone,
        score: prefer ? -1 : Math.abs(cross - (items[0]?.crossStart ?? 0)),
      });
    };

    if (origin) {
      considerParent(origin.parent, true);
    }

    const walk = (node: OutlineNode) => {
      if (!origin || node.id !== origin.parent.id) {
        considerParent(node, false);
      }

      node.children.forEach(walk);
    };

    walk(outline);

    if (candidates.length === 0) {
      // Empty space behind a card (tree-growth side) → nest as its child.
      const childLane = this._resolveChildLaneAtScene(
        draggedIds,
        sceneX,
        sceneY,
      );

      if (childLane) {
        return childLane;
      }

      return null;
    }

    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0]!;

    return { targetNodeId: best.targetNodeId, zone: best.zone };
  }

  /**
   * Pointer in the gutter behind a card (child side of the tree) counts as
   * nesting under that card — where the translucent placeholder will sit.
   */
  private _resolveChildLaneAtScene(
    draggedIds: readonly string[],
    sceneX: number,
    sceneY: number,
  ): { targetNodeId: string; zone: "inside" } | null {
    const { outline } = this._getOutlineSnapshot();
    const primaryId = draggedIds[0]!;
    const draggedBase = this._dragBasePositions.get(primaryId);
    const draggedSpan = draggedBase
      ? this._treeDirection === "LR" || this._treeDirection === "RL"
        ? draggedBase.width
        : draggedBase.height
      : LAYOUT_NODE_WIDTH.min * 0.35;
    const depth = this._childGap + Math.max(draggedSpan, 80);
    const crossPad = 28;

    let bestId: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    this._dragBasePositions.forEach((base, nodeId) => {
      if (
        this._isDraggedRelatedNode(outline, draggedIds, nodeId) ||
        !this._cellNodes.has(nodeId)
      ) {
        return;
      }

      let inLane = false;
      let score = Number.POSITIVE_INFINITY;

      switch (this._treeDirection) {
        case "LR": {
          const laneLeft = base.left + base.width;
          const laneRight = laneLeft + depth;
          inLane =
            sceneX >= laneLeft &&
            sceneX <= laneRight &&
            sceneY >= base.top - crossPad &&
            sceneY <= base.top + base.height + crossPad;
          score = Math.abs(sceneX - (laneLeft + this._childGap / 2));
          break;
        }
        case "RL": {
          const laneRight = base.left;
          const laneLeft = laneRight - depth;
          inLane =
            sceneX <= laneRight &&
            sceneX >= laneLeft &&
            sceneY >= base.top - crossPad &&
            sceneY <= base.top + base.height + crossPad;
          score = Math.abs(sceneX - (laneRight - this._childGap / 2));
          break;
        }
        case "TB": {
          const laneTop = base.top + base.height;
          const laneBottom = laneTop + depth;
          inLane =
            sceneY >= laneTop &&
            sceneY <= laneBottom &&
            sceneX >= base.left - crossPad &&
            sceneX <= base.left + base.width + crossPad;
          score = Math.abs(sceneY - (laneTop + this._childGap / 2));
          break;
        }
        case "BT": {
          const laneBottom = base.top;
          const laneTop = laneBottom - depth;
          inLane =
            sceneY <= laneBottom &&
            sceneY >= laneTop &&
            sceneX >= base.left - crossPad &&
            sceneX <= base.left + base.width + crossPad;
          score = Math.abs(sceneY - (laneBottom - this._childGap / 2));
          break;
        }
      }

      if (!inLane || score >= bestScore) {
        return;
      }

      bestScore = score;
      bestId = nodeId;
    });

    return bestId ? { targetNodeId: bestId, zone: "inside" } : null;
  }

  private _captureDragBasePositions(): void {
    this._dragBasePositions.clear();
    this._dragSlotPreviewKey = null;

    this._cellNodes.forEach((node, nodeId) => {
      this._dragBasePositions.set(nodeId, {
        left: Number.parseFloat(node.style.left) || 0,
        top: Number.parseFloat(node.style.top) || 0,
        width: node.offsetWidth,
        height: node.offsetHeight,
      });
    });
  }

  /**
   * Which side of a sibling insert gap the pointer sits on.
   * - `after`: pointer is past the gap (below for LR/RL, right for TB) →
   *   shift the before-side (upper/left) away to open space.
   * - `before`: pointer is before the gap (above / left) → shift the
   *   after-side (lower/right) away.
   */
  private _resolveSlotGapBias(
    neighborPrevId: string | null,
    neighborNextId: string | null,
    alongY: boolean,
    sceneX: number,
    sceneY: number,
  ): "before" | "after" {
    const prevBase = neighborPrevId
      ? this._dragBasePositions.get(neighborPrevId)
      : undefined;
    const nextBase = neighborNextId
      ? this._dragBasePositions.get(neighborNextId)
      : undefined;

    if (!prevBase && nextBase) {
      // Insert at start — only the after-side can move.
      return "before";
    }

    if (prevBase && !nextBase) {
      // Insert at end — only the before-side can move.
      return "after";
    }

    if (!prevBase || !nextBase) {
      return "before";
    }

    const gapMid = alongY
      ? (prevBase.top + prevBase.height + nextBase.top) / 2
      : (prevBase.left + prevBase.width + nextBase.left) / 2;
    const pointer = alongY ? sceneY : sceneX;

    return pointer >= gapMid ? "after" : "before";
  }

  /**
   * iOS-style drop preview: collapse the hole left by the dragged card,
   * open a gap at the before/after insert index, and move the translucent
   * placeholder into that intended drop slot. For “inside” (become child),
   * park the placeholder in the child lane behind the target — where the
   * node will appear after drop.
   *
   * Sibling gap bias: if the pointer is on the after side of the gap, the
   * before-side neighbors slide away (full slot); if on the before side, the
   * after-side neighbors slide away. The near side stays put.
   */
  private _updateDragSlotPreview(
    draggedIds: readonly string[],
    sceneX = 0,
    sceneY = 0,
  ): void {
    const alongY =
      this._treeDirection === "LR" || this._treeDirection === "RL";
    const primaryId = draggedIds[0];
    const draggedBase = primaryId
      ? this._dragBasePositions.get(primaryId)
      : undefined;
    const draggedSet = new Set(draggedIds);

    if (!primaryId || !draggedBase) {
      return;
    }

    const slotSize =
      draggedIds.reduce((total, nodeId) => {
        const base = this._dragBasePositions.get(nodeId);

        if (!base) {
          return total;
        }

        const span = alongY ? base.height : base.width;
        return total + span + this._siblingGap;
      }, 0) ||
      (alongY ? draggedBase.height : draggedBase.width) + this._siblingGap;

    const { outline } = this._getOutlineSnapshot();
    const origin = findOutlineNode(outline, primaryId);
    const offsets = new Map<string, number>();

    const addOffset = (nodeId: string, delta: number) => {
      offsets.set(nodeId, (offsets.get(nodeId) ?? 0) + delta);
    };

    let previewKey = `origin:${origin?.parent.id ?? "none"}`;
    let neighborPrev: string | null = null;
    let neighborNext: string | null = null;
    /** Scene-space destination for the translucent drag-source card. */
    let placeholderLeft = draggedBase.left;
    let placeholderTop = draggedBase.top;
    let movePlaceholder = false;

    // Open a gap at the sibling drop index (before / after).
    if (
      this._dropTargetNodeId &&
      this._dropZone &&
      this._dropZone !== "inside"
    ) {
      const drop = resolveDropTarget(
        outline,
        primaryId,
        this._dropTargetNodeId,
        this._dropZone,
      );

      if (drop) {
        const parent =
          drop.parentId === "root"
            ? outline
            : (findOutlineNode(outline, drop.parentId)?.node ?? null);

        if (parent) {
          const remaining = parent.children.filter(
            (child) => !draggedSet.has(child.id),
          );
          let insertAt = drop.insertIndex;
          let removedBefore = 0;

          if (origin && origin.parent.id === parent.id) {
            parent.children.forEach((child, index) => {
              if (draggedSet.has(child.id) && index < drop.insertIndex) {
                removedBefore += 1;
              }
            });
          }

          insertAt -= removedBefore;
          insertAt = Math.max(0, Math.min(insertAt, remaining.length));

          const sameParentHome =
            !!origin &&
            origin.parent.id === parent.id &&
            (() => {
              // Compacted home index of the first dragged root among remaining.
              const firstDragged = parent.children.findIndex((child) =>
                draggedSet.has(child.id),
              );
              if (firstDragged < 0) {
                return false;
              }
              const compacted = parent.children
                .slice(0, firstDragged)
                .filter((child) => !draggedSet.has(child.id)).length;
              return insertAt === compacted;
            })();

          neighborPrev = remaining[insertAt - 1]?.id ?? null;
          neighborNext = remaining[insertAt]?.id ?? null;
          const gapBias = this._resolveSlotGapBias(
            neighborPrev,
            neighborNext,
            alongY,
            sceneX,
            sceneY,
          );
          previewKey = `slot:${parent.id}:${insertAt}:${gapBias}`;

          if (sameParentHome) {
            // Dropping back into the original slot — keep everyone still.
          } else if (origin && origin.parent.id === parent.id) {
            const firstDraggedIndex = parent.children.findIndex((child) =>
              draggedSet.has(child.id),
            );
            origin.parent.children.forEach((child, index) => {
              if (!draggedSet.has(child.id) && index > firstDraggedIndex) {
                addOffset(child.id, -slotSize);
              }
            });
            remaining.forEach((child, index) => {
              if (gapBias === "after") {
                if (index < insertAt) {
                  addOffset(child.id, -slotSize);
                }
              } else if (index >= insertAt) {
                addOffset(child.id, slotSize);
              }
            });
            movePlaceholder = true;
          } else {
            if (origin) {
              const firstDraggedIndex = origin.parent.children.findIndex(
                (child) => draggedSet.has(child.id),
              );
              origin.parent.children.forEach((child, index) => {
                if (!draggedSet.has(child.id) && index > firstDraggedIndex) {
                  addOffset(child.id, -slotSize);
                }
              });
            }

            remaining.forEach((child, index) => {
              if (gapBias === "after") {
                if (index < insertAt) {
                  addOffset(child.id, -slotSize);
                }
              } else if (index >= insertAt) {
                addOffset(child.id, slotSize);
              }
            });
            movePlaceholder = true;
          }

          if (movePlaceholder) {
            if (neighborNext) {
              const nextBase = this._dragBasePositions.get(neighborNext);

              if (nextBase) {
                const nextShift = offsets.get(neighborNext) ?? 0;

                if (alongY) {
                  placeholderLeft = nextBase.left;
                  placeholderTop = nextBase.top + nextShift - slotSize;
                } else {
                  placeholderLeft = nextBase.left + nextShift - slotSize;
                  placeholderTop = nextBase.top;
                }
              }
            } else if (neighborPrev) {
              const prevBase = this._dragBasePositions.get(neighborPrev);

              if (prevBase) {
                const prevShift = offsets.get(neighborPrev) ?? 0;

                if (alongY) {
                  placeholderLeft = prevBase.left;
                  placeholderTop =
                    prevBase.top +
                    prevShift +
                    prevBase.height +
                    this._siblingGap;
                } else {
                  placeholderLeft =
                    prevBase.left +
                    prevShift +
                    prevBase.width +
                    this._siblingGap;
                  placeholderTop = prevBase.top;
                }
              }
            }
          }
        }
      }
    } else if (this._dropZone === "inside" && this._dropTargetNodeId) {
      previewKey = `inside:${this._dropTargetNodeId}`;

      const targetNode =
        this._dropTargetNodeId === "root"
          ? outline
          : (findOutlineNode(outline, this._dropTargetNodeId)?.node ?? null);
      const targetBase = this._dragBasePositions.get(this._dropTargetNodeId);
      const remainingChildren =
        targetNode?.children.filter((child) => !draggedSet.has(child.id)) ??
        [];
      const insertAt = remainingChildren.length;
      const sameParentHome =
        !!origin &&
        origin.parent.id === (targetNode?.id ?? "") &&
        (() => {
          const firstDragged = origin.parent.children.findIndex((child) =>
            draggedSet.has(child.id),
          );
          if (firstDragged < 0) {
            return false;
          }
          const compacted = origin.parent.children
            .slice(0, firstDragged)
            .filter((child) => !draggedSet.has(child.id)).length;
          return compacted === insertAt;
        })();

      neighborPrev = remainingChildren[insertAt - 1]?.id ?? null;

      if (!sameParentHome) {
        if (origin) {
          const firstDraggedIndex = origin.parent.children.findIndex((child) =>
            draggedSet.has(child.id),
          );
          origin.parent.children.forEach((child, index) => {
            if (!draggedSet.has(child.id) && index > firstDraggedIndex) {
              addOffset(child.id, -slotSize);
            }
          });
        }

        movePlaceholder = true;

        if (neighborPrev) {
          const prevBase = this._dragBasePositions.get(neighborPrev);

          if (prevBase) {
            const prevShift = offsets.get(neighborPrev) ?? 0;

            if (alongY) {
              // LR/RL: append below the last existing child.
              placeholderLeft = prevBase.left;
              placeholderTop =
                prevBase.top +
                prevShift +
                prevBase.height +
                this._siblingGap;
            } else {
              placeholderLeft =
                prevBase.left +
                prevShift +
                prevBase.width +
                this._siblingGap;
              placeholderTop = prevBase.top;
            }
          }
        } else if (targetBase) {
          // First child: sit in the growth-direction lane behind the parent.
          const gap = this._childGap;

          switch (this._treeDirection) {
            case "LR":
              placeholderLeft = targetBase.left + targetBase.width + gap;
              placeholderTop =
                targetBase.top +
                (targetBase.height - draggedBase.height) / 2;
              break;
            case "RL":
              placeholderLeft =
                targetBase.left - gap - draggedBase.width;
              placeholderTop =
                targetBase.top +
                (targetBase.height - draggedBase.height) / 2;
              break;
            case "TB":
              placeholderLeft =
                targetBase.left +
                (targetBase.width - draggedBase.width) / 2;
              placeholderTop = targetBase.top + targetBase.height + gap;
              break;
            case "BT":
              placeholderLeft =
                targetBase.left +
                (targetBase.width - draggedBase.width) / 2;
              placeholderTop =
                targetBase.top - gap - draggedBase.height;
              break;
          }
        }
      }
    } else if (origin) {
      // No sibling target yet — only collapse the origin hole.
      const firstDraggedIndex = origin.parent.children.findIndex((child) =>
        draggedSet.has(child.id),
      );
      origin.parent.children.forEach((child, index) => {
        if (!draggedSet.has(child.id) && index > firstDraggedIndex) {
          addOffset(child.id, -slotSize);
        }
      });
    }

    if (previewKey === this._dragSlotPreviewKey) {
      return;
    }

    this._dragSlotPreviewKey = previewKey;

    const placeholderDx = movePlaceholder
      ? placeholderLeft - draggedBase.left
      : 0;
    const placeholderDy = movePlaceholder
      ? placeholderTop - draggedBase.top
      : 0;

    this._cellNodes.forEach((node, nodeId) => {
      node.classList.remove("is-slot-neighbor");

      if (draggedSet.has(nodeId)) {
        // Keep the primary card as the moving placeholder; others stay faded.
        if (nodeId === primaryId) {
          node.style.transform =
            placeholderDx === 0 && placeholderDy === 0
              ? ""
              : `translate(${placeholderDx}px, ${placeholderDy}px)`;
        } else {
          node.style.transform = "";
        }
        return;
      }

      const shift = offsets.get(nodeId) ?? 0;
      node.style.transform =
        shift === 0
          ? ""
          : alongY
            ? `translateY(${shift}px)`
            : `translateX(${shift}px)`;

      if (nodeId === neighborPrev || nodeId === neighborNext) {
        node.classList.add("is-slot-neighbor");
      }
    });

    // Keep connectors glued to the translucent placeholder / shifted siblings.
    this._refreshEdgesFromCache();
  }

  private _clearDragSlotPreview(): void {
    this._dragSlotPreviewKey = null;
    this._dragBasePositions.clear();
    this._cellNodes.forEach((node) => {
      node.style.transform = "";
      node.classList.remove("is-slot-neighbor");
    });
  }

  private _completeNodeDrag(draggedIds: readonly string[]): void {
    if (!this._dropTargetNodeId || !this._dropZone || draggedIds.length === 0) {
      return;
    }

    const primaryId = draggedIds[0]!;
    const { cells, outline } = this._getOutlineSnapshot();

    if (
      draggedIds.some(
        (nodeId) =>
          nodeId === this._dropTargetNodeId ||
          isOutlineDescendant(outline, nodeId, this._dropTargetNodeId!),
      )
    ) {
      return;
    }

    const dropTarget = resolveDropTarget(
      outline,
      primaryId,
      this._dropTargetNodeId,
      this._dropZone,
    );

    if (!dropTarget) {
      return;
    }

    const movedOutline = moveOutlineNodes(
      outline,
      draggedIds,
      dropTarget.parentId,
      dropTarget.insertIndex,
    );

    if (!movedOutline) {
      return;
    }

    const modelIds: string[] = [];
    let activeModelId = "";

    draggedIds.forEach((nodeId) => {
      const index = this._getCellIndexFromNodeId(nodeId);
      const cell = index >= 0 ? this._notebook.widgets[index] : null;

      if (!cell) {
        return;
      }

      modelIds.push(cell.model.id);

      if (nodeId === primaryId) {
        activeModelId = cell.model.id;
      }
    });

    // Freeze the camera before cells reorder / layout so the window does not
    // chase the moved node (notebook sync + ensure-visible would pan otherwise).
    this._cancelCenterFollow();
    this._lockViewportPan(VIEWPORT_PAN_LOCK_MS);
    this._holdViewportPan();
    extendQuietNotebookSync(VIEWPORT_PAN_LOCK_MS);
    this._viewportAnchor = null;
    this._pendingFocusCellIndex = null;
    this._pendingFocusCenter = false;

    this._applyingNotebookChange = true;

    try {
      applyOutlineToNotebook(this._context.model, movedOutline, cells);
    } finally {
      this._applyingNotebookChange = false;
    }

    if (modelIds.length > 0) {
      this._selectCellsByModelIds(modelIds, activeModelId || modelIds[0]!);
    }

    this._invalidateOutlineCache();
    this._clearDragSlotPreview();
    this._applyLayout();
  }

  private _clearDragUi(): void {
    this._dragGhost?.remove();
    this._dragGhost = null;
    this._dropTargetNodeId = null;
    this._dropZone = null;
    this._viewport.classList.remove("is-node-dragging");
    this._clearDragSlotPreview();
    this._cellNodes.forEach((node) => {
      node.classList.remove(
        "is-drop-before",
        "is-drop-inside",
        "is-drop-after",
        "is-drag-source",
        "is-slot-neighbor",
      );
    });
    this._refreshEdgesFromCache();
  }

  /** Read inline translate used by drag slot preview (not the scene pan/zoom). */
  private _readCssTranslate(node: HTMLElement): { x: number; y: number } {
    const value = node.style.transform;

    if (!value || value === "none") {
      return { x: 0, y: 0 };
    }

    if (value.startsWith("translateX(")) {
      return { x: Number.parseFloat(value.slice(11)) || 0, y: 0 };
    }

    if (value.startsWith("translateY(")) {
      return { x: 0, y: Number.parseFloat(value.slice(11)) || 0 };
    }

    const match = /^translate\(\s*([^,)]+)\s*(?:,\s*([^)]+))?\)/.exec(value);

    if (!match) {
      return { x: 0, y: 0 };
    }

    return {
      x: Number.parseFloat(match[1]!) || 0,
      y: match[2] ? Number.parseFloat(match[2]!) || 0 : 0,
    };
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
    const translate = this._readCssTranslate(node);

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
    const draggedIds = this._dragState?.nodeIds ?? [];

    if (
      !this._dragState?.active ||
      draggedIds.length === 0 ||
      !this._dropTargetNodeId ||
      !this._dropZone
    ) {
      return edges;
    }

    const primaryId = draggedIds[0]!;
    const drop = resolveDropTarget(
      outline,
      primaryId,
      this._dropTargetNodeId,
      this._dropZone,
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

    edges.forEach(({ fromId, toId }) => {
      const fromLayout = positions.get(fromId);
      const toLayout = positions.get(toId);

      if (!fromLayout || !toLayout) {
        return;
      }

      const from = this._resolveLayoutPosition(fromLayout, fromId);
      const to = this._resolveLayoutPosition(toLayout, toId);
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

        if (!this._centerCellInViewport(index)) {
          this._scheduleCenterOnCell(index);
        } else {
          this._noteCenterFollowSuccess(index);
          this._scheduleCenterOnCell(index);
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

    if (this._heldViewportPan) {
      this._panX = this._heldViewportPan.x;
      this._panY = this._heldViewportPan.y;
      this._applyTransform();
    }

    if (!this._isViewportPanLocked()) {
      // Font/settings / markdown reflow after open or notebook sync.
      this._centerFollowIfNeeded();
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

export class NotebookMindMapDocumentWidget extends DocumentWidget<NotebookMindMapWidget> {
  constructor(options: DocumentWidget.IOptions<NotebookMindMapWidget>) {
    super(options);
    this.addClass("jp-KuusiNotebookMindMapDocument");
    this.toolbar.addClass("jp-NotebookPanel-toolbar");

    this.title.icon = kuusiIcon;
    this.title.iconClass = "jp-KuusiTabIcon";
    this.title.iconLabel = "Kuusi";
    options.content.bindDocumentWidget(this);
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

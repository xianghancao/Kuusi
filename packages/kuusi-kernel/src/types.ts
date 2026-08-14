export type NotebookCell = {
  cell_type: "code" | "markdown" | "raw";
  source: string | string[];
  metadata?: Record<string, unknown>;
};

/**
 * Deepest ATX / visual heading Kuusi paints as H1–H3.
 * Deeper outline levels (4…{@MAX_OUTLINE_DEPTH}) persist in metadata and
 * render with Body chrome.
 */
export const MAX_OUTLINE_HEADING_LEVEL = 3;

/** Deepest structural nesting Kuusi persists (metadata.outlineLevel / headingLevel). */
export const MAX_OUTLINE_DEPTH = 20;

/** Visual heading for frames / ATX: H1–H3, else Body (`null`). */
export const outlineVisualHeadingLevel = (
  level: number | null | undefined,
): number | null => {
  if (typeof level !== "number" || level < 1) {
    return null;
  }

  return level <= MAX_OUTLINE_HEADING_LEVEL ? level : null;
};

export const clampOutlineDepth = (level: number): number =>
  Math.min(MAX_OUTLINE_DEPTH, Math.max(1, Math.round(level)));

export type NotebookContent = {
  cells: NotebookCell[];
};

export type OutlineNode = {
  /** Stable id for layout (`root`, `cell-0`, …) */
  id: string;
  /** Index into notebook.cells, or null for the virtual root */
  cellIndex: number | null;
  /**
   * Structural outline depth (1…{@MAX_OUTLINE_DEPTH}), or null for plain Body
   * content that does not open a nesting frame. Levels above
   * {@link MAX_OUTLINE_HEADING_LEVEL} still nest, but use Body styling.
   */
  headingLevel: number | null;
  title: string;
  children: OutlineNode[];
};

export type LayoutPosition = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OutlineEdge = {
  fromId: string;
  toId: string;
};

/** Dagre rank direction for the outline tree layout. */
export type TreeDirection = "TB" | "BT" | "LR" | "RL";

/** How parent→child connectors are routed between cards. */
export type EdgeRouteStyle =
  | "straight"
  | "curve"
  | "orthogonal"
  | "rounded-orthogonal";

/** Spacing preset for mind map node layout. */
export type LayoutDensity = "compact" | "normal" | "loose";

export type LayoutOptions = {
  direction?: TreeDirection;
  /** Collapsed node ids — their descendants are omitted from layout. */
  collapsedIds?: ReadonlySet<string>;
  density?: LayoutDensity;
  /** Boundary gap between sibling nodes (maps to dagre nodesep). */
  siblingGap?: number;
  /** Boundary gap between parent and child nodes (maps to dagre ranksep). */
  childGap?: number;
  /** Measured node box sizes used by the layout engine. */
  nodeDimensions?: ReadonlyMap<string, { width: number; height: number }>;
};

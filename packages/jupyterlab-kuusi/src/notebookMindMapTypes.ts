import type { OutlineNode, TreeDirection } from "kuusi-kernel";
import type { AppearanceSettings } from "./appearanceToolbar";

export const KUUSI_ADD_MINDMAP_COMMAND = "jupyterlab-kuusi:add-mindmap";
export const KUUSI_OPEN_NOTEBOOK_VIEW_COMMAND =
  "jupyterlab-kuusi:open-notebook-view";
export const KUUSI_OPEN_MARKDOWN_EDITOR_COMMAND =
  "jupyterlab-kuusi:open-markdown-editor";

export type MindMapSourceKind = "notebook" | "markdown";

export const TREE_DIRECTION_LABELS: Record<TreeDirection, string> = {
  TB: "↓",
  BT: "↑",
  LR: "→",
  RL: "←",
};

export const DRAG_THRESHOLD_PX = 6;
/** Touch: hold this long on a card before a move reorders instead of panning. */
export const TOUCH_DRAG_HOLD_MS = 350;
/**
 * Ignore open-centering against a still-docking / zero-ish split pane.
 * Lumino often reports a tiny non-zero box before the final size lands.
 */
export const OPEN_CENTER_MIN_VIEWPORT_PX = 80;
/**
 * After open / notebook sync, keep re-centering through dock resize and
 * markdown reflow so an early pan is not left stale.
 */
export const CENTER_FOLLOW_MS = 4000;
/** Require viewport size unchanged this long before ending open-center follow. */
export const CENTER_VIEWPORT_STABLE_MS = 280;
/** After drag / manual pan, block auto-recentering this long. */
export const VIEWPORT_PAN_LOCK_MS = 1800;
export const VIEWPORT_PAN_LOCK_AFTER_PAN_MS = 900;
/** Node must be at least this large before we treat a center attempt as real. */
export const OPEN_CENTER_MIN_NODE_PX = 8;
/** Max interval between two taps on the same card to enter edit mode. */
export const CELL_DOUBLE_TAP_MS = 450;
/** Ignore transient command-mode flips while the editor is mounting. */
export const CELL_EDIT_ENTRY_GUARD_MS = 750;
/** Display 100% equals this internal CSS scale (former 50%). */
export const ZOOM_BASE = 0.5;
export const MIN_ZOOM_PERCENT = 20;
export const MAX_ZOOM_PERCENT = 200;
export const ZOOM_PERCENT_STEP = 10;
export const MIN_ZOOM = (MIN_ZOOM_PERCENT / 100) * ZOOM_BASE;
export const MAX_ZOOM = (MAX_ZOOM_PERCENT / 100) * ZOOM_BASE;
/** Pinch / ctrl+wheel zoom intensity (lower = slower). Tuned for trackpad deltas. */
export const ZOOM_WHEEL_SENSITIVITY = 0.0048;
/** Cap per-event zoom so a large delta cannot jump too far. */
export const ZOOM_WHEEL_MAX_STEP = 1.18;

export const zoomToPercent = (zoom: number): number =>
  Math.round((zoom / ZOOM_BASE) * 100);

export const percentToZoom = (percent: number): number =>
  (percent / 100) * ZOOM_BASE;

export const snapZoomPercent = (percent: number): number => {
  const snapped =
    Math.round(percent / ZOOM_PERCENT_STEP) * ZOOM_PERCENT_STEP;
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, snapped));
};

export const appearanceEquals = (
  left: AppearanceSettings,
  right: AppearanceSettings,
): boolean =>
  left.edgeStyle === right.edgeStyle &&
  left.edgeRoute === right.edgeRoute &&
  left.edgeArrowDirection === right.edgeArrowDirection &&
  left.edgeArrowStyle === right.edgeArrowStyle &&
  left.edgeWidth === right.edgeWidth &&
  left.edgeColor === right.edgeColor &&
  left.edgeTaper === right.edgeTaper &&
  left.edgeMinWidth === right.edgeMinWidth &&
  left.edgeBranchColors === right.edgeBranchColors &&
  left.nodeFillColor === right.nodeFillColor &&
  left.nodeBorderStyle === right.nodeBorderStyle &&
  left.nodeBorderWidth === right.nodeBorderWidth &&
  left.nodeBorderColor === right.nodeBorderColor &&
  left.nodeBorderCorner === right.nodeBorderCorner &&
  left.nodeBorderRadius === right.nodeBorderRadius &&
  left.selectionGlowColor === right.selectionGlowColor &&
  left.selectionGlowWidth === right.selectionGlowWidth &&
  left.hoverGlowColor === right.hoverGlowColor &&
  left.hoverGlowWidth === right.hoverGlowWidth &&
  JSON.stringify(left.levelStyles) === JSON.stringify(right.levelStyles) &&
  left.nodePaddingX === right.nodePaddingX &&
  left.nodePaddingY === right.nodePaddingY;

export const collectVisibleCellIndices = (
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

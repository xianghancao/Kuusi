import { findOutlineNode } from "./notebook-tree";
import type { OutlineNode } from "./types";

export type OutlineMoveDirection = "up" | "down" | "left" | "right";

export type OutlineNavigationResult = {
  nodeId: string;
  cellIndex: number;
} | null;

const cellNodeFromId = (nodeId: string): OutlineNavigationResult | null => {
  if (!nodeId.startsWith("cell-")) {
    return null;
  }

  const cellIndex = Number.parseInt(nodeId.slice("cell-".length), 10);

  if (!Number.isFinite(cellIndex)) {
    return null;
  }

  return { nodeId, cellIndex };
};

const visibleCellChildren = (
  parent: OutlineNode,
  visibleIds: ReadonlySet<string>,
): OutlineNode[] =>
  parent.children.filter(
    (child) => visibleIds.has(child.id) && child.id !== "root",
  );

/** Last cell index in preorder within `node` and its descendants. */
export const getSubtreeMaxCellIndex = (
  root: OutlineNode,
  nodeId: string,
): number | null => {
  const located = findOutlineNode(root, nodeId);

  if (!located) {
    return null;
  }

  let maxIndex = located.node.cellIndex;

  const visit = (node: OutlineNode) => {
    if (node.cellIndex !== null) {
      maxIndex =
        maxIndex === null ? node.cellIndex : Math.max(maxIndex, node.cellIndex);
    }

    node.children.forEach(visit);
  };

  visit(located.node);
  return maxIndex;
};

/** Notebook insert index for a sibling topic after the current subtree. */
export const getInsertIndexAfterSubtree = (
  root: OutlineNode,
  nodeId: string,
  cellCount: number,
): number => {
  const maxIndex = getSubtreeMaxCellIndex(root, nodeId);

  if (maxIndex === null) {
    return cellCount;
  }

  return Math.min(maxIndex + 1, cellCount);
};

/** Notebook insert index for a new child topic as the last child under `nodeId`. */
export const getInsertIndexForChild = (
  root: OutlineNode,
  nodeId: string,
  cellCount: number,
): number => getInsertIndexAfterSubtree(root, nodeId, cellCount);

export const navigateOutlineNode = (
  root: OutlineNode,
  currentNodeId: string,
  direction: OutlineMoveDirection,
  visibleIds: ReadonlySet<string>,
  collapsedIds: ReadonlySet<string>,
): OutlineNavigationResult | null => {
  const located = findOutlineNode(root, currentNodeId);

  if (!located) {
    return null;
  }

  const { parent, index, node } = located;
  const siblings = visibleCellChildren(parent, visibleIds);

  if (direction === "up" || direction === "down") {
    const siblingIndex = siblings.findIndex((child) => child.id === node.id);

    if (siblingIndex === -1) {
      return null;
    }

    const target =
      direction === "up"
        ? siblings[siblingIndex - 1]
        : siblings[siblingIndex + 1];

    return target?.cellIndex !== null && target?.cellIndex !== undefined
      ? cellNodeFromId(target.id)
      : null;
  }

  if (direction === "left") {
    if (parent.id === "root") {
      return null;
    }

    return parent.cellIndex !== null
      ? cellNodeFromId(parent.id)
      : navigateOutlineNode(
          root,
          parent.id,
          "left",
          visibleIds,
          collapsedIds,
        );
  }

  if (collapsedIds.has(node.id)) {
    return null;
  }

  const firstChild = visibleCellChildren(node, visibleIds)[0];

  return firstChild?.cellIndex !== null && firstChild?.cellIndex !== undefined
    ? cellNodeFromId(firstChild.id)
    : null;
};

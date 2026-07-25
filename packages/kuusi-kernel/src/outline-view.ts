import type { OutlineNode } from "./types";

/** Node ids that should participate in layout and rendering. */
export const getVisibleOutlineNodeIds = (
  root: OutlineNode,
  collapsedIds: ReadonlySet<string>,
): Set<string> => {
  const visible = new Set<string>();

  const visit = (node: OutlineNode, hidden: boolean) => {
    if (hidden) {
      return;
    }

    visible.add(node.id);

    if (collapsedIds.has(node.id)) {
      return;
    }

    node.children.forEach((child) => visit(child, false));
  };

  visit(root, false);
  return visible;
};

export const countOutlineDescendants = (node: OutlineNode): number =>
  node.children.reduce(
    (sum, child) => sum + 1 + countOutlineDescendants(child),
    0,
  );

/** Cell indices for a node and all of its descendants (depth-first). */
export const collectOutlineSubtreeCellIndices = (
  node: OutlineNode,
): number[] => {
  const indices: number[] = [];

  const visit = (current: OutlineNode) => {
    if (current.cellIndex !== null) {
      indices.push(current.cellIndex);
    }

    current.children.forEach(visit);
  };

  visit(node);
  return indices;
};

/** First `#` heading node — the mind map root topic. */
export const getMindMapRootNode = (root: OutlineNode): OutlineNode | null => {
  if (root.headingLevel === 1 && root.cellIndex !== null) {
    return root;
  }

  return (
    root.children.find((child) => child.headingLevel === 1) ??
    root.children[0] ??
    null
  );
};

import { parseMarkdownHeading } from "./notebook-outline";
import type { NotebookCell, OutlineNode, TreeDirection } from "./types";
import {
  clampOutlineDepth,
  MAX_OUTLINE_DEPTH,
  MAX_OUTLINE_HEADING_LEVEL,
} from "./types";

const joinCellSource = (source: string | string[]) =>
  Array.isArray(source) ? source.join("") : source;

export type OutlineNodeLocation = {
  node: OutlineNode;
  parent: OutlineNode;
  index: number;
};

export type NotebookReorderPlan = {
  /** Desired sequence of original cell indices. */
  order: number[];
  /** Updated markdown sources keyed by original cell index. */
  sourceUpdates: Map<number, string>;
  /**
   * Outline heading metadata to write (`number`) or clear (`null`),
   * keyed by original cell index.
   */
  headingMetadataUpdates: Map<number, number | null>;
};

export type DropZone = "before" | "inside" | "after";

/**
 * Map pointer position over a target card to a drop zone.
 *
 * Sibling order runs perpendicular to tree growth:
 * - LR / RL → siblings stack vertically → **top** band = sibling before
 * - TB / BT → siblings stack horizontally → **leading** band = sibling before
 *
 * The rest of the card — including the **rear** along sibling order (bottom /
 * trailing) and the center — means “inside” (become a child). Sibling “after”
 * is done via the gap between cards, not the rear of the card itself.
 */
export const getDropZoneFromPointer = (
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
  direction: TreeDirection,
): DropZone => {
  const siblingsAlongY = direction === "LR" || direction === "RL";

  if (siblingsAlongY) {
    const relative = (clientY - rect.top) / Math.max(rect.height, 1);

    // Top = insert as previous sibling; rear/center = nest as child.
    if (relative < 0.25) {
      return "before";
    }

    return "inside";
  }

  const relative = (clientX - rect.left) / Math.max(rect.width, 1);

  if (relative < 0.25) {
    return "before";
  }

  return "inside";
};

/** Sibling card span along the stack axis (and the cross-axis lane). */
export type SiblingSlotItem = {
  id: string;
  start: number;
  end: number;
  crossStart: number;
  crossEnd: number;
};

/**
 * When the pointer sits in the gap between two sibling cards (or beyond the
 * first/last sibling along the stack axis), map that to a before/after drop.
 * Returns null when the pointer is outside the sibling lane.
 *
 * Beyond the extreme siblings, `extremeAxisPad` controls how far the pointer
 * may stray and still count as “insert at top/bottom” (default: unlimited).
 */
export const resolveSiblingGapDrop = (
  items: SiblingSlotItem[],
  axis: number,
  cross: number,
  options: {
    crossPad?: number;
    /** How far past the first/last sibling still counts as top/bottom insert. */
    extremeAxisPad?: number;
  } = {},
): { targetNodeId: string; zone: "before" | "after" } | null => {
  if (items.length === 0) {
    return null;
  }

  const sorted = [...items].sort((a, b) => a.start - b.start);
  const crossPad = options.crossPad ?? 40;
  const extremeAxisPad = options.extremeAxisPad ?? Number.POSITIVE_INFINITY;
  const laneStart = Math.min(...sorted.map((item) => item.crossStart)) - crossPad;
  const laneEnd = Math.max(...sorted.map((item) => item.crossEnd)) + crossPad;

  if (cross < laneStart || cross > laneEnd) {
    return null;
  }

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  // Above the topmost sibling → insert before first (even if far away).
  if (axis < first.start) {
    if (axis >= first.start - extremeAxisPad) {
      return { targetNodeId: first.id, zone: "before" };
    }

    return null;
  }

  // Below the bottommost sibling → insert after last (even if far away).
  if (axis > last.end) {
    if (axis <= last.end + extremeAxisPad) {
      return { targetNodeId: last.id, zone: "after" };
    }

    return null;
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index]!;
    const next = sorted[index + 1]!;

    if (axis >= current.end && axis <= next.start) {
      // Gap between neighbors → insert before the lower/next card.
      return { targetNodeId: next.id, zone: "before" };
    }
  }

  return null;
};

export const cloneOutlineNode = (node: OutlineNode): OutlineNode => ({
  ...node,
  children: node.children.map(cloneOutlineNode),
});

export const findOutlineNode = (
  root: OutlineNode,
  nodeId: string,
): OutlineNodeLocation | null => {
  const search = (parent: OutlineNode): OutlineNodeLocation | null => {
    const index = parent.children.findIndex((child) => child.id === nodeId);

    if (index >= 0) {
      return { node: parent.children[index]!, parent, index };
    }

    for (const child of parent.children) {
      const found = search(child);

      if (found) {
        return found;
      }
    }

    return null;
  };

  if (nodeId === root.id) {
    return null;
  }

  return search(root);
};

export const isOutlineDescendant = (
  root: OutlineNode,
  ancestorId: string,
  descendantId: string,
): boolean => {
  const ancestor =
    ancestorId === root.id
      ? root
      : (findOutlineNode(root, ancestorId)?.node ?? null);

  if (!ancestor) {
    return false;
  }

  const visit = (node: OutlineNode): boolean => {
    if (node.id === descendantId) {
      return true;
    }

    return node.children.some(visit);
  };

  return visit(ancestor);
};

export const detachOutlineNode = (
  root: OutlineNode,
  nodeId: string,
): OutlineNode | null => {
  const found = findOutlineNode(root, nodeId);

  if (!found) {
    return null;
  }

  const [removed] = found.parent.children.splice(found.index, 1);
  return removed ?? null;
};

export const insertOutlineNode = (
  parent: OutlineNode,
  node: OutlineNode,
  index: number,
): void => {
  const boundedIndex = Math.max(0, Math.min(index, parent.children.length));
  parent.children.splice(boundedIndex, 0, node);
};

export const moveOutlineNode = (
  root: OutlineNode,
  nodeId: string,
  targetParentId: string,
  insertIndex: number,
): OutlineNode | null => {
  const cloned = cloneOutlineNode(root);

  if (nodeId === "root") {
    return null;
  }

  const targetParent =
    targetParentId === "root"
      ? cloned
      : (findOutlineNode(cloned, targetParentId)?.node ?? null);

  if (!targetParent) {
    return null;
  }

  if (
    nodeId === targetParentId ||
    isOutlineDescendant(cloned, nodeId, targetParentId)
  ) {
    return null;
  }

  const originalLocation = findOutlineNode(cloned, nodeId);

  if (!originalLocation) {
    return null;
  }

  const removed = detachOutlineNode(cloned, nodeId);

  if (!removed) {
    return null;
  }

  let adjustedIndex = insertIndex;

  if (
    originalLocation.parent.id === targetParent.id &&
    originalLocation.index < insertIndex
  ) {
    adjustedIndex -= 1;
  }

  insertOutlineNode(targetParent, removed, adjustedIndex);
  return cloned;
};

/**
 * Top-most selected nodes only: a selected child of another selected node is
 * omitted (it moves with its ancestor).
 */
export const collectOutlineSelectionRoots = (
  root: OutlineNode,
  selectedIds: ReadonlySet<string> | readonly string[],
): string[] => {
  const selected =
    selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const roots: string[] = [];

  const visit = (node: OutlineNode): void => {
    if (node.id !== root.id && selected.has(node.id)) {
      roots.push(node.id);
      return;
    }

    node.children.forEach(visit);
  };

  visit(root);
  return roots;
};

/** Move several outline roots as one contiguous block (document order kept). */
export const moveOutlineNodes = (
  root: OutlineNode,
  nodeIds: readonly string[],
  targetParentId: string,
  insertIndex: number,
): OutlineNode | null => {
  if (nodeIds.length === 0) {
    return null;
  }

  if (nodeIds.length === 1) {
    return moveOutlineNode(root, nodeIds[0]!, targetParentId, insertIndex);
  }

  const cloned = cloneOutlineNode(root);
  const roots = collectOutlineSelectionRoots(cloned, nodeIds);

  if (roots.length === 0) {
    return null;
  }

  if (roots.length === 1) {
    return moveOutlineNode(cloned, roots[0]!, targetParentId, insertIndex);
  }

  const targetParent =
    targetParentId === "root"
      ? cloned
      : (findOutlineNode(cloned, targetParentId)?.node ?? null);

  if (!targetParent) {
    return null;
  }

  for (const nodeId of roots) {
    if (
      nodeId === targetParentId ||
      isOutlineDescendant(cloned, nodeId, targetParentId)
    ) {
      return null;
    }
  }

  const locations = roots
    .map((nodeId) => findOutlineNode(cloned, nodeId))
    .filter((location): location is OutlineNodeLocation => location !== null);

  if (locations.length !== roots.length) {
    return null;
  }

  let removedBefore = 0;

  locations.forEach((location) => {
    if (
      location.parent.id === targetParent.id &&
      location.index < insertIndex
    ) {
      removedBefore += 1;
    }
  });

  // Detach highest sibling index first so earlier indices stay stable.
  locations.sort((left, right) => {
    if (left.parent.id === right.parent.id) {
      return right.index - left.index;
    }

    return (right.node.cellIndex ?? 0) - (left.node.cellIndex ?? 0);
  });

  const detached: OutlineNode[] = [];

  for (const location of locations) {
    const removed = detachOutlineNode(cloned, location.node.id);

    if (!removed) {
      return null;
    }

    detached.push(removed);
  }

  // Restore document order (detach loop was reverse).
  detached.reverse();

  let index = Math.max(0, insertIndex - removedBefore);

  detached.forEach((node) => {
    insertOutlineNode(targetParent, node, index);
    index += 1;
  });

  return cloned;
};

export const resolveDropTarget = (
  root: OutlineNode,
  draggedId: string,
  targetNodeId: string,
  zone: DropZone,
): { parentId: string; insertIndex: number } | null => {
  if (draggedId === targetNodeId) {
    return null;
  }

  if (isOutlineDescendant(root, draggedId, targetNodeId)) {
    return null;
  }

  if (zone === "inside") {
    const parent =
      targetNodeId === "root"
        ? root
        : (findOutlineNode(root, targetNodeId)?.node ?? null);

    if (!parent) {
      return null;
    }

    return { parentId: parent.id, insertIndex: parent.children.length };
  }

  const target = findOutlineNode(root, targetNodeId);

  if (!target) {
    return null;
  }

  if (zone === "before") {
    return { parentId: target.parent.id, insertIndex: target.index };
  }

  return { parentId: target.parent.id, insertIndex: target.index + 1 };
};

export const normalizeOutlineHeadingLevels = (root: OutlineNode): void => {
  const visit = (node: OutlineNode, parentHeadingLevel: number) => {
    node.children.forEach((child) => {
      if (child.headingLevel !== null) {
        const nextLevel = parentHeadingLevel + 1;

        if (nextLevel > MAX_OUTLINE_DEPTH) {
          // Beyond persistable depth — keep as plain Body under the parent.
          child.headingLevel = null;
          visit(child, parentHeadingLevel);
          return;
        }

        child.headingLevel = nextLevel;
        visit(child, child.headingLevel);
        return;
      }

      // Body nodes with children need a structural level so reorder/rebuild
      // preserves nesting (e.g. body dropped inside another body).
      if (child.children.length > 0) {
        const nextLevel = parentHeadingLevel + 1;

        if (nextLevel > MAX_OUTLINE_DEPTH) {
          visit(child, parentHeadingLevel);
          return;
        }

        child.headingLevel = nextLevel;
        visit(child, nextLevel);
        return;
      }

      visit(child, parentHeadingLevel);
    });
  };

  visit(root, 0);
};

export const replaceMarkdownHeadingTitle = (
  source: string,
  newTitle: string,
): string => {
  const lines = source.split("\n");
  const lineIndex = lines.findIndex((line) => line.trim().length > 0);

  if (lineIndex < 0) {
    return source;
  }

  const line = lines[lineIndex]!;
  const trimmed = line.trim();
  const match = trimmed.match(/^(#{1,6})(?:\s+(.*))?$/);

  if (!match?.[1]) {
    return source;
  }

  const leading = line.slice(0, line.indexOf(trimmed));
  const title = newTitle.trim();
  lines[lineIndex] = `${leading}${match[1]}${title ? ` ${title}` : ""}`;
  return lines.join("\n");
};

export const updateMarkdownHeadingSource = (
  source: string,
  level: number,
): string => {
  const clamped = Math.min(
    MAX_OUTLINE_HEADING_LEVEL,
    Math.max(1, Math.round(level)),
  );
  const lines = source.split("\n");
  const lineIndex = lines.findIndex((line) => line.trim().length > 0);

  if (lineIndex < 0) {
    return source;
  }

  const line = lines[lineIndex]!;
  const trimmed = line.trim();
  const match = trimmed.match(/^(#{1,6})(?:\s+(.*))?$/);

  if (!match?.[1]) {
    return source;
  }

  const leading = line.slice(0, line.indexOf(trimmed));
  const title = (match[2] ?? "").trim();
  lines[lineIndex] = `${leading}${"#".repeat(clamped)}${title ? ` ${title}` : ""}`;
  return lines.join("\n");
};

/** Strip a leading markdown `#` heading so the cell becomes Body text. */
export const clearMarkdownHeadingSource = (source: string): string => {
  const lines = source.split("\n");
  const lineIndex = lines.findIndex((line) => line.trim().length > 0);

  if (lineIndex < 0) {
    return source;
  }

  const line = lines[lineIndex]!;
  const trimmed = line.trim();
  const match = trimmed.match(/^(#{1,6})(?:\s+(.*))?$/);

  if (!match?.[1]) {
    return source;
  }

  const leading = line.slice(0, line.indexOf(trimmed));
  const title = (match[2] ?? "").trim();
  lines[lineIndex] = `${leading}${title}`;
  return lines.join("\n");
};

export const flattenOutlineCellNodes = (root: OutlineNode): OutlineNode[] => {
  const items: OutlineNode[] = [];

  const visit = (node: OutlineNode) => {
    if (node.cellIndex !== null) {
      items.push(node);
    }

    node.children.forEach(visit);
  };

  visit(root);
  return items;
};

export const computeNotebookReorderPlan = (
  root: OutlineNode,
  cells: NotebookCell[],
): NotebookReorderPlan => {
  const working = cloneOutlineNode(root);
  const beforeByIndex = new Map<number, number | null>();

  flattenOutlineCellNodes(working).forEach((node) => {
    if (node.cellIndex !== null) {
      beforeByIndex.set(node.cellIndex, node.headingLevel);
    }
  });

  normalizeOutlineHeadingLevels(working);

  const orderedNodes = flattenOutlineCellNodes(working);
  const order = orderedNodes.map((node) => node.cellIndex!);
  const sourceUpdates = new Map<number, string>();
  const headingMetadataUpdates = new Map<number, number | null>();

  orderedNodes.forEach((node) => {
    if (node.cellIndex === null) {
      return;
    }

    const previousLevel = beforeByIndex.get(node.cellIndex);
    const nextLevel =
      node.headingLevel === null ? null : clampOutlineDepth(node.headingLevel);

    if (previousLevel !== nextLevel) {
      headingMetadataUpdates.set(node.cellIndex, nextLevel);
    }

    const cell = cells[node.cellIndex];

    if (!cell || cell.cell_type !== "markdown") {
      return;
    }

    const source = joinCellSource(cell.source);

    if (nextLevel === null || nextLevel > MAX_OUTLINE_HEADING_LEVEL) {
      // Body chrome / deep outline: no ATX heading in source.
      if (!parseMarkdownHeading(source.trim())) {
        return;
      }

      const updated = clearMarkdownHeadingSource(source);

      if (updated !== source) {
        sourceUpdates.set(node.cellIndex, updated);
      }

      return;
    }

    if (!parseMarkdownHeading(source.trim())) {
      return;
    }

    const updated = updateMarkdownHeadingSource(source, nextLevel);

    if (updated !== source) {
      sourceUpdates.set(node.cellIndex, updated);
    }
  });

  return { order, sourceUpdates, headingMetadataUpdates };
};

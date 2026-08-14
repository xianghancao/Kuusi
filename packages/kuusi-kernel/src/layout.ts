import dagre from "dagre";
import type {
  LayoutDensity,
  LayoutOptions,
  LayoutPosition,
  OutlineEdge,
  OutlineNode,
  TreeDirection,
  EdgeRouteStyle,
} from "./types";

const NODE_WIDTH = 700;
const NODE_HEIGHT = 160;

export const DEFAULT_NODE_LAYOUT_SIZE = {
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
} as const;

/** Global / per-node card width bounds (px). */
export const LAYOUT_NODE_WIDTH = {
  min: 160,
  max: 960,
  default: NODE_WIDTH,
} as const;

const getNodeSize = (
  nodeId: string,
  dimensions: LayoutOptions["nodeDimensions"],
): { width: number; height: number } => {
  const measured = dimensions?.get(nodeId);

  if (!measured) {
    return { width: NODE_WIDTH, height: NODE_HEIGHT };
  }

  return {
    width: Math.max(measured.width, LAYOUT_NODE_WIDTH.min),
    // Use the measured card height as-is so siblingGap: 0 packs cards flush.
    height: Math.max(measured.height, 1),
  };
};

/**
 * Spacing presets inspired by XMind map layout:
 * - compact: "Compact Map" — minimal sibling and branch gaps
 * - normal: default balanced auto-layout spacing
 * - loose: extra open spacing between topics
 */
const DENSITY_SPACING: Record<
  LayoutDensity,
  {
    nodesepWhenHorizontal: number;
    ranksepWhenHorizontal: number;
    nodesepWhenVertical: number;
    ranksepWhenVertical: number;
    margin: number;
    verticalGap: number;
  }
> = {
  compact: {
    nodesepWhenHorizontal: 6,
    ranksepWhenHorizontal: 24,
    nodesepWhenVertical: 24,
    ranksepWhenVertical: 6,
    margin: 12,
    verticalGap: 4,
  },
  normal: {
    nodesepWhenHorizontal: 22,
    ranksepWhenHorizontal: 52,
    nodesepWhenVertical: 52,
    ranksepWhenVertical: 22,
    margin: 28,
    verticalGap: 16,
  },
  loose: {
    nodesepWhenHorizontal: 44,
    ranksepWhenHorizontal: 92,
    nodesepWhenVertical: 92,
    ranksepWhenVertical: 44,
    margin: 40,
    verticalGap: 36,
  },
};

export const LAYOUT_SIBLING_GAP = {
  min: 0,
  max: 100,
  default: 22,
} as const;

export const LAYOUT_CHILD_GAP = {
  min: 0,
  max: 400,
  default: 52,
} as const;

/** Default sibling/child boundary gaps for a layout density preset (LR-oriented). */
export const getLayoutGapsForDensity = (
  density: LayoutDensity,
): { siblingGap: number; childGap: number } => {
  const spacing = DENSITY_SPACING[density];

  return {
    siblingGap: spacing.nodesepWhenHorizontal,
    childGap: spacing.ranksepWhenHorizontal,
  };
};

const horizontallyOverlaps = (
  above: LayoutPosition,
  below: LayoutPosition,
): boolean => {
  const overlap =
    Math.min(above.x + above.width, below.x + below.width) -
    Math.max(above.x, below.x);

  return overlap > 24;
};

/** Enforce a minimum gap between vertically stacked, horizontally overlapping topics. */
const adjustVerticalGaps = (
  positions: LayoutPosition[],
  targetGap: number,
): LayoutPosition[] => {
  const gap = Math.max(0, targetGap);
  const adjusted = new Map(positions.map((position) => [position.id, { ...position }]));
  const sorted = [...positions].sort((left, right) => {
    if (left.y !== right.y) {
      return left.y - right.y;
    }

    return left.x - right.x;
  });

  sorted.forEach((node) => {
    const current = adjusted.get(node.id)!;
    let minY = Number.NEGATIVE_INFINITY;

    sorted.forEach((candidate) => {
      if (candidate.id === node.id) {
        return;
      }

      const above = adjusted.get(candidate.id)!;

      if (above.y + above.height > current.y) {
        return;
      }

      if (!horizontallyOverlaps(above, current)) {
        return;
      }

      minY = Math.max(minY, above.y + above.height + gap);
    });

    if (!Number.isFinite(minY)) {
      return;
    }

    if (current.y < minY) {
      current.y = minY;
    }
  });

  return [...adjusted.values()];
};

const axisCenter = (position: LayoutPosition, alongY: boolean): number =>
  alongY
    ? position.y + position.height / 2
    : position.x + position.width / 2;

const shiftAlongAxis = (
  position: LayoutPosition,
  delta: number,
  alongY: boolean,
): void => {
  if (alongY) {
    position.y += delta;
  } else {
    position.x += delta;
  }
};

const collectSubtreeIds = (
  node: OutlineNode,
  collapsedIds: ReadonlySet<string>,
): string[] => {
  const ids: string[] = [node.id];

  if (collapsedIds.has(node.id)) {
    return ids;
  }

  node.children.forEach((child) => {
    ids.push(...collectSubtreeIds(child, collapsedIds));
  });

  return ids;
};

const subtreeAxisRange = (
  node: OutlineNode,
  byId: Map<string, LayoutPosition>,
  alongY: boolean,
  collapsedIds: ReadonlySet<string>,
): { start: number; end: number } | null => {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;

  collectSubtreeIds(node, collapsedIds).forEach((id) => {
    const position = byId.get(id);

    if (!position) {
      return;
    }

    const edgeStart = alongY ? position.y : position.x;
    const edgeEnd = alongY
      ? position.y + position.height
      : position.x + position.width;
    start = Math.min(start, edgeStart);
    end = Math.max(end, edgeEnd);
  });

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  return { start, end };
};

/**
 * Bottom-up: pack each parent's child subtrees so their bounding boxes do not
 * overlap along the sibling axis, then center the packed block on the parent.
 * Keeps edges in the rank gutter instead of cutting through nodes.
 */
const packAndCenterSiblingSubtrees = (
  positions: LayoutPosition[],
  root: OutlineNode,
  direction: TreeDirection,
  collapsedIds: ReadonlySet<string>,
  siblingGap: number,
): LayoutPosition[] => {
  const alongY = direction === "LR" || direction === "RL";
  const byId = new Map(
    positions.map((position) => [position.id, { ...position }]),
  );

  const shiftSubtree = (node: OutlineNode, delta: number): void => {
    if (Math.abs(delta) < 0.5) {
      return;
    }

    collectSubtreeIds(node, collapsedIds).forEach((id) => {
      const position = byId.get(id);

      if (position) {
        shiftAlongAxis(position, delta, alongY);
      }
    });
  };

  const reflow = (parent: OutlineNode): void => {
    if (collapsedIds.has(parent.id)) {
      return;
    }

    parent.children.forEach(reflow);

    if (parent.children.length === 0) {
      return;
    }

    const parentPos = byId.get(parent.id);

    // Virtual outline root: still pack top-level trees so they don't overlap.
    const ranges = parent.children
      .map((child) => {
        const range = subtreeAxisRange(child, byId, alongY, collapsedIds);

        return range ? { child, range } : null;
      })
      .filter(
        (
          item,
        ): item is {
          child: OutlineNode;
          range: { start: number; end: number };
        } => item !== null,
      );

    if (ranges.length === 0) {
      return;
    }

    const spans = ranges.map(({ range }) => range.end - range.start);
    const blockSpan =
      spans.reduce((sum, span) => sum + span, 0) +
      siblingGap * Math.max(0, ranges.length - 1);

    const parentCenter = parentPos
      ? axisCenter(parentPos, alongY)
      : (ranges[0]!.range.start + ranges[ranges.length - 1]!.range.end) / 2;
    let cursor = parentCenter - blockSpan / 2;

    ranges.forEach(({ child, range }, index) => {
      shiftSubtree(child, cursor - range.start);
      cursor += spans[index]! + siblingGap;
    });
  };

  // Always start from the outline root (virtual or H1) so every parent packs
  // its child subtrees, then centers them on itself.
  reflow(root);

  return [...byId.values()];
};

/** Top-level layout nodes: the H1 root cell(s), not the virtual outline root. */
const getLayoutRoots = (root: OutlineNode): OutlineNode[] =>
  root.cellIndex !== null ? [root] : root.children;

const visit = (
  node: OutlineNode,
  parentId: string | null,
  graph: dagre.graphlib.Graph,
  collapsedIds: ReadonlySet<string>,
  nodeDimensions: LayoutOptions["nodeDimensions"],
) => {
  const size = getNodeSize(node.id, nodeDimensions);

  graph.setNode(node.id, {
    width: size.width,
    height: size.height,
    label: node.title,
  });

  if (parentId) {
    graph.setEdge(parentId, node.id);
  }

  if (collapsedIds.has(node.id)) {
    return;
  }

  node.children.forEach((child) =>
    visit(child, node.id, graph, collapsedIds, nodeDimensions),
  );
};

/** Assign x/y positions to outline nodes. */
export const layoutOutlineTree = (
  root: OutlineNode,
  options: LayoutOptions = {},
): LayoutPosition[] => {
  const direction: TreeDirection = options.direction ?? "LR";
  const collapsedIds = options.collapsedIds ?? new Set<string>();
  const density: LayoutDensity = options.density ?? "normal";
  const spacing = DENSITY_SPACING[density];
  const densityGaps = getLayoutGapsForDensity(density);
  const siblingGap = options.siblingGap ?? densityGaps.siblingGap;
  const childGap = options.childGap ?? densityGaps.childGap;
  const nodeDimensions = options.nodeDimensions;
  const graph = new dagre.graphlib.Graph();

  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    nodesep: siblingGap,
    ranksep: childGap,
    marginx: spacing.margin,
    marginy: spacing.margin,
  });

  getLayoutRoots(root).forEach((child) =>
    visit(child, null, graph, collapsedIds, nodeDimensions),
  );
  dagre.layout(graph);

  const positions = graph.nodes().map((id) => {
    const positioned = graph.node(id);

    return {
      id,
      x: positioned.x - positioned.width / 2,
      y: positioned.y - positioned.height / 2,
      width: positioned.width,
      height: positioned.height,
    };
  });

  const spaced = adjustVerticalGaps(positions, siblingGap);

  const packed = packAndCenterSiblingSubtrees(
    spaced,
    root,
    direction,
    collapsedIds,
    siblingGap,
  );

  // Dagre centers nodes in a rank; with unequal widths (Fit content) that
  // staggers parent-facing edges. Align each sibling group on that edge.
  const aligned = alignSiblingLeadingEdges(
    packed,
    root,
    direction,
    collapsedIds,
  );

  // Sibling packing centers branches on the parent and can push coordinates
  // negative. SVG edges use viewBox origin (0,0), so shift the whole map
  // back into the positive quadrant or those connectors disappear.
  return normalizeLayoutOrigin(aligned, spacing.margin);
};

/**
 * Align each parent's children on the parent-facing edge so variable-width
 * cards share a clean column (left for LR, right for RL, …).
 */
const alignSiblingLeadingEdges = (
  positions: LayoutPosition[],
  root: OutlineNode,
  direction: TreeDirection,
  collapsedIds: ReadonlySet<string>,
): LayoutPosition[] => {
  const byId = new Map(
    positions.map((position) => [position.id, { ...position }]),
  );

  const shiftSubtree = (node: OutlineNode, dx: number, dy: number): void => {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      return;
    }

    collectSubtreeIds(node, collapsedIds).forEach((id) => {
      const position = byId.get(id);

      if (position) {
        position.x += dx;
        position.y += dy;
      }
    });
  };

  const alignGroup = (parent: OutlineNode): void => {
    if (collapsedIds.has(parent.id)) {
      return;
    }

    parent.children.forEach(alignGroup);

    const siblings = parent.children
      .map((child) => {
        const position = byId.get(child.id);
        return position ? { child, position } : null;
      })
      .filter(
        (
          item,
        ): item is { child: OutlineNode; position: LayoutPosition } =>
          item !== null,
      );

    if (siblings.length < 2) {
      return;
    }

    switch (direction) {
      case "LR": {
        const left = Math.min(...siblings.map(({ position }) => position.x));
        siblings.forEach(({ child, position }) => {
          shiftSubtree(child, left - position.x, 0);
        });
        break;
      }
      case "RL": {
        const right = Math.max(
          ...siblings.map(({ position }) => position.x + position.width),
        );
        siblings.forEach(({ child, position }) => {
          shiftSubtree(child, right - (position.x + position.width), 0);
        });
        break;
      }
      case "TB": {
        const top = Math.min(...siblings.map(({ position }) => position.y));
        siblings.forEach(({ child, position }) => {
          shiftSubtree(child, 0, top - position.y);
        });
        break;
      }
      case "BT": {
        const bottom = Math.max(
          ...siblings.map(({ position }) => position.y + position.height),
        );
        siblings.forEach(({ child, position }) => {
          shiftSubtree(child, 0, bottom - (position.y + position.height));
        });
        break;
      }
    }
  };

  alignGroup(root);
  return [...byId.values()];
};

/** Translate layout so every node sits at/after `margin` on both axes. */
const normalizeLayoutOrigin = (
  positions: LayoutPosition[],
  margin: number,
): LayoutPosition[] => {
  if (positions.length === 0) {
    return positions;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;

  positions.forEach((position) => {
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
  });

  const dx = margin - minX;
  const dy = margin - minY;

  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
    return positions;
  }

  return positions.map((position) => ({
    ...position,
    x: position.x + dx,
    y: position.y + dy,
  }));
};

/** Parent → child links for drawing canvas edges. */
export const collectOutlineEdges = (
  root: OutlineNode,
  collapsedIds: ReadonlySet<string> = new Set(),
): OutlineEdge[] => {
  const edges: OutlineEdge[] = [];

  const visit = (node: OutlineNode, parentId: string | null) => {
    if (parentId) {
      edges.push({ fromId: parentId, toId: node.id });
    }

    if (collapsedIds.has(node.id)) {
      return;
    }

    node.children.forEach((child) => visit(child, node.id));
  };

  getLayoutRoots(root).forEach((child) => visit(child, null));
  return edges;
};

const horizontalCenter = (node: LayoutPosition, edge: "left" | "right") => ({
  x: edge === "left" ? node.x : node.x + node.width,
  y: node.y + node.height / 2,
});

const verticalCenter = (node: LayoutPosition, edge: "top" | "bottom") => ({
  x: node.x + node.width / 2,
  y: edge === "top" ? node.y : node.y + node.height,
});

const getEdgeAnchors = (
  from: LayoutPosition,
  to: LayoutPosition,
  direction: TreeDirection,
): {
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
} => {
  switch (direction) {
    case "LR":
      return {
        fromPoint: horizontalCenter(from, "right"),
        toPoint: horizontalCenter(to, "left"),
      };
    case "RL":
      return {
        fromPoint: horizontalCenter(from, "left"),
        toPoint: horizontalCenter(to, "right"),
      };
    case "BT":
      return {
        fromPoint: verticalCenter(from, "top"),
        toPoint: verticalCenter(to, "bottom"),
      };
    case "TB":
    default:
      return {
        fromPoint: verticalCenter(from, "bottom"),
        toPoint: verticalCenter(to, "top"),
      };
  }
};

/** SVG path between parent and child nodes for the given tree direction. */
export const buildMindMapEdgePath = (
  from: LayoutPosition,
  to: LayoutPosition,
  direction: TreeDirection = "TB",
  route: EdgeRouteStyle = "orthogonal",
): string => {
  const { fromPoint, toPoint } = getEdgeAnchors(from, to, direction);
  const { x: x0, y: y0 } = fromPoint;
  const { x: x1, y: y1 } = toPoint;

  if (route === "straight") {
    return `M ${x0} ${y0} L ${x1} ${y1}`;
  }

  const alongY = direction === "LR" || direction === "RL";

  if (route === "curve") {
    if (alongY) {
      const midX = x0 + (x1 - x0) / 2;
      return `M ${x0} ${y0} C ${midX} ${y0}, ${midX} ${y1}, ${x1} ${y1}`;
    }

    const midY = y0 + (y1 - y0) / 2;
    return `M ${x0} ${y0} C ${x0} ${midY}, ${x1} ${midY}, ${x1} ${y1}`;
  }

  // orthogonal + rounded-orthogonal
  if (alongY) {
    const midX = x0 + (x1 - x0) / 2;

    if (Math.abs(y0 - y1) < 0.5) {
      return `M ${x0} ${y0} L ${x1} ${y1}`;
    }

    if (route === "orthogonal") {
      return `M ${x0} ${y0} L ${midX} ${y0} L ${midX} ${y1} L ${x1} ${y1}`;
    }

    const radius = Math.min(
      16,
      Math.abs(x1 - x0) / 2,
      Math.abs(y1 - y0) / 2,
    );
    const ySign = y1 >= y0 ? 1 : -1;
    const xSign = x1 >= x0 ? 1 : -1;

    return [
      `M ${x0} ${y0}`,
      `L ${midX - xSign * radius} ${y0}`,
      `Q ${midX} ${y0} ${midX} ${y0 + ySign * radius}`,
      `L ${midX} ${y1 - ySign * radius}`,
      `Q ${midX} ${y1} ${midX + xSign * radius} ${y1}`,
      `L ${x1} ${y1}`,
    ].join(" ");
  }

  const midY = y0 + (y1 - y0) / 2;

  if (Math.abs(x0 - x1) < 0.5) {
    return `M ${x0} ${y0} L ${x1} ${y1}`;
  }

  if (route === "orthogonal") {
    return `M ${x0} ${y0} L ${x0} ${midY} L ${x1} ${midY} L ${x1} ${y1}`;
  }

  const radius = Math.min(
    16,
    Math.abs(x1 - x0) / 2,
    Math.abs(y1 - y0) / 2,
  );
  const xSign = x1 >= x0 ? 1 : -1;
  const ySign = y1 >= y0 ? 1 : -1;

  return [
    `M ${x0} ${y0}`,
    `L ${x0} ${midY - ySign * radius}`,
    `Q ${x0} ${midY} ${x0 + xSign * radius} ${midY}`,
    `L ${x1 - xSign * radius} ${midY}`,
    `Q ${x1} ${midY} ${x1} ${midY + ySign * radius}`,
    `L ${x1} ${y1}`,
  ].join(" ");
};

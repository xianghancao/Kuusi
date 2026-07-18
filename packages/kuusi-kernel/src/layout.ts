import dagre from "dagre";
import type {
  LayoutDensity,
  LayoutOptions,
  LayoutPosition,
  OutlineEdge,
  OutlineNode,
  TreeDirection,
} from "./types";

const NODE_WIDTH = 520;
const NODE_HEIGHT = 160;
const NODE_LAYOUT_PADDING = 24;

export const DEFAULT_NODE_LAYOUT_SIZE = {
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
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
    width: Math.max(measured.width, NODE_WIDTH),
    height: Math.max(measured.height + NODE_LAYOUT_PADDING, NODE_HEIGHT),
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
  max: 200,
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

/** Enforce XMind-like vertical stacking gaps between adjacent topics. */
const adjustVerticalGaps = (
  positions: LayoutPosition[],
  density: LayoutDensity,
): LayoutPosition[] => {
  const targetGap = DENSITY_SPACING[density].verticalGap;
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

      minY = Math.max(minY, above.y + above.height + targetGap);
    });

    if (!Number.isFinite(minY)) {
      return;
    }

    if (density === "compact" || current.y < minY) {
      current.y = minY;
    }
  });

  return [...adjusted.values()];
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

  return adjustVerticalGaps(positions, density);
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
): string => {
  const { fromPoint, toPoint } = getEdgeAnchors(from, to, direction);

  switch (direction) {
    case "BT": {
      const midY = fromPoint.y + (toPoint.y - fromPoint.y) / 2;

      return `M ${fromPoint.x} ${fromPoint.y} C ${fromPoint.x} ${midY}, ${toPoint.x} ${midY}, ${toPoint.x} ${toPoint.y}`;
    }
    case "LR": {
      const midX = fromPoint.x + (toPoint.x - fromPoint.x) / 2;

      return `M ${fromPoint.x} ${fromPoint.y} C ${midX} ${fromPoint.y}, ${midX} ${toPoint.y}, ${toPoint.x} ${toPoint.y}`;
    }
    case "RL": {
      const midX = fromPoint.x + (toPoint.x - fromPoint.x) / 2;

      return `M ${fromPoint.x} ${fromPoint.y} C ${midX} ${fromPoint.y}, ${midX} ${toPoint.y}, ${toPoint.x} ${toPoint.y}`;
    }
    case "TB":
    default: {
      const midY = fromPoint.y + (toPoint.y - fromPoint.y) / 2;

      return `M ${fromPoint.x} ${fromPoint.y} C ${fromPoint.x} ${midY}, ${toPoint.x} ${midY}, ${toPoint.x} ${toPoint.y}`;
    }
  }
};

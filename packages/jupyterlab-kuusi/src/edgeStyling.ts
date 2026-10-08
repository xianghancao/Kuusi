export type EdgeLike = { fromId: string; toId: string };

export type EdgeNodeInfo = {
  /** Depth of the edge's child node: 1 = directly under a map root. */
  depth: number;
  /** Index of the first-level branch this edge belongs to. */
  branch: number;
};

export type EdgeBranchColors = "off" | "rainbow" | "pastel" | "mono";

export const EDGE_BRANCH_COLOR_MODES: EdgeBranchColors[] = [
  "off",
  "rainbow",
  "pastel",
  "mono",
];

export const isEdgeBranchColors = (value: unknown): value is EdgeBranchColors =>
  typeof value === "string" &&
  (EDGE_BRANCH_COLOR_MODES as string[]).includes(value);

export const EDGE_BRANCH_PALETTES: Record<
  Exclude<EdgeBranchColors, "off">,
  string[]
> = {
  rainbow: [
    "#e53935",
    "#fb8c00",
    "#fdd835",
    "#43a047",
    "#00acc1",
    "#1e88e5",
    "#5e35b1",
    "#d81b60",
  ],
  pastel: [
    "#ef9a9a",
    "#ffcc80",
    "#fff59d",
    "#a5d6a7",
    "#80deea",
    "#90caf9",
    "#b39ddb",
    "#f48fb1",
  ],
  mono: ["#37474f", "#546e7a", "#78909c", "#90a4ae"],
};

/** Each level is this fraction as thick as the one above it. */
export const EDGE_TAPER_FACTOR = 0.78;

/**
 * Depth and first-level branch for every child node in an edge list.
 * Roots are the nodes that only ever appear as a parent; edges out of a root
 * start a new branch. Works on a drag-filtered edge list too.
 */
export const computeEdgeInfo = (
  edges: readonly EdgeLike[],
): Map<string, EdgeNodeInfo> => {
  const children = new Set<string>();
  const byParent = new Map<string, string[]>();

  edges.forEach(({ fromId, toId }) => {
    children.add(toId);
    const list = byParent.get(fromId);

    if (list) {
      list.push(toId);
    } else {
      byParent.set(fromId, [toId]);
    }
  });

  const info = new Map<string, EdgeNodeInfo>();
  let branchCounter = 0;

  const visit = (parentId: string, depth: number, branch: number | null) => {
    (byParent.get(parentId) ?? []).forEach((childId) => {
      const childBranch = branch ?? branchCounter++;
      info.set(childId, { depth, branch: childBranch });
      visit(childId, depth + 1, childBranch);
    });
  };

  byParent.forEach((_list, parentId) => {
    if (!children.has(parentId)) {
      visit(parentId, 1, null);
    }
  });

  return info;
};

/** Stroke width for an edge at `depth` (1 = thickest), never below `minPx`. */
export const taperedEdgeWidth = (
  basePx: number,
  minPx: number,
  depth: number,
): number => {
  if (depth <= 1) {
    return basePx;
  }

  const floor = Math.min(minPx, basePx);
  return Math.max(floor, basePx * EDGE_TAPER_FACTOR ** (depth - 1));
};

export const branchEdgeColor = (
  mode: Exclude<EdgeBranchColors, "off">,
  branch: number,
): string => {
  const palette = EDGE_BRANCH_PALETTES[mode];
  return palette[((branch % palette.length) + palette.length) % palette.length]!;
};

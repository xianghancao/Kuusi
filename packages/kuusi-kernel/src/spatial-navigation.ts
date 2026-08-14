import type { OutlineMoveDirection } from "./outline-navigation";

export type SpatialNodeBounds = {
  nodeId: string;
  cellIndex: number;
  centerX: number;
  centerY: number;
};

const directionScore = (
  current: SpatialNodeBounds,
  candidate: SpatialNodeBounds,
  direction: OutlineMoveDirection,
): number | null => {
  const dx = candidate.centerX - current.centerX;
  const dy = candidate.centerY - current.centerY;
  const minAxisDelta = 4;

  switch (direction) {
    case "right":
      if (dx < minAxisDelta) {
        return null;
      }
      return dx + Math.abs(dy) * 0.65;
    case "left":
      if (dx > -minAxisDelta) {
        return null;
      }
      return -dx + Math.abs(dy) * 0.65;
    case "down":
      if (dy < minAxisDelta) {
        return null;
      }
      return dy + Math.abs(dx) * 0.65;
    case "up":
      if (dy > -minAxisDelta) {
        return null;
      }
      return -dy + Math.abs(dx) * 0.65;
    default:
      return null;
  }
};

/**
 * Pick the nearest visible node on the canvas in the given screen direction.
 */
export const findSpatialNavigationTarget = (
  currentNodeId: string,
  nodes: readonly SpatialNodeBounds[],
  direction: OutlineMoveDirection,
): SpatialNodeBounds | null => {
  const current = nodes.find((node) => node.nodeId === currentNodeId);

  if (!current) {
    return null;
  }

  let best: SpatialNodeBounds | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  nodes.forEach((candidate) => {
    if (candidate.nodeId === currentNodeId) {
      return;
    }

    const score = directionScore(current, candidate, direction);

    if (score === null || score >= bestScore) {
      return;
    }

    bestScore = score;
    best = candidate;
  });

  return best;
};

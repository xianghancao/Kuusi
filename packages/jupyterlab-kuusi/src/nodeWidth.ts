import type { ICellModel } from "@jupyterlab/cells";
import { LAYOUT_NODE_WIDTH, LEGACY_CELL_METADATA_KEY } from "kuusi-kernel";

export const clampNodeWidth = (width: number): number =>
  Math.min(
    LAYOUT_NODE_WIDTH.max,
    Math.max(LAYOUT_NODE_WIDTH.min, Math.round(width)),
  );

const readKuusiRecord = (
  cell: ICellModel,
): Record<string, unknown> | null => {
  const kuusi = cell.getMetadata("kuusi");

  if (kuusi && typeof kuusi === "object") {
    return kuusi as Record<string, unknown>;
  }

  const legacy = cell.getMetadata(LEGACY_CELL_METADATA_KEY);

  if (legacy && typeof legacy === "object") {
    return legacy as Record<string, unknown>;
  }

  return null;
};

/** Per-node card width from `metadata.kuusi.width`, if set. */
export const readCellNodeWidth = (cell: ICellModel): number | null => {
  const kuusi = readKuusiRecord(cell);
  const width = kuusi?.width;

  if (typeof width !== "number" || !Number.isFinite(width)) {
    return null;
  }

  return clampNodeWidth(width);
};

/** Persist or clear per-node card width in `metadata.kuusi`. */
export const writeCellNodeWidth = (
  cell: ICellModel,
  width: number | null,
): void => {
  const kuusi = { ...(readKuusiRecord(cell) ?? {}) };

  if (width === null) {
    delete kuusi.width;
  } else {
    kuusi.width = clampNodeWidth(width);
  }

  if (Object.keys(kuusi).length === 0) {
    cell.deleteMetadata("kuusi");
  } else {
    cell.setMetadata("kuusi", kuusi);
  }
};

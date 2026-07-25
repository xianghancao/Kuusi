import type { ICellModel } from "@jupyterlab/cells";
import { LEGACY_CELL_METADATA_KEY, type NodeFrameStyle } from "kuusi-kernel";

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

const readFrameStyle = (cell: ICellModel): NodeFrameStyle => {
  const kuusi = readKuusiRecord(cell);
  const frameStyle = kuusi?.frameStyle;

  if (!frameStyle || typeof frameStyle !== "object") {
    return {};
  }

  return frameStyle as NodeFrameStyle;
};

/** Per-node fill from `metadata.kuusi.frameStyle.background`. */
export const readCellNodeFill = (cell: ICellModel): string | null => {
  const background = readFrameStyle(cell).background;

  if (typeof background !== "string" || background.length === 0) {
    return null;
  }

  return background;
};

/** Persist or clear per-node fill color in `metadata.kuusi.frameStyle`. */
export const writeCellNodeFill = (
  cell: ICellModel,
  color: string | null,
): void => {
  const kuusi = { ...(readKuusiRecord(cell) ?? {}) };
  const frameStyle: NodeFrameStyle = { ...readFrameStyle(cell) };

  if (color === null || color.length === 0) {
    delete frameStyle.background;
  } else {
    frameStyle.background = color;
  }

  if (Object.keys(frameStyle).length === 0) {
    delete kuusi.frameStyle;
  } else {
    kuusi.frameStyle = frameStyle;
  }

  if (Object.keys(kuusi).length === 0) {
    cell.deleteMetadata("kuusi");
  } else {
    cell.setMetadata("kuusi", kuusi);
  }
};

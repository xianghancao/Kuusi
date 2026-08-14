import type { IMarkdownCellModel } from "@jupyterlab/cells";
import type { INotebookModel } from "@jupyterlab/notebook";
import {
  computeNotebookReorderPlan,
  LEGACY_CELL_METADATA_KEY,
  type NotebookCell,
  type OutlineNode,
} from "kuusi-kernel";

const writeHeadingMetadata = (
  cell: IMarkdownCellModel,
  level: number | null,
): void => {
  const kuusiRaw = cell.getMetadata("kuusi");
  const legacyRaw = cell.getMetadata(LEGACY_CELL_METADATA_KEY);
  const base =
    kuusiRaw && typeof kuusiRaw === "object"
      ? { ...(kuusiRaw as Record<string, unknown>) }
      : legacyRaw && typeof legacyRaw === "object"
        ? { ...(legacyRaw as Record<string, unknown>) }
        : {};

  if (level === null) {
    delete base.headingLevel;
    delete base.outlineLevel;

    if (Object.keys(base).length === 0) {
      cell.deleteMetadata("kuusi");
    } else {
      cell.setMetadata("kuusi", base);
    }

    return;
  }

  cell.setMetadata("kuusi", {
    ...base,
    outlineLevel: level,
    headingLevel: level,
  });
};

/** Persist or clear structural outline depth in `metadata.kuusi`. */
export const writeCellHeadingLevel = writeHeadingMetadata;

export const applyOutlineToNotebook = (
  model: INotebookModel,
  outline: OutlineNode,
  cells: NotebookCell[],
): void => {
  const plan = computeNotebookReorderPlan(outline, cells);
  const cellCount = model.cells.length;

  if (cellCount === 0) {
    return;
  }

  model.sharedModel.transact(() => {
    plan.sourceUpdates.forEach((source, originalIndex) => {
      const cell = model.cells.get(originalIndex);

      if (cell?.type === "markdown") {
        (cell as IMarkdownCellModel).sharedModel.setSource(source);
      }
    });

    plan.headingMetadataUpdates.forEach((level, originalIndex) => {
      const cell = model.cells.get(originalIndex);

      if (cell?.type === "markdown") {
        writeHeadingMetadata(cell as IMarkdownCellModel, level);
      }
    });

    const currentOrder = Array.from({ length: cellCount }, (_, index) => index);

    for (let targetIndex = 0; targetIndex < plan.order.length; targetIndex++) {
      const desiredOriginalIndex = plan.order[targetIndex]!;
      const fromIndex = currentOrder.indexOf(desiredOriginalIndex);

      if (fromIndex === targetIndex) {
        continue;
      }

      model.sharedModel.moveCell(fromIndex, targetIndex);
      currentOrder.splice(fromIndex, 1);
      currentOrder.splice(targetIndex, 0, desiredOriginalIndex);
    }
  });
};

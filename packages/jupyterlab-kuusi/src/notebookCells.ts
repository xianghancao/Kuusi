import type { ICellModel } from "@jupyterlab/cells";
import type { INotebookModel } from "@jupyterlab/notebook";
import type { NotebookCell } from "kuusi-kernel";

/**
 * Lightweight outline/layout snapshot of one cell.
 * Avoids `model.toJSON()` so code outputs and unrelated metadata are not copied.
 */
export const snapshotCellModel = (cell: ICellModel): NotebookCell => {
  const kuusi = cell.getMetadata("kuusi");
  const lumen = cell.getMetadata("lumen");
  const metadata: Record<string, unknown> = {};

  if (kuusi !== undefined) {
    metadata.kuusi = kuusi;
  }

  if (lumen !== undefined) {
    metadata.lumen = lumen;
  }

  const snapshot: NotebookCell = {
    cell_type: cell.type as NotebookCell["cell_type"],
    source: cell.sharedModel.getSource(),
  };

  if (Object.keys(metadata).length > 0) {
    snapshot.metadata = metadata;
  }

  return snapshot;
};

/** Ordered lightweight snapshots for outline build / reorder planning. */
export const snapshotNotebookCells = (
  model: INotebookModel,
): NotebookCell[] => {
  const cells: NotebookCell[] = [];

  for (let index = 0; index < model.cells.length; index += 1) {
    const cell = model.cells.get(index);

    if (cell) {
      cells.push(snapshotCellModel(cell));
    }
  }

  return cells;
};

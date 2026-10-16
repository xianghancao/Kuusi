import type { NotebookPanel } from "@jupyterlab/notebook";

/**
 * Remember the active cell, caret / selection and scroll position of a
 * notebook. The returned function puts them back once the cells have been
 * rebuilt (after a revert from disk), so the caret is not sent to line 1.
 */
export const captureNotebookViewState = (
  panel: NotebookPanel,
): (() => void) | null => {
  const notebook = panel.content;
  const index = notebook.activeCellIndex;
  const selection = notebook.activeCell?.editor?.getSelection?.();
  const position = notebook.activeCell?.editor?.getCursorPosition?.();
  const scrollTop = notebook.node.scrollTop;
  const editing = notebook.mode === "edit";

  if (index < 0) {
    return null;
  }

  return () => {
    const restore = (): void => {
      if (panel.isDisposed || index >= notebook.widgets.length) {
        return;
      }

      notebook.activeCellIndex = index;
      const editor = notebook.widgets[index].editor;

      if (editor) {
        if (selection) {
          editor.setSelection(selection);
        } else if (position) {
          editor.setCursorPosition(position);
        }
      }

      notebook.node.scrollTop = scrollTop;

      if (editing) {
        notebook.mode = "edit";
        editor?.focus();
      }
    };

    // The revert fills the notebook in over a few frames.
    for (const delay of [0, 120, 400]) {
      window.setTimeout(restore, delay);
    }
  };
};

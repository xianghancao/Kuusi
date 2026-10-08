import type { IDocumentWidget } from "@jupyterlab/docregistry";
import type { FileEditor, IEditorTracker } from "@jupyterlab/fileeditor";
import type { MarkdownDocument } from "@jupyterlab/markdownviewer";
import type {
  INotebookModel,
  INotebookTracker,
  NotebookPanel,
} from "@jupyterlab/notebook";
import type { Widget } from "@lumino/widgets";
import { EditorView } from "@codemirror/view";
import { markdownCellIndexToLine, markdownLineToCellIndex } from "kuusi-kernel";

import { articleLineAtPoint, revealArticleLine } from "./articleSourceMap";
import type { MarkdownMindMapDocumentWidget } from "./markdownMindMapWidget";
import type { MarkdownSlidesDocumentWidget } from "./markdownSlides/markdownSlidesWidget";
import {
  notebookArticleLayout,
  notebookCellForArticleLine,
  type NotebookArticleLayout,
} from "./notebookMarkdownContext";

/** Which document a view renders: a `.md` text file or an `.ipynb`. */
export type PositionSourceKind = "markdown" | "notebook";

type PositionView = {
  widget: Widget;
  kind: PositionSourceKind;
  path: () => string;
  /** Follow a source line (0-based, in the markdown the view renders). */
  reveal: (source: string, line: number) => void;
};

const views = new Set<PositionView>();
let editorTracker: IEditorTracker | null = null;
let notebookTracker: INotebookTracker | null = null;

export const configureRenderPositionSync = (services: {
  editorTracker?: IEditorTracker | null;
  notebookTracker?: INotebookTracker | null;
}): void => {
  editorTracker = services.editorTracker ?? editorTracker;
  notebookTracker = services.notebookTracker ?? notebookTracker;
};

/**
 * A view that just moved the source must not be scrolled back by the echo
 * of that move (it would jump away from where the user clicked).
 */
const ORIGIN_HOLD_MS = 800;
const origins = new Map<string, { view: PositionView; until: number }>();

const markOrigin = (path: string, view: PositionView): void => {
  origins.set(path, { view, until: performance.now() + ORIGIN_HOLD_MS });
};

const isShown = (widget: Widget): boolean =>
  !widget.isDisposed && widget.isAttached && widget.isVisible;

const registerView = (view: PositionView): void => {
  views.add(view);
  view.widget.disposed.connect(() => {
    views.delete(view);
  });
  // Catch up to the caret that is already there (render may still be empty).
  requestAnimationFrame(() => revealCurrentSource(view));
  window.setTimeout(() => revealCurrentSource(view), 400);
};

const revealCurrentSource = (view: PositionView): void => {
  if (!isShown(view.widget)) {
    return;
  }

  const path = view.path();

  if (view.kind === "markdown") {
    const widget = findMarkdownEditor(path);

    if (widget) {
      view.reveal(
        widget.context.model.toString(),
        widget.content.editor.getCursorPosition().line,
      );
    }
    return;
  }

  const panel = findNotebook(path);

  if (!panel?.model) {
    return;
  }

  const layout = layoutFor(panel.model);
  const line = notebookLine(panel, layout);

  if (line !== null) {
    view.reveal(layout.markdown, line);
  }
};

/** The source moved: bring every visible view of the same document along. */
export const revealSourcePositionInViews = (
  path: string,
  kind: PositionSourceKind,
  source: string,
  line: number,
): void => {
  const origin = origins.get(path);
  const now = performance.now();

  views.forEach((view) => {
    if (
      view.kind !== kind ||
      view.path() !== path ||
      !isShown(view.widget) ||
      (origin?.view === view && now < origin.until)
    ) {
      return;
    }

    view.reveal(source, line);
  });
};

/** True for a short while after the user pressed a key or pointer in `node`. */
const trackUserIntent = (widget: Widget, holdMs = 1000): (() => boolean) => {
  let last = -Infinity;
  const mark = (): void => {
    last = performance.now();
  };

  widget.node.addEventListener("pointerdown", mark, true);
  widget.node.addEventListener("keydown", mark, true);
  widget.disposed.connect(() => {
    widget.node.removeEventListener("pointerdown", mark, true);
    widget.node.removeEventListener("keydown", mark, true);
  });

  return () => performance.now() - last < holdMs;
};

const hasTextSelection = (): boolean =>
  window.getSelection()?.isCollapsed === false;

// ---------------------------------------------------------------------------
// Markdown editor (source of `.md` views)
// ---------------------------------------------------------------------------

const findMarkdownEditor = (
  path: string,
): IDocumentWidget<FileEditor> | null =>
  editorTracker?.find((widget) => widget.context.path === path) ?? null;

const editorViewOf = (widget: IDocumentWidget<FileEditor>): EditorView | null => {
  const view = (widget.content.editor as unknown as { editor?: unknown }).editor;
  return view instanceof EditorView ? view : null;
};

/** Put the editor caret on `line` and scroll there only if it is off screen. */
const moveMarkdownEditor = (
  path: string,
  line: number,
  origin: PositionView,
): void => {
  const widget = findMarkdownEditor(path);
  const view = widget ? editorViewOf(widget) : null;

  if (!widget || !view) {
    return;
  }

  const doc = view.state.doc;
  const target = doc.line(Math.max(1, Math.min(line + 1, doc.lines)));

  if (doc.lineAt(view.state.selection.main.head).number === target.number) {
    return;
  }

  markOrigin(path, origin);

  const scroller = view.scrollDOM.getBoundingClientRect();
  const coords = view.coordsAtPos(target.from);
  const visible =
    coords !== null &&
    coords.top >= scroller.top + 8 &&
    coords.bottom <= scroller.bottom - 8;

  view.dispatch({
    selection: { anchor: target.from },
    effects: visible
      ? []
      : EditorView.scrollIntoView(target.from, { y: "center" }),
  });
};

const markdownEditorLine = (path: string): number | null => {
  const widget = findMarkdownEditor(path);
  return widget ? widget.content.editor.getCursorPosition().line : null;
};

// ---------------------------------------------------------------------------
// Notebook (source of `.ipynb` Article / Slides)
// ---------------------------------------------------------------------------

const layoutCache = new WeakMap<INotebookModel, NotebookArticleLayout>();
const layoutWatched = new WeakSet<INotebookModel>();

const layoutFor = (model: INotebookModel): NotebookArticleLayout => {
  if (!layoutWatched.has(model)) {
    layoutWatched.add(model);
    model.contentChanged.connect(() => {
      layoutCache.delete(model);
    });
  }

  let layout = layoutCache.get(model);

  if (!layout) {
    layout = notebookArticleLayout(model);
    layoutCache.set(model, layout);
  }

  return layout;
};

const findNotebook = (path: string): NotebookPanel | null =>
  notebookTracker?.find((panel) => panel.context.path === path) ?? null;

/** Line in the generated article markdown for the notebook's caret. */
const notebookLine = (
  panel: NotebookPanel,
  layout: NotebookArticleLayout,
): number | null => {
  const notebook = panel.content;
  const index = notebook.activeCellIndex;
  let start = layout.cellStarts[index] ?? -1;

  if (start < 0) {
    // Empty cell: use the nearest earlier cell that produced content.
    for (let i = index - 1; i >= 0 && start < 0; i -= 1) {
      start = layout.cellStarts[i] ?? -1;
    }
    return start < 0 ? null : start;
  }

  const cell = notebook.activeCell;

  if (!cell || notebook.mode !== "edit") {
    return start;
  }

  const caretLine = cell.editor?.getCursorPosition().line ?? 0;
  // Code and raw cells are wrapped in a fence; skip its opening line.
  return start + caretLine + (cell.model.type === "markdown" ? 0 : 1);
};

/** Select a notebook cell and scroll to it without taking focus. */
const moveNotebook = (
  path: string,
  cellIndex: number,
  origin: PositionView,
): void => {
  const panel = findNotebook(path);
  const notebook = panel?.content;

  if (!panel || !notebook || cellIndex < 0 || cellIndex >= notebook.widgets.length) {
    return;
  }

  if (notebook.activeCellIndex === cellIndex) {
    return;
  }

  markOrigin(path, origin);

  const focused = document.activeElement;
  const focusWasOutside =
    focused instanceof HTMLElement && !panel.node.contains(focused);

  if (notebook.mode === "edit" && focusWasOutside) {
    notebook.mode = "command";
  }

  notebook.activeCellIndex = cellIndex;
  void notebook.scrollToItem(cellIndex, "smart");

  const restore = (): void => {
    if (
      focusWasOutside &&
      focused instanceof HTMLElement &&
      focused.isConnected &&
      document.activeElement !== focused
    ) {
      focused.focus({ preventScroll: true });
    }
  };

  restore();
  requestAnimationFrame(restore);
};

const NOTEBOOK_SYNC_DEBOUNCE_MS = 60;
const boundNotebooks = new WeakSet<NotebookPanel>();

/** Notebook caret / active cell → notebook Article and Slides. */
export const bindNotebookPositionSource = (panel: NotebookPanel): void => {
  if (boundNotebooks.has(panel)) {
    return;
  }

  boundNotebooks.add(panel);

  let timer: number | null = null;
  let lastLine = -1;
  let watchedSelections: { disconnect: () => void } | null = null;

  const syncNow = (): void => {
    const model = panel.model;

    if (panel.isDisposed || !model) {
      return;
    }

    const layout = layoutFor(model);
    const line = notebookLine(panel, layout);

    if (line === null || line === lastLine) {
      return;
    }

    lastLine = line;
    revealSourcePositionInViews(
      panel.context.path,
      "notebook",
      layout.markdown,
      line,
    );
  };

  const schedule = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      timer = null;
      syncNow();
    }, NOTEBOOK_SYNC_DEBOUNCE_MS);
  };

  const watchActiveCell = (): void => {
    watchedSelections?.disconnect();
    watchedSelections = null;

    const selections = panel.content.activeCell?.model.selections;

    if (selections) {
      selections.changed.connect(schedule);
      watchedSelections = {
        disconnect: () => selections.changed.disconnect(schedule),
      };
    }

    schedule();
  };

  panel.content.activeCellChanged.connect(watchActiveCell);
  panel.content.stateChanged.connect((_, change) => {
    if (change.name === "mode") {
      schedule();
    }
  });
  watchActiveCell();

  panel.disposed.connect(() => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    watchedSelections?.disconnect();
  });
};

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const renderedRootOf = (widget: MarkdownDocument): HTMLElement | null => {
  const node = widget.content.renderer.node;

  if (node.matches(".jp-RenderedMarkdown, .jp-RenderedMySTMarkdown")) {
    return node;
  }

  return node.querySelector<HTMLElement>(
    ".jp-RenderedMarkdown, .jp-RenderedMySTMarkdown",
  );
};

const IGNORED_CLICK_TARGETS =
  "a, button, input, select, textarea, summary, .jp-KuusiRenderChrome, .jp-KuusiFormatDropdown-menu";

const boundViews = new WeakSet<Widget>();

/** Article (markdown preview or notebook article) ↔ its source. */
export const bindArticlePositionSync = (
  widget: MarkdownDocument,
  kind: PositionSourceKind,
): void => {
  if (boundViews.has(widget)) {
    return;
  }

  boundViews.add(widget);

  const view: PositionView = {
    widget,
    kind,
    path: () => widget.context.path,
    reveal: (source, line) => {
      const root = renderedRootOf(widget);

      if (root) {
        revealArticleLine(root, source, line);
      }
    },
  };
  registerView(view);

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    const root = renderedRootOf(widget);

    if (
      !root ||
      !(target instanceof Element) ||
      target.closest(IGNORED_CLICK_TARGETS) ||
      hasTextSelection()
    ) {
      return;
    }

    const path = widget.context.path;

    if (kind === "markdown") {
      const line = articleLineAtPoint(
        root,
        widget.context.model.toString(),
        target,
        event.clientY,
      );

      if (line !== null) {
        moveMarkdownEditor(path, line, view);
      }
      return;
    }

    const panel = findNotebook(path);

    if (!panel?.model) {
      return;
    }

    const layout = layoutFor(panel.model);
    const line = articleLineAtPoint(root, layout.markdown, target, event.clientY);

    if (line !== null) {
      moveNotebook(path, notebookCellForArticleLine(layout, line), view);
    }
  };

  widget.content.node.addEventListener("click", onClick);
  widget.disposed.connect(() => {
    widget.content.node.removeEventListener("click", onClick);
  });
};

/** Slides (markdown or notebook) ↔ its source. */
export const bindSlidesPositionSync = (
  widget: MarkdownSlidesDocumentWidget,
  kind: PositionSourceKind,
): void => {
  if (boundViews.has(widget)) {
    return;
  }

  boundViews.add(widget);

  const viewer = widget.content;
  const view: PositionView = {
    widget,
    kind,
    path: () => widget.context.path,
    reveal: (source, line) => viewer.showSourceLine(source, line),
  };
  registerView(view);

  viewer.userNavigated.connect(() => {
    const path = widget.context.path;

    if (kind === "markdown") {
      const current = markdownEditorLine(path);

      if (
        current !== null &&
        viewer.logicalIndexForSourceLine(current) !== viewer.currentLogicalIndex
      ) {
        moveMarkdownEditor(path, viewer.sourceLineForCurrentSlide(), view);
      }
      return;
    }

    const panel = findNotebook(path);

    if (!panel?.model) {
      return;
    }

    const layout = layoutFor(panel.model);
    const current = notebookLine(panel, layout);

    if (
      current === null ||
      viewer.logicalIndexForSourceLine(current) !== viewer.currentLogicalIndex
    ) {
      moveNotebook(
        path,
        notebookCellForArticleLine(layout, viewer.sourceLineForCurrentSlide()),
        view,
      );
    }
  });
};

/** Markdown mind map ↔ the `.md` editor (notebook mind maps sync natively). */
export const bindMarkdownMindMapPositionSync = (
  widget: MarkdownMindMapDocumentWidget,
): void => {
  if (boundViews.has(widget)) {
    return;
  }

  boundViews.add(widget);

  const notebook = widget.content.notebook;
  const view: PositionView = {
    widget,
    kind: "markdown",
    path: () => widget.context.path,
    reveal: (source, line) => {
      const cellIndex = markdownLineToCellIndex(source, line);

      if (notebook.activeCellIndex !== cellIndex) {
        widget.content.requestOpenCenter(cellIndex);
      }
    },
  };
  registerView(view);

  // Rebuilds after edits also move the active cell; only follow the user.
  const userActed = trackUserIntent(widget);

  notebook.activeCellChanged.connect(() => {
    const path = widget.context.path;
    const editor = findMarkdownEditor(path);
    const cellIndex = notebook.activeCellIndex;

    if (!editor || cellIndex < 0 || !userActed()) {
      return;
    }

    const source = editor.context.model.toString();
    const current = editor.content.editor.getCursorPosition().line;

    if (markdownLineToCellIndex(source, current) !== cellIndex) {
      moveMarkdownEditor(path, markdownCellIndexToLine(source, cellIndex), view);
    }
  });
};

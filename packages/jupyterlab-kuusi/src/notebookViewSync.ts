import type { IDocumentManager } from "@jupyterlab/docmanager";
import type { DocumentRegistry } from "@jupyterlab/docregistry";
import { MarkdownCell } from "@jupyterlab/cells";
import { NotebookPanel, type INotebookTracker } from "@jupyterlab/notebook";
import type { NotebookMindMapDocumentWidget } from "./notebookMindMapWidget";
import type { NotebookMindMapTracker } from "./tracker";

const NOTEBOOK_FACTORY = "Notebook";

const boundNotebookPanels = new WeakSet<NotebookPanel>();
const boundMindMapFocus = new WeakSet<NotebookMindMapDocumentWidget>();

/** Which side owns keyboard focus for a notebook path in a Kuusi split. */
export type SplitFocusOwner = "kuusi" | "notebook";

const focusOwnerByPath = new Map<string, SplitFocusOwner>();

/** Depth of programmatic notebook selection sync (ignore focus claims). */
let quietNotebookSyncDepth = 0;

/** Wall-clock: treat notebook focus as programmatic until this time. */
let quietNotebookSyncUntil = 0;

const beginQuietNotebookSync = (holdMs = 250): void => {
  quietNotebookSyncDepth += 1;
  quietNotebookSyncUntil = Math.max(
    quietNotebookSyncUntil,
    performance.now() + holdMs,
  );
};

const endQuietNotebookSync = (): void => {
  quietNotebookSyncDepth = Math.max(0, quietNotebookSyncDepth - 1);
};

const isQuietNotebookSync = (): boolean =>
  quietNotebookSyncDepth > 0 || performance.now() < quietNotebookSyncUntil;

/** Extend the window where notebook selection sync must not recenter Kuusi. */
export const extendQuietNotebookSync = (holdMs = 250): void => {
  beginQuietNotebookSync(holdMs);
  endQuietNotebookSync();
};

export const getSplitFocusOwner = (path: string): SplitFocusOwner =>
  focusOwnerByPath.get(path) ?? "kuusi";

export const claimKuusiFocus = (path: string): void => {
  focusOwnerByPath.set(path, "kuusi");
};

export const claimNotebookFocus = (path: string): void => {
  if (isQuietNotebookSync()) {
    return;
  }

  focusOwnerByPath.set(path, "notebook");
};

const findNotebookPanel = (
  path: string,
  notebookTracker: INotebookTracker,
): NotebookPanel | null => {
  let panel: NotebookPanel | null = null;

  notebookTracker.forEach((candidate) => {
    if (!panel && candidate.context.path === path) {
      panel = candidate;
    }
  });

  return panel;
};

const findMindMapForPath = (
  path: string,
  mindMapTracker: NotebookMindMapTracker,
): NotebookMindMapDocumentWidget | null => {
  let found: NotebookMindMapDocumentWidget | null = null;

  mindMapTracker.forEach((candidate) => {
    if (!found && candidate.context.path === path) {
      found = candidate;
    }
  });

  return found;
};

const blurFocusInside = (root: HTMLElement): void => {
  const active = document.activeElement;

  if (active instanceof HTMLElement && root.contains(active)) {
    active.blur();
  }
};

/** Restore Kuusi viewport focus when it still owns the split. */
export const restoreKuusiFocusIfOwned = (
  path: string,
  mindMapTracker: NotebookMindMapTracker,
  notebookTracker?: INotebookTracker,
): void => {
  if (getSplitFocusOwner(path) !== "kuusi") {
    return;
  }

  const mindMap = findMindMapForPath(path, mindMapTracker);

  if (!mindMap || mindMap.isDisposed) {
    return;
  }

  const active = document.activeElement;

  // Keep typing in a Kuusi cell editor; only reclaim when focus left Kuusi.
  if (active instanceof Node && mindMap.node.contains(active)) {
    return;
  }

  // Drop accidental focus parked in the classic notebook pane.
  if (notebookTracker) {
    const panel = findNotebookPanel(path, notebookTracker);

    if (panel && !panel.isDisposed) {
      blurFocusInside(panel.node);
    }
  }

  mindMap.activate();
  mindMap.content.focusMapViewport();
};

/** Keep reclaiming Kuusi focus for a short window after programmatic sync. */
const stickKuusiFocus = (
  path: string,
  mindMapTracker: NotebookMindMapTracker,
  notebookTracker?: INotebookTracker,
): void => {
  const run = (): void => {
    restoreKuusiFocusIfOwned(path, mindMapTracker, notebookTracker);
  };

  run();
  requestAnimationFrame(run);
  [16, 50, 100, 200, 400].forEach((delayMs) => {
    window.setTimeout(run, delayMs);
  });
};

/** Ensure the classic Notebook view is open (left side of a Kuusi split). */
export const ensureNotebookPanelOpen = async (
  path: string,
  notebookTracker: INotebookTracker,
  docManager: IDocumentManager,
): Promise<NotebookPanel | null> => {
  let panel = findNotebookPanel(path, notebookTracker);

  if (!panel) {
    const widget = docManager.openOrReveal(path, NOTEBOOK_FACTORY, undefined, {
      activate: false,
    });

    if (widget instanceof NotebookPanel) {
      panel = widget;
    }
  }

  if (!panel) {
    return null;
  }

  await panel.revealed;
  return panel;
};

/** Open options that place a widget to the right of the notebook panel. */
export const splitRightOfNotebookOptions = (
  notebook: NotebookPanel | null,
): DocumentRegistry.IOpenOptions =>
  notebook
    ? { ref: notebook.id, mode: "split-right", activate: true }
    : { activate: true };

/**
 * Mirror Kuusi’s selection into the classic notebook view (scroll + active cell)
 * without activating that panel. Focus stays on Kuusi when it owns the split.
 */
export const revealCellInNotebookEditor = async (
  path: string,
  cellIndex: number,
  notebookTracker: INotebookTracker,
  docManager: IDocumentManager,
  mindMapTracker?: NotebookMindMapTracker,
): Promise<void> => {
  let panel = findNotebookPanel(path, notebookTracker);

  if (!panel) {
    const widget = await docManager.openOrReveal(
      path,
      NOTEBOOK_FACTORY,
      undefined,
      { activate: false },
    );

    if (widget instanceof NotebookPanel) {
      panel = widget;
    }
  }

  if (!panel) {
    return;
  }

  await panel.revealed;

  if (cellIndex < 0 || cellIndex >= panel.content.widgets.length) {
    return;
  }

  // Hold quiet long enough for Notebook’s delayed focus side-effects.
  beginQuietNotebookSync(400);

  try {
    panel.content.deselectAll();
    panel.content.activeCellIndex = cellIndex;
    panel.content.mode = "command";

    const cell = panel.content.widgets[cellIndex];

    if (cell instanceof MarkdownCell && !cell.rendered) {
      cell.rendered = true;
    }

    // Scroll without leaving focus in the notebook pane.
    blurFocusInside(panel.node);
    cell?.node.scrollIntoView({ block: "nearest", behavior: "auto" });
    blurFocusInside(panel.node);
  } finally {
    endQuietNotebookSync();
  }

  if (mindMapTracker) {
    stickKuusiFocus(path, mindMapTracker, notebookTracker);
  }
};

/** Render a markdown cell in the classic notebook view for the same file. */
export const renderMarkdownCellInNotebookEditor = (
  path: string,
  cellIndex: number,
  notebookTracker: INotebookTracker,
): void => {
  const panel = findNotebookPanel(path, notebookTracker);

  if (!panel) {
    return;
  }

  if (cellIndex < 0 || cellIndex >= panel.content.widgets.length) {
    return;
  }

  beginQuietNotebookSync(200);

  try {
    const cell = panel.content.widgets[cellIndex];

    if (cell instanceof MarkdownCell && !cell.rendered) {
      cell.rendered = true;
    }

    if (
      panel.content.activeCellIndex === cellIndex &&
      panel.content.mode === "edit"
    ) {
      panel.content.mode = "command";
    }

    blurFocusInside(panel.node);
  } finally {
    endQuietNotebookSync();
  }
};

/**
 * Notebook owns focus only on real user intent:
 * - pointerdown on the notebook pane, or
 * - Tab/focus arriving from Kuusi (relatedTarget inside Kuusi).
 * Programmatic focus from selection sync is ignored and stolen back.
 */
export const bindNotebookFocusOwnership = (
  panel: NotebookPanel,
  mindMapTracker: NotebookMindMapTracker,
  notebookTracker: INotebookTracker,
): void => {
  const path = () => panel.context.path;

  const onUserPointer = (): void => {
    // Real click/tap on the classic notebook — release the Kuusi lock.
    focusOwnerByPath.set(path(), "notebook");
  };

  const onFocusIn = (event: FocusEvent): void => {
    const ownerPath = path();

    if (isQuietNotebookSync() || getSplitFocusOwner(ownerPath) === "kuusi") {
      const related = event.relatedTarget;
      const mindMap = findMindMapForPath(ownerPath, mindMapTracker);
      const fromKuusi =
        related instanceof Node &&
        Boolean(mindMap && !mindMap.isDisposed && mindMap.node.contains(related));

      // Tab / explicit focus move from Kuusi → allow notebook.
      if (fromKuusi && !isQuietNotebookSync()) {
        claimNotebookFocus(ownerPath);
        return;
      }

      // Selection sync or unknown programmatic focus → keep Kuusi locked.
      restoreKuusiFocusIfOwned(ownerPath, mindMapTracker, notebookTracker);
      return;
    }

    const target = event.target;

    if (!(target instanceof Node) || !panel.node.contains(target)) {
      return;
    }

    claimNotebookFocus(ownerPath);
  };

  panel.node.addEventListener("pointerdown", onUserPointer, true);
  panel.node.addEventListener("focusin", onFocusIn, true);

  panel.disposed.connect(() => {
    panel.node.removeEventListener("pointerdown", onUserPointer, true);
    panel.node.removeEventListener("focusin", onFocusIn, true);
    focusOwnerByPath.delete(path());
  });
};

/** User interacts with Kuusi → Kuusi owns focus and keeps the viewport. */
export const bindMindMapFocusOwnership = (
  widget: NotebookMindMapDocumentWidget,
  notebookTracker?: INotebookTracker,
): void => {
  if (boundMindMapFocus.has(widget)) {
    return;
  }

  boundMindMapFocus.add(widget);

  const path = () => widget.context.path;

  const lockToKuusi = (): void => {
    if (widget.isDisposed) {
      return;
    }

    // Do not yank focus out of an in-progress cell editor.
    if (widget.content.notebook.mode === "edit") {
      claimKuusiFocus(path());
      return;
    }

    claimKuusiFocus(path());
    widget.content.focusMapViewport();

    if (notebookTracker) {
      const panel = findNotebookPanel(path(), notebookTracker);

      if (panel && !panel.isDisposed) {
        blurFocusInside(panel.node);
      }
    }
  };

  widget.node.addEventListener(
    "pointerdown",
    () => {
      claimKuusiFocus(path());
    },
    true,
  );

  widget.node.addEventListener(
    "focusin",
    () => {
      claimKuusiFocus(path());
    },
    true,
  );

  // After click handling (selection sync), force viewport focus again.
  widget.node.addEventListener(
    "pointerup",
    () => {
      if (getSplitFocusOwner(path()) === "kuusi") {
        window.requestAnimationFrame(() => {
          if (!widget.isDisposed) {
            lockToKuusi();
          }
        });
      }
    },
    true,
  );

  widget.disposed.connect(() => {
    focusOwnerByPath.delete(path());
  });
};

export const bindNotebookToMindMapSync = (
  panel: NotebookPanel,
  mindMapTracker: NotebookMindMapTracker,
  notebookTracker: INotebookTracker,
): void => {
  if (boundNotebookPanels.has(panel)) {
    return;
  }

  boundNotebookPanels.add(panel);
  bindNotebookFocusOwnership(panel, mindMapTracker, notebookTracker);

  const syncToMindMaps = () => {
    // Selection mirrored from Kuusi should not recenter / steal Kuusi focus.
    if (isQuietNotebookSync()) {
      return;
    }

    const cellIndex = panel.content.activeCellIndex;

    mindMapTracker.forEach((mindMapDoc) => {
      if (mindMapDoc.context.path === panel.context.path) {
        mindMapDoc.content.syncActiveCellFromNotebook(cellIndex, {
          center: true,
        });
      }
    });
  };

  panel.content.activeCellChanged.connect(syncToMindMaps);
};

export const syncNotebookPanelToMindMaps = (
  panel: NotebookPanel,
  mindMapTracker: NotebookMindMapTracker,
  notebookTracker: INotebookTracker,
): void => {
  bindNotebookToMindMapSync(panel, mindMapTracker, notebookTracker);

  const cellIndex = panel.content.activeCellIndex;

  mindMapTracker.forEach((mindMapDoc) => {
    if (mindMapDoc.context.path === panel.context.path) {
      mindMapDoc.content.syncActiveCellFromNotebook(cellIndex, {
        center: true,
      });
    }
  });
};

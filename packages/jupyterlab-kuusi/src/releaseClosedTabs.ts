import type { JupyterFrontEnd } from "@jupyterlab/application";
import type { ISignal } from "@lumino/signaling";
import type { Widget } from "@lumino/widgets";

type ToolbarHost = Widget & { toolbar?: Widget };

type FastToolbarElement = HTMLElement & {
  focusableElements?: Element[];
  slottedItems?: Element[];
};

const watched = new WeakSet<Widget>();

/**
 * True for Kuusi main-area shells only. Never attach dispose hooks to plain
 * Notebook / Console / Editor tabs — those are Jupyter’s, not ours.
 */
const isKuusiMainShell = (widget: Widget): boolean =>
  Array.from(widget.node.classList).some((name) => name.startsWith("jp-Kuusi"));

/**
 * `<jp-toolbar>` registers itself in global FAST design-token tables and never
 * unregisters. On dispose we detach that custom element and drop its internal
 * arrays so closed Kuusi tabs can GC.
 *
 * Do not empty `widget.node` — that wiped the whole document DOM (and used to
 * run on every main-area tab), which races Jupyter shell chrome.
 */
const releaseFastToolbar = (toolbarNode: FastToolbarElement | null): void => {
  if (!toolbarNode) {
    return;
  }

  if (toolbarNode.focusableElements) {
    toolbarNode.focusableElements = [];
  }
  if (toolbarNode.slottedItems) {
    toolbarNode.slottedItems = [];
  }
  toolbarNode.replaceChildren();
  toolbarNode.remove();
};

const watchClosedTab = (widget: ToolbarHost): void => {
  if (watched.has(widget) || !isKuusiMainShell(widget)) {
    return;
  }

  watched.add(widget);
  const toolbarNode = (widget.toolbar?.node ?? null) as FastToolbarElement | null;

  widget.disposed.connect(() => {
    releaseFastToolbar(toolbarNode);
  });
};

export const releaseClosedTabs = (app: JupyterFrontEnd): void => {
  const scan = (): void => {
    for (const widget of app.shell.widgets("main")) {
      watchClosedTab(widget as ToolbarHost);
    }
  };

  const shell = app.shell as JupyterFrontEnd.IShell & {
    layoutModified?: ISignal<unknown, void>;
  };

  shell.layoutModified?.connect(scan);
  shell.currentChanged?.connect(scan);
  void app.restored.then(scan);
};

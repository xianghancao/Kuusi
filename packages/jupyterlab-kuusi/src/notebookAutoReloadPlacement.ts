/**
 * Keep the auto-reload switch on the Jupyter document plugin toolbar
 * (`.jp-Toolbar` under the tab), not inside the in-canvas Kuusi page pill.
 *
 * Accepts a duck type so this module does not import DocumentWidget (avoids a
 * cycle with notebookMindMapDocument).
 */
export const ensureNotebookAutoReloadOnPluginToolbar = (doc: {
  toolbar?: { node: HTMLElement } | null;
  content: { node: HTMLElement };
}): void => {
  const AUTO_RELOAD_ITEM = "kuusi-notebook-auto-reload";
  const pluginToolbar = doc.toolbar?.node;

  if (!pluginToolbar) {
    return;
  }

  const pageCluster = doc.content.node.querySelector(
    ".jp-KuusiToolbarCluster--page",
  );

  if (!pageCluster) {
    return;
  }

  const misplaced =
    pageCluster.querySelector(`[data-jp-item-name="${AUTO_RELOAD_ITEM}"]`) ??
    pageCluster.querySelector(".jp-KuusiNotebook-autoReload");

  if (!misplaced) {
    return;
  }

  const toolbarItem = misplaced.closest(".jp-Toolbar-item");

  if (
    toolbarItem instanceof HTMLElement &&
    !pluginToolbar.contains(toolbarItem)
  ) {
    pluginToolbar.appendChild(toolbarItem);
  }
};

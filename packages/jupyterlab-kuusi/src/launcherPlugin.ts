import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { IDocumentManager } from "@jupyterlab/docmanager";
import { IDefaultFileBrowser } from "@jupyterlab/filebrowser";
import { ILauncher } from "@jupyterlab/launcher";
import { IDisposable } from "@lumino/disposable";
import {
  OPEN_DEFAULT_OPENERS_SETTINGS_COMMAND,
} from "./defaultOpeners/constants";
import { openKuusiSplitWorkspace } from "./kuusiSplitWorkspace";
import {
  articleIcon,
  bookIcon,
  kuusiBrandIcon,
  slidesIcon,
} from "./kuusiIcon";
import { kuusiLauncherMindMapIcon } from "./launcherIcons";
import { createKuusiMindMapMarkdown } from "./mindMapMarkdown";
import type { KuusiRenderViewId } from "./kuusiRenderViews";
import { isRenderViewEnabled, onEnabledRenderViewsChanged } from "./renderViewOrder";
import { createKuusiMindMapNotebook } from "./mindMapNotebook";

const PLUGIN_ID = "jupyterlab-kuusi:launcher";

const LAUNCHER_CATEGORY = "Kuusi";

/** Kuusi section sits directly under Notebook; see launcher order rules in `style/index.css`. */
const LAUNCHER_CATEGORY_RANK = 0;

/** Supplies the Kuusi section header icon (first tile, visually collapsed). */
export const LAUNCHER_SECTION_COMMAND = "jupyterlab-kuusi:launcher-section";

export const LAUNCHER_MINDMAP_COMMAND = "jupyterlab-kuusi:launcher-mindmap";
export const LAUNCHER_ARTICLE_COMMAND = "jupyterlab-kuusi:launcher-article";
export const LAUNCHER_BOOK_COMMAND = "jupyterlab-kuusi:launcher-book";
export const LAUNCHER_SLIDES_COMMAND = "jupyterlab-kuusi:launcher-slides";

/** Launcher tiles currently shown (section tile is CSS-collapsed for the header icon). */
const VISIBLE_LAUNCHER_COMMANDS = new Set<string>([
  LAUNCHER_SECTION_COMMAND,
  LAUNCHER_MINDMAP_COMMAND,
  LAUNCHER_ARTICLE_COMMAND,
  LAUNCHER_BOOK_COMMAND,
  LAUNCHER_SLIDES_COMMAND,
  OPEN_DEFAULT_OPENERS_SETTINGS_COMMAND,
]);

const launcherDirectory = (fileBrowser: IDefaultFileBrowser | null): string =>
  fileBrowser?.model.path ?? "";

/** Create untitled Markdown in the file-browser cwd, then open editor + render view. */
const createMarkdownAndOpenView = async (
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  fileBrowser: IDefaultFileBrowser | null,
  viewId: "article" | "book" | "slides",
): Promise<void> => {
  const path = await createKuusiMindMapMarkdown(
    docManager,
    launcherDirectory(fileBrowser),
  );
  openKuusiSplitWorkspace(app, docManager, path, viewId);
};

/** Place Kuusi section immediately after the built-in Notebook row (DOM fallback). */
const placeKuusiLauncherAfterNotebook = (): void => {
  const content = document.querySelector(".jp-Launcher-content");
  if (!content) {
    return;
  }

  const kuusiSection = content.querySelector(
    `.jp-Launcher-section:has(.jp-LauncherCard[data-category="${LAUNCHER_CATEGORY}"])`,
  );
  const notebookSection = content.querySelector(
    '.jp-Launcher-section:has(.jp-LauncherCard[data-category="Notebook"])',
  );

  if (!kuusiSection || !notebookSection || kuusiSection === notebookSection) {
    return;
  }

  if (notebookSection.nextElementSibling === kuusiSection) {
    return;
  }

  notebookSection.insertAdjacentElement("afterend", kuusiSection);
};

const registerLauncherCommands = (
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  fileBrowser: IDefaultFileBrowser | null,
): void => {
  if (!app.commands.hasCommand(LAUNCHER_SECTION_COMMAND)) {
    app.commands.addCommand(LAUNCHER_SECTION_COMMAND, {
      label: "Kuusi",
      caption: "Kuusi",
      icon: kuusiBrandIcon,
      execute: () => undefined,
    });
  }

  if (!app.commands.hasCommand(LAUNCHER_MINDMAP_COMMAND)) {
    app.commands.addCommand(LAUNCHER_MINDMAP_COMMAND, {
      label: "Mind Map",
      caption:
        "Create a notebook and open it as a Kuusi mind map beside the editor",
      icon: kuusiLauncherMindMapIcon,
      execute: async () => {
        const path = await createKuusiMindMapNotebook(
          docManager,
          launcherDirectory(fileBrowser),
        );

        openKuusiSplitWorkspace(app, docManager, path, "mindmap");
      },
    });
  }

  if (!app.commands.hasCommand(LAUNCHER_ARTICLE_COMMAND)) {
    app.commands.addCommand(LAUNCHER_ARTICLE_COMMAND, {
      label: "Article",
      caption:
        "Create a Markdown file and open the Article view beside the editor",
      icon: articleIcon,
      execute: () =>
        createMarkdownAndOpenView(app, docManager, fileBrowser, "article"),
    });
  }

  if (!app.commands.hasCommand(LAUNCHER_BOOK_COMMAND)) {
    app.commands.addCommand(LAUNCHER_BOOK_COMMAND, {
      label: "Book",
      caption:
        "Create a Markdown file and open the Book view beside the editor",
      icon: bookIcon,
      execute: () =>
        createMarkdownAndOpenView(app, docManager, fileBrowser, "book"),
    });
  }

  if (!app.commands.hasCommand(LAUNCHER_SLIDES_COMMAND)) {
    app.commands.addCommand(LAUNCHER_SLIDES_COMMAND, {
      label: "Slides",
      caption:
        "Create a Markdown file and open the Slides view beside the editor",
      icon: slidesIcon,
      execute: () =>
        createMarkdownAndOpenView(app, docManager, fileBrowser, "slides"),
    });
  }
};

const launcherPlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: "Kuusi items in the JupyterLab Launcher.",
  autoStart: true,
  requires: [ILauncher, IDocumentManager],
  optional: [IDefaultFileBrowser],
  activate: (
    app: JupyterFrontEnd,
    launcher: ILauncher,
    docManager: IDocumentManager,
    fileBrowser: IDefaultFileBrowser | null,
  ) => {
    registerLauncherCommands(app, docManager, fileBrowser);

    let mounted = false;
    const disposables: IDisposable[] = [];

    const mountLauncherItems = (): void => {
      if (mounted) {
        return;
      }
      mounted = true;

      // Always shown: the section header icon and Settings. The four view tiles
      // follow Settings → Default files → views: Book and Slides are off by
      // default, so they only appear once the user turns them on.
      const fixed = [
        { command: LAUNCHER_SECTION_COMMAND, rank: -100 },
        { command: OPEN_DEFAULT_OPENERS_SETTINGS_COMMAND, rank: 34 },
      ] as const;
      const viewTiles: ReadonlyArray<{
        command: string;
        rank: number;
        view: KuusiRenderViewId;
      }> = [
        { command: LAUNCHER_MINDMAP_COMMAND, rank: 10, view: "mindmap" },
        { command: LAUNCHER_ARTICLE_COMMAND, rank: 20, view: "article" },
        { command: LAUNCHER_BOOK_COMMAND, rank: 21, view: "book" },
        { command: LAUNCHER_SLIDES_COMMAND, rank: 22, view: "slides" },
      ];
      const shown = new Map<string, IDisposable>();

      const addTile = (command: string, rank: number): IDisposable =>
        launcher.add({
          command,
          category: LAUNCHER_CATEGORY,
          categoryRank: LAUNCHER_CATEGORY_RANK,
          rank,
        });

      for (const item of fixed) {
        if (VISIBLE_LAUNCHER_COMMANDS.has(item.command)) {
          disposables.push(addTile(item.command, item.rank));
        }
      }

      const syncViewTiles = (): void => {
        for (const tile of viewTiles) {
          const show =
            VISIBLE_LAUNCHER_COMMANDS.has(tile.command) &&
            isRenderViewEnabled(tile.view);
          const current = shown.get(tile.command);

          if (show && !current) {
            shown.set(tile.command, addTile(tile.command, tile.rank));
          } else if (!show && current) {
            current.dispose();
            shown.delete(tile.command);
          }
        }

        requestAnimationFrame(() => {
          placeKuusiLauncherAfterNotebook();
        });
      };

      syncViewTiles();
      const enabledSubscription = onEnabledRenderViewsChanged(syncViewTiles);
      disposables.push(
        {
          dispose: () => enabledSubscription.disconnect(),
          get isDisposed() {
            return false;
          },
        },
        {
          dispose: () => shown.forEach((tile) => tile.dispose()),
          get isDisposed() {
            return false;
          },
        },
      );

      requestAnimationFrame(() => {
        placeKuusiLauncherAfterNotebook();
      });
    };

    // Register once default-openers (and its settings command) have activated.
    void app.restored.then(mountLauncherItems);

    const syncKuusiLauncherPlacement = (): void => {
      placeKuusiLauncherAfterNotebook();
    };
    app.shell.currentChanged?.connect(syncKuusiLauncherPlacement);
    disposables.push({
      dispose: () => {
        app.shell.currentChanged?.disconnect(syncKuusiLauncherPlacement);
      },
      get isDisposed() {
        return false;
      },
    });

    console.info("jupyterlab-kuusi: Launcher entries activated");
  },
};

export default launcherPlugin;

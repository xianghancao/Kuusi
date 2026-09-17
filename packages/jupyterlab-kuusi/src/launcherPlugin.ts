import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { IDocumentManager } from "@jupyterlab/docmanager";
import { IDefaultFileBrowser } from "@jupyterlab/filebrowser";
import { ILauncher } from "@jupyterlab/launcher";
import { IDisposable } from "@lumino/disposable";
import {
  FACTORY_EDITOR,
  FACTORY_KUUSI_NOTEBOOK,
  FACTORY_MARKDOWN_PREVIEW,
  OPEN_DEFAULT_OPENERS_SETTINGS_COMMAND,
} from "./defaultOpeners/constants";
import { OPEN_IMAGE_HUB_COMMAND } from "./imageView/imageOpenHub";
import { OPEN_LIVE_PDF_HUB_COMMAND } from "./livePdf/livePdfOpenHub";
import { OPEN_VOICE_RECORDER_COMMAND } from "./voiceRecorder/openVoiceRecorder";
import { shouldUseKuusiForMarkdown } from "./defaultOpeners/defaultOpenersState";
import { kuusiBrandIcon } from "./kuusiIcon";
import {
  kuusiLauncherImageIcon,
  kuusiLauncherLivePdfIcon,
  kuusiLauncherMarkdownIcon,
  kuusiLauncherMindMapIcon,
  kuusiLauncherTexIcon,
  kuusiLauncherVoiceIcon,
} from "./launcherIcons";
import { createKuusiMindMapNotebook } from "./mindMapNotebook";
import { OPEN_TEX_WORKSPACE_COMMAND } from "./texCompile/plugin";
import { OPEN_CHANNEL_MONITOR_COMMAND } from "./channelMonitor/openChannelMonitor";
import { LAUNCHER_COMPRESS_COMMAND } from "./compress/plugin";
import { isKuusiFullRelease } from "./releaseTier";
import { channelMonitorIcon } from "./channelMonitor/channelMonitorIcon";

const PLUGIN_ID = "jupyterlab-kuusi:launcher";

const LAUNCHER_CATEGORY = "Kuusi";

/** Kuusi section sits directly under Notebook; see launcher order rules in `style/index.css`. */
const LAUNCHER_CATEGORY_RANK = 0;

/** Supplies the Kuusi section header icon (first tile, visually collapsed). */
export const LAUNCHER_SECTION_COMMAND = "jupyterlab-kuusi:launcher-section";

export const LAUNCHER_MINDMAP_COMMAND = "jupyterlab-kuusi:launcher-mindmap";
export const LAUNCHER_MARKDOWN_COMMAND = "jupyterlab-kuusi:launcher-markdown";
export const LAUNCHER_TEX_COMMAND = "jupyterlab-kuusi:launcher-tex";
export const LAUNCHER_LIVE_PDF_COMMAND = "jupyterlab-kuusi:launcher-live-pdf";
export const LAUNCHER_IMAGE_COMMAND = "jupyterlab-kuusi:launcher-image";
export const LAUNCHER_VOICE_COMMAND = "jupyterlab-kuusi:launcher-voice";
export const LAUNCHER_CHANNEL_MONITOR_COMMAND =
  "jupyterlab-kuusi:launcher-channel-monitor";

const launcherDirectory = (fileBrowser: IDefaultFileBrowser | null): string =>
  fileBrowser?.model.path ?? "";

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
  const mindMapFactory = FACTORY_KUUSI_NOTEBOOK;

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
        "Create a notebook in the current folder and open it as a Kuusi mind map",
      icon: kuusiLauncherMindMapIcon,
      execute: async () => {
        const path = await createKuusiMindMapNotebook(
          docManager,
          launcherDirectory(fileBrowser),
        );

        return docManager.openOrReveal(path, mindMapFactory);
      },
    });
  }

  if (!app.commands.hasCommand(LAUNCHER_MARKDOWN_COMMAND)) {
    app.commands.addCommand(LAUNCHER_MARKDOWN_COMMAND, {
      label: "Markdown",
      caption: "Create a Markdown file in the current folder",
      icon: kuusiLauncherMarkdownIcon,
      execute: async () => {
        const model = await docManager.newUntitled({
          path: launcherDirectory(fileBrowser),
          type: "file",
          ext: ".md",
        });

        const factory = shouldUseKuusiForMarkdown()
          ? FACTORY_MARKDOWN_PREVIEW
          : FACTORY_EDITOR;

        return docManager.openOrReveal(model.path, factory);
      },
    });
  }

  if (!app.commands.hasCommand(LAUNCHER_TEX_COMMAND)) {
    app.commands.addCommand(LAUNCHER_TEX_COMMAND, {
      label: "LaTeX",
      caption:
        "Create a LaTeX file and open the editor (compile to preview PDF)",
      icon: kuusiLauncherTexIcon,
      execute: async () => {
        const model = await docManager.newUntitled({
          path: launcherDirectory(fileBrowser),
          type: "file",
          ext: ".tex",
        });

        return app.commands.execute(OPEN_TEX_WORKSPACE_COMMAND, {
          path: model.path,
        });
      },
    });
  }

  if (!app.commands.hasCommand(LAUNCHER_LIVE_PDF_COMMAND)) {
    app.commands.addCommand(LAUNCHER_LIVE_PDF_COMMAND, {
      label: "Live PDF",
      caption: "Drop a PDF or choose one from the file browser to open",
      icon: kuusiLauncherLivePdfIcon,
      execute: () => app.commands.execute(OPEN_LIVE_PDF_HUB_COMMAND),
    });
  }

  if (!app.commands.hasCommand(LAUNCHER_IMAGE_COMMAND)) {
    app.commands.addCommand(LAUNCHER_IMAGE_COMMAND, {
      label: "Image",
      caption: "Drop an image or choose one from the file browser to open",
      icon: kuusiLauncherImageIcon,
      execute: () => app.commands.execute(OPEN_IMAGE_HUB_COMMAND),
    });
  }

  if (!app.commands.hasCommand(LAUNCHER_VOICE_COMMAND)) {
    app.commands.addCommand(LAUNCHER_VOICE_COMMAND, {
      label: "Voice note",
      caption: "Record audio and save to the current file browser folder",
      icon: kuusiLauncherVoiceIcon,
      execute: () => app.commands.execute(OPEN_VOICE_RECORDER_COMMAND),
    });
  }

  if (!app.commands.hasCommand(LAUNCHER_CHANNEL_MONITOR_COMMAND)) {
    app.commands.addCommand(LAUNCHER_CHANNEL_MONITOR_COMMAND, {
      label: "Transfer speed",
      caption:
        "Monitor Thunderbolt, Wi-Fi, USB, and disk throughput; copy to a peer Mac",
      icon: channelMonitorIcon,
      execute: () => app.commands.execute(OPEN_CHANNEL_MONITOR_COMMAND),
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

      const items = isKuusiFullRelease()
        ? ([
            { command: LAUNCHER_SECTION_COMMAND, rank: -100 },
            { command: LAUNCHER_MINDMAP_COMMAND, rank: 0 },
            { command: LAUNCHER_MARKDOWN_COMMAND, rank: 1 },
            { command: LAUNCHER_TEX_COMMAND, rank: 2 },
            { command: LAUNCHER_LIVE_PDF_COMMAND, rank: 3 },
            { command: LAUNCHER_IMAGE_COMMAND, rank: 4 },
            { command: LAUNCHER_VOICE_COMMAND, rank: 5 },
            { command: LAUNCHER_CHANNEL_MONITOR_COMMAND, rank: 6 },
            { command: LAUNCHER_COMPRESS_COMMAND, rank: 7 },
            { command: OPEN_DEFAULT_OPENERS_SETTINGS_COMMAND, rank: 8 },
          ] as const)
        : ([
            { command: LAUNCHER_SECTION_COMMAND, rank: -100 },
            { command: LAUNCHER_MINDMAP_COMMAND, rank: 0 },
            { command: OPEN_DEFAULT_OPENERS_SETTINGS_COMMAND, rank: 1 },
          ] as const);

      for (const item of items) {
        disposables.push(
          launcher.add({
            command: item.command,
            category: LAUNCHER_CATEGORY,
            categoryRank: LAUNCHER_CATEGORY_RANK,
            rank: item.rank,
          }),
        );
      }

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

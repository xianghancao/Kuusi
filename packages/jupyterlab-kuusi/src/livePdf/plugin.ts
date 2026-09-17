import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { Notification } from "@jupyterlab/apputils";
import { PathExt } from "@jupyterlab/coreutils";
import { IDocumentManager } from "@jupyterlab/docmanager";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import { IDefaultFileBrowser } from "@jupyterlab/filebrowser";
import type { FileEditor } from "@jupyterlab/fileeditor";
import type { Contents } from "@jupyterlab/services";
import { pdfIcon } from "@jupyterlab/ui-components";
import { ISettingRegistry } from "@jupyterlab/settingregistry";
import { syncTexEdit } from "../texCompile/syncTex";
import { isLivePdfBackground } from "./livePdfBackground";
import { isLivePdfNavMode } from "./livePdfNavMode";
import { LivePdfWidgetFactory } from "./livePdfFactory";
import {
  OPEN_LIVE_PDF_HUB_COMMAND,
  openLivePdfOpenHub,
} from "./livePdfOpenHub";
import type { LivePdfViewer } from "./livePdfViewer";

const PLUGIN_ID = "jupyterlab-kuusi:live-pdf";

export const OPEN_LIVE_PDF_COMMAND = "jupyterlab-kuusi:open-live-pdf";

type OpenLivePdfArgs = {
  path?: string;
};

const isPdfFile = (item: Contents.IModel): boolean => {
  if (item.type === "directory") {
    return false;
  }

  if (item.path.toLowerCase().endsWith(".pdf")) {
    return true;
  }

  return item.mimetype === "application/pdf";
};

const resolvePdfPaths = (
  args: OpenLivePdfArgs,
  defaultBrowser: IDefaultFileBrowser,
): string[] => {
  if (args.path) {
    return [args.path];
  }

  return [...defaultBrowser.selectedItems()]
    .filter(isPdfFile)
    .map((item) => item.path);
};

const livePdfPlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description:
    "PDF.js viewer with manual refresh, auto-reload, and file browser open action.",
  autoStart: true,
  requires: [IDocumentManager, IDefaultFileBrowser, ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    docManager: IDocumentManager,
    defaultBrowser: IDefaultFileBrowser,
    settingRegistry: ISettingRegistry,
  ) => {
    const revealInFileBrowser = async (path: string): Promise<void> => {
      const directory = PathExt.dirname(path);
      const name = PathExt.basename(path);

      await defaultBrowser.model.cd(directory);
      await defaultBrowser.selectItemByName(name);
      app.shell.activateById(defaultBrowser.id);
    };

    const jumpToSource = async (
      pdfPath: string,
      viewer: LivePdfViewer,
    ): Promise<void> => {
      const anchor = viewer.getSyncAnchor();

      if (!anchor) {
        return;
      }

      const result = await syncTexEdit(
        pdfPath,
        anchor.page,
        anchor.h,
        anchor.v,
      );

      if (!result.ok || !result.path || typeof result.line !== "number") {
        Notification.error(
          result.error ?? "SyncTeX lookup failed for this position.",
          { autoClose: 4000 },
        );
        return;
      }

      const widget = docManager.openOrReveal(result.path, "Editor") as
        | IDocumentWidget<FileEditor>
        | undefined;

      if (!widget) {
        return;
      }

      const line = Math.max(0, result.line - 1);
      const column = Math.max(0, (result.column ?? 1) - 1);

      widget.content.editor.setCursorPosition({ line, column });
      widget.content.editor.focus();
    };

    const factory = new LivePdfWidgetFactory(
      app.serviceManager.contents,
      revealInFileBrowser,
      jumpToSource,
    );

    factory.setBackgroundPersistHandler((value) => {
      void settingRegistry.set(PLUGIN_ID, "background", value);
    });
    factory.setNavModePersistHandler((value) => {
      void settingRegistry.set(PLUGIN_ID, "navMode", value);
    });

    void settingRegistry.load(PLUGIN_ID).then((settings) => {
      const background = settings.get("background").composite;
      const navMode = settings.get("navMode").composite;

      factory.setBackground(isLivePdfBackground(background) ? background : "default");
      factory.setNavMode(isLivePdfNavMode(navMode) ? navMode : "thumbnails");

      settings.changed.connect(() => {
        const nextBackground = settings.get("background").composite;
        const nextNavMode = settings.get("navMode").composite;

        factory.setBackground(
          isLivePdfBackground(nextBackground) ? nextBackground : "default",
        );
        factory.setNavMode(
          isLivePdfNavMode(nextNavMode) ? nextNavMode : "thumbnails",
        );
      });
    });

    app.docRegistry.addWidgetFactory(factory);

    const canOpenLivePdf = (args: OpenLivePdfArgs = {}) =>
      resolvePdfPaths(args, defaultBrowser).length > 0;

    app.commands.addCommand(OPEN_LIVE_PDF_COMMAND, {
      label: "Open with Kuusi Live PDF",
      caption: "Open the selected PDF in the Kuusi Live PDF viewer",
      icon: pdfIcon,
      isVisible: (args: OpenLivePdfArgs = {}) => canOpenLivePdf(args),
      isEnabled: (args: OpenLivePdfArgs = {}) => canOpenLivePdf(args),
      execute: (args: OpenLivePdfArgs = {}) => {
        for (const path of resolvePdfPaths(args, defaultBrowser)) {
          docManager.openOrReveal(path, LivePdfWidgetFactory.NAME);
        }
      },
    });

    app.contextMenu.addItem({
      command: OPEN_LIVE_PDF_COMMAND,
      selector: '.jp-DirListing-item[data-file-type="PDF"]',
      rank: 15,
    });

    app.commands.addCommand(OPEN_LIVE_PDF_HUB_COMMAND, {
      label: "Open Live PDF",
      caption: "Choose or drop a PDF to open in Kuusi Live PDF",
      execute: () => {
        const directory = defaultBrowser.model.path ?? "";
        openLivePdfOpenHub(app, docManager, defaultBrowser, directory);
      },
    });

    console.info("jupyterlab-kuusi: live PDF viewer activated");
  },
};

export default livePdfPlugin;

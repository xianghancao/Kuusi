import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { ICommandPalette } from "@jupyterlab/apputils";
import { IDocumentManager } from "@jupyterlab/docmanager";
import { IDefaultFileBrowser } from "@jupyterlab/filebrowser";
import type { Contents } from "@jupyterlab/services";
import { compressIcon } from "./compressIcon";
import { compressSelection, extractZipSelection } from "./compressActions";

const PLUGIN_ID = "jupyterlab-kuusi:compress";

export const COMPRESS_COMMAND = "jupyterlab-kuusi:compress";
export const EXTRACT_ZIP_COMMAND = "jupyterlab-kuusi:extract-zip";
export const LAUNCHER_COMPRESS_COMMAND = "jupyterlab-kuusi:launcher-compress";

const isZipItem = (item: Contents.IModel): boolean =>
  item.type !== "directory" && item.path.toLowerCase().endsWith(".zip");

const compressPlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: "Compress and extract ZIP archives in the workspace.",
  autoStart: true,
  requires: [IDocumentManager, IDefaultFileBrowser],
  optional: [ICommandPalette],
  activate: (
    app: JupyterFrontEnd,
    docManager: IDocumentManager,
    fileBrowser: IDefaultFileBrowser,
    palette: ICommandPalette | null,
  ) => {
    if (!app.commands.hasCommand(COMPRESS_COMMAND)) {
      app.commands.addCommand(COMPRESS_COMMAND, {
        label: "Compress to ZIP",
        caption: "Create a .zip archive from the selected files or folders",
        icon: compressIcon,
        isEnabled: () => [...fileBrowser.selectedItems()].length > 0,
        execute: () => compressSelection(fileBrowser, docManager),
      });
    }

    if (!app.commands.hasCommand(EXTRACT_ZIP_COMMAND)) {
      app.commands.addCommand(EXTRACT_ZIP_COMMAND, {
        label: "Extract ZIP",
        caption: "Extract a .zip archive into a new folder",
        icon: compressIcon,
        isEnabled: () => {
          const selected = [...fileBrowser.selectedItems()];
          return selected.length === 1 && isZipItem(selected[0]);
        },
        execute: () => extractZipSelection(fileBrowser, docManager),
      });
    }

    if (!app.commands.hasCommand(LAUNCHER_COMPRESS_COMMAND)) {
      app.commands.addCommand(LAUNCHER_COMPRESS_COMMAND, {
        label: "Compress",
        caption: "Compress selected files or folders to .zip",
        icon: compressIcon,
        execute: () => compressSelection(fileBrowser, docManager),
      });
    }

    app.contextMenu.addItem({
      command: COMPRESS_COMMAND,
      selector: ".jp-DirListing-item",
      rank: 18,
    });
    app.contextMenu.addItem({
      command: EXTRACT_ZIP_COMMAND,
      selector: '.jp-DirListing-item[data-file-type="archive"]',
      rank: 19,
    });
    app.contextMenu.addItem({
      command: EXTRACT_ZIP_COMMAND,
      selector: '.jp-DirListing-item[data-file-type="zip"]',
      rank: 19,
    });

    palette?.addItem({ command: COMPRESS_COMMAND, category: "Kuusi" });
    palette?.addItem({ command: EXTRACT_ZIP_COMMAND, category: "Kuusi" });

    console.info("jupyterlab-kuusi: compress activated");
  },
};

export default compressPlugin;

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { PathExt } from "@jupyterlab/coreutils";
import { IDocumentManager } from "@jupyterlab/docmanager";
import { IDefaultFileBrowser } from "@jupyterlab/filebrowser";
import type { Contents } from "@jupyterlab/services";
import { imageIcon } from "@jupyterlab/ui-components";
import { ImageWidgetFactory } from "./imageFactory";
import { isKuusiImagePath } from "./imageFormats";
import { OPEN_IMAGE_HUB_COMMAND, openImageOpenHub } from "./imageOpenHub";

const PLUGIN_ID = "jupyterlab-kuusi:image";

export const OPEN_KUUSI_IMAGE_COMMAND = "jupyterlab-kuusi:open-kuusi-image";

type OpenImageArgs = {
  path?: string;
};

const isImageContents = (item: Contents.IModel): boolean => {
  if (item.type === "directory") {
    return false;
  }

  if (isKuusiImagePath(item.path)) {
    return true;
  }

  return item.mimetype.startsWith("image/");
};

const resolveImagePaths = (
  args: OpenImageArgs,
  defaultBrowser: IDefaultFileBrowser,
): string[] => {
  if (args.path) {
    return [args.path];
  }

  return [...defaultBrowser.selectedItems()]
    .filter(isImageContents)
    .map((item) => item.path);
};

const imagePlugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: "Kuusi image viewer with browser decode and TIFF support.",
  autoStart: true,
  requires: [IDocumentManager, IDefaultFileBrowser],
  activate: (
    app: JupyterFrontEnd,
    docManager: IDocumentManager,
    defaultBrowser: IDefaultFileBrowser,
  ) => {
    const revealInFileBrowser = async (path: string): Promise<void> => {
      const directory = PathExt.dirname(path);
      const name = PathExt.basename(path);

      await defaultBrowser.model.cd(directory);
      await defaultBrowser.selectItemByName(name);
      app.shell.activateById(defaultBrowser.id);
    };

    const factory = new ImageWidgetFactory(
      app.serviceManager.contents,
      revealInFileBrowser,
    );

    app.docRegistry.addWidgetFactory(factory);

    const canOpen = (args: OpenImageArgs = {}) =>
      resolveImagePaths(args, defaultBrowser).length > 0;

    app.commands.addCommand(OPEN_KUUSI_IMAGE_COMMAND, {
      label: "Open with Kuusi Image",
      caption: "Open the selected image in the Kuusi Image viewer",
      icon: imageIcon,
      isVisible: (args: OpenImageArgs = {}) => canOpen(args),
      isEnabled: (args: OpenImageArgs = {}) => canOpen(args),
      execute: (args: OpenImageArgs = {}) => {
        for (const path of resolveImagePaths(args, defaultBrowser)) {
          docManager.openOrReveal(path, ImageWidgetFactory.NAME);
        }
      },
    });

    app.contextMenu.addItem({
      command: OPEN_KUUSI_IMAGE_COMMAND,
      selector: '.jp-DirListing-item[data-file-type="png"]',
      rank: 16,
    });
    app.contextMenu.addItem({
      command: OPEN_KUUSI_IMAGE_COMMAND,
      selector: '.jp-DirListing-item[data-file-type="jpeg"]',
      rank: 16,
    });
    app.contextMenu.addItem({
      command: OPEN_KUUSI_IMAGE_COMMAND,
      selector: '.jp-DirListing-item[data-file-type="gif"]',
      rank: 16,
    });
    app.contextMenu.addItem({
      command: OPEN_KUUSI_IMAGE_COMMAND,
      selector: '.jp-DirListing-item[data-file-type="webp"]',
      rank: 16,
    });
    app.contextMenu.addItem({
      command: OPEN_KUUSI_IMAGE_COMMAND,
      selector: '.jp-DirListing-item[data-file-type="tiff"]',
      rank: 16,
    });
    app.contextMenu.addItem({
      command: OPEN_KUUSI_IMAGE_COMMAND,
      selector: '.jp-DirListing-item[data-file-type="svg"]',
      rank: 16,
    });

    app.commands.addCommand(OPEN_IMAGE_HUB_COMMAND, {
      label: "Open Image",
      caption: "Choose or drop an image to open in Kuusi Image",
      execute: () => {
        const directory = defaultBrowser.model.path ?? "";
        openImageOpenHub(app, docManager, defaultBrowser, directory);
      },
    });

    console.info("jupyterlab-kuusi: image viewer activated");
  },
};

export default imagePlugin;

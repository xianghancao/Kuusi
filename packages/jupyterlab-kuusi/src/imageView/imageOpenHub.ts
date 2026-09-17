import type { JupyterFrontEnd } from "@jupyterlab/application";
import {
  MainAreaWidget,
  Notification,
  showErrorMessage,
} from "@jupyterlab/apputils";
import type { IDocumentManager } from "@jupyterlab/docmanager";
import {
  FileDialog,
  type IDefaultFileBrowser,
} from "@jupyterlab/filebrowser";
import type { Contents } from "@jupyterlab/services";
import { UUID } from "@lumino/coreutils";
import { Widget } from "@lumino/widgets";
import { FACTORY_KUUSI_IMAGE } from "../defaultOpeners/constants";
import { kuusiImageIcon } from "../kuusiIcon";
import { applyKuusiTabIcon } from "../kuusiTabIcon";
import { isKuusiImagePath } from "./imageFormats";

export const OPEN_IMAGE_HUB_COMMAND = "jupyterlab-kuusi:open-image-hub";

const IMAGE_ACCEPT =
  ".png,.gif,.jpg,.jpeg,.bmp,.tif,.tiff,.webp,.svg,.ico,image/*";

const isImageFile = (file: File): boolean =>
  file.type.startsWith("image/") || isKuusiImagePath(file.name);

const imageDialogFilter = (item: Contents.IModel) => {
  if (item.type === "directory") {
    return null;
  }

  return isKuusiImagePath(item.path) ? { score: 10, label: "Image" } : null;
};

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== "string") {
        reject(new Error("Could not read the image file."));
        return;
      }

      const comma = result.indexOf(",");

      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Could not read the image file."));
    };

    reader.readAsDataURL(file);
  });

class ImageOpenHubPanel extends Widget {
  private _dropZone: HTMLDivElement;
  private _busy = false;

  constructor(
    private _docManager: IDocumentManager,
    private _fileBrowser: IDefaultFileBrowser | null,
    private _uploadDirectory: string,
    private _onOpenImage: () => void,
  ) {
    super();
    this.addClass("jp-KuusiImageOpenHub");

    const layout = document.createElement("div");
    layout.className = "jp-KuusiImageOpenHub-layout";

    const title = document.createElement("h2");
    title.className = "jp-KuusiImageOpenHub-title";
    title.textContent = "Open an image in Kuusi Image";

    const hint = document.createElement("p");
    hint.className = "jp-KuusiImageOpenHub-hint";
    hint.textContent =
      "Drop an image here, or choose one from the Jupyter file browser.";

    this._dropZone = document.createElement("div");
    this._dropZone.className = "jp-KuusiImageOpenHub-dropZone";
    this._dropZone.tabIndex = 0;
    this._dropZone.setAttribute("role", "region");
    this._dropZone.setAttribute("aria-label", "Drop image files to open");

    const dropLabel = document.createElement("div");
    dropLabel.className = "jp-KuusiImageOpenHub-dropLabel";
    dropLabel.textContent = "Drop image here";

    const dropSub = document.createElement("div");
    dropSub.className = "jp-KuusiImageOpenHub-dropSub";
    dropSub.textContent =
      "Files are uploaded to your current folder, then opened.";

    this._dropZone.append(dropLabel, dropSub);

    const actions = document.createElement("div");
    actions.className = "jp-KuusiImageOpenHub-actions";

    const browseButton = document.createElement("button");
    browseButton.type = "button";
    browseButton.className = "jp-KuusiImageOpenHub-browse jp-mod-styled";
    browseButton.textContent = "Browse file browser…";
    browseButton.addEventListener("click", () => {
      void this._browseServer();
    });

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = IMAGE_ACCEPT;
    fileInput.hidden = true;
    fileInput.multiple = true;
    fileInput.addEventListener("change", () => {
      const files = Array.from(fileInput.files ?? []);

      fileInput.value = "";

      if (files.length > 0) {
        void this._openLocalFiles(files);
      }
    });

    const uploadButton = document.createElement("button");
    uploadButton.type = "button";
    uploadButton.className = "jp-KuusiImageOpenHub-upload jp-mod-styled";
    uploadButton.textContent = "Choose from computer…";
    uploadButton.addEventListener("click", () => {
      fileInput.click();
    });

    actions.append(browseButton, uploadButton);
    layout.append(title, hint, this._dropZone, actions, fileInput);
    this.node.appendChild(layout);

    this._bindDropHandlers();
  }

  private _bindDropHandlers(): void {
    const zone = this._dropZone;

    zone.addEventListener("dragenter", (event) => {
      event.preventDefault();
      zone.classList.add("is-dragover");
    });

    zone.addEventListener("dragover", (event) => {
      event.preventDefault();

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }

      zone.classList.add("is-dragover");
    });

    zone.addEventListener("dragleave", (event) => {
      if (event.currentTarget === event.target) {
        zone.classList.remove("is-dragover");
      }
    });

    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("is-dragover");

      const files = Array.from(event.dataTransfer?.files ?? []);

      if (files.length > 0) {
        void this._openLocalFiles(files);
      }
    });
  }

  private async _browseServer(): Promise<void> {
    if (this._busy) {
      return;
    }

    this._busy = true;

    try {
      const result = await FileDialog.getOpenFiles({
        manager: this._docManager,
        defaultPath: this._uploadDirectory,
        label: "Select an image file",
        filter: imageDialogFilter,
      });

      if (result.button.accept !== true) {
        return;
      }

      const models = result.value ?? [];
      const image = models.find((item) => isKuusiImagePath(item.path));

      if (!image) {
        Notification.warning("Choose a supported image file.", {
          autoClose: 3500,
        });
        return;
      }

      await this._openServerPath(image.path);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not open the image.";

      void showErrorMessage("Kuusi Image", message);
    } finally {
      this._busy = false;
    }
  }

  private async _openLocalFiles(files: File[]): Promise<void> {
    if (this._busy) {
      return;
    }

    const images = files.filter(isImageFile);

    if (images.length === 0) {
      Notification.warning("Only image files can be opened here.", {
        autoClose: 3500,
      });
      return;
    }

    this._busy = true;

    try {
      for (const file of images) {
        const path = await this._uploadLocalImage(file);
        await this._openServerPath(path);
        break;
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not upload the image.";

      void showErrorMessage("Kuusi Image", message);
    } finally {
      this._busy = false;
    }
  }

  private async _uploadLocalImage(file: File): Promise<string> {
    if (this._fileBrowser) {
      const model = await this._fileBrowser.model.upload(file);
      return model.path;
    }

    const directory = this._uploadDirectory;
    const name = file.name;
    const path = directory ? `${directory}/${name}` : name;
    const content = await readFileAsBase64(file);

    await this._docManager.services.contents.save(path, {
      type: "file",
      format: "base64",
      content,
    });

    return path;
  }

  private async _openServerPath(path: string): Promise<void> {
    await this._docManager.openOrReveal(path, FACTORY_KUUSI_IMAGE);
    this._onOpenImage();
  }
}

export const openImageOpenHub = (
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  fileBrowser: IDefaultFileBrowser | null,
  uploadDirectory: string,
): MainAreaWidget<ImageOpenHubPanel> => {
  const widget = new MainAreaWidget<ImageOpenHubPanel>({
    content: new ImageOpenHubPanel(
      docManager,
      fileBrowser,
      uploadDirectory,
      () => {
        widget.close();
      },
    ),
  });

  widget.id = `kuusi-image-open-${UUID.uuid4()}`;
  widget.title.label = "Image";
  widget.title.closable = true;
  applyKuusiTabIcon(widget.title, kuusiImageIcon, "Kuusi Image");

  app.shell.add(widget, "main", { activate: true });

  return widget;
};

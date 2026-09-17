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
import { FACTORY_KUUSI_PDF } from "../defaultOpeners/constants";
import { livePdfIcon } from "../kuusiIcon";
import { applyKuusiTabIcon } from "../kuusiTabIcon";

export const OPEN_LIVE_PDF_HUB_COMMAND = "jupyterlab-kuusi:open-live-pdf-hub";

const isPdfPath = (path: string): boolean =>
  path.toLowerCase().endsWith(".pdf");

const isPdfFile = (file: File): boolean =>
  file.name.toLowerCase().endsWith(".pdf") ||
  file.type === "application/pdf";

const pdfDialogFilter = (item: Contents.IModel) => {
  if (item.type === "directory") {
    return null;
  }

  return isPdfPath(item.path) ? { score: 10, label: "PDF" } : null;
};

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== "string") {
        reject(new Error("Could not read the PDF file."));
        return;
      }

      const comma = result.indexOf(",");

      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Could not read the PDF file."));
    };

    reader.readAsDataURL(file);
  });

class LivePdfOpenHubPanel extends Widget {
  private _dropZone: HTMLDivElement;
  private _busy = false;

  constructor(
    private _docManager: IDocumentManager,
    private _fileBrowser: IDefaultFileBrowser | null,
    private _uploadDirectory: string,
    private _onOpenPdf: () => void,
  ) {
    super();
    this.addClass("jp-KuusiLivePdfOpenHub");

    const layout = document.createElement("div");
    layout.className = "jp-KuusiLivePdfOpenHub-layout";

    const title = document.createElement("h2");
    title.className = "jp-KuusiLivePdfOpenHub-title";
    title.textContent = "Open a PDF in Kuusi Live PDF";

    const hint = document.createElement("p");
    hint.className = "jp-KuusiLivePdfOpenHub-hint";
    hint.textContent =
      "Drop a PDF file here, or choose one from the Jupyter file browser.";

    this._dropZone = document.createElement("div");
    this._dropZone.className = "jp-KuusiLivePdfOpenHub-dropZone";
    this._dropZone.tabIndex = 0;
    this._dropZone.setAttribute("role", "region");
    this._dropZone.setAttribute("aria-label", "Drop PDF files to open");

    const dropLabel = document.createElement("div");
    dropLabel.className = "jp-KuusiLivePdfOpenHub-dropLabel";
    dropLabel.textContent = "Drop PDF here";

    const dropSub = document.createElement("div");
    dropSub.className = "jp-KuusiLivePdfOpenHub-dropSub";
    dropSub.textContent = "Files are uploaded to your current folder, then opened.";

    this._dropZone.append(dropLabel, dropSub);

    const actions = document.createElement("div");
    actions.className = "jp-KuusiLivePdfOpenHub-actions";

    const browseButton = document.createElement("button");
    browseButton.type = "button";
    browseButton.className = "jp-KuusiLivePdfOpenHub-browse jp-mod-styled";
    browseButton.textContent = "Browse file browser…";
    browseButton.addEventListener("click", () => {
      void this._browseServer();
    });

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf,application/pdf";
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
    uploadButton.className = "jp-KuusiLivePdfOpenHub-upload jp-mod-styled";
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
        label: "Select a PDF file",
        filter: pdfDialogFilter,
      });

      if (result.button.accept !== true) {
        return;
      }

      const models = result.value ?? [];
      const pdf = models.find((item) => isPdfPath(item.path));

      if (!pdf) {
        Notification.warning("Choose a PDF file (.pdf).", { autoClose: 3500 });
        return;
      }

      await this._openServerPath(pdf.path);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not open the PDF.";

      void showErrorMessage("Live PDF", message);
    } finally {
      this._busy = false;
    }
  }

  private async _openLocalFiles(files: File[]): Promise<void> {
    if (this._busy) {
      return;
    }

    const pdfs = files.filter(isPdfFile);

    if (pdfs.length === 0) {
      Notification.warning("Only PDF files can be opened here.", {
        autoClose: 3500,
      });
      return;
    }

    this._busy = true;

    try {
      for (const file of pdfs) {
        const path = await this._uploadLocalPdf(file);
        await this._openServerPath(path);
        break;
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not upload the PDF.";

      void showErrorMessage("Live PDF", message);
    } finally {
      this._busy = false;
    }
  }

  private async _uploadLocalPdf(file: File): Promise<string> {
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
    await this._docManager.openOrReveal(path, FACTORY_KUUSI_PDF);
    this._onOpenPdf();
  }
}

export const openLivePdfOpenHub = (
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  fileBrowser: IDefaultFileBrowser | null,
  uploadDirectory: string,
): MainAreaWidget<LivePdfOpenHubPanel> => {
  const widget = new MainAreaWidget<LivePdfOpenHubPanel>({
    content: new LivePdfOpenHubPanel(
      docManager,
      fileBrowser,
      uploadDirectory,
      () => {
        widget.close();
      },
    ),
  });

  widget.id = `kuusi-live-pdf-open-${UUID.uuid4()}`;
  widget.title.label = "Live PDF";
  widget.title.closable = true;
  applyKuusiTabIcon(widget.title, livePdfIcon, "Kuusi Live PDF");

  app.shell.add(widget, "main", { activate: true });

  return widget;
};

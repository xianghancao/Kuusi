import type { JupyterFrontEnd } from "@jupyterlab/application";
import type { IDocumentManager } from "@jupyterlab/docmanager";
import type { DocumentRegistry } from "@jupyterlab/docregistry";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import type { FileEditor } from "@jupyterlab/fileeditor";
import {
  LivePdfDocumentWidget,
  LivePdfWidgetFactory,
} from "../livePdf/livePdfFactory";
import { linkPdfToTexSource, takePdfSourceLink } from "../livePdf/livePdfSourceLink";
import { pdfPathForTex } from "./compileTex";

export type OpenPdfPreviewOptions = {
  /** Focus the PDF tab after opening (default false). */
  activate?: boolean;
};

/** Open Kuusi Live PDF beside the .tex editor (split-right). */
export const openPdfPreviewBesideTexEditor = (
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  texPath: string,
  editorWidget: IDocumentWidget<FileEditor>,
  options: OpenPdfPreviewOptions = {},
): void => {
  const activate = options.activate ?? false;
  const pdfPath = pdfPathForTex(texPath);
  linkPdfToTexSource(pdfPath, texPath);

  const openOptions: DocumentRegistry.IOpenOptions = {
    mode: "split-right",
    ref: editorWidget.id,
    activate,
  };

  const existingPdf = docManager.findWidget(
    pdfPath,
    LivePdfWidgetFactory.NAME,
  );
  const wasAttached = Boolean(existingPdf?.isAttached);

  const pdfWidget = docManager.openOrReveal(
    pdfPath,
    LivePdfWidgetFactory.NAME,
    undefined,
    openOptions,
  );

  if (
    pdfWidget &&
    editorWidget &&
    !editorWidget.isDisposed &&
    wasAttached
  ) {
    app.shell.add(pdfWidget, "main", openOptions);
  }

  if (pdfWidget instanceof LivePdfDocumentWidget) {
    pdfWidget.ensureJumpToSource();
    takePdfSourceLink(pdfPath);
  }
};

/** Open the .tex editor only (PDF opens after a successful compile). */
export const openTexEditorWithPdfPreview = (
  _app: JupyterFrontEnd,
  docManager: IDocumentManager,
  texPath: string,
): IDocumentWidget<FileEditor> | null => {
  const editorWidget = docManager.openOrReveal(
    texPath,
    "Editor",
    undefined,
    { activate: true },
  ) as IDocumentWidget<FileEditor> | undefined;

  return editorWidget ?? null;
};

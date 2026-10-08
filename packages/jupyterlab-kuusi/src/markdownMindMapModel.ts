import type { DocumentRegistry } from "@jupyterlab/docregistry";
import type { PartialJSONValue } from "@lumino/coreutils";
import { NotebookModel, type INotebookModel } from "@jupyterlab/notebook";
import {
  cellsToMarkdownDocument,
  markdownDocumentToCells,
  type NotebookCell,
} from "kuusi-kernel";

const joinSource = (source: string | string[]): string =>
  Array.isArray(source) ? source.join("") : source;

export const createMarkdownMindMapNotebookModel = (): INotebookModel =>
  new NotebookModel();

type TextModel = DocumentRegistry.ICodeModel;

export const readTextModelSource = (model: TextModel): string =>
  model.sharedModel.getSource();

export const writeTextModelSource = (model: TextModel, markdown: string): void => {
  model.sharedModel.setSource(markdown);
};

/** Load `.md` source into an in-memory notebook used by the mind map canvas. */
export const loadMarkdownIntoNotebookModel = (
  markdown: string,
  notebookModel: INotebookModel,
): void => {
  const cells = markdownDocumentToCells(markdown).map((cell) => ({
    cell_type: "markdown" as const,
    metadata: cell.metadata ?? {},
    source: joinSource(cell.source),
  }));

  notebookModel.fromJSON({
    cells,
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  } as PartialJSONValue);
};

/** Write the current mind map notebook back to markdown text. */
export const notebookModelToMarkdown = (notebookModel: INotebookModel): string => {
  const cells: NotebookCell[] = [];

  for (let index = 0; index < notebookModel.cells.length; index += 1) {
    const cell = notebookModel.cells.get(index);

    if (!cell || cell.type !== "markdown") {
      continue;
    }

    const metadata: Record<string, unknown> = {};
    const kuusi = cell.getMetadata("kuusi");

    if (kuusi !== undefined) {
      metadata.kuusi = kuusi;
    }

    const snapshot: NotebookCell = {
      cell_type: "markdown",
      source: cell.sharedModel.getSource(),
    };

    if (Object.keys(metadata).length > 0) {
      snapshot.metadata = metadata;
    }

    cells.push(snapshot);
  }

  return cellsToMarkdownDocument(cells);
};

/**
 * The mind map round trip is lossy (blank-line runs collapse, CRLF becomes LF,
 * a trailing newline is added). Compare through this form so that formatting
 * the map would normalize anyway is not mistaken for a user edit.
 */
export const normalizeMarkdownForMindMap = (markdown: string): string =>
  cellsToMarkdownDocument(markdownDocumentToCells(markdown));

/** True when the map already shows `markdown` (modulo round-trip normalization). */
export const notebookModelMatchesMarkdown = (
  notebookModel: INotebookModel,
  markdown: string,
): boolean =>
  notebookModelToMarkdown(notebookModel) ===
  normalizeMarkdownForMindMap(markdown);

export const syncNotebookModelToTextContext = (
  notebookModel: INotebookModel,
  textContext: DocumentRegistry.IContext<TextModel>,
): void => {
  const current = readTextModelSource(textContext.model);

  // Untouched map: leave the source file's formatting alone.
  if (notebookModelMatchesMarkdown(notebookModel, current)) {
    return;
  }

  writeTextModelSource(textContext.model, notebookModelToMarkdown(notebookModel));
};

export const syncTextContextToNotebookModel = (
  textContext: DocumentRegistry.IContext<TextModel>,
  notebookModel: INotebookModel,
): void => {
  loadMarkdownIntoNotebookModel(readTextModelSource(textContext.model), notebookModel);
};

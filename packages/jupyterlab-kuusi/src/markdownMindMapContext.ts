import type { DocumentRegistry } from "@jupyterlab/docregistry";
import type { INotebookModel } from "@jupyterlab/notebook";

import {
  syncNotebookModelToTextContext,
  syncTextContextToNotebookModel,
} from "./markdownMindMapModel";

type TextContext = DocumentRegistry.IContext<DocumentRegistry.ICodeModel>;

/** Notebook context facade backed by a Markdown text document on disk. */
export const createMarkdownMindMapNotebookContext = (
  textContext: TextContext,
  notebookModel: INotebookModel,
): DocumentRegistry.IContext<INotebookModel> => {
  const facade = Object.create(textContext) as DocumentRegistry.IContext<INotebookModel>;

  Object.defineProperty(facade, "model", {
    get: () => notebookModel,
  });

  facade.save = async (): Promise<void> => {
    syncNotebookModelToTextContext(notebookModel, textContext);
    await textContext.save();
  };

  facade.saveAs = async (): Promise<boolean> => {
    syncNotebookModelToTextContext(notebookModel, textContext);
    return textContext.saveAs();
  };

  facade.revert = async (): Promise<void> => {
    await textContext.revert();
    syncTextContextToNotebookModel(textContext, notebookModel);
  };

  return facade;
};

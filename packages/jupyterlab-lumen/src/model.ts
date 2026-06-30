import type { DocumentRegistry } from "@jupyterlab/docregistry";

type SharedTextModel = {
  source: string;
};

export const getModelText = (model: DocumentRegistry.IModel) =>
  (model.sharedModel as unknown as SharedTextModel).source;

export const setModelText = (model: DocumentRegistry.IModel, text: string) => {
  (model.sharedModel as unknown as SharedTextModel).source = text;
};

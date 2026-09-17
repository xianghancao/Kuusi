import type { DocumentRegistry } from "@jupyterlab/docregistry";
import {
  FACTORY_IMAGE,
  FACTORY_KUUSI_IMAGE,
} from "./constants";
import { KUUSI_IMAGE_FILE_TYPES } from "../imageView/imageFormats";

const kuusiImageFactoryName = (): string =>
  FACTORY_KUUSI_IMAGE.toLowerCase();

const officialImageFactoryName = (): string => FACTORY_IMAGE.toLowerCase();

const registryDefaults = (
  registry: DocumentRegistry,
): {
  _defaultWidgetFactories: Record<string, string>;
  _defaultWidgetFactoryOverrides: Record<string, string>;
} =>
  registry as unknown as {
    _defaultWidgetFactories: Record<string, string>;
    _defaultWidgetFactoryOverrides: Record<string, string>;
  };

export const applyImageDefaultViewers = (
  registry: DocumentRegistry,
  useKuusi: boolean,
): void => {
  const reg = registryDefaults(registry);

  if (useKuusi) {
    if (!registry.getWidgetFactory(FACTORY_KUUSI_IMAGE)) {
      return;
    }

    for (const fileType of KUUSI_IMAGE_FILE_TYPES) {
      reg._defaultWidgetFactoryOverrides[fileType] = kuusiImageFactoryName();
    }

    return;
  }

  for (const fileType of KUUSI_IMAGE_FILE_TYPES) {
    delete reg._defaultWidgetFactoryOverrides[fileType];
  }

  if (registry.getWidgetFactory(FACTORY_IMAGE)) {
    for (const fileType of KUUSI_IMAGE_FILE_TYPES) {
      reg._defaultWidgetFactories[fileType] = officialImageFactoryName();
    }
  }
};

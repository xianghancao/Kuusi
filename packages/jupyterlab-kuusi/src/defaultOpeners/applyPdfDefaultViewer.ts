import type { DocumentRegistry } from "@jupyterlab/docregistry";
import {
  FACTORY_KUUSI_PDF,
  FACTORY_PDF,
  FILE_TYPE_PDF,
} from "./constants";

const kuusiPdfFactoryName = (): string =>
  FACTORY_KUUSI_PDF.toLowerCase();

const officialPdfFactoryName = (): string => FACTORY_PDF.toLowerCase();

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

/**
 * JupyterLab's `setDefaultWidgetFactory("PDF", …)` fails for PDF because
 * factory lists are keyed inconsistently (`PDF` vs `pdf`). Apply the user's
 * Kuusi PDF preference directly on the registry override map instead.
 */
export const applyPdfDefaultViewer = (
  registry: DocumentRegistry,
  useKuusi: boolean,
): void => {
  const reg = registryDefaults(registry);
  const fileType = FILE_TYPE_PDF;

  if (useKuusi) {
    if (!registry.getWidgetFactory(FACTORY_KUUSI_PDF)) {
      return;
    }

    reg._defaultWidgetFactoryOverrides[fileType] = kuusiPdfFactoryName();
    return;
  }

  delete reg._defaultWidgetFactoryOverrides[fileType];

  if (registry.getWidgetFactory(FACTORY_PDF)) {
    reg._defaultWidgetFactories[fileType] = officialPdfFactoryName();
  }
};

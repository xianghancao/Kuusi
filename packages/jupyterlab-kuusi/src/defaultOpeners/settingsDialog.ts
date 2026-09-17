import type { DefaultOpenersManager } from "./defaultOpenersManager";
import { createKuusiTranslator } from "../kuusiI18n";
import { showKuusiSettingsDialog } from "../kuusiSettingsDialog";

export const showDefaultOpenersSettings = async (
  manager: DefaultOpenersManager,
): Promise<void> => {
  const t = createKuusiTranslator();
  await showKuusiSettingsDialog(manager, t);
};

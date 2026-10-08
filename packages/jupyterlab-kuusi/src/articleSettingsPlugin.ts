import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";

import { ARTICLE_SETTINGS_PLUGIN_ID } from "./articleSettings";

/**
 * Schema-only plugin so `jupyterlab-kuusi:article` settings are registered and
 * loadable via ISettingRegistry.
 */
const articleSettingsPlugin: JupyterFrontEndPlugin<void> = {
  id: ARTICLE_SETTINGS_PLUGIN_ID,
  description: "Kuusi Article reading appearance settings.",
  autoStart: true,
  activate: (_app: JupyterFrontEnd) => {
    console.info("jupyterlab-kuusi: Article settings activated");
  },
};

export default articleSettingsPlugin;

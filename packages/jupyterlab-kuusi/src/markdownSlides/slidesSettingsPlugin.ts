import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";

import { SLIDES_SETTINGS_PLUGIN_ID } from "./slidesSettings";

const slidesSettingsPlugin: JupyterFrontEndPlugin<void> = {
  id: SLIDES_SETTINGS_PLUGIN_ID,
  description: "Kuusi Markdown Slides appearance settings.",
  autoStart: true,
  activate: (_app: JupyterFrontEnd) => {
    console.info("jupyterlab-kuusi: Markdown Slides settings activated");
  },
};

export default slidesSettingsPlugin;

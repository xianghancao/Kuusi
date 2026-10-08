import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";

import { BOOK_SETTINGS_PLUGIN_ID } from "./bookSettings";

/** Schema-only plugin so `jupyterlab-kuusi:book` settings are registered. */
const bookSettingsPlugin: JupyterFrontEndPlugin<void> = {
  id: BOOK_SETTINGS_PLUGIN_ID,
  description: "Kuusi Book dual-column reading appearance settings.",
  autoStart: true,
  activate: (_app: JupyterFrontEnd) => {
    console.info("jupyterlab-kuusi: Book settings activated");
  },
};

export default bookSettingsPlugin;

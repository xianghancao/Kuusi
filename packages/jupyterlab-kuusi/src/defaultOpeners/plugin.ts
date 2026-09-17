import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { ICommandPalette } from "@jupyterlab/apputils";
import { ISettingRegistry } from "@jupyterlab/settingregistry";
import {
  DEFAULT_OPENERS_PLUGIN_ID,
  OPEN_DEFAULT_OPENERS_SETTINGS_COMMAND,
} from "./constants";
import { kuusiLauncherSettingsIcon } from "../launcherIcons";
import {
  DefaultOpenersManager,
  setDefaultOpenersManager,
} from "./defaultOpenersManager";
import { showDefaultOpenersSettings } from "./settingsDialog";

const defaultOpenersPlugin: JupyterFrontEndPlugin<void> = {
  id: DEFAULT_OPENERS_PLUGIN_ID,
  description: "Configure which file types open with Kuusi by default.",
  autoStart: true,
  requires: [ISettingRegistry],
  optional: [ICommandPalette],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry,
    palette: ICommandPalette | null,
  ) => {
    const manager = new DefaultOpenersManager(
      settingRegistry,
      app.docRegistry,
    );
    setDefaultOpenersManager(manager);

    app.commands.addCommand(OPEN_DEFAULT_OPENERS_SETTINGS_COMMAND, {
      label: "Kuusi Settings",
      caption: "Choose default Kuusi openers for notebooks, Markdown, TeX, and PDF",
      icon: kuusiLauncherSettingsIcon,
      execute: () => showDefaultOpenersSettings(manager),
    });

    if (palette) {
      palette.addItem({
        command: OPEN_DEFAULT_OPENERS_SETTINGS_COMMAND,
        category: "Kuusi",
      });
    }

    console.info("jupyterlab-kuusi: Default openers settings activated");
  },
};

export default defaultOpenersPlugin;

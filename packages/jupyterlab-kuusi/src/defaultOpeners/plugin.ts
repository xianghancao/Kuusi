import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { ICommandPalette, Notification } from "@jupyterlab/apputils";
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
import { createKuusiTranslator } from "../kuusiI18n";
import { compareVersions } from "../kuusiVersionCheck";
import { KUUSI_VERSION } from "../version";
import { showDefaultOpenersSettings } from "./settingsDialog";

const LAST_SEEN_VERSION_KEY = "jupyterlab-kuusi:last-seen-version";

/** After an upgrade, say so once: the user can see the new version took hold. */
const announceUpgrade = (): void => {
  try {
    const previous = window.localStorage.getItem(LAST_SEEN_VERSION_KEY);
    window.localStorage.setItem(LAST_SEEN_VERSION_KEY, KUUSI_VERSION);

    if (previous && compareVersions(KUUSI_VERSION, previous) > 0) {
      Notification.success(
        `${createKuusiTranslator().upgradedTo()} v${KUUSI_VERSION}`,
        { autoClose: 6000 },
      );
    }
  } catch {
    // Storage can be blocked (private windows); the notice is optional.
  }
};

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
      app.restored,
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

    void app.restored.then(announceUpgrade);
    console.info("jupyterlab-kuusi: Default openers settings activated");
  },
};

export default defaultOpenersPlugin;

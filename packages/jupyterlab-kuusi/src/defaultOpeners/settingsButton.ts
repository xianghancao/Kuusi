import type { CommandRegistry } from "@lumino/commands";
import { OPEN_DEFAULT_OPENERS_SETTINGS_COMMAND } from "./constants";
import { kuusiLauncherSettingsIcon } from "../launcherIcons";
import { createKuusiTranslator } from "../kuusiI18n";
import {
  refreshKuusiLatestVersion,
  subscribeKuusiVersionState,
} from "../kuusiVersionCheck";
import { setKuusiUpdateBadgeVisible } from "../kuusiVersionUi";

const SETTINGS_TITLE = "Kuusi settings";

type SettingsBadgeTarget = {
  badge: HTMLElement;
  trigger: HTMLButtonElement;
};

const badgeTargets: SettingsBadgeTarget[] = [];
let badgeSubscriptionStarted = false;

const ensureSettingsBadgeSubscription = (): void => {
  if (badgeSubscriptionStarted) {
    return;
  }
  badgeSubscriptionStarted = true;

  const t = createKuusiTranslator();

  subscribeKuusiVersionState((state) => {
    badgeTargets.forEach(({ badge, trigger }) => {
      setKuusiUpdateBadgeVisible(
        badge,
        trigger,
        t,
        state.updateAvailable,
        SETTINGS_TITLE,
      );
    });
  });

  void refreshKuusiLatestVersion();
};

export const createKuusiSettingsButton = (
  commands: CommandRegistry,
): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = "jp-KuusiDefaultOpeners-settingsWrap";

  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "jp-KuusiDefaultOpeners-settingsBtn jp-ToolbarButtonComponent";
  button.title = SETTINGS_TITLE;
  button.setAttribute("aria-label", SETTINGS_TITLE);

  const updateBadge = document.createElement("span");
  updateBadge.className = "jp-KuusiProductDropdown-updateBadge";
  updateBadge.hidden = true;
  updateBadge.setAttribute("aria-hidden", "true");

  kuusiLauncherSettingsIcon.element({
    container: button,
    stylesheet: "menuItem",
  });

  button.appendChild(updateBadge);
  wrap.appendChild(button);

  badgeTargets.push({ badge: updateBadge, trigger: button });
  ensureSettingsBadgeSubscription();

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    void commands.execute(OPEN_DEFAULT_OPENERS_SETTINGS_COMMAND);
  });

  return wrap;
};

import type { KuusiTranslator } from "./kuusiI18n";
import { compareVersions, type KuusiVersionState } from "./kuusiVersionCheck";
import { KUUSI_VERSION } from "./version";

export const applyKuusiVersionDisplay = (
  latestValueEl: HTMLElement,
  versionTabBadge: HTMLElement | null,
  state: KuusiVersionState,
  t: KuusiTranslator,
  options?: {
    cached?: boolean;
    onUpdateAvailable?: (available: boolean) => void;
  },
): void => {
  const { latest } = state;

  if (!latest) {
    latestValueEl.textContent = "—";
    latestValueEl.classList.remove("is-update-available", "is-up-to-date");
    latestValueEl.title = t.latestUnavailable();
    if (versionTabBadge) {
      versionTabBadge.hidden = true;
    }
    options?.onUpdateAvailable?.(false);
    return;
  }

  latestValueEl.textContent = `v${latest}`;
  latestValueEl.classList.remove("is-update-available", "is-up-to-date");

  const updateAvailable = compareVersions(latest, KUUSI_VERSION) > 0;

  if (updateAvailable) {
    latestValueEl.classList.add("is-update-available");
    latestValueEl.title = t.newVersionAvailable();
    if (versionTabBadge) {
      versionTabBadge.hidden = false;
    }
    options?.onUpdateAvailable?.(true);
    return;
  }

  latestValueEl.classList.add("is-up-to-date");
  latestValueEl.title = options?.cached
    ? `${t.upToDate()} (${t.pypiLatestVersion()} cached)`
    : t.upToDate();
  if (versionTabBadge) {
    versionTabBadge.hidden = true;
  }
  options?.onUpdateAvailable?.(false);
};

export const setKuusiUpdateBadgeVisible = (
  badge: HTMLElement,
  trigger: HTMLElement,
  t: KuusiTranslator,
  visible: boolean,
  defaultTitle: string,
): void => {
  if (visible) {
    badge.hidden = false;
    badge.classList.add("is-visible");
    trigger.title = t.newVersionAvailable();
    trigger.setAttribute("aria-label", `${defaultTitle} — ${t.newVersionAvailable()}`);
    return;
  }

  badge.hidden = true;
  badge.classList.remove("is-visible");
  trigger.title = defaultTitle;
  trigger.setAttribute("aria-label", defaultTitle);
};

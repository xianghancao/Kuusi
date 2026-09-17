import { Dialog, showDialog } from "@jupyterlab/apputils";
import { Widget } from "@lumino/widgets";
import type { DefaultOpenersManager } from "./defaultOpeners/defaultOpenersManager";
import { createDefaultOpenersPanel } from "./defaultOpeners/openersPanel";
import type { KuusiTranslator } from "./kuusiI18n";
import {
  createKuusiAboutPanel,
  createKuusiCommunityPanel,
  createKuusiRepositoryPanel,
  createKuusiVersionPanel,
} from "./kuusiInfoPanels";
import {
  getKuusiVersionState,
  refreshKuusiLatestVersion,
  subscribeKuusiVersionState,
} from "./kuusiVersionCheck";
import { applyKuusiVersionDisplay } from "./kuusiVersionUi";

type SettingsSection =
  | "openers"
  | "version"
  | "community"
  | "repository"
  | "about";

let lastSettingsSection: SettingsSection = "openers";

const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: (t: KuusiTranslator) => string;
  versionTab?: boolean;
}> = [
  { id: "openers", label: (t) => t.defaultFiles() },
  { id: "version", label: (t) => t.version(), versionTab: true },
  { id: "community", label: (t) => t.community() },
  { id: "repository", label: (t) => t.repository() },
  { id: "about", label: (t) => t.about() },
];

const createSettingsShell = (
  manager: DefaultOpenersManager,
  t: KuusiTranslator,
): { widget: Widget; dispose: () => void } => {
  const card = document.createElement("div");
  card.className = "jp-KuusiSettings-card";

  const body = document.createElement("div");
  body.className = "jp-KuusiSecondaryMenu jp-KuusiSettings-secondary";

  const nav = document.createElement("div");
  nav.className = "jp-KuusiSecondaryMenu-nav";
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", t.kuusiSettings());

  const panel = document.createElement("div");
  panel.className =
    "jp-KuusiSecondaryMenu-panel jp-KuusiProductDropdown-panel jp-KuusiSettings-panel";
  panel.setAttribute("role", "tabpanel");

  const openersPanel = createDefaultOpenersPanel(manager);
  const versionRefs = createKuusiVersionPanel(t);
  const communityPanel = createKuusiCommunityPanel(t);
  const repositoryPanel = createKuusiRepositoryPanel(t);
  const aboutPanel = createKuusiAboutPanel(t);

  const panels: Record<SettingsSection, HTMLElement> = {
    openers: openersPanel,
    version: versionRefs.panel,
    community: communityPanel,
    repository: repositoryPanel,
    about: aboutPanel,
  };

  for (const sectionPanel of Object.values(panels)) {
    sectionPanel.classList.add("jp-KuusiSettings-sectionPanel");
    sectionPanel.hidden = true;
    panel.appendChild(sectionPanel);
  }

  const tabButtons = new Map<SettingsSection, HTMLButtonElement>();

  const syncVersionPanel = (): void => {
    applyKuusiVersionDisplay(
      versionRefs.latestValueEl,
      versionRefs.versionTabBadge,
      getKuusiVersionState(),
      t,
    );
  };

  const unsubscribeVersion = subscribeKuusiVersionState(() => {
    syncVersionPanel();
  });
  void refreshKuusiLatestVersion();

  const setSection = (section: SettingsSection): void => {
    const alreadyActive = lastSettingsSection === section;
    lastSettingsSection = section;
    tabButtons.forEach((button, id) => {
      const isActive = id === section;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    for (const [id, sectionPanel] of Object.entries(panels) as Array<
      [SettingsSection, HTMLElement]
    >) {
      sectionPanel.hidden = id !== section;
    }

    if (section === "version" && !alreadyActive) {
      syncVersionPanel();
      void refreshKuusiLatestVersion();
    }
  };

  SETTINGS_SECTIONS.forEach(({ id, label, versionTab }) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "jp-KuusiSecondaryMenu-tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute(
      "aria-selected",
      id === lastSettingsSection ? "true" : "false",
    );

    const labelEl = document.createElement("span");
    labelEl.className = "jp-KuusiSecondaryMenu-tabLabel";
    labelEl.textContent = label(t);
    tab.appendChild(labelEl);

    if (versionTab) {
      tab.appendChild(versionRefs.versionTabBadge);
    }

    tab.classList.toggle("is-active", id === lastSettingsSection);
    const activate = (event: Event) => {
      event.stopPropagation();
      setSection(id);
    };
    tab.addEventListener("mouseenter", activate);
    tab.addEventListener("focus", activate);
    tab.addEventListener("click", activate);
    tabButtons.set(id, tab);
    nav.appendChild(tab);
  });

  body.append(nav, panel);
  card.appendChild(body);
  setSection(lastSettingsSection);

  const widget = new Widget();
  widget.addClass("jp-KuusiSettings-dialogBody");
  widget.node.appendChild(card);

  return {
    widget,
    dispose: () => {
      unsubscribeVersion();
    },
  };
};

export const showKuusiSettingsDialog = async (
  manager: DefaultOpenersManager,
  t: KuusiTranslator,
): Promise<void> => {
  await manager.ready();

  const { widget, dispose } = createSettingsShell(manager, t);

  try {
    await showDialog({
      title: t.kuusiSettings(),
      body: widget,
      buttons: [Dialog.okButton({ label: t.close() })],
    });
  } finally {
    dispose();
  }
};

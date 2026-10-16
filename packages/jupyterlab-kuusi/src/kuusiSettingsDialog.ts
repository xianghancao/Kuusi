import { Dialog, showDialog } from "@jupyterlab/apputils";
import { Widget } from "@lumino/widgets";
import type { DefaultOpenersManager } from "./defaultOpeners/defaultOpenersManager";
import { createDefaultOpenersPanel } from "./defaultOpeners/openersPanel";
import { renderPanelWidgets } from "./panelWidgets";
import { APPEARANCE_COLOR_SWATCHES, appendColorPickerSection } from "./colorPicker";
import type { KuusiTranslator } from "./kuusiI18n";
import {
  createKuusiAboutPanel,
  createKuusiCommunityPanel,
  createKuusiFeedbackPanel,
  createKuusiRepositoryPanel,
  createKuusiUpgradePanel,
  createKuusiVersionPanel,
  KUUSI_PIP_UPGRADE,
} from "./kuusiInfoPanels";
import {
  compareVersions,
  getKuusiVersionState,
  refreshKuusiLatestVersion,
  subscribeKuusiVersionState,
} from "./kuusiVersionCheck";
import { KUUSI_VERSION } from "./version";
import { applyKuusiVersionDisplay } from "./kuusiVersionUi";

type SettingsSection =
  | "openers"
  | "notebook"
  | "version"
  | "upgrade"
  | "community"
  | "feedback"
  | "repository"
  | "about";

let lastSettingsSection: SettingsSection = "openers";

const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: (t: KuusiTranslator) => string;
  versionTab?: boolean;
}> = [
  { id: "openers", label: (t) => t.defaultFiles() },
  { id: "notebook", label: (t) => t.notebookSettings() },
  { id: "version", label: (t) => t.version(), versionTab: true },
  { id: "upgrade", label: (t) => t.upgrade() },
  { id: "community", label: (t) => t.community() },
  { id: "feedback", label: (t) => t.feedback() },
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
  const notebookPanel = document.createElement("div");
  const renderNotebookPanel = (): void => {
    notebookPanel.replaceChildren();
    renderPanelWidgets(notebookPanel, [
      {
        kind: "toggle",
        label: t.autoReloadDefault(),
        title: t.autoReloadDefaultTitle(),
        value: manager.autoReloadDefault,
        onChange: (enabled: boolean) => {
          void manager.setAutoReloadDefault(enabled);
        },
      },
    ]);
    const intro = document.createElement("p");
    intro.className = "jp-KuusiDefaultOpeners-intro";
    intro.textContent = t.cellColorsHint();
    notebookPanel.appendChild(intro);
    appendColorPickerSection(
      notebookPanel,
      t.cellBarColor(),
      manager.cellBarColor,
      (color) => {
        void manager.setCellBarColor(color).then(renderNotebookPanel);
      },
      APPEARANCE_COLOR_SWATCHES,
      { includeDefaultSwatch: true },
    );
    appendColorPickerSection(
      notebookPanel,
      t.cellBorderColor(),
      manager.cellBorderColor,
      (color) => {
        void manager.setCellBorderColor(color).then(renderNotebookPanel);
      },
      APPEARANCE_COLOR_SWATCHES,
      { includeDefaultSwatch: true },
    );
  };
  renderNotebookPanel();
  const versionRefs = createKuusiVersionPanel(t);
  // A status chip (and the upgrade command) under the two version rows.
  const versionStatus = document.createElement("div");
  versionStatus.className = "jp-KuusiSettings-versionStatus";
  // The two version rows form a card; the panel itself fills the page.
  const versionCard = document.createElement("div");
  versionCard.className = "jp-KuusiSettings-versionCard";
  while (versionRefs.panel.firstChild) {
    versionCard.appendChild(versionRefs.panel.firstChild);
  }
  versionRefs.panel.append(versionCard, versionStatus);
  const upgradePanel = createKuusiUpgradePanel(t);
  const communityPanel = createKuusiCommunityPanel(t);
  const feedbackPanel = createKuusiFeedbackPanel(t);
  const repositoryPanel = createKuusiRepositoryPanel(t);
  const aboutPanel = createKuusiAboutPanel(t);

  const panels: Record<SettingsSection, HTMLElement> = {
    openers: openersPanel,
    notebook: notebookPanel,
    version: versionRefs.panel,
    upgrade: upgradePanel,
    community: communityPanel,
    feedback: feedbackPanel,
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
    const state = getKuusiVersionState();
    applyKuusiVersionDisplay(
      versionRefs.latestValueEl,
      versionRefs.versionTabBadge,
      state,
      t,
    );

    const update = Boolean(state.latest) && compareVersions(state.latest!, KUUSI_VERSION) > 0;
    const chip = document.createElement("span");
    chip.className = `jp-KuusiSettings-chip ${
      !state.latest ? "is-unknown" : update ? "is-update" : "is-ok"
    }`;
    chip.textContent = !state.latest
      ? t.latestUnavailable()
      : update
        ? t.newVersionAvailable()
        : t.upToDate();
    versionStatus.replaceChildren(chip);

    if (update) {
      const hint = document.createElement("div");
      hint.className = "jp-KuusiSettings-updateHint";
      const lead = document.createElement("span");
      lead.textContent = `${t.updateWith()}`;
      const code = document.createElement("code");
      code.textContent = KUUSI_PIP_UPGRADE;
      const more = document.createElement("button");
      more.type = "button";
      more.className = "jp-KuusiSettings-linkBtn";
      more.textContent = `${t.howToUpgrade()} →`;
      more.addEventListener("click", (event) => {
        event.stopPropagation();
        setSection("upgrade");
      });
      hint.append(lead, code, more);
      versionStatus.appendChild(hint);
    }
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
      // A plain (grey) Close rather than the primary blue button, and focus on
      // the active tab so the button does not open with a heavy focus ring.
      buttons: [Dialog.cancelButton({ label: t.close() })],
      focusNodeSelector: ".jp-KuusiSecondaryMenu-tab.is-active",
    });
  } finally {
    dispose();
  }
};

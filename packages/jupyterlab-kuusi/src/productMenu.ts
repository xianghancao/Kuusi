import { closeKuusiDropdownMenus, openKuusiDropdownMenu } from "./formatToolbar";
import type { KuusiTranslator } from "./kuusiI18n";
import { appendKeyboardGuideContent } from "./keyboardGuide";
import {
  createKuusiAboutPanel,
  createKuusiCommunityPanel,
  createKuusiRepositoryPanel,
  createKuusiVersionPanel,
} from "./kuusiInfoPanels";
import { applyKuusiLogo } from "./kuusiLogo";
import {
  getKuusiVersionState,
  refreshKuusiLatestVersion,
  subscribeKuusiVersionState,
} from "./kuusiVersionCheck";
import { applyKuusiVersionDisplay, setKuusiUpdateBadgeVisible } from "./kuusiVersionUi";
const KUUSI_PIP_INSTALL = "pip install jupyterlab-kuusi";

type ProductSection =
  | "about"
  | "version"
  | "repository"
  | "community"
  | "install"
  | "shortcut";

/** Remember last Kuusi secondary tab within the page session. */
let lastProductSection: ProductSection = "about";

const refreshLatestVersion = (
  latestValueEl: HTMLElement,
  versionTabBadge: HTMLElement,
  t: KuusiTranslator,
  updateBadge: HTMLElement,
  trigger: HTMLButtonElement,
): void => {
  const sync = (): void => {
    applyKuusiVersionDisplay(
      latestValueEl,
      versionTabBadge,
      getKuusiVersionState(),
      t,
      {
        onUpdateAvailable: (available) => {
          setKuusiUpdateBadgeVisible(
            updateBadge,
            trigger,
            t,
            available,
            "Kuusi",
          );
        },
      },
    );
  };

  sync();
  void refreshKuusiLatestVersion().then(() => {
    sync();
  });
};

const createInstallRow = (t: KuusiTranslator): HTMLElement => {
  const row = document.createElement("div");
  row.className = "jp-KuusiProductDropdown-installRow";

  const command = document.createElement("code");
  command.className = "jp-KuusiProductDropdown-installCommand";
  command.textContent = KUUSI_PIP_INSTALL;

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "jp-KuusiProductDropdown-copyBtn";
  copyButton.textContent = t.copy();
  copyButton.title = t.copyInstallCommand();
  copyButton.setAttribute("aria-label", t.copyInstallCommand());

  const setCopied = () => {
    copyButton.textContent = t.copied();
    window.setTimeout(() => {
      copyButton.textContent = t.copy();
    }, 1500);
  };

  copyButton.addEventListener("click", (event) => {
    event.stopPropagation();
    void navigator.clipboard.writeText(KUUSI_PIP_INSTALL).then(setCopied).catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = KUUSI_PIP_INSTALL;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setCopied();
    });
  });

  row.append(command, copyButton);
  return row;
};

const PRODUCT_SECTIONS: Array<{
  id: ProductSection;
  label: (t: KuusiTranslator) => string;
}> = [
  { id: "about", label: (t) => t.about() },
  { id: "version", label: (t) => t.version() },
  { id: "repository", label: (t) => t.repository() },
  { id: "community", label: (t) => t.community() },
  { id: "install", label: (t) => t.install() },
  { id: "shortcut", label: (t) => t.shortcut() },
];

export const createProductMenu = (
  root: HTMLElement,
  t: KuusiTranslator,
): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.className =
    "jp-KuusiFormatDropdown jp-KuusiProductDropdown jp-KuusiNotebookMindMap-header-brand";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "jp-KuusiNotebookMindMap-header-title";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-label", "Kuusi");
  trigger.title = "Kuusi";
  applyKuusiLogo(trigger, "header", { showLabel: false });

  const updateBadge = document.createElement("span");
  updateBadge.className = "jp-KuusiProductDropdown-updateBadge";
  updateBadge.hidden = true;
  updateBadge.setAttribute("aria-hidden", "true");
  trigger.appendChild(updateBadge);

  const menu = document.createElement("div");
  menu.className =
    "jp-KuusiFormatDropdown-menu jp-KuusiFormatDropdown-menu-wide jp-KuusiProductDropdown-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Kuusi");

  const body = document.createElement("div");
  body.className = "jp-KuusiSecondaryMenu";

  const nav = document.createElement("div");
  nav.className = "jp-KuusiSecondaryMenu-nav";
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", "Kuusi");

  const panel = document.createElement("div");
  panel.className = "jp-KuusiSecondaryMenu-panel jp-KuusiProductDropdown-panel";
  panel.setAttribute("role", "tabpanel");

  const aboutPanel = createKuusiAboutPanel(t);
  const versionRefs = createKuusiVersionPanel(t);
  const repositoryPanel = createKuusiRepositoryPanel(t);
  const communityPanel = createKuusiCommunityPanel(t);

  const installPanel = document.createElement("div");
  installPanel.className = "jp-KuusiProductDropdown-installPanel";
  installPanel.appendChild(createInstallRow(t));

  const shortcutPanel = document.createElement("div");
  shortcutPanel.className = "jp-KuusiProductDropdown-guidePanel";
  appendKeyboardGuideContent(shortcutPanel, t);

  const panels: Record<ProductSection, HTMLElement> = {
    about: aboutPanel,
    version: versionRefs.panel,
    repository: repositoryPanel,
    community: communityPanel,
    install: installPanel,
    shortcut: shortcutPanel,
  };

  const tabButtons = new Map<ProductSection, HTMLButtonElement>();
  let versionTabBadge: HTMLElement | null = null;

  const setSection = (section: ProductSection) => {
    const alreadyActive =
      lastProductSection === section && panel.contains(panels[section]);
    lastProductSection = section;
    tabButtons.forEach((button, id) => {
      const isActive = id === section;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    if (!alreadyActive) {
      panel.replaceChildren(panels[section]);
    }

    if (section === "version" && versionTabBadge && !alreadyActive) {
      refreshLatestVersion(
        versionRefs.latestValueEl,
        versionTabBadge,
        t,
        updateBadge,
        trigger,
      );
    }
  };

  PRODUCT_SECTIONS.forEach(({ id, label }) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "jp-KuusiSecondaryMenu-tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute(
      "aria-selected",
      id === lastProductSection ? "true" : "false",
    );

    const labelEl = document.createElement("span");
    labelEl.className = "jp-KuusiSecondaryMenu-tabLabel";
    labelEl.textContent = label(t);
    tab.appendChild(labelEl);

    if (id === "version") {
      versionTabBadge = versionRefs.versionTabBadge;
      tab.appendChild(versionRefs.versionTabBadge);
    }

    tab.classList.toggle("is-active", id === lastProductSection);
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
  menu.appendChild(body);
  setSection(lastProductSection);

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.contains("is-open");
    closeKuusiDropdownMenus(root);

    if (!isOpen) {
      setSection(lastProductSection);
      openKuusiDropdownMenu(menu, root);
    }
  });

  wrapper.append(trigger, menu);

  subscribeKuusiVersionState((state) => {
    setKuusiUpdateBadgeVisible(
      updateBadge,
      trigger,
      t,
      state.updateAvailable,
      "Kuusi",
    );
    applyKuusiVersionDisplay(
      versionRefs.latestValueEl,
      versionRefs.versionTabBadge,
      state,
      t,
    );
  });
  void refreshKuusiLatestVersion();

  return wrapper;
};

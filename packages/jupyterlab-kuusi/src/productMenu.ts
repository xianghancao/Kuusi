import { closeKuusiDropdownMenus } from "./formatToolbar";
import type { KuusiTranslator } from "./kuusiI18n";
import { appendKeyboardGuideContent } from "./keyboardGuide";
import { applyKuusiLogo } from "./kuusiLogo";
import {
  KUUSI_DISCOURSE_URL,
  KUUSI_GITHUB_URL,
  KUUSI_PYPI_URL,
  KUUSI_VERSION,
  KUUSI_X_URL,
} from "./version";

const KUUSI_GITHUB_REPO = "xianghancao/kuusi";
const KUUSI_PIP_INSTALL = "pip install jupyterlab-kuusi";
const VERSION_CACHE_KEY = "jupyterlab-kuusi:latest-version";
const VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type VersionCacheEntry = {
  version: string;
  fetchedAt: number;
};

type ProductSection =
  | "about"
  | "version"
  | "repository"
  | "community"
  | "install"
  | "shortcut";

/** Remember last Kuusi secondary tab within the page session. */
let lastProductSection: ProductSection = "about";

const normalizeVersion = (version: string): string =>
  version.trim().replace(/^v/i, "");

const compareVersions = (left: string, right: string): number => {
  const parse = (value: string) =>
    normalizeVersion(value)
      .split(".")
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));

  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);

    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
};

const readVersionCache = (): VersionCacheEntry | null => {
  try {
    const raw = localStorage.getItem(VERSION_CACHE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as VersionCacheEntry;

    if (
      typeof parsed.version !== "string" ||
      typeof parsed.fetchedAt !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const writeVersionCache = (version: string): void => {
  try {
    const entry: VersionCacheEntry = {
      version,
      fetchedAt: Date.now(),
    };
    localStorage.setItem(VERSION_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage failures in private browsing or restricted environments.
  }
};

const isCacheFresh = (entry: VersionCacheEntry): boolean =>
  Date.now() - entry.fetchedAt < VERSION_CACHE_TTL_MS;

export const fetchLatestKuusiVersion = async (): Promise<string | null> => {
  const releaseResponse = await fetch(
    `https://api.github.com/repos/${KUUSI_GITHUB_REPO}/releases/latest`,
  );

  if (releaseResponse.ok) {
    const release = (await releaseResponse.json()) as { tag_name?: string };

    if (release.tag_name) {
      return normalizeVersion(release.tag_name);
    }
  }

  const packageResponse = await fetch(
    `https://raw.githubusercontent.com/${KUUSI_GITHUB_REPO}/main/packages/jupyterlab-kuusi/package.json`,
  );

  if (!packageResponse.ok) {
    return null;
  }

  const packageJson = (await packageResponse.json()) as { version?: string };
  return packageJson.version ? normalizeVersion(packageJson.version) : null;
};

const setUpdateBadgeVisible = (
  updateBadge: HTMLElement,
  trigger: HTMLButtonElement,
  t: KuusiTranslator,
  visible: boolean,
): void => {
  if (visible) {
    updateBadge.hidden = false;
    updateBadge.classList.add("is-visible");
    trigger.title = t.newVersionAvailable();
    trigger.setAttribute("aria-label", `Kuusi — ${t.newVersionAvailable()}`);
    return;
  }

  updateBadge.hidden = true;
  updateBadge.classList.remove("is-visible");
  trigger.title = "Kuusi";
  trigger.setAttribute("aria-label", "Kuusi");
};

const applyLatestVersionState = (
  latestValueEl: HTMLElement,
  versionTabBadge: HTMLElement,
  latest: string,
  t: KuusiTranslator,
  updateBadge: HTMLElement,
  trigger: HTMLButtonElement,
  cached = false,
): void => {
  latestValueEl.textContent = `v${latest}`;
  latestValueEl.classList.remove("is-update-available", "is-up-to-date");

  const updateAvailable = compareVersions(latest, KUUSI_VERSION) > 0;

  if (updateAvailable) {
    latestValueEl.classList.add("is-update-available");
    latestValueEl.title = t.newVersionAvailable();
    versionTabBadge.hidden = false;
    setUpdateBadgeVisible(updateBadge, trigger, t, true);
    return;
  }

  latestValueEl.classList.add("is-up-to-date");
  latestValueEl.title = cached
    ? `${t.upToDate()} (${t.latestVersion()} cached)`
    : t.upToDate();
  versionTabBadge.hidden = true;
  setUpdateBadgeVisible(updateBadge, trigger, t, false);
};

const refreshLatestVersion = (
  latestValueEl: HTMLElement,
  versionTabBadge: HTMLElement,
  t: KuusiTranslator,
  updateBadge: HTMLElement,
  trigger: HTMLButtonElement,
): void => {
  const cached = readVersionCache();

  if (cached) {
    applyLatestVersionState(
      latestValueEl,
      versionTabBadge,
      cached.version,
      t,
      updateBadge,
      trigger,
      true,
    );
  } else {
    latestValueEl.textContent = "—";
    latestValueEl.classList.remove("is-update-available", "is-up-to-date");
    latestValueEl.title = t.latestUnavailable();
    versionTabBadge.hidden = true;
  }

  if (cached && isCacheFresh(cached)) {
    return;
  }

  void fetchLatestKuusiVersion()
    .then((latest) => {
      if (!latest) {
        if (!cached) {
          latestValueEl.textContent = t.latestUnavailable();
          latestValueEl.title = t.latestUnavailable();
          versionTabBadge.hidden = true;
        }
        return;
      }

      writeVersionCache(latest);
      applyLatestVersionState(
        latestValueEl,
        versionTabBadge,
        latest,
        t,
        updateBadge,
        trigger,
        false,
      );
    })
    .catch(() => {
      if (!cached) {
        latestValueEl.textContent = t.latestUnavailable();
        latestValueEl.title = t.latestUnavailable();
        versionTabBadge.hidden = true;
      }
    });
};

const createVersionRow = (
  label: string,
  value: string,
): { row: HTMLElement; valueEl: HTMLElement } => {
  const row = document.createElement("div");
  row.className = "jp-KuusiProductDropdown-versionRow";
  row.setAttribute("role", "menuitem");

  const labelEl = document.createElement("span");
  labelEl.className = "jp-KuusiProductDropdown-versionLabel";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "jp-KuusiProductDropdown-versionValue";
  valueEl.textContent = value;

  row.append(labelEl, valueEl);
  return { row, valueEl };
};

const createExternalLink = (
  label: string,
  href: string,
  title: string,
  displayUrl = href,
): HTMLAnchorElement => {
  const link = document.createElement("a");
  link.className =
    "jp-KuusiFormatDropdown-item jp-KuusiProductDropdown-link";
  link.setAttribute("role", "menuitem");
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = title;

  const name = document.createElement("span");
  name.className = "jp-KuusiProductDropdown-linkLabel";
  name.textContent = label;

  const url = document.createElement("span");
  url.className = "jp-KuusiProductDropdown-linkUrl";
  url.textContent = displayUrl;

  link.append(name, url);
  link.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  return link;
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
  applyKuusiLogo(trigger, "header");

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

  const aboutPanel = document.createElement("div");
  aboutPanel.className = "jp-KuusiProductDropdown-aboutPanel";
  const aboutText = document.createElement("p");
  aboutText.className = "jp-KuusiProductDropdown-aboutText";
  aboutText.textContent = t.aboutBlurb();
  aboutPanel.appendChild(aboutText);

  const versionPanel = document.createElement("div");
  versionPanel.className = "jp-KuusiProductDropdown-versionPanel";
  const currentRow = createVersionRow(t.currentVersion(), `v${KUUSI_VERSION}`);
  const latestRow = createVersionRow(t.latestVersion(), "—");
  versionPanel.append(currentRow.row, latestRow.row);

  const repositoryPanel = document.createElement("div");
  repositoryPanel.className = "jp-KuusiProductDropdown-repositoryPanel";
  repositoryPanel.append(
    createExternalLink("GitHub:", KUUSI_GITHUB_URL, t.openRepository()),
    createExternalLink("PyPI:", KUUSI_PYPI_URL, t.openPyPI()),
  );

  const communityPanel = document.createElement("div");
  communityPanel.className = "jp-KuusiProductDropdown-communityPanel";
  const communityText = document.createElement("p");
  communityText.className = "jp-KuusiProductDropdown-aboutText";
  communityText.textContent = t.communityBlurb();
  communityPanel.append(
    communityText,
    createExternalLink(
      "Discourse:",
      KUUSI_DISCOURSE_URL,
      t.openDiscourse(),
      "discourse.jupyter.org/t/…/38802",
    ),
    createExternalLink("X:", KUUSI_X_URL, t.openX(), "x.com/KussiMindMap"),
  );

  const installPanel = document.createElement("div");
  installPanel.className = "jp-KuusiProductDropdown-installPanel";
  installPanel.appendChild(createInstallRow(t));

  const shortcutPanel = document.createElement("div");
  shortcutPanel.className = "jp-KuusiProductDropdown-guidePanel";
  appendKeyboardGuideContent(shortcutPanel, t);

  const panels: Record<ProductSection, HTMLElement> = {
    about: aboutPanel,
    version: versionPanel,
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
        latestRow.valueEl,
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
      const badge = document.createElement("span");
      badge.className = "jp-KuusiProductDropdown-versionNew";
      badge.textContent = t.newBadge();
      badge.hidden = true;
      versionTabBadge = badge;
      tab.appendChild(badge);
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
      menu.classList.add("is-open");
    }
  });

  document.addEventListener("click", () => {
    closeKuusiDropdownMenus(root);
  });

  wrapper.append(trigger, menu);

  if (versionTabBadge) {
    refreshLatestVersion(
      latestRow.valueEl,
      versionTabBadge,
      t,
      updateBadge,
      trigger,
    );
  }

  return wrapper;
};

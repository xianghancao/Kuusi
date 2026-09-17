import type { KuusiTranslator } from "./kuusiI18n";
import {
  KUUSI_COMMUNITY_EMAIL,
  KUUSI_DISCOURSE_URL,
  KUUSI_GITHUB_URL,
  KUUSI_PYPI_URL,
  KUUSI_VERSION,
  KUUSI_X_URL,
} from "./version";

export const createVersionRow = (
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

export const createExternalLink = (
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

export type KuusiVersionPanelRefs = {
  panel: HTMLElement;
  latestValueEl: HTMLElement;
  versionTabBadge: HTMLElement;
};

export const createKuusiVersionPanel = (
  t: KuusiTranslator,
): KuusiVersionPanelRefs => {
  const versionPanel = document.createElement("div");
  versionPanel.className = "jp-KuusiProductDropdown-versionPanel";
  const currentRow = createVersionRow(t.currentVersion(), `v${KUUSI_VERSION}`);
  const latestRow = createVersionRow(t.pypiLatestVersion(), "—");
  versionPanel.append(currentRow.row, latestRow.row);

  const versionTabBadge = document.createElement("span");
  versionTabBadge.className = "jp-KuusiProductDropdown-versionNew";
  versionTabBadge.textContent = t.newBadge();
  versionTabBadge.hidden = true;

  return {
    panel: versionPanel,
    latestValueEl: latestRow.valueEl,
    versionTabBadge,
  };
};

export const createKuusiAboutPanel = (t: KuusiTranslator): HTMLElement => {
  const aboutPanel = document.createElement("div");
  aboutPanel.className = "jp-KuusiProductDropdown-aboutPanel";
  const aboutText = document.createElement("p");
  aboutText.className = "jp-KuusiProductDropdown-aboutText";
  aboutText.textContent = t.aboutBlurb();
  aboutPanel.appendChild(aboutText);
  return aboutPanel;
};

export const createKuusiRepositoryPanel = (t: KuusiTranslator): HTMLElement => {
  const repositoryPanel = document.createElement("div");
  repositoryPanel.className = "jp-KuusiProductDropdown-repositoryPanel";
  repositoryPanel.append(
    createExternalLink("GitHub:", KUUSI_GITHUB_URL, t.openRepository()),
    createExternalLink("PyPI:", KUUSI_PYPI_URL, t.openPyPI()),
  );
  return repositoryPanel;
};

export const createKuusiCommunityPanel = (t: KuusiTranslator): HTMLElement => {
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
    createExternalLink(
      "Email:",
      `mailto:${KUUSI_COMMUNITY_EMAIL}`,
      t.openCommunityEmail(),
      KUUSI_COMMUNITY_EMAIL,
    ),
  );
  return communityPanel;
};

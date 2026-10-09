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

const writeClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the legacy path (insecure origins, older browsers).
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
};

/** A shell command in a monospace row with a Copy button. */
export const createCommandBlock = (
  command: string,
  t: KuusiTranslator,
): HTMLElement => {
  const row = document.createElement("div");
  row.className = "jp-KuusiUpgrade-command";

  const code = document.createElement("code");
  code.textContent = command;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "jp-KuusiUpgrade-copy";
  button.textContent = t.copy();
  button.setAttribute("aria-label", `${t.copy()}: ${command}`);

  let timer = 0;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    void writeClipboard(command).then((ok) => {
      if (!ok) {
        return;
      }

      button.textContent = t.copied();
      button.classList.add("is-copied");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        button.textContent = t.copy();
        button.classList.remove("is-copied");
      }, 1600);
    });
  });

  row.append(code, button);
  return row;
};

const createUpgradeStep = (
  index: number,
  title: string,
  ...content: Array<HTMLElement | string>
): HTMLElement => {
  const step = document.createElement("section");
  step.className = "jp-KuusiUpgrade-step";

  const badge = document.createElement("span");
  badge.className = "jp-KuusiUpgrade-num";
  badge.textContent = String(index);
  badge.setAttribute("aria-hidden", "true");

  const main = document.createElement("div");
  main.className = "jp-KuusiUpgrade-main";
  const heading = document.createElement("h3");
  heading.className = "jp-KuusiSettings-sectionTitle";
  heading.textContent = title;
  main.appendChild(heading);

  content.forEach((item) => {
    if (typeof item === "string") {
      const text = document.createElement("p");
      text.className = "jp-KuusiUpgrade-text";
      text.textContent = item;
      main.appendChild(text);
    } else {
      main.appendChild(item);
    }
  });

  step.append(badge, main);
  return step;
};

const createDetails = (
  summary: string,
  ...content: Array<HTMLElement | string>
): HTMLElement => {
  const details = document.createElement("details");
  details.className = "jp-KuusiUpgrade-details";
  const title = document.createElement("summary");
  title.textContent = summary;
  details.appendChild(title);

  content.forEach((item) => {
    if (typeof item === "string") {
      const text = document.createElement("p");
      text.className = "jp-KuusiUpgrade-text";
      text.textContent = item;
      details.appendChild(text);
    } else {
      details.appendChild(item);
    }
  });

  return details;
};

export const KUUSI_PIP_UPGRADE = "pip install -U jupyterlab-kuusi";

/** Settings → Upgrade: how to update Kuusi, step by step. */
export const createKuusiUpgradePanel = (t: KuusiTranslator): HTMLElement => {
  const panel = document.createElement("div");
  panel.className = "jp-KuusiUpgrade";

  const intro = document.createElement("p");
  intro.className = "jp-KuusiDefaultOpeners-intro";
  intro.textContent = t.upgradeIntro();
  panel.appendChild(intro);

  const isMac = /mac/i.test(navigator.platform || navigator.userAgent);

  panel.append(
    createUpgradeStep(
      1,
      t.upgradeInstall(),
      t.upgradeInstallHint(),
      createCommandBlock(KUUSI_PIP_UPGRADE, t),
      createDetails(
        t.upgradeOthers(),
        t.upgradeCondaHint(),
        createCommandBlock("conda activate <env>", t),
        createCommandBlock(KUUSI_PIP_UPGRADE, t),
        t.upgradeUvHint(),
        createCommandBlock("uv pip install -U jupyterlab-kuusi", t),
      ),
    ),
    createUpgradeStep(
      2,
      t.upgradeRestart(),
      t.upgradeRestartBody(),
      createCommandBlock("jupyter lab", t),
      isMac ? t.upgradeHardRefreshMac() : t.upgradeHardRefreshOther(),
    ),
    createUpgradeStep(
      3,
      t.upgradeVerify(),
      createCommandBlock("jupyter labextension list", t),
      t.upgradeVerifyBody(),
      createDetails(
        t.upgradeTrouble(),
        t.upgradeTroubleBody(),
        createCommandBlock("pip show jupyterlab-kuusi", t),
      ),
      createDetails(
        t.upgradeSource(),
        t.upgradeSourceBody(),
        createCommandBlock("git pull", t),
        createCommandBlock("npm run jlab:install", t),
      ),
    ),
  );

  return panel;
};

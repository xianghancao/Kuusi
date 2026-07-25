export type SecondaryMenuSectionDef<Id extends string> = {
  id: Id;
  label: string;
};

export type SecondaryMenuOptions<Id extends string> = {
  ariaLabel: string;
  sections: Array<SecondaryMenuSectionDef<Id>>;
  getActive: () => Id;
  setActive: (id: Id) => void;
  fillSection: (id: Id, panel: HTMLElement) => void;
  panelClassName?: string;
};

export type SecondaryMenuController<Id extends string> = {
  body: HTMLElement;
  setSection: (id: Id) => void;
  refresh: () => void;
  getActive: () => Id;
};

/**
 * Mount a left-nav + right-panel secondary menu into an empty dropdown shell.
 * Remembers the active tab via getActive/setActive across rebuilds.
 */
export const mountSecondaryMenu = <Id extends string>(
  menu: HTMLElement,
  options: SecondaryMenuOptions<Id>,
): SecondaryMenuController<Id> => {
  const { ariaLabel, sections, getActive, setActive, fillSection, panelClassName } =
    options;

  if (sections.length === 0) {
    throw new Error("Secondary menu requires at least one section");
  }

  const body = document.createElement("div");
  body.className = "jp-KuusiSecondaryMenu";

  const nav = document.createElement("div");
  nav.className = "jp-KuusiSecondaryMenu-nav";
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", ariaLabel);

  const panel = document.createElement("div");
  panel.className = panelClassName
    ? `jp-KuusiSecondaryMenu-panel ${panelClassName}`
    : "jp-KuusiSecondaryMenu-panel";
  panel.setAttribute("role", "tabpanel");

  const tabButtons = new Map<Id, HTMLButtonElement>();

  const resolveActive = (): Id => {
    const current = getActive();
    return sections.some((section) => section.id === current)
      ? current
      : sections[0].id;
  };

  const setSection = (id: Id) => {
    const alreadyActive = resolveActive() === id && panel.childElementCount > 0;
    setActive(id);
    tabButtons.forEach((button, tabId) => {
      const isActive = tabId === id;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    if (alreadyActive) {
      return;
    }

    panel.replaceChildren();
    fillSection(id, panel);
  };

  const refresh = () => {
    setActive(resolveActive());
    tabButtons.forEach((button, tabId) => {
      const isActive = tabId === resolveActive();
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    panel.replaceChildren();
    fillSection(resolveActive(), panel);
  };

  sections.forEach(({ id, label }) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "jp-KuusiSecondaryMenu-tab";
    tab.setAttribute("role", "tab");

    const labelEl = document.createElement("span");
    labelEl.className = "jp-KuusiSecondaryMenu-tabLabel";
    labelEl.textContent = label;
    tab.appendChild(labelEl);

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
  refresh();

  return {
    body,
    setSection,
    refresh,
    getActive: resolveActive,
  };
};

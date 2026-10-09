/**
 * Grouping rule for every capsule menu with a left-hand list of tabs
 * (Article, Mind Map, Book, ...):
 *
 *  1. Tabs that belong to one concern form a group; the left list shows a small
 *     caption for it (LAYOUT, SURFACE, LINE, ...).
 *  2. A rule is drawn between two groups (`.jp-KuusiSecondaryMenu-group` carries
 *     it), so groups never run together. The first group has no rule above it.
 *  3. Tab labels are short: the caption supplies the context. Do not prefix a
 *     label with its group ("Line · Width") or fake a separator.
 *  4. A menu with a single group needs no caption.
 *
 * Declare groups through `mountSecondaryMenu` (`sections[].group`) or, when one
 * capsule button merges several menus, `mountComposedSecondaryMenu`
 * (`groups[].label`). Both render the caption and rule below, so a menu cannot
 * drift from the rule by hand-rolling its own.
 */

/** Pointer must rest on a tab this long before it switches the panel. */
const TAB_HOVER_INTENT_MS = 120;

/**
 * Hover switches panels, but only after a short rest: moving diagonally from
 * the nav toward the panel no longer flashes through every tab on the way.
 * Click and keyboard focus still switch immediately.
 */
export const bindTabActivation = (
  tab: HTMLElement,
  activate: () => void,
): void => {
  let timer: number | null = null;

  const clear = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  tab.addEventListener("mouseenter", () => {
    clear();
    timer = window.setTimeout(() => {
      timer = null;
      activate();
    }, TAB_HOVER_INTENT_MS);
  });
  tab.addEventListener("mouseleave", clear);
  tab.addEventListener("focus", () => {
    clear();
    activate();
  });
  tab.addEventListener("click", (event) => {
    event.stopPropagation();
    clear();
    activate();
  });
};

/** Up / Down / Home / End move between tabs of a vertical tablist. */
export const bindTablistKeyboard = (nav: HTMLElement): void => {
  nav.addEventListener("keydown", (event) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];

    if (!keys.includes(event.key) || event.isComposing) {
      return;
    }

    const tabs = Array.from(
      nav.querySelectorAll<HTMLElement>(".jp-KuusiSecondaryMenu-tab"),
    );
    const current = tabs.indexOf(document.activeElement as HTMLElement);

    if (tabs.length === 0 || current < 0) {
      return;
    }

    let next = current;

    if (event.key === "ArrowDown") {
      next = (current + 1) % tabs.length;
    } else if (event.key === "ArrowUp") {
      next = (current - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      next = 0;
    } else {
      next = tabs.length - 1;
    }

    event.preventDefault();
    event.stopPropagation();
    tabs[next]!.focus();
  });
};

export type SecondaryMenuSectionDef<Id extends string> = {
  id: Id;
  label: string;
  /** Caption shown above the first tab of each run of same-group sections. */
  group?: string;
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
      // Roving tabindex: Tab enters the nav once, arrows move within it.
      button.tabIndex = isActive ? 0 : -1;
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
      button.tabIndex = isActive ? 0 : -1;
    });
    panel.replaceChildren();
    fillSection(resolveActive(), panel);
  };

  let previousGroup: string | undefined;

  sections.forEach(({ id, label, group }) => {
    if (group && group !== previousGroup) {
      const caption = document.createElement("div");
      caption.className = "jp-KuusiSecondaryMenu-group";
      caption.setAttribute("role", "presentation");
      caption.textContent = group;
      nav.appendChild(caption);
    }
    previousGroup = group;

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "jp-KuusiSecondaryMenu-tab";
    tab.setAttribute("role", "tab");

    const labelEl = document.createElement("span");
    labelEl.className = "jp-KuusiSecondaryMenu-tabLabel";
    labelEl.textContent = label;
    tab.appendChild(labelEl);

    bindTabActivation(tab, () => setSection(id));
    tabButtons.set(id, tab);
    nav.appendChild(tab);
  });

  bindTablistKeyboard(nav);
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

export type ComposedMenuGroup = {
  id: string;
  /** Caption that opens this group (with a rule above it unless it is first). Omit to continue the previous group. */
  label?: string;
  /** Mount an existing secondary menu into `host`. */
  mount: (host: HTMLElement) => unknown;
};

export type ComposedMenuOptions = {
  ariaLabel: string;
  groups: ComposedMenuGroup[];
  getActive: () => string;
  setActive: (id: string) => void;
};

/**
 * Merge several independently-mounted secondary menus into one left-nav,
 * so one capsule button can expose Line + Node + … without rewriting each menu.
 * Each group keeps its own panel and remembered tab; only one panel shows.
 */
export const mountComposedSecondaryMenu = (
  menu: HTMLElement,
  options: ComposedMenuOptions,
): void => {
  const { ariaLabel, groups, getActive, setActive } = options;
  const body = document.createElement("div");
  body.className = "jp-KuusiSecondaryMenu";

  const nav = document.createElement("div");
  nav.className = "jp-KuusiSecondaryMenu-nav";
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", ariaLabel);

  const panels = document.createElement("div");
  panels.style.display = "contents";

  type Mounted = { id: string; tabs: HTMLElement[]; panel: HTMLElement };
  const mounted: Mounted[] = [];

  groups.forEach((group) => {
    const host = document.createElement("div");
    group.mount(host);
    const tabs = Array.from(
      host.querySelectorAll<HTMLElement>(".jp-KuusiSecondaryMenu-tab"),
    );
    const panel = host.querySelector<HTMLElement>(
      ".jp-KuusiSecondaryMenu-panel",
    );

    if (!panel) {
      return;
    }

    // A labelled group opens with its caption (and the rule above it); an
    // unlabelled one continues the previous group.
    if (group.label) {
      const caption = document.createElement("div");
      caption.className = "jp-KuusiSecondaryMenu-group";
      caption.setAttribute("role", "presentation");
      caption.textContent = group.label;
      nav.appendChild(caption);
    }

    tabs.forEach((tab) => {
      const label = tab.querySelector(".jp-KuusiSecondaryMenu-tabLabel");

      if (label && group.label) {
        // The caption carries the group visually; keep it in the accessible name.
        tab.setAttribute(
          "aria-label",
          `${group.label} · ${label.textContent ?? ""}`,
        );
      }

      nav.appendChild(tab);
    });
    panels.appendChild(panel);
    mounted.push({ id: group.id, tabs, panel });
  });

  const show = (id: string): void => {
    mounted.forEach((entry) => {
      const active = entry.id === id;
      entry.panel.hidden = !active;

      if (!active) {
        entry.tabs.forEach((tab) => {
          tab.classList.remove("is-active");
          tab.setAttribute("aria-selected", "false");
        });
      }
    });
  };

  mounted.forEach((entry) => {
    const activate = (): void => {
      setActive(entry.id);
      show(entry.id);
    };

    entry.tabs.forEach((tab) => {
      bindTabActivation(tab, activate);
    });
  });

  const current = getActive();
  show(mounted.some((entry) => entry.id === current) ? current : mounted[0].id);

  bindTablistKeyboard(nav);
  body.append(nav, panels);
  menu.appendChild(body);
};

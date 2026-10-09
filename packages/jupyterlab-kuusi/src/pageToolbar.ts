import { createCapsuleDropdown } from "./capsuleDropdown";
import {
  closeKuusiDropdownMenus,
  setKuusiDropdownMenuAnchor,
} from "./formatToolbar";
import type { KuusiTranslator } from "./kuusiI18n";

/**
 * Logical slots inside the single left page capsule.
 * Add new groups at the end of PAGE_TOOLBAR_GROUP_ORDER when needed.
 */
export type PageToolbarGroupId = "brand" | "structure" | "appearance";

export const PAGE_TOOLBAR_GROUP_ORDER: PageToolbarGroupId[] = [
  "brand",
  "structure",
  "appearance",
];

export type PageToolbarItem = {
  /** Stable id for future extension hooks / overrides. */
  id: string;
  group: PageToolbarGroupId;
  /** Sort key within the group (lower first). */
  order?: number;
  create: () => HTMLElement;
};

export type PageToolbarOptions = {
  /**
   * Root whose dropdown menus this toolbar owns. When set, capsules that no
   * longer fit the header fold into a "…" menu instead of being clipped.
   */
  menuRoot?: HTMLElement;
  /** Width kept free at the header's right edge (e.g. the vertical Aa strip). */
  reserveRight?: number;
};

/** Hides a capsule (or divider) that has been folded into the "…" menu. */
const OVERFLOWED_CLASS = "is-toolbar-overflowed";

type ToolbarEntry = {
  item: PageToolbarItem;
  node: HTMLElement;
  /** The capsule's dropdown button; only capsules with one can be folded. */
  trigger: HTMLButtonElement | null;
};

export type PageToolbarHandle = {
  node: HTMLElement;
  /** Replace or append items later without rebuilding the whole header. */
  setItems: (items: PageToolbarItem[]) => void;
};

const createGroupDivider = (): HTMLElement => {
  const divider = document.createElement("span");
  divider.className = "jp-KuusiToolbarDivider";
  divider.setAttribute("aria-hidden", "true");
  return divider;
};

const sortItems = (items: PageToolbarItem[]): PageToolbarItem[] =>
  [...items].sort((left, right) => {
    const groupDelta =
      PAGE_TOOLBAR_GROUP_ORDER.indexOf(left.group) -
      PAGE_TOOLBAR_GROUP_ORDER.indexOf(right.group);

    if (groupDelta !== 0) {
      return groupDelta;
    }

    return (left.order ?? 0) - (right.order ?? 0);
  });

/**
 * One glass capsule with ordered groups and thin dividers between groups.
 * Future controls: push another {@link PageToolbarItem} into the matching group.
 *
 * Overflow: capsules of the `appearance` group fold into a trailing "…" menu,
 * last first, when the header is too narrow. Opening one from "…" shows its own
 * menu anchored to the "…" button, so every view (Article, Book, Slides,
 * Mind Map) shares the behaviour.
 */
export const createPageToolbar = (
  items: PageToolbarItem[],
  t: KuusiTranslator,
  ariaLabel?: string,
  options: PageToolbarOptions = {},
): PageToolbarHandle => {
  const { menuRoot, reserveRight = 0 } = options;
  const cluster = document.createElement("div");
  cluster.className =
    "jp-KuusiToolbarCluster jp-KuusiToolbarCluster--page";
  cluster.setAttribute("role", "toolbar");
  cluster.setAttribute("aria-label", ariaLabel ?? t.pageControls());

  let entries: ToolbarEntry[] = [];
  let dividers: Array<{ el: HTMLElement; following: ToolbarEntry[] }> = [];
  let overflowEl: HTMLElement | null = null;
  let overflowTrigger: HTMLElement | null = null;

  const isFoldable = (entry: ToolbarEntry): boolean =>
    entry.trigger !== null && entry.item.group === "appearance";

  const entryLabel = (entry: ToolbarEntry): string =>
    entry.trigger?.textContent?.trim() ||
    entry.trigger?.getAttribute("aria-label") ||
    entry.item.id;

  const isFolded = (entry: ToolbarEntry): boolean =>
    entry.node.classList.contains(OVERFLOWED_CLASS);

  const openFolded = (entry: ToolbarEntry): void => {
    if (!menuRoot || !entry.trigger) {
      return;
    }

    closeKuusiDropdownMenus(menuRoot);
    const menu =
      entry.trigger.parentElement?.querySelector<HTMLElement>(
        ":scope > [role='menu']",
      ) ?? null;
    // The capsule's own trigger is hidden: open it, then hang its menu off "…".
    entry.trigger.click();

    if (menu && overflowTrigger) {
      setKuusiDropdownMenuAnchor(menu, overflowTrigger);
    }
  };

  const createOverflow = (): HTMLElement =>
    createCapsuleDropdown(menuRoot!, {
      toolbarClass: "jp-KuusiToolbarOverflow",
      dropdownClass: "jp-KuusiToolbarOverflow-dropdown",
      triggerClass: "jp-KuusiToolbarOverflow-btn",
      ariaLabel: t.moreTools(),
      triggerLabel: "…",
      menuClassName:
        "jp-KuusiFormatDropdown-menu jp-KuusiToolbarOverflow-menu",
      fillMenu: (menu) => {
        entries.filter(isFolded).forEach((entry) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "jp-KuusiFormatDropdown-item";
          button.setAttribute("role", "menuitem");
          button.textContent = entryLabel(entry);
          button.addEventListener("pointerdown", (event) => {
            event.stopPropagation();
          });
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            openFolded(entry);
          });
          menu.appendChild(button);
        });
      },
    });

  const render = (nextItems: PageToolbarItem[]) => {
    cluster.replaceChildren();
    entries = [];
    dividers = [];
    const sorted = sortItems(nextItems);
    let previousGroup: PageToolbarGroupId | null = null;
    let pendingDivider: HTMLElement | null = null;

    sorted.forEach((item) => {
      if (previousGroup !== null && item.group !== previousGroup) {
        pendingDivider = createGroupDivider();
        cluster.appendChild(pendingDivider);
        dividers.push({ el: pendingDivider, following: [] });
      }

      const node = item.create();
      cluster.appendChild(node);
      const entry: ToolbarEntry = {
        item,
        node,
        trigger: node.querySelector<HTMLButtonElement>(
          "button[aria-haspopup]",
        ),
      };
      entries.push(entry);
      dividers[dividers.length - 1]?.following.push(entry);
      previousGroup = item.group;
    });

    if (menuRoot) {
      overflowEl = createOverflow();
      overflowEl.classList.add(OVERFLOWED_CLASS);
      overflowTrigger = overflowEl.querySelector<HTMLElement>(
        "button[aria-haspopup]",
      );
      cluster.appendChild(overflowEl);
      schedule();
    }
  };

  const fullWidth = (): number =>
    cluster.scrollWidth + (cluster.offsetWidth - cluster.clientWidth);

  const sync = (): void => {
    frame = 0;
    const header = cluster.closest("header");

    if (!menuRoot || !overflowEl || !header || header.clientWidth <= 0) {
      return;
    }

    const styles = getComputedStyle(header);
    const available =
      header.clientWidth -
      (Number.parseFloat(styles.paddingLeft) || 0) -
      (Number.parseFloat(styles.paddingRight) || 0) -
      reserveRight;
    const foldable = entries.filter(isFoldable);
    const before = foldable.filter(isFolded).map((entry) => entry.item.id);

    // Start from everything shown, then fold from the end until it fits.
    foldable.forEach((entry) => entry.node.classList.remove(OVERFLOWED_CLASS));
    overflowEl.classList.add(OVERFLOWED_CLASS);

    if (fullWidth() > available && foldable.length > 0) {
      overflowEl.classList.remove(OVERFLOWED_CLASS);

      for (let i = foldable.length - 1; i >= 0; i -= 1) {
        if (fullWidth() <= available) {
          break;
        }

        foldable[i].node.classList.add(OVERFLOWED_CLASS);
      }
    }

    // A divider is only useful while something follows it.
    dividers.forEach(({ el, following }) => {
      el.classList.toggle(
        OVERFLOWED_CLASS,
        following.every((entry) => isFolded(entry)),
      );
    });

    const after = foldable.filter(isFolded).map((entry) => entry.item.id);

    if (before.join() !== after.join()) {
      // The anchor of an open menu may have just been folded away.
      closeKuusiDropdownMenus(menuRoot);
    }
  };

  let frame = 0;
  let observer: ResizeObserver | null = null;
  let attachTries = 0;

  function schedule(): void {
    if (!menuRoot || frame) {
      return;
    }

    frame = window.requestAnimationFrame(sync);
  }

  const attach = (): void => {
    const header = cluster.closest("header");

    if (!header) {
      if (attachTries < 240) {
        attachTries += 1;
        window.requestAnimationFrame(attach);
      }
      return;
    }

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        if (!cluster.isConnected) {
          observer?.disconnect();
          return;
        }
        schedule();
      });
      observer.observe(header);
    }

    schedule();
    // Web fonts change label widths after the first measurement.
    void document.fonts?.ready.then(schedule);
  };

  render(items);

  if (menuRoot) {
    window.requestAnimationFrame(attach);
  }

  return {
    node: cluster,
    setItems: render,
  };
};

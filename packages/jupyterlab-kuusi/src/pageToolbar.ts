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
 */
export const createPageToolbar = (
  items: PageToolbarItem[],
  t: KuusiTranslator,
): PageToolbarHandle => {
  const cluster = document.createElement("div");
  cluster.className =
    "jp-KuusiToolbarCluster jp-KuusiToolbarCluster--page";
  cluster.setAttribute("role", "toolbar");
  cluster.setAttribute("aria-label", t.pageControls());

  const render = (nextItems: PageToolbarItem[]) => {
    cluster.replaceChildren();
    const sorted = sortItems(nextItems);
    let previousGroup: PageToolbarGroupId | null = null;

    sorted.forEach((item) => {
      if (previousGroup !== null && item.group !== previousGroup) {
        cluster.appendChild(createGroupDivider());
      }

      cluster.appendChild(item.create());
      previousGroup = item.group;
    });
  };

  render(items);

  return {
    node: cluster,
    setItems: render,
  };
};

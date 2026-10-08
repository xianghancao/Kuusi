import { type LayoutDensity, type TreeDirection } from "kuusi-kernel";

import { fillBackgroundMenu } from "./backgroundToolbar";
import type {
  MindMapBackgroundDisplayOptions,
  MindMapBackgroundState,
} from "./backgroundToolbar";
import { CAPSULE_MENU_SECONDARY, createCapsuleDropdown } from "./capsuleDropdown";
import { appendMenuFooterAction } from "./menuFooter";
import type { KuusiTranslator } from "./kuusiI18n";
import { fillLayoutMenu, type LayoutSpacingState } from "./layoutToolbar";
import { renderPanelWidgets } from "./panelWidgets";
import { fillViewBehaviorMenu, type ViewBehaviorApi } from "./viewBehaviorMenu";
import {
  mountComposedSecondaryMenu,
  mountSecondaryMenu,
} from "./secondaryMenu";

export type MindMapLayoutCapsuleApi = {
  getTreeDirection: () => TreeDirection;
  onTreeDirectionChange: (direction: TreeDirection) => void;
  directionOptions: Array<{
    value: TreeDirection;
    label: string;
    title: string;
  }>;
  getLayoutState: () => LayoutSpacingState;
  onDensityChange: (density: LayoutDensity) => void;
  onGapChange: (gaps: { siblingGap?: number; childGap?: number }) => void;
  getBackgroundState: () => MindMapBackgroundState;
  onBackgroundChange: (state: MindMapBackgroundState) => void;
  backgroundDisplay?: MindMapBackgroundDisplayOptions;
  /** Zoom range, mouse wheel, and open-view behavior. */
  viewBehavior?: ViewBehaviorApi;
  /** Dot + "reset" for the menu's settings versus the theme defaults. */
  customization?: {
    isCustomized: () => boolean;
    reset: () => void;
    connect: (listener: () => void) => { disconnect: () => void };
  };
};

let lastLayoutGroup = "tree";

/** Layout: tree direction · density / spacing · canvas background. */
export const createMindMapLayoutToolbar = (
  root: HTMLElement,
  api: MindMapLayoutCapsuleApi,
  t: KuusiTranslator,
): HTMLElement =>
  createCapsuleDropdown(root, {
    toolbarClass: "jp-KuusiNotebookMindMap-layout-toolbar",
    dropdownClass: "jp-KuusiLayoutDropdown",
    triggerClass: "jp-KuusiLayoutDropdown-trigger",
    ariaLabel: t.nodeLayoutSpacing(),
    triggerLabel: t.layout(),
    menuClassName: CAPSULE_MENU_SECONDARY,
    isCustomized: api.customization?.isCustomized,
    connectSync: api.customization?.connect,
    footer: (menu, rebuild) => {
      const customization = api.customization;

      if (!customization) {
        return;
      }

      appendMenuFooterAction(menu, {
        label: t.resetPageSettings(),
        title: t.resetPageSettingsTitle(),
        disabled: !customization.isCustomized(),
        onClick: () => {
          customization.reset();
          rebuild();
        },
      });
    },
    fillMenu: (menu, rebuild) => {
      mountComposedSecondaryMenu(menu, {
        ariaLabel: t.nodeLayoutSpacing(),
        getActive: () => lastLayoutGroup,
        setActive: (id) => {
          lastLayoutGroup = id;
        },
        groups: [
          {
            id: "tree",
            mount: (host) =>
              mountSecondaryMenu(host, {
                ariaLabel: t.tree(),
                sections: [{ id: "direction", label: t.tree() }],
                getActive: () => "direction",
                setActive: () => undefined,
                fillSection: (_id, panel) => {
                  renderPanelWidgets(panel, [
                    {
                      kind: "choice",
                      value: api.getTreeDirection(),
                      options: api.directionOptions,
                      onChange: (value) => {
                        api.onTreeDirectionChange(value as TreeDirection);
                        rebuild();
                      },
                    },
                  ]);
                },
              }),
          },
          {
            id: "layout",
            mount: (host) =>
              fillLayoutMenu(
                host,
                api.getLayoutState,
                api.onDensityChange,
                api.onGapChange,
                t,
                rebuild,
              ),
          },
          ...(api.viewBehavior
            ? [
                {
                  id: "view",
                  label: t.viewBehavior(),
                  mount: (host: HTMLElement) =>
                    fillViewBehaviorMenu(host, api.viewBehavior!, t, rebuild),
                },
              ]
            : []),
          {
            id: "background",
            label: t.background(),
            mount: (host) =>
              fillBackgroundMenu(
                host,
                api.getBackgroundState,
                api.onBackgroundChange,
                t,
                rebuild,
                api.backgroundDisplay,
              ),
          },
        ],
      });
    },
  });

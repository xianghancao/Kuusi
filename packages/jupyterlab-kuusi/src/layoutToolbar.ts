import type { KuusiTranslator } from "./kuusiI18n";
import {
  LAYOUT_CHILD_GAP,
  LAYOUT_SIBLING_GAP,
  type LayoutDensity,
} from "kuusi-kernel";
import { closeKuusiDropdownMenus, openKuusiDropdownMenu } from "./formatToolbar";
import { renderPanelWidgets } from "./panelWidgets";
import { mountSecondaryMenu } from "./secondaryMenu";

export type LayoutSpacingState = {
  density: LayoutDensity;
  siblingGap: number;
  childGap: number;
};

type LayoutSection = "density" | "spacing";

let lastLayoutSection: LayoutSection = "density";

const createDensityPreview = (previewClass: string): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = `jp-KuusiLayoutDropdown-preview ${previewClass}`;
  preview.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 3; index += 1) {
    const bar = document.createElement("span");
    bar.className = "jp-KuusiLayoutDropdown-previewBar";
    preview.appendChild(bar);
  }

  return preview;
};

const getLayoutDensities = (
  t: KuusiTranslator,
): Array<{
  value: LayoutDensity;
  label: string;
  title: string;
  previewClass: string;
}> => [
  {
    value: "compact",
    label: "Compact",
    title: t.compactLayout(),
    previewClass: "jp-KuusiLayoutDropdown-preview-compact",
  },
  {
    value: "normal",
    label: "Normal",
    title: t.normalLayout(),
    previewClass: "jp-KuusiLayoutDropdown-preview-normal",
  },
  {
    value: "loose",
    label: "Loose",
    title: t.looseLayout(),
    previewClass: "jp-KuusiLayoutDropdown-preview-loose",
  },
];

export const createLayoutToolbar = (
  root: HTMLElement,
  getState: () => LayoutSpacingState,
  onDensityChange: (density: LayoutDensity) => void,
  onGapChange: (gaps: { siblingGap?: number; childGap?: number }) => void,
  t: KuusiTranslator,
): HTMLElement => {
  const toolbar = document.createElement("div");
  toolbar.className = "jp-KuusiNotebookMindMap-layout-toolbar";

  const dropdown = document.createElement("div");
  dropdown.className = "jp-KuusiFormatDropdown jp-KuusiLayoutDropdown";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className =
    "jp-KuusiNotebookMindMap-format-btn jp-KuusiLayoutDropdown-trigger";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-label", t.nodeLayoutSpacing());
  trigger.title = t.nodeLayoutSpacing();
  trigger.textContent = t.layout();

  const menu = document.createElement("div");
  menu.className =
    "jp-KuusiFormatDropdown-menu jp-KuusiLayoutDropdown-menu jp-KuusiSecondaryMenu-host";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t.nodeLayoutSpacing());

  const rebuildMenu = () => {
    menu.replaceChildren();
    mountSecondaryMenu(menu, {
      ariaLabel: t.nodeLayoutSpacing(),
      sections: [
        { id: "density", label: t.density() },
        { id: "spacing", label: t.spacing() },
      ],
      getActive: () => lastLayoutSection,
      setActive: (id) => {
        lastLayoutSection = id;
      },
      fillSection: (id, panel) => {
        const state = getState();

        if (id === "density") {
          renderPanelWidgets(panel, [
            {
              kind: "choice",
              value: state.density,
              options: getLayoutDensities(t).map(
                ({ value, label, title, previewClass }) => ({
                  value,
                  label,
                  title,
                  preview: () => createDensityPreview(previewClass),
                }),
              ),
              onChange: (value) => {
                onDensityChange(value as LayoutDensity);
                rebuildMenu();
              },
            },
          ]);
          return;
        }

        renderPanelWidgets(panel, [
          {
            kind: "slider",
            label: t.siblingGap(),
            value: state.siblingGap,
            min: LAYOUT_SIBLING_GAP.min,
            max: LAYOUT_SIBLING_GAP.max,
            onChange: (siblingGap) => {
              onGapChange({ siblingGap });
            },
          },
          {
            kind: "slider",
            label: t.childGap(),
            value: state.childGap,
            min: LAYOUT_CHILD_GAP.min,
            max: LAYOUT_CHILD_GAP.max,
            onChange: (childGap) => {
              onGapChange({ childGap });
            },
          },
        ]);
      },
    });
  };

  rebuildMenu();

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.contains("is-open");
    closeKuusiDropdownMenus(root);

    if (!isOpen) {
      rebuildMenu();
      openKuusiDropdownMenu(menu, root);
    }
  });

  dropdown.append(trigger, menu);
  toolbar.appendChild(dropdown);

  return toolbar;
};

import { BACKGROUND_COLOR_SWATCHES } from "./colorPicker";
import type { KuusiTranslator } from "./kuusiI18n";
import { closeKuusiDropdownMenus, openKuusiDropdownMenu } from "./formatToolbar";
import { renderPanelWidgets } from "./panelWidgets";
import { mountSecondaryMenu } from "./secondaryMenu";

/** Texture / fill pattern — independent of canvas color. */
export type MindMapBackgroundPattern =
  | "none"
  | "plain"
  | "grid"
  | "grid-dense"
  | "dots"
  | "dots-dense"
  | "gradient";

/** Canvas color theme — independent of pattern. */
export type MindMapBackground =
  | "default"
  | "eye-care"
  | "newspaper"
  | "business-blue"
  | "sea-blue"
  | "tech-blue"
  | "grass-green"
  | "avocado"
  | "stone-gray"
  | "red-wall"
  | "ink"
  | "custom";

export const DEFAULT_MIND_MAP_BACKGROUND: MindMapBackground = "default";

export const DEFAULT_MIND_MAP_BACKGROUND_PATTERN: MindMapBackgroundPattern =
  "none";

export const DEFAULT_MIND_MAP_BACKGROUND_COLOR = "#d6ecff";

export const LEGACY_BACKGROUND_PATTERNS = [
  "plain",
  "grid",
  "dots",
  "gradient",
] as const;

export type MindMapBackgroundState = {
  background: MindMapBackground;
  backgroundPattern: MindMapBackgroundPattern;
  backgroundColor: string;
};

type BackgroundSection = "pattern" | "color" | "custom";

let lastBackgroundSection: BackgroundSection = "pattern";

const createPatternPreview = (value: MindMapBackgroundPattern): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = "jp-KuusiBackgroundDropdown-preview";
  preview.dataset.kuusiBackgroundPatternPreview = value;
  preview.setAttribute("aria-hidden", "true");
  return preview;
};

const createColorPreview = (
  value: MindMapBackground,
  customColor: string,
): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = "jp-KuusiBackgroundDropdown-preview";
  preview.dataset.kuusiBackgroundPreview = value;
  preview.setAttribute("aria-hidden", "true");

  if (value === "custom" && customColor) {
    preview.style.background = customColor;
  }

  return preview;
};

const getBackgroundPatterns = (
  t: KuusiTranslator,
): Array<{
  value: MindMapBackgroundPattern;
  label: string;
  title: string;
}> => [
  {
    value: "none",
    label: t.backgroundPatternNone(),
    title: t.backgroundPatternNoneTitle(),
  },
  {
    value: "plain",
    label: t.backgroundPlain(),
    title: t.backgroundPlainTitle(),
  },
  {
    value: "grid",
    label: t.backgroundGrid(),
    title: t.backgroundGridTitle(),
  },
  {
    value: "grid-dense",
    label: t.backgroundGridDense(),
    title: t.backgroundGridDenseTitle(),
  },
  {
    value: "dots",
    label: t.backgroundDots(),
    title: t.backgroundDotsTitle(),
  },
  {
    value: "dots-dense",
    label: t.backgroundDotsDense(),
    title: t.backgroundDotsDenseTitle(),
  },
  {
    value: "gradient",
    label: t.backgroundGradient(),
    title: t.backgroundGradientTitle(),
  },
];

const getMindMapBackgrounds = (
  t: KuusiTranslator,
): Array<{
  value: MindMapBackground;
  label: string;
  title: string;
}> => [
  {
    value: "default",
    label: t.backgroundDefault(),
    title: t.backgroundDefaultTitle(),
  },
  {
    value: "business-blue",
    label: t.backgroundBusinessBlue(),
    title: t.backgroundBusinessBlueTitle(),
  },
  {
    value: "tech-blue",
    label: t.backgroundTechBlue(),
    title: t.backgroundTechBlueTitle(),
  },
  {
    value: "eye-care",
    label: t.backgroundEyeCare(),
    title: t.backgroundEyeCareTitle(),
  },
  {
    value: "newspaper",
    label: t.backgroundNewspaper(),
    title: t.backgroundNewspaperTitle(),
  },
  {
    value: "sea-blue",
    label: t.backgroundSeaBlue(),
    title: t.backgroundSeaBlueTitle(),
  },
  {
    value: "grass-green",
    label: t.backgroundGrassGreen(),
    title: t.backgroundGrassGreenTitle(),
  },
  {
    value: "avocado",
    label: t.backgroundAvocado(),
    title: t.backgroundAvocadoTitle(),
  },
  {
    value: "stone-gray",
    label: t.backgroundStoneGray(),
    title: t.backgroundStoneGrayTitle(),
  },
  {
    value: "red-wall",
    label: t.backgroundRedWall(),
    title: t.backgroundRedWallTitle(),
  },
  {
    value: "ink",
    label: t.backgroundInk(),
    title: t.backgroundInkTitle(),
  },
];

export const applyBackgroundToViewport = (
  viewport: HTMLElement,
  background: MindMapBackground,
  backgroundPattern: MindMapBackgroundPattern,
  customColor = "",
): void => {
  viewport.dataset.kuusiBackground = background;
  viewport.dataset.kuusiBackgroundPattern = backgroundPattern;

  if (background === "custom" && customColor) {
    viewport.style.setProperty("--kuusi-background-custom-color", customColor);
  } else {
    viewport.style.removeProperty("--kuusi-background-custom-color");
  }
};

export const fillBackgroundMenu = (
  menu: HTMLElement,
  getBackgroundState: () => MindMapBackgroundState,
  onChange: (state: MindMapBackgroundState) => void,
  t: KuusiTranslator,
  onRebuild: () => void,
): void => {
  mountSecondaryMenu(menu, {
    ariaLabel: t.canvasBackground(),
    sections: [
      { id: "pattern", label: t.backgroundPattern() },
      { id: "color", label: t.backgroundColor() },
      { id: "custom", label: t.backgroundCustomColor() },
    ],
    getActive: () => lastBackgroundSection,
    setActive: (id) => {
      lastBackgroundSection = id;
    },
    fillSection: (id, panel) => {
      const { background, backgroundPattern, backgroundColor } =
        getBackgroundState();

      if (id === "pattern") {
        renderPanelWidgets(panel, [
          {
            kind: "choice",
            value: backgroundPattern,
            options: getBackgroundPatterns(t).map(({ value, label, title }) => ({
              value,
              label,
              title,
              preview: () => createPatternPreview(value),
            })),
            onChange: (value) => {
              onChange({
                background,
                backgroundPattern: value as MindMapBackgroundPattern,
                backgroundColor,
              });
              onRebuild();
            },
          },
        ]);
        return;
      }

      if (id === "color") {
        renderPanelWidgets(panel, [
          {
            kind: "choice",
            value: background,
            options: getMindMapBackgrounds(t).map(({ value, label, title }) => ({
              value,
              label,
              title,
              preview: () => createColorPreview(value, backgroundColor),
            })),
            onChange: (value) => {
              onChange({
                background: value as MindMapBackground,
                backgroundPattern,
                backgroundColor,
              });
              onRebuild();
            },
          },
        ]);
        return;
      }

      renderPanelWidgets(panel, [
        {
          kind: "color",
          sectionLabel: t.backgroundCustomColor(),
          value: background === "custom" ? backgroundColor : "",
          swatches: BACKGROUND_COLOR_SWATCHES,
          customDefault: backgroundColor || DEFAULT_MIND_MAP_BACKGROUND_COLOR,
          customInputId: "jp-KuusiBackgroundColorCustom-input",
          onChange: (color) => {
            onChange({
              background: "custom",
              backgroundPattern,
              backgroundColor: color || DEFAULT_MIND_MAP_BACKGROUND_COLOR,
            });
            onRebuild();
          },
        },
      ]);
    },
  });
};

export const createBackgroundToolbar = (
  root: HTMLElement,
  getBackgroundState: () => MindMapBackgroundState,
  onChange: (state: MindMapBackgroundState) => void,
  t: KuusiTranslator,
): HTMLElement => {
  const toolbar = document.createElement("div");
  toolbar.className = "jp-KuusiNotebookMindMap-background-toolbar";

  const dropdown = document.createElement("div");
  dropdown.className = "jp-KuusiFormatDropdown jp-KuusiBackgroundDropdown";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className =
    "jp-KuusiNotebookMindMap-format-btn jp-KuusiBackgroundDropdown-trigger";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-label", t.canvasBackground());
  trigger.title = t.canvasBackground();
  trigger.textContent = t.background();

  const menu = document.createElement("div");
  menu.className =
    "jp-KuusiFormatDropdown-menu jp-KuusiBackgroundDropdown-menu jp-KuusiSecondaryMenu-host";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t.canvasBackground());

  const rebuildMenu = () => {
    menu.replaceChildren();
    fillBackgroundMenu(menu, getBackgroundState, onChange, t, rebuildMenu);
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

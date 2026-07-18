import {
  appendColorPickerSection,
  BACKGROUND_COLOR_SWATCHES,
} from "./colorPicker";
import type { KuusiTranslator } from "./kuusiI18n";
import {
  appendDropdownSection,
  closeKuusiDropdownMenus,
  createDropdownOptionRow,
} from "./formatToolbar";

/** Texture / fill pattern — independent of canvas color. */
export type MindMapBackgroundPattern =
  | "none"
  | "plain"
  | "grid"
  | "dots"
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
    value: "dots",
    label: t.backgroundDots(),
    title: t.backgroundDotsTitle(),
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
    "jp-KuusiFormatDropdown-menu jp-KuusiBackgroundDropdown-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t.canvasBackground());

  const rebuildMenu = () => {
    menu.replaceChildren();
    const { background, backgroundPattern, backgroundColor } =
      getBackgroundState();

    appendDropdownSection(menu, t.backgroundPattern());
    const patternRow = createDropdownOptionRow(menu);

    getBackgroundPatterns(t).forEach(({ value, label, title }) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className =
        "jp-KuusiFormatDropdown-item jp-KuusiBackgroundDropdown-item";
      item.setAttribute("role", "menuitem");
      item.setAttribute("aria-label", title);
      item.title = title;
      item.classList.toggle("is-active", backgroundPattern === value);

      const labelEl = document.createElement("span");
      labelEl.className = "jp-KuusiBackgroundDropdown-label";
      labelEl.textContent = label;
      item.appendChild(labelEl);
      item.appendChild(createPatternPreview(value));

      item.addEventListener("click", (event) => {
        event.stopPropagation();
        onChange({ background, backgroundPattern: value, backgroundColor });
        rebuildMenu();
      });
      patternRow.appendChild(item);
    });

    appendDropdownSection(menu, t.backgroundColor());
    const colorRow = createDropdownOptionRow(menu);

    getMindMapBackgrounds(t).forEach(({ value, label, title }) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className =
        "jp-KuusiFormatDropdown-item jp-KuusiBackgroundDropdown-item";
      item.setAttribute("role", "menuitem");
      item.setAttribute("aria-label", title);
      item.title = title;
      item.classList.toggle("is-active", background === value);

      const labelEl = document.createElement("span");
      labelEl.className = "jp-KuusiBackgroundDropdown-label";
      labelEl.textContent = label;
      item.appendChild(labelEl);
      item.appendChild(createColorPreview(value, backgroundColor));

      item.addEventListener("click", (event) => {
        event.stopPropagation();
        onChange({ background: value, backgroundPattern, backgroundColor });
        rebuildMenu();
      });
      colorRow.appendChild(item);
    });

    appendColorPickerSection(
      menu,
      t.backgroundCustomColor(),
      background === "custom" ? backgroundColor : "",
      (color) => {
        onChange({
          background: "custom",
          backgroundPattern,
          backgroundColor: color || DEFAULT_MIND_MAP_BACKGROUND_COLOR,
        });
        rebuildMenu();
      },
      BACKGROUND_COLOR_SWATCHES,
      {
        customDefault: backgroundColor || DEFAULT_MIND_MAP_BACKGROUND_COLOR,
        customInputId: "jp-KuusiBackgroundColorCustom-input",
      },
    );
  };

  rebuildMenu();

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.contains("is-open");
    closeKuusiDropdownMenus(root);

    if (!isOpen) {
      menu.classList.add("is-open");
    }
  });

  document.addEventListener("click", () => {
    closeKuusiDropdownMenus(root);
  });

  dropdown.append(trigger, menu);
  toolbar.appendChild(dropdown);

  return toolbar;
};

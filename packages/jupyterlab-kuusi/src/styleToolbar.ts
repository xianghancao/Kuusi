import type { AppearanceSettings } from "./appearanceToolbar";
import { DEFAULT_APPEARANCE } from "./appearanceToolbar";
import type {
  MindMapBackground,
  MindMapBackgroundPattern,
} from "./backgroundToolbar";
import type { MindMapFont, MindMapFontSize } from "./fontToolbar";
import type { KuusiTranslator } from "./kuusiI18n";
import { closeKuusiDropdownMenus, createDropdownOptionRow } from "./formatToolbar";

/**
 * Theme presets stamp Line / Node / Background / Font menu parameters.
 * Ids are stable for settings persistence.
 */
export type MindMapTheme =
  | "notebook"
  | "soft"
  | "outline"
  | "paper"
  | "board"
  | "black"
  | "minimal";

export const DEFAULT_MIND_MAP_THEME: MindMapTheme = "notebook";

export type ThemePresetSettings = {
  appearance: AppearanceSettings;
  background: MindMapBackground;
  backgroundPattern: MindMapBackgroundPattern;
  editFont: MindMapFont;
  displayFont: MindMapFont;
  editFontSize: MindMapFontSize;
  displayFontSize: MindMapFontSize;
};

type ThemeOption = {
  value: MindMapTheme;
  label: string;
  title: string;
};

const MIND_MAP_THEMES: ThemeOption[] = [
  {
    value: "notebook",
    label: "Notebook",
    title: "Follow Jupyter defaults — clean cards and connectors",
  },
  {
    value: "soft",
    label: "Soft",
    title: "Rounded cards, light borders, eye-care canvas with dots",
  },
  {
    value: "outline",
    label: "Outline",
    title: "Strong blue borders and arrows on a grid for clarity",
  },
  {
    value: "paper",
    label: "Paper",
    title: "Newspaper canvas with serif type for reading",
  },
  {
    value: "board",
    label: "Board",
    title: "Presentation board — blue canvas, white cards, child arrows",
  },
  {
    value: "black",
    label: "Black",
    title: "Dark stage — ink canvas, charcoal cards, soft light edges",
  },
  {
    value: "minimal",
    label: "Minimal",
    title: "Thin lines, sharp corners, plain canvas",
  },
];

const appearance = (
  partial: Partial<AppearanceSettings>,
): AppearanceSettings => ({
  ...DEFAULT_APPEARANCE,
  ...partial,
});

const THEME_PRESETS: Record<MindMapTheme, ThemePresetSettings> = {
  notebook: {
    appearance: appearance({}),
    background: "default",
    backgroundPattern: "none",
    editFont: "notebook",
    displayFont: "notebook",
    editFontSize: "md",
    displayFontSize: "md",
  },
  soft: {
    appearance: appearance({
      edgeWidth: "2pt",
      edgeColor: "#90a4ae",
      nodeFillColor: "",
      nodeBorderColor: "#cfd8dc",
      nodeBorderCorner: "rounded",
      nodeBorderRadius: "16px",
      selectionGlowWidth: "3px",
    }),
    background: "eye-care",
    backgroundPattern: "dots",
    editFont: "system-ui",
    displayFont: "system-ui",
    editFontSize: "md",
    displayFontSize: "md",
  },
  outline: {
    appearance: appearance({
      edgeStyle: "solid",
      edgeWidth: "3pt",
      edgeColor: "#1976d2",
      edgeArrowDirection: "end",
      edgeArrowStyle: "triangle",
      nodeBorderColor: "#1976d2",
      nodeBorderWidth: "2px",
      nodeBorderCorner: "rounded",
      nodeBorderRadius: "6px",
      selectionGlowColor: "#1976d2",
      selectionGlowWidth: "3px",
    }),
    background: "default",
    backgroundPattern: "grid",
    editFont: "system-ui",
    displayFont: "system-ui",
    editFontSize: "md",
    displayFontSize: "md",
  },
  paper: {
    appearance: appearance({
      edgeWidth: "2pt",
      edgeColor: "#8d6e63",
      nodeBorderColor: "#bcaaa4",
      nodeBorderCorner: "rounded",
      nodeBorderRadius: "8px",
      selectionGlowColor: "#6d4c41",
      selectionGlowWidth: "2px",
    }),
    background: "newspaper",
    backgroundPattern: "none",
    editFont: "georgia",
    displayFont: "georgia",
    editFontSize: "md",
    displayFontSize: "md",
  },
  board: {
    appearance: appearance({
      edgeWidth: "3pt",
      edgeColor: "#1565c0",
      edgeArrowDirection: "end",
      edgeArrowStyle: "stealth",
      nodeFillColor: "#ffffff",
      nodeBorderColor: "#90caf9",
      nodeBorderCorner: "rounded",
      nodeBorderRadius: "12px",
      selectionGlowColor: "#1565c0",
      selectionGlowWidth: "3px",
    }),
    background: "business-blue",
    backgroundPattern: "grid",
    editFont: "segoe-ui",
    displayFont: "segoe-ui",
    editFontSize: "md",
    displayFontSize: "md",
  },
  black: {
    appearance: appearance({
      edgeWidth: "2pt",
      edgeColor: "#9e9e9e",
      edgeArrowDirection: "end",
      edgeArrowStyle: "stealth",
      nodeFillColor: "#1c1c1c",
      nodeBorderColor: "#424242",
      nodeBorderCorner: "rounded",
      nodeBorderRadius: "10px",
      selectionGlowColor: "#64b5f6",
      selectionGlowWidth: "3px",
    }),
    background: "ink",
    backgroundPattern: "dots",
    editFont: "system-ui",
    displayFont: "system-ui",
    editFontSize: "md",
    displayFontSize: "md",
  },
  minimal: {
    appearance: appearance({
      edgeWidth: "1pt",
      edgeColor: "#bdbdbd",
      edgeArrowDirection: "none",
      nodeFillColor: "",
      nodeBorderColor: "#e0e0e0",
      nodeBorderWidth: "1px",
      nodeBorderCorner: "sharp",
      nodeBorderRadius: "4px",
      selectionGlowWidth: "1px",
    }),
    background: "default",
    backgroundPattern: "plain",
    editFont: "helvetica",
    displayFont: "helvetica",
    editFontSize: "sm",
    displayFontSize: "sm",
  },
};

const LEGACY_THEME_MAP: Record<string, MindMapTheme> = {
  classic: "notebook",
  contrast: "outline",
  soft: "soft",
  notebook: "notebook",
  outline: "outline",
  paper: "paper",
  board: "board",
  black: "black",
  minimal: "minimal",
};

export const normalizeMindMapTheme = (value: unknown): MindMapTheme | null => {
  if (typeof value !== "string") {
    return null;
  }

  return LEGACY_THEME_MAP[value] ?? null;
};

export const getThemePresetSettings = (
  theme: MindMapTheme,
): ThemePresetSettings => THEME_PRESETS[theme];

/** Settings patch applied when the user picks a Theme preset. */
export const buildThemeSettingsUpdate = (
  theme: MindMapTheme,
): { theme: MindMapTheme } & ThemePresetSettings => ({
  theme,
  ...THEME_PRESETS[theme],
});

/** Kept for scene dataset bookkeeping; look comes from appearance/background/font. */
export const applyThemeToScene = (
  scene: HTMLElement,
  theme: MindMapTheme,
): void => {
  scene.dataset.kuusiTheme = theme;
};

export const fillThemeMenu = (
  menu: HTMLElement,
  getTheme: () => MindMapTheme,
  onChange: (theme: MindMapTheme) => void,
  onRebuild: () => void,
): void => {
  const row = createDropdownOptionRow(menu);
  MIND_MAP_THEMES.forEach(({ value, label, title }) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "jp-KuusiFormatDropdown-item jp-KuusiStyleDropdown-item";
    item.setAttribute("role", "menuitem");
    item.setAttribute("aria-label", title);
    item.title = title;
    item.textContent = label;
    item.classList.toggle("is-active", getTheme() === value);
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      onChange(value);
      onRebuild();
    });
    row.appendChild(item);
  });
};

export const createStyleToolbar = (
  root: HTMLElement,
  getTheme: () => MindMapTheme,
  onChange: (theme: MindMapTheme) => void,
  t: KuusiTranslator,
): HTMLElement => {
  const toolbar = document.createElement("div");
  toolbar.className = "jp-KuusiNotebookMindMap-style-toolbar";

  const dropdown = document.createElement("div");
  dropdown.className = "jp-KuusiFormatDropdown jp-KuusiStyleDropdown";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className =
    "jp-KuusiNotebookMindMap-format-btn jp-KuusiStyleDropdown-trigger";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-label", t.mindMapTheme());
  trigger.title = t.mindMapTheme();
  trigger.textContent = t.theme();

  const menu = document.createElement("div");
  menu.className = "jp-KuusiFormatDropdown-menu jp-KuusiStyleDropdown-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t.mindMapTheme());

  const rebuildMenu = () => {
    menu.replaceChildren();
    fillThemeMenu(menu, getTheme, onChange, rebuildMenu);
  };

  rebuildMenu();

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.contains("is-open");
    closeKuusiDropdownMenus(root);

    if (!isOpen) {
      rebuildMenu();
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

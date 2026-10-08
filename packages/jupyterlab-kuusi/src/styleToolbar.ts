import type { AppearanceSettings } from "./appearanceToolbar";
import { DEFAULT_APPEARANCE } from "./appearanceToolbar";
import type {
  MindMapBackground,
  MindMapBackgroundPattern,
} from "./backgroundToolbar";
import type { KuusiTranslator } from "./kuusiI18n";
import { closeKuusiDropdownMenus, openKuusiDropdownMenu } from "./formatToolbar";
import { rebuildMenuPreservingState } from "./menuRebuild";
import { bindThemeRowPreview } from "./themeCapsule";
import { appendThemeRestoreButton } from "./themeRestore";

/**
 * Theme presets stamp Line / Node / Background. Text and Headings stay as set.
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
};

type ThemeOption = {
  value: MindMapTheme;
  label: string;
  title: string;
};

const getMindMapThemes = (t: KuusiTranslator): ThemeOption[] => [
  {
    value: "notebook",
    label: t.articleThemeNotebook(),
    title: "Follow Jupyter defaults — clean cards and connectors",
  },
  {
    value: "soft",
    label: t.mindMapThemeSoft(),
    title: "Rounded cards, light borders, eye-care canvas with dots",
  },
  {
    value: "outline",
    label: t.mindMapThemeOutline(),
    title: "Strong blue borders and arrows on a grid for clarity",
  },
  {
    value: "paper",
    label: t.mindMapThemePaper(),
    title: "Newspaper canvas with serif type for reading",
  },
  {
    value: "board",
    label: t.mindMapThemeBoard(),
    title: "Presentation board — blue canvas, white cards, child arrows",
  },
  {
    value: "black",
    label: t.mindMapThemeBlack(),
    title: "Dark stage — ink canvas, charcoal cards, soft light edges",
  },
  {
    value: "minimal",
    label: t.articleThemeMinimal(),
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

/** Kept for scene dataset bookkeeping; look comes from appearance/background. */
export const applyThemeToScene = (
  scene: HTMLElement,
  theme: MindMapTheme,
): void => {
  scene.dataset.kuusiTheme = theme;
};

/** Mini LR map preview for Theme menu rows. */
const createThemeThumbnail = (theme: MindMapTheme): HTMLElement => {
  const preset = THEME_PRESETS[theme];
  const { appearance, background, backgroundPattern } = preset;

  const thumb = document.createElement("span");
  thumb.className = "jp-KuusiStyleDropdown-thumb";
  thumb.setAttribute("aria-hidden", "true");

  const canvas = document.createElement("span");
  canvas.className = "jp-KuusiStyleDropdown-thumbCanvas";

  const bg = document.createElement("span");
  bg.className =
    "jp-KuusiStyleDropdown-thumbBg jp-KuusiBackgroundDropdown-preview";
  bg.dataset.kuusiBackgroundPreview = background;
  bg.dataset.kuusiBackgroundPatternPreview = backgroundPattern;

  const nodeFill =
    appearance.nodeFillColor || "var(--jp-layout-color0, #fff)";
  const nodeBorder =
    appearance.nodeBorderColor || "var(--jp-border-color2, #ccc)";
  const edgeColor = appearance.edgeColor || "var(--jp-border-color2, #ccc)";
  const radius =
    appearance.nodeBorderCorner === "sharp"
      ? "0"
      : appearance.nodeBorderCorner === "ellipse"
        ? "999px"
        : appearance.nodeBorderRadius || "6px";
  const borderWidth = appearance.nodeBorderWidth || "1px";

  canvas.style.setProperty("--kuusi-theme-thumb-fill", nodeFill);
  canvas.style.setProperty("--kuusi-theme-thumb-border", nodeBorder);
  canvas.style.setProperty("--kuusi-theme-thumb-edge", edgeColor);
  canvas.style.setProperty("--kuusi-theme-thumb-radius", radius);
  canvas.style.setProperty("--kuusi-theme-thumb-border-width", borderWidth);

  const root = document.createElement("span");
  root.className = "jp-KuusiStyleDropdown-thumbNode is-root";

  const edge = document.createElement("span");
  edge.className = "jp-KuusiStyleDropdown-thumbEdge";

  const branch = document.createElement("span");
  branch.className = "jp-KuusiStyleDropdown-thumbBranch";

  for (let i = 0; i < 2; i += 1) {
    const child = document.createElement("span");
    child.className = "jp-KuusiStyleDropdown-thumbNode";
    branch.appendChild(child);
  }

  canvas.append(bg, root, edge, branch);
  thumb.appendChild(canvas);
  return thumb;
};

export const fillThemeMenu = (
  menu: HTMLElement,
  getTheme: () => MindMapTheme,
  onChange: (theme: MindMapTheme) => void,
  onRebuild: () => void,
  t: KuusiTranslator,
  isCustomized?: () => boolean,
  preview?: (theme: MindMapTheme | null) => void,
): void => {
  const list = document.createElement("div");
  list.className = "jp-KuusiStyleDropdown-list";
  const current = getTheme();

  getMindMapThemes(t).forEach(({ value, label, title }) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className =
      "jp-KuusiFormatDropdown-item jp-KuusiStyleDropdown-item";
    item.setAttribute("role", "menuitem");
    item.setAttribute("aria-label", title);
    item.title = title;
    item.classList.toggle("is-active", current === value);

    const labelEl = document.createElement("span");
    labelEl.className = "jp-KuusiStyleDropdown-label";
    labelEl.textContent = label;

    item.append(labelEl, createThemeThumbnail(value));
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      if (current !== value) {
        onChange(value);
      } else {
        preview?.(null);
      }
      onRebuild();
    });
    if (preview) {
      bindThemeRowPreview(menu, item, value, (next) =>
        preview(next as MindMapTheme | null),
      );
    }
    list.appendChild(item);
  });

  menu.appendChild(list);
  appendThemeRestoreButton(menu, {
    t,
    disabled: isCustomized ? !isCustomized() : false,
    onRestore: () => {
      onChange(getTheme());
      onRebuild();
    },
  });
};

export const createStyleToolbar = (
  root: HTMLElement,
  getTheme: () => MindMapTheme,
  onChange: (theme: MindMapTheme) => void,
  t: KuusiTranslator,
  options: {
    isCustomized?: () => boolean;
    /** Unsaved hover preview; null drops it. */
    preview?: (theme: MindMapTheme | null) => void;
    /** Settings change feed that keeps the "customized" dot current. */
    connect?: (listener: () => void) => { disconnect: () => void };
  } = {},
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

  const syncCustomized = (): void => {
    trigger.classList.toggle(
      "is-customized",
      Boolean(options.isCustomized?.()),
    );
  };
  syncCustomized();

  if (options.connect) {
    let connection: { disconnect: () => void } | null = null;
    let wasConnected = false;
    connection = options.connect(() => {
      if (!toolbar.isConnected) {
        if (wasConnected) {
          connection?.disconnect();
        }
        return;
      }
      wasConnected = true;
      syncCustomized();
    });
  }

  const menu = document.createElement("div");
  menu.className = "jp-KuusiFormatDropdown-menu jp-KuusiStyleDropdown-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t.mindMapTheme());

  const buildMenu = () => {
    menu.replaceChildren();
    fillThemeMenu(
      menu,
      getTheme,
      onChange,
      rebuildMenu,
      t,
      options.isCustomized,
      options.preview,
    );
  };
  const rebuildMenu = (): void => {
    rebuildMenuPreservingState(menu, buildMenu);
  };

  buildMenu();

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.contains("is-open");
    closeKuusiDropdownMenus(root);

    if (!isOpen) {
      buildMenu();
      openKuusiDropdownMenu(menu, root);
    }
  });

  dropdown.append(trigger, menu);
  toolbar.appendChild(dropdown);

  return toolbar;
};

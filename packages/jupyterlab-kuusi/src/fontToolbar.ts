import type { KuusiTranslator } from "./kuusiI18n";
import { closeKuusiDropdownMenus, openKuusiDropdownMenu } from "./formatToolbar";
import type { PanelWidget } from "./panelWidgets";
import { renderPanelWidgets } from "./panelWidgets";
import { mountSecondaryMenu } from "./secondaryMenu";

export type MindMapFont =
  | "notebook"
  | "system-ui"
  | "arial"
  | "helvetica"
  | "segoe-ui"
  | "verdana"
  | "georgia"
  | "times"
  | "palatino"
  | "garamond"
  | "cambria";

/** Seven discrete font-size steps (edit / display independently). */
export type MindMapFontSize =
  | "xxs"
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "xxl";

export const MIND_MAP_FONT_SIZES: readonly MindMapFontSize[] = [
  "xxs",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "xxl",
] as const;

export const DEFAULT_MIND_MAP_FONT: MindMapFont = "notebook";
export const DEFAULT_MIND_MAP_FONT_SIZE: MindMapFontSize = "md";

type FontSection = "edit" | "display" | "link";

let lastFontSection: FontSection = "edit";

const FONT_SIZE_LABELS: Record<MindMapFontSize, string> = {
  xxs: "XXS",
  xs: "XS",
  sm: "S",
  md: "M",
  lg: "L",
  xl: "XL",
  xxl: "XXL",
};

/** Approximate CSS px at a 16px root (sizes are stored as rem steps). */
const FONT_SIZE_APPROX_PX: Record<MindMapFontSize, number> = {
  xxs: 12,
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 23,
  xxl: 26,
};

const LEGACY_FONT_SIZE_MAP: Record<string, MindMapFontSize> = {
  notebook: "md",
  small: "sm",
  medium: "md",
  large: "lg",
  "extra-large": "xl",
  xxs: "xxs",
  xs: "xs",
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
  xxl: "xxl",
};

export const normalizeMindMapFontSize = (value: unknown): MindMapFontSize | null => {
  if (typeof value !== "string") {
    return null;
  }

  return LEGACY_FONT_SIZE_MAP[value] ?? null;
};

export const fontSizeToSliderIndex = (size: MindMapFontSize): number =>
  Math.max(0, MIND_MAP_FONT_SIZES.indexOf(size));

export const sliderIndexToFontSize = (index: number): MindMapFontSize => {
  const clamped = Math.min(
    MIND_MAP_FONT_SIZES.length - 1,
    Math.max(0, Math.round(index)),
  );
  return MIND_MAP_FONT_SIZES[clamped];
};

export const fontSizeLabel = (size: MindMapFontSize): string =>
  `${FONT_SIZE_LABELS[size]} · ${FONT_SIZE_APPROX_PX[size]}px`;

type FontCategory = "default" | "sans" | "serif";

type FontOption = {
  value: MindMapFont;
  label: string;
  title: string;
  category: FontCategory;
  previewFamily: string;
};

const FONT_OPTIONS: FontOption[] = [
  {
    value: "notebook",
    label: "Notebook",
    title: "Use the notebook default font",
    category: "default",
    previewFamily:
      "var(--jp-content-font-family, var(--jp-ui-font-family, system-ui))",
  },
  {
    value: "system-ui",
    label: "System UI",
    title: "System sans-serif UI font",
    category: "sans",
    previewFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    value: "arial",
    label: "Arial",
    title: "Arial sans-serif",
    category: "sans",
    previewFamily: "Arial, Helvetica, sans-serif",
  },
  {
    value: "helvetica",
    label: "Helvetica Neue",
    title: "Helvetica Neue sans-serif",
    category: "sans",
    previewFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  {
    value: "segoe-ui",
    label: "Segoe UI",
    title: "Segoe UI sans-serif",
    category: "sans",
    previewFamily: '"Segoe UI", Tahoma, sans-serif',
  },
  {
    value: "verdana",
    label: "Verdana",
    title: "Verdana sans-serif",
    category: "sans",
    previewFamily: "Verdana, Geneva, sans-serif",
  },
  {
    value: "georgia",
    label: "Georgia",
    title: "Georgia serif",
    category: "serif",
    previewFamily: "Georgia, serif",
  },
  {
    value: "times",
    label: "Times New Roman",
    title: "Times New Roman serif",
    category: "serif",
    previewFamily: '"Times New Roman", Times, serif',
  },
  {
    value: "palatino",
    label: "Palatino",
    title: "Palatino serif",
    category: "serif",
    previewFamily: '"Palatino Linotype", Palatino, serif',
  },
  {
    value: "garamond",
    label: "Garamond",
    title: "Garamond serif",
    category: "serif",
    previewFamily: 'Garamond, "Times New Roman", serif',
  },
  {
    value: "cambria",
    label: "Cambria",
    title: "Cambria serif",
    category: "serif",
    previewFamily: "Cambria, Georgia, serif",
  },
];

const FONT_FAMILY_BY_VALUE: Record<MindMapFont, string> = Object.fromEntries(
  FONT_OPTIONS.map((option) => [option.value, option.previewFamily]),
) as Record<MindMapFont, string>;

const getSectionLabels = (t: KuusiTranslator): Record<FontCategory, string> => ({
  default: t.fontSectionDefault(),
  sans: t.fontSectionSans(),
  serif: t.fontSectionSerif(),
});

export const applyFontToScene = (
  scene: HTMLElement,
  editFont: MindMapFont,
  displayFont: MindMapFont,
  editFontSize: MindMapFontSize,
  displayFontSize: MindMapFontSize,
): void => {
  scene.dataset.kuusiEditFont = editFont;
  scene.dataset.kuusiDisplayFont = displayFont;
  scene.dataset.kuusiEditFontSize = editFontSize;
  scene.dataset.kuusiDisplayFontSize = displayFontSize;
  delete scene.dataset.kuusiFont;
  delete scene.dataset.kuusiFontSize;
  scene.style.setProperty(
    "--kuusi-mindmap-font-family-edit",
    FONT_FAMILY_BY_VALUE[editFont],
  );
  scene.style.setProperty(
    "--kuusi-mindmap-font-family-display",
    FONT_FAMILY_BY_VALUE[displayFont],
  );
};

const createFontPreview = (previewFamily: string): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = "jp-KuusiFontDropdown-preview";
  preview.style.fontFamily = previewFamily;
  preview.textContent = "Ag";
  preview.setAttribute("aria-hidden", "true");
  return preview;
};

const buildFontModeWidgets = (
  size: MindMapFontSize,
  onSizeChange: (size: MindMapFontSize) => void,
  font: MindMapFont,
  onFontChange: (font: MindMapFont) => void,
  t: KuusiTranslator,
  onRebuild: () => void,
): PanelWidget[] => {
  const sectionLabels = getSectionLabels(t);
  const widgets: PanelWidget[] = [
    {
      kind: "slider",
      label: t.fontSizeSection(),
      value: fontSizeToSliderIndex(size),
      min: 0,
      max: MIND_MAP_FONT_SIZES.length - 1,
      formatValue: (index) => fontSizeLabel(sliderIndexToFontSize(index)),
      onChange: (index) => {
        onSizeChange(sliderIndexToFontSize(index));
      },
    },
  ];

  (["default", "sans", "serif"] as FontCategory[]).forEach((category) => {
    const options = FONT_OPTIONS.filter((option) => option.category === category);

    if (options.length === 0) {
      return;
    }

    widgets.push({
      kind: "choice",
      sectionLabel: sectionLabels[category],
      value: font,
      options: options.map((option) => ({
        value: option.value,
        label: option.label,
        title: option.title,
        preview: () => createFontPreview(option.previewFamily),
      })),
      onChange: (value) => {
        onFontChange(value as MindMapFont);
        onRebuild();
      },
    });
  });

  return widgets;
};

export const fillFontMenu = (
  menu: HTMLElement,
  getEditFont: () => MindMapFont,
  onEditFontChange: (font: MindMapFont) => void,
  getEditFontSize: () => MindMapFontSize,
  onEditFontSizeChange: (fontSize: MindMapFontSize) => void,
  getDisplayFont: () => MindMapFont,
  onDisplayFontChange: (font: MindMapFont) => void,
  getDisplayFontSize: () => MindMapFontSize,
  onDisplayFontSizeChange: (fontSize: MindMapFontSize) => void,
  getUnifyEditDisplayFont: () => boolean,
  onUnifyEditDisplayFontChange: (value: boolean) => void,
  getMatchNotebookFont: () => boolean,
  onMatchNotebookFontChange: (value: boolean) => void,
  t: KuusiTranslator,
  onRebuild: () => void,
): void => {
  mountSecondaryMenu(menu, {
    ariaLabel: t.mindMapFont(),
    sections: [
      { id: "edit", label: t.fontSizeEdit() },
      { id: "display", label: t.fontSizeDisplay() },
      { id: "link", label: t.fontLink() },
    ],
    getActive: () => lastFontSection,
    setActive: (id) => {
      lastFontSection = id;
    },
    fillSection: (id, panel) => {
      if (id === "link") {
        renderPanelWidgets(panel, [
          {
            kind: "toggle",
            label: t.unifyEditDisplayFont(),
            value: getUnifyEditDisplayFont(),
            onChange: (value) => {
              onUnifyEditDisplayFontChange(value);
              onRebuild();
            },
          },
          {
            kind: "toggle",
            label: t.matchNotebookFont(),
            value: getMatchNotebookFont(),
            onChange: (value) => {
              onMatchNotebookFontChange(value);
              onRebuild();
            },
          },
        ]);
        return;
      }

      if (id === "edit") {
        renderPanelWidgets(
          panel,
          buildFontModeWidgets(
            getEditFontSize(),
            onEditFontSizeChange,
            getEditFont(),
            onEditFontChange,
            t,
            onRebuild,
          ),
        );
        return;
      }

      renderPanelWidgets(
        panel,
        buildFontModeWidgets(
          getDisplayFontSize(),
          onDisplayFontSizeChange,
          getDisplayFont(),
          onDisplayFontChange,
          t,
          onRebuild,
        ),
      );
    },
  });
};

export const createFontToolbar = (
  root: HTMLElement,
  getEditFont: () => MindMapFont,
  onEditFontChange: (font: MindMapFont) => void,
  getEditFontSize: () => MindMapFontSize,
  onEditFontSizeChange: (fontSize: MindMapFontSize) => void,
  getDisplayFont: () => MindMapFont,
  onDisplayFontChange: (font: MindMapFont) => void,
  getDisplayFontSize: () => MindMapFontSize,
  onDisplayFontSizeChange: (fontSize: MindMapFontSize) => void,
  getUnifyEditDisplayFont: () => boolean,
  onUnifyEditDisplayFontChange: (value: boolean) => void,
  getMatchNotebookFont: () => boolean,
  onMatchNotebookFontChange: (value: boolean) => void,
  t: KuusiTranslator,
): HTMLElement => {
  const toolbar = document.createElement("div");
  toolbar.className = "jp-KuusiNotebookMindMap-font-toolbar";

  const dropdown = document.createElement("div");
  dropdown.className = "jp-KuusiFormatDropdown jp-KuusiFontDropdown";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className =
    "jp-KuusiNotebookMindMap-format-btn jp-KuusiFontDropdown-trigger";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-label", t.mindMapFont());
  trigger.title = t.mindMapFont();
  trigger.textContent = t.font();

  const menu = document.createElement("div");
  menu.className =
    "jp-KuusiFormatDropdown-menu jp-KuusiFormatDropdown-menu-wide jp-KuusiFontDropdown-menu jp-KuusiSecondaryMenu-host";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t.mindMapFont());

  const rebuildMenu = () => {
    menu.replaceChildren();
    fillFontMenu(
      menu,
      getEditFont,
      onEditFontChange,
      getEditFontSize,
      onEditFontSizeChange,
      getDisplayFont,
      onDisplayFontChange,
      getDisplayFontSize,
      onDisplayFontSizeChange,
      getUnifyEditDisplayFont,
      onUnifyEditDisplayFontChange,
      getMatchNotebookFont,
      onMatchNotebookFontChange,
      t,
      rebuildMenu,
    );
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

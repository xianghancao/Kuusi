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

/** Named size steps for headings / code (not body). */
export type MindMapFontSize =
  | "xxs"
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "xxl";

/** Body text size in CSS px (Article / Book / Slides / Mind Map). */
export type BodyFontSizePx = number;

export const BODY_FONT_SIZE_MIN = 8;
export const BODY_FONT_SIZE_MAX = 16;
export const BODY_FONT_SIZE_STEP = 0.5;
export const BODY_FONT_SIZE_INPUT_STEP = 0.1;
/** Match prior “xs” (~Lab content body). */
export const DEFAULT_BODY_FONT_SIZE_PX: BodyFontSizePx = 14;

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
/** Prefer DEFAULT_BODY_FONT_SIZE_PX for body; kept for heading/code defaults. */
export const DEFAULT_MIND_MAP_FONT_SIZE: MindMapFontSize = "xs";

const FONT_SIZE_LABELS: Record<MindMapFontSize, string> = {
  xxs: "XXS",
  xs: "XS",
  sm: "S",
  md: "M",
  lg: "L",
  xl: "XL",
  xxl: "XXL",
};

/** CSS rem used by heading / code sizes (16px root). xs ≈ Lab 14px. */
export const MIND_MAP_FONT_SIZE_REM: Record<MindMapFontSize, string> = {
  xxs: "0.75rem",
  xs: "0.875rem",
  sm: "1rem",
  md: "1.125rem",
  lg: "1.25rem",
  xl: "1.4375rem",
  xxl: "1.625rem",
};

/** Approximate CSS px at a 16px root (named heading/code steps). */
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

/** Map legacy named body sizes into the 8–16px range. */
const LEGACY_BODY_FONT_SIZE_PX: Record<string, BodyFontSizePx> = {
  notebook: 14,
  small: 12,
  medium: 14,
  large: 16,
  "extra-large": 16,
  xxs: 12,
  xs: 14,
  sm: 16,
  md: 16,
  lg: 16,
  xl: 16,
  xxl: 16,
};

export const roundBodyFontSizePx = (value: number): BodyFontSizePx =>
  Math.round(value * 10) / 10;

export const clampBodyFontSizePx = (value: number): BodyFontSizePx =>
  roundBodyFontSizePx(
    Math.min(BODY_FONT_SIZE_MAX, Math.max(BODY_FONT_SIZE_MIN, value)),
  );

export const normalizeBodyFontSizePx = (
  value: unknown,
  fallback: BodyFontSizePx = DEFAULT_BODY_FONT_SIZE_PX,
): BodyFontSizePx => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampBodyFontSizePx(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    const legacy = LEGACY_BODY_FONT_SIZE_PX[trimmed];
    if (legacy !== undefined) {
      return legacy;
    }
    const parsed = Number.parseFloat(trimmed);
    if (Number.isFinite(parsed)) {
      return clampBodyFontSizePx(parsed);
    }
  }

  return clampBodyFontSizePx(fallback);
};

export const bodyFontSizeCss = (size: BodyFontSizePx): string =>
  `${clampBodyFontSizePx(size)}px`;

export const bodyFontSizeLabel = (size: BodyFontSizePx): string =>
  `${clampBodyFontSizePx(size)}px`;

export const normalizeMindMapFontSize = (
  value: unknown,
): MindMapFontSize | null => {
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

export const fontSizeShortLabel = (size: MindMapFontSize): string =>
  FONT_SIZE_LABELS[size];

export type FontCategory = "default" | "sans" | "serif";

export type FontOption = {
  value: MindMapFont;
  label: string;
  title: string;
  category: FontCategory;
  previewFamily: string;
};

export const FONT_OPTIONS: FontOption[] = [
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

export const mindMapFontFamilyCss = (font: MindMapFont): string =>
  FONT_FAMILY_BY_VALUE[font];

export const applyFontToScene = (
  scene: HTMLElement,
  editFont: MindMapFont,
  displayFont: MindMapFont,
  editFontSize: BodyFontSizePx,
  displayFontSize: BodyFontSizePx,
): void => {
  const editPx = clampBodyFontSizePx(editFontSize);
  const displayPx = clampBodyFontSizePx(displayFontSize);
  scene.dataset.kuusiEditFont = editFont;
  scene.dataset.kuusiDisplayFont = displayFont;
  scene.dataset.kuusiEditFontSize = String(editPx);
  scene.dataset.kuusiDisplayFontSize = String(displayPx);
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
  scene.style.setProperty(
    "--kuusi-mindmap-font-size-edit",
    bodyFontSizeCss(editPx),
  );
  scene.style.setProperty(
    "--kuusi-mindmap-font-size-display",
    bodyFontSizeCss(displayPx),
  );
};

export const createFontPreview = (previewFamily: string): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = "jp-KuusiFontDropdown-preview";
  preview.style.fontFamily = previewFamily;
  preview.textContent = "Ag";
  preview.setAttribute("aria-hidden", "true");
  return preview;
};

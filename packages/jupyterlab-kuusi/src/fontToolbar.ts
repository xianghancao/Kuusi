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
  | "cambria"
  | "songti"
  | "heiti"
  | "kaiti"
  | "fangsong";

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
/** 28pt — Word's size menu goes higher, but body text rarely does. */
export const BODY_FONT_SIZE_MAX = 37.5;
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

/** CSS px per typographic point (96dpi), so 12pt = 16px as in Word. */
export const PX_PER_PT = 4 / 3;

export const pxToPt = (px: number): number =>
  Math.round((px / PX_PER_PT) * 10) / 10;

export const ptToPx = (pt: number): BodyFontSizePx =>
  clampBodyFontSizePx(pt * PX_PER_PT);

/** Slider range/step in points (the unit shown in the menu). */
export const BODY_FONT_SIZE_PT_RANGE = {
  min: 6,
  max: 28,
  step: 0.5,
} as const;

export const bodyFontSizeLabel = (size: BodyFontSizePx): string =>
  `${pxToPt(clampBodyFontSizePx(size))}pt`;

export const normalizeMindMapFontSize = (
  value: unknown,
): MindMapFontSize | null => {
  if (typeof value !== "string") {
    return null;
  }

  return LEGACY_FONT_SIZE_MAP[value] ?? null;
};

/**
 * Heading size: a named step, or a custom CSS px value. A custom value that
 * lands on a step is stored as that step, so presets compare equal.
 */
export type HeadingFontSize = MindMapFontSize | number;

/** One heading scale for every view, in points (Word-like whole numbers). */
export const HEADING_STEP_PT: Record<MindMapFontSize, number> = {
  xxs: 10,
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 27,
};

/** Body size steps in points; 10.5pt is the default body size. */
export const BODY_STEP_PT: readonly number[] = [9, 10, 10.5, 11, 12, 14, 16];

/** Custom heading sizes the number field accepts, in points. */
export const HEADING_FONT_SIZE_PT_RANGE = { min: 6, max: 72 } as const;

const roundPx = (value: number): number => Math.round(value * 100) / 100;

export const HEADING_STEP_PX: Record<MindMapFontSize, number> = {
  xxs: roundPx(HEADING_STEP_PT.xxs * PX_PER_PT),
  xs: roundPx(HEADING_STEP_PT.xs * PX_PER_PT),
  sm: roundPx(HEADING_STEP_PT.sm * PX_PER_PT),
  md: roundPx(HEADING_STEP_PT.md * PX_PER_PT),
  lg: roundPx(HEADING_STEP_PT.lg * PX_PER_PT),
  xl: roundPx(HEADING_STEP_PT.xl * PX_PER_PT),
  xxl: roundPx(HEADING_STEP_PT.xxl * PX_PER_PT),
};

export const headingSizePx = (size: HeadingFontSize): number =>
  typeof size === "number" ? size : HEADING_STEP_PX[size];

export const headingSizeCss = (size: HeadingFontSize): string =>
  `${headingSizePx(size)}px`;

/** The named step closest to `px` (for views that only know steps). */
export const nearestHeadingStep = (px: number): MindMapFontSize =>
  MIND_MAP_FONT_SIZES.reduce((best, step) =>
    Math.abs(HEADING_STEP_PX[step] - px) <
    Math.abs(HEADING_STEP_PX[best] - px)
      ? step
      : best,
  );

/** Step name for a size that sits on a step, otherwise the clamped px. */
export const canonicalHeadingSize = (px: number): HeadingFontSize => {
  const min = HEADING_FONT_SIZE_PT_RANGE.min * PX_PER_PT;
  const max = HEADING_FONT_SIZE_PT_RANGE.max * PX_PER_PT;
  const clamped = roundPx(Math.min(max, Math.max(min, px)));
  const step = MIND_MAP_FONT_SIZES.find(
    (name) => Math.abs(HEADING_STEP_PX[name] - clamped) < 0.15,
  );

  return step ?? clamped;
};

export const normalizeHeadingFontSize = (
  value: unknown,
): HeadingFontSize | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return canonicalHeadingSize(value);
  }

  return normalizeMindMapFontSize(value);
};

/**
 * Code size: a named step, or a custom CSS px value (a custom value that lands
 * on a step is stored as that step, as for headings).
 */
export type CodeFontSize = MindMapFontSize | number;

/** Code steps in points — the same sizes the named steps always rendered at. */
export const CODE_STEP_PT: Record<MindMapFontSize, number> = {
  xxs: 9,
  xs: 10.5,
  sm: 12,
  md: 13.5,
  lg: 15,
  xl: 17.25,
  xxl: 19.5,
};

export const CODE_FONT_SIZE_PT_RANGE = { min: 6, max: 40 } as const;

export const CODE_STEP_PX: Record<MindMapFontSize, number> = {
  xxs: 12,
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 23,
  xxl: 26,
};

export const codeSizePx = (size: CodeFontSize): number =>
  typeof size === "number" ? size : CODE_STEP_PX[size];

export const canonicalCodeSize = (px: number): CodeFontSize => {
  const min = CODE_FONT_SIZE_PT_RANGE.min * PX_PER_PT;
  const max = CODE_FONT_SIZE_PT_RANGE.max * PX_PER_PT;
  const clamped = roundPx(Math.min(max, Math.max(min, px)));
  const step = MIND_MAP_FONT_SIZES.find(
    (name) => Math.abs(CODE_STEP_PX[name] - clamped) < 0.15,
  );

  return step ?? clamped;
};

export const normalizeCodeFontSize = (value: unknown): CodeFontSize | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return canonicalCodeSize(value);
  }

  return normalizeMindMapFontSize(value);
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

/** Points, like the body font size slider, so the Text menu uses one unit. */
export const fontSizeLabel = (size: MindMapFontSize): string =>
  `${FONT_SIZE_LABELS[size]} · ${pxToPt(FONT_SIZE_APPROX_PX[size])}pt`;

export const fontSizeShortLabel = (size: MindMapFontSize): string =>
  FONT_SIZE_LABELS[size];

export type FontCategory = "default" | "sans" | "serif" | "cjk";

export type FontOption = {
  value: MindMapFont;
  label: string;
  title: string;
  category: FontCategory;
  previewFamily: string;
};

export const DEFAULT_TEXT_FONT: MindMapFont = "helvetica";

/**
 * Neither “System UI” nor “Notebook” is offered any more: macOS prints those
 * system fonts as outlines. Saved settings that still name them become Helvetica
 * Neue. Mind Map keeps `notebook` for its own “match the notebook font” switch.
 */
export const migrateFont = <T>(value: T, keepNotebook = false): T =>
  value === "system-ui" || (value === "notebook" && !keepNotebook)
    ? (DEFAULT_TEXT_FONT as unknown as T)
    : value;

export const FONT_OPTIONS: FontOption[] = [
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
  {
    value: "songti",
    label: "宋体 Songti",
    title: "Songti / SimSun serif (Chinese body text)",
    category: "cjk",
    previewFamily:
      '"Songti SC", STSong, SimSun, "Noto Serif CJK SC", "Source Han Serif SC", serif',
  },
  {
    value: "heiti",
    label: "黑体 Heiti",
    title: "PingFang / YaHei sans-serif (Chinese)",
    category: "cjk",
    previewFamily:
      '"PingFang SC", "Heiti SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
  },
  {
    value: "kaiti",
    label: "楷体 Kaiti",
    title: "Kaiti regular-script serif (Chinese)",
    category: "cjk",
    previewFamily: '"Kaiti SC", STKaiti, KaiTi, 楷体, serif',
  },
  {
    value: "fangsong",
    label: "仿宋 Fangsong",
    title: "Fangsong serif (Chinese official documents)",
    category: "cjk",
    previewFamily: 'STFangsong, FangSong, 仿宋, "Songti SC", serif',
  },
];

/** Every font value, in menu order (settings validators share this). */
export const FONT_VALUES: readonly MindMapFont[] = FONT_OPTIONS.map(
  (option) => option.value,
);

export const isFontValue = (value: unknown): value is MindMapFont =>
  value === "system-ui" ||
  value === "notebook" ||
  (typeof value === "string" && (FONT_VALUES as readonly string[]).includes(value));

const FONT_FAMILY_BY_VALUE: Record<MindMapFont, string> = {
  ...(Object.fromEntries(
    FONT_OPTIONS.map((option) => [option.value, option.previewFamily]),
  ) as Record<MindMapFont, string>),
  // Legacy value: same look as its replacement.
  "system-ui": '"Helvetica Neue", Helvetica, Arial, sans-serif',
  // Not offered in the lists; Mind Map's “match notebook font” still uses it.
  notebook:
    "var(--jp-content-font-family, var(--jp-ui-font-family, system-ui))",
};

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

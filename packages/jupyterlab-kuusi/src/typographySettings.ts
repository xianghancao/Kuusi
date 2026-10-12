import {
  DEFAULT_CODE_FONT,
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_CODE_THEME,
  isCodeFont,
  isCodeTheme,
  type CodeFont,
  type CodeTheme,
} from "./codeThemes";
import {
  DEFAULT_BLOCKQUOTE_WEIGHT,
  DEFAULT_HR_WEIGHT,
  DEFAULT_LIST_STYLE,
  isListStyle,
  isRuleWeight,
  type ListStyle,
  type RuleWeight,
} from "./elementChromeSettings";
import {
  DEFAULT_TABLE_APPEARANCE,
  DEFAULT_TABLE_BORDER_WIDTH,
  DEFAULT_TABLE_STYLE,
  DEFAULT_TABLE_TRANSPARENCY,
  TABLE_BORDER_RANGE,
  TABLE_TRANSPARENCY_RANGE,
  isTableStyle,
  type TableStyle,
} from "./tableSettings";
import {
  DEFAULT_BODY_FONT_SIZE_PX,
  DEFAULT_MIND_MAP_FONT,
  DEFAULT_MIND_MAP_FONT_SIZE,
  FONT_OPTIONS,
  normalizeBodyFontSizePx,
  normalizeCodeFontSize,
  normalizeHeadingFontSize,
  type CodeFontSize,
  type HeadingFontSize,
  type BodyFontSizePx,
  type MindMapFont,
} from "./fontToolbar";

/**
 * Text / Paragraph / Headings / Code / Image settings shared by Article,
 * Slides, and Mind Map, so the three capsules expose the same menus.
 */

export type TextAlign = "left" | "center" | "right";
export type ParagraphAlign = "left" | "justify";
export type LinkStyle = "default" | "underline" | "accent";
export type CodeStyle = "plain" | "muted" | "contrast";
export type { CodeFont, CodeTheme, TableStyle };
export type ImageWidth = "natural" | "wide" | "full";
export type ImageAlign = TextAlign;
export type ImageWrap = "none" | "left" | "right";
export type ImageBorderStyle = "none" | "solid" | "dashed" | "dotted" | "double";
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type HeadingId = `h${HeadingLevel}`;

export type HeadingStyle = {
  font: MindMapFont;
  fontSize: HeadingFontSize;
  /** Empty string follows the page foreground. */
  color: string;
  align: TextAlign;
};

export type HeadingStyles = Record<HeadingId, HeadingStyle>;

export type TypographyValues = {
  font: MindMapFont;
  /** Body size in CSS px (8–16). */
  fontSize: BodyFontSizePx;
  /** Empty string follows the page foreground. */
  color: string;
  /** Empty string inherits the body color for **strong** / <b>. */
  strongColor: string;
  letterSpacing: number;
  lineHeight: number;
  paragraphSpacing: number;
  paragraphIndent: number;
  paragraphAlign: ParagraphAlign;
  linkStyle: LinkStyle;
  headers: HeadingStyles;
  codeStyle: CodeStyle;
  /** Language-inspired syntax color palette (default Python). */
  codeTheme: CodeTheme;
  codeFont: CodeFont;
  codeFontSize: CodeFontSize;
  codeFrame: boolean;
  /** Empty string follows the theme border color. */
  codeFrameColor: string;
  codeFrameRadius: number;
  codeFrameBorder: number;
  /** Code block max-width as percent of the text column. */
  codeFrameWidth: number;
  tableStyle: TableStyle;
  /** Table rule / grid stroke in pt. */
  tableBorderWidth: number;
  /** Table cell fill transparency in percent (100 = see-through). */
  tableTransparency: number;
  tableHeaderRowBold: boolean;
  tableHeaderColumnBold: boolean;
  /** List spacing density. */
  listStyle: ListStyle;
  /** Blockquote rule weight. */
  blockquoteWeight: RuleWeight;
  /** Horizontal-rule weight. */
  hrWeight: RuleWeight;
  codeBackground: string;
  blockquoteBackground: string;
  blockquoteColor: string;
  blockquoteBarColor: string;
  imageWidth: ImageWidth;
  imageAlign: ImageAlign;
  imageWrap: ImageWrap;
  imageBorderStyle: ImageBorderStyle;
  imageBorderWidth: number;
  /** Empty string follows the page foreground. */
  imageBorderColor: string;
  imageRadius: number;
};

export type NumberRange = { min: number; max: number; step: number };

export const HEADING_LEVELS: HeadingLevel[] = [1, 2, 3, 4, 5, 6];

export const headingId = (level: HeadingLevel): HeadingId => `h${level}`;

/**
 * Spacing / indent / tracking are stored in CSS points (pt), like Word.
 * Legacy em values (old max 3 / 0.15) are migrated with 1em ≈ 12pt.
 */
export const EM_TO_PT = 12;
const LEGACY_PARAGRAPH_EM_MAX = 3;
const LEGACY_LETTER_SPACING_EM_MAX = 0.15;

export const LETTER_SPACING_RANGE: NumberRange = {
  min: 0,
  max: 3,
  step: 0.05,
};
/** Body size in points (menu unit); stored values stay CSS px. */
export const BODY_FONT_SIZE_RANGE: NumberRange = {
  min: 6,
  max: 28,
  step: 0.5,
};
export const PARAGRAPH_SPACING_RANGE: NumberRange = {
  min: 0,
  max: 48,
  step: 1,
};
export const PARAGRAPH_INDENT_RANGE: NumberRange = {
  min: 0,
  max: 72,
  step: 1,
};
export const CODE_RADIUS_RANGE: NumberRange = { min: 0, max: 24, step: 1 };
export const CODE_BORDER_RANGE: NumberRange = { min: 0, max: 8, step: 1 };
export const CODE_WIDTH_RANGE: NumberRange = { min: 40, max: 100, step: 5 };
export { TABLE_BORDER_RANGE, TABLE_TRANSPARENCY_RANGE };
export const IMAGE_BORDER_RANGE: NumberRange = { min: 0, max: 12, step: 1 };
export const IMAGE_RADIUS_RANGE: NumberRange = { min: 0, max: 32, step: 1 };

/** Map a saved em value to pt when it still sits in the old em range. */
export const migrateEmToPt = (
  value: number,
  legacyMax: number,
): number => (value > legacyMax ? value : value * EM_TO_PT);

export const migrateLetterSpacingToPt = (value: number): number =>
  migrateEmToPt(value, LEGACY_LETTER_SPACING_EM_MAX);

export const migrateParagraphMeasureToPt = (value: number): number =>
  migrateEmToPt(value, LEGACY_PARAGRAPH_EM_MAX);

const FONT_VALUES = new Set<string>(FONT_OPTIONS.map((option) => option.value));

export const isTypographyFont = (value: unknown): value is MindMapFont =>
  typeof value === "string" && FONT_VALUES.has(value);

export const isTypographyColor = (value: unknown): value is string =>
  typeof value === "string" &&
  (value === "" || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value));

export const isTextAlign = (value: unknown): value is TextAlign =>
  value === "left" || value === "center" || value === "right";

export const isParagraphAlign = (value: unknown): value is ParagraphAlign =>
  value === "left" || value === "justify";

export const isLinkStyle = (value: unknown): value is LinkStyle =>
  value === "default" || value === "underline" || value === "accent";

export const isCodeStyle = (value: unknown): value is CodeStyle =>
  value === "plain" || value === "muted" || value === "contrast";

export const isImageWidth = (value: unknown): value is ImageWidth =>
  value === "natural" || value === "wide" || value === "full";

export const isImageAlign = (value: unknown): value is ImageAlign =>
  isTextAlign(value);

export const isImageWrap = (value: unknown): value is ImageWrap =>
  value === "none" || value === "left" || value === "right";

export const isImageBorderStyle = (value: unknown): value is ImageBorderStyle =>
  value === "none" ||
  value === "solid" ||
  value === "dashed" ||
  value === "dotted" ||
  value === "double";

export { isTableStyle };
export { isListStyle, isRuleWeight };

/** Clamp to [min, max] and snap to the range step; non-numbers fall back. */
export const normalizeInRange = (
  value: unknown,
  range: NumberRange,
  fallback: number,
): number => {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isFinite(raw)) {
    return fallback;
  }

  const clamped = Math.min(range.max, Math.max(range.min, raw));
  const steps = Math.round((clamped - range.min) / range.step);
  return Number((range.min + steps * range.step).toFixed(2));
};

export const makeHeadingStyle = (
  partial: Partial<HeadingStyle> = {},
): HeadingStyle => ({
  font: partial.font ?? DEFAULT_MIND_MAP_FONT,
  fontSize: partial.fontSize ?? DEFAULT_MIND_MAP_FONT_SIZE,
  color: partial.color ?? "",
  align: partial.align ?? "left",
});

export const normalizeHeadingStyle = (
  value: unknown,
  fallback: HeadingStyle,
): HeadingStyle => {
  const raw =
    value && typeof value === "object" ? (value as Partial<HeadingStyle>) : {};

  return {
    font: isTypographyFont(raw.font) ? raw.font : fallback.font,
    fontSize: normalizeHeadingFontSize(raw.fontSize) ?? fallback.fontSize,
    color: isTypographyColor(raw.color) ? raw.color : fallback.color,
    align: isTextAlign(raw.align) ? raw.align : fallback.align,
  };
};

export const normalizeHeadingStyles = (
  value: unknown,
  defaults: HeadingStyles,
): HeadingStyles => {
  const raw =
    value && typeof value === "object"
      ? (value as Partial<Record<HeadingId, unknown>>)
      : {};

  return {
    h1: normalizeHeadingStyle(raw.h1, defaults.h1),
    h2: normalizeHeadingStyle(raw.h2, defaults.h2),
    h3: normalizeHeadingStyle(raw.h3, defaults.h3),
    h4: normalizeHeadingStyle(raw.h4, defaults.h4),
    h5: normalizeHeadingStyle(raw.h5, defaults.h5),
    h6: normalizeHeadingStyle(raw.h6, defaults.h6),
  };
};

export const updateHeadingStyle = (
  headers: HeadingStyles,
  id: HeadingId,
  partial: Partial<HeadingStyle>,
): HeadingStyles => ({
  ...headers,
  [id]: { ...headers[id], ...partial },
});

/** Flat H1–H6 defaults (same size). Mind map uses this so existing maps do not jump. */
export const makeFlatHeadingStyles = (
  partial: Partial<HeadingStyle> = {},
): HeadingStyles => ({
  h1: makeHeadingStyle(partial),
  h2: makeHeadingStyle(partial),
  h3: makeHeadingStyle(partial),
  h4: makeHeadingStyle(partial),
  h5: makeHeadingStyle(partial),
  h6: makeHeadingStyle(partial),
});

/** Neutral shared defaults. Article / Slides override line-height and heading steps. */
export const DEFAULT_TYPOGRAPHY_VALUES: TypographyValues = {
  font: DEFAULT_MIND_MAP_FONT,
  fontSize: DEFAULT_BODY_FONT_SIZE_PX,
  color: "",
  strongColor: "",
  letterSpacing: 0,
  lineHeight: 1.5,
  paragraphSpacing: 6,
  paragraphIndent: 0,
  paragraphAlign: "left",
  linkStyle: "default",
  headers: makeFlatHeadingStyles(),
  codeStyle: "muted",
  codeTheme: DEFAULT_CODE_THEME,
  codeFont: DEFAULT_CODE_FONT,
  codeFontSize: DEFAULT_CODE_FONT_SIZE,
  codeFrame: false,
  codeFrameColor: "",
  codeFrameRadius: 6,
  codeFrameBorder: 1,
  codeFrameWidth: 100,
  tableStyle: DEFAULT_TABLE_STYLE,
  tableBorderWidth: DEFAULT_TABLE_BORDER_WIDTH,
  tableTransparency: DEFAULT_TABLE_TRANSPARENCY,
  tableHeaderRowBold: DEFAULT_TABLE_APPEARANCE.tableHeaderRowBold,
  tableHeaderColumnBold: DEFAULT_TABLE_APPEARANCE.tableHeaderColumnBold,
  listStyle: DEFAULT_LIST_STYLE,
  blockquoteWeight: DEFAULT_BLOCKQUOTE_WEIGHT,
  hrWeight: DEFAULT_HR_WEIGHT,
  codeBackground: "",
  blockquoteBackground: "",
  blockquoteColor: "",
  blockquoteBarColor: "",
  imageWidth: "wide",
  imageAlign: "center",
  imageWrap: "none",
  imageBorderStyle: "none",
  imageBorderWidth: 1,
  imageBorderColor: "",
  imageRadius: 0,
};

export const normalizeTypographyValues = (
  value: unknown,
  fallback: TypographyValues = DEFAULT_TYPOGRAPHY_VALUES,
): TypographyValues => {
  const raw =
    value && typeof value === "object"
      ? (value as Partial<TypographyValues>)
      : {};

  return {
    font: isTypographyFont(raw.font) ? raw.font : fallback.font,
    fontSize: normalizeBodyFontSizePx(raw.fontSize, fallback.fontSize),
    color: isTypographyColor(raw.color) ? raw.color : fallback.color,
    strongColor: isTypographyColor(raw.strongColor)
      ? raw.strongColor
      : fallback.strongColor,
    letterSpacing: normalizeInRange(
      typeof raw.letterSpacing === "number"
        ? migrateLetterSpacingToPt(raw.letterSpacing)
        : raw.letterSpacing,
      LETTER_SPACING_RANGE,
      fallback.letterSpacing,
    ),
    lineHeight: normalizeInRange(
      raw.lineHeight,
      { min: 0.5, max: 3, step: 0.05 },
      fallback.lineHeight,
    ),
    paragraphSpacing: normalizeInRange(
      typeof raw.paragraphSpacing === "number"
        ? migrateParagraphMeasureToPt(raw.paragraphSpacing)
        : raw.paragraphSpacing,
      PARAGRAPH_SPACING_RANGE,
      fallback.paragraphSpacing,
    ),
    paragraphIndent: normalizeInRange(
      typeof raw.paragraphIndent === "number"
        ? migrateParagraphMeasureToPt(raw.paragraphIndent)
        : raw.paragraphIndent,
      PARAGRAPH_INDENT_RANGE,
      fallback.paragraphIndent,
    ),
    paragraphAlign: isParagraphAlign(raw.paragraphAlign)
      ? raw.paragraphAlign
      : fallback.paragraphAlign,
    linkStyle: isLinkStyle(raw.linkStyle) ? raw.linkStyle : fallback.linkStyle,
    headers: normalizeHeadingStyles(raw.headers, fallback.headers),
    codeStyle: isCodeStyle(raw.codeStyle) ? raw.codeStyle : fallback.codeStyle,
    codeTheme: isCodeTheme(raw.codeTheme) ? raw.codeTheme : fallback.codeTheme,
    codeFont: isCodeFont(raw.codeFont) ? raw.codeFont : fallback.codeFont,
    codeFontSize:
      normalizeCodeFontSize(raw.codeFontSize) ?? fallback.codeFontSize,
    codeFrame:
      typeof raw.codeFrame === "boolean" ? raw.codeFrame : fallback.codeFrame,
    codeFrameColor: isTypographyColor(raw.codeFrameColor)
      ? raw.codeFrameColor
      : fallback.codeFrameColor,
    codeFrameRadius: normalizeInRange(
      raw.codeFrameRadius,
      CODE_RADIUS_RANGE,
      fallback.codeFrameRadius,
    ),
    codeFrameBorder: normalizeInRange(
      raw.codeFrameBorder,
      CODE_BORDER_RANGE,
      fallback.codeFrameBorder,
    ),
    codeFrameWidth: normalizeInRange(
      raw.codeFrameWidth,
      CODE_WIDTH_RANGE,
      fallback.codeFrameWidth,
    ),
    tableStyle: isTableStyle(raw.tableStyle)
      ? raw.tableStyle
      : fallback.tableStyle,
    tableBorderWidth: normalizeInRange(
      raw.tableBorderWidth,
      TABLE_BORDER_RANGE,
      fallback.tableBorderWidth,
    ),
    tableTransparency: normalizeInRange(
      raw.tableTransparency,
      TABLE_TRANSPARENCY_RANGE,
      fallback.tableTransparency,
    ),
    tableHeaderRowBold:
      typeof raw.tableHeaderRowBold === "boolean"
        ? raw.tableHeaderRowBold
        : fallback.tableHeaderRowBold,
    tableHeaderColumnBold:
      typeof raw.tableHeaderColumnBold === "boolean"
        ? raw.tableHeaderColumnBold
        : fallback.tableHeaderColumnBold,
    listStyle: isListStyle(raw.listStyle) ? raw.listStyle : fallback.listStyle,
    blockquoteWeight: isRuleWeight(raw.blockquoteWeight)
      ? raw.blockquoteWeight
      : fallback.blockquoteWeight,
    hrWeight: isRuleWeight(raw.hrWeight) ? raw.hrWeight : fallback.hrWeight,
    codeBackground: isTypographyColor(raw.codeBackground)
      ? raw.codeBackground
      : fallback.codeBackground,
    blockquoteBackground: isTypographyColor(raw.blockquoteBackground)
      ? raw.blockquoteBackground
      : fallback.blockquoteBackground,
    blockquoteColor: isTypographyColor(raw.blockquoteColor)
      ? raw.blockquoteColor
      : fallback.blockquoteColor,
    blockquoteBarColor: isTypographyColor(raw.blockquoteBarColor)
      ? raw.blockquoteBarColor
      : fallback.blockquoteBarColor,
    imageWidth: isImageWidth(raw.imageWidth)
      ? raw.imageWidth
      : fallback.imageWidth,
    imageAlign: isImageAlign(raw.imageAlign)
      ? raw.imageAlign
      : fallback.imageAlign,
    imageWrap: isImageWrap(raw.imageWrap) ? raw.imageWrap : fallback.imageWrap,
    imageBorderStyle: isImageBorderStyle(raw.imageBorderStyle)
      ? raw.imageBorderStyle
      : fallback.imageBorderStyle,
    imageBorderWidth: normalizeInRange(
      raw.imageBorderWidth,
      IMAGE_BORDER_RANGE,
      fallback.imageBorderWidth,
    ),
    imageBorderColor: isTypographyColor(raw.imageBorderColor)
      ? raw.imageBorderColor
      : fallback.imageBorderColor,
    imageRadius: normalizeInRange(
      raw.imageRadius,
      IMAGE_RADIUS_RANGE,
      fallback.imageRadius,
    ),
  };
};

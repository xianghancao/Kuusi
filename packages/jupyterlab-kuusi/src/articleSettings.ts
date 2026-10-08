import type { ISettingRegistry } from "@jupyterlab/settingregistry";
import type { JSONValue } from "@lumino/coreutils";
import {
  DEFAULT_BODY_FONT_SIZE_PX,
  DEFAULT_MIND_MAP_FONT,
  DEFAULT_MIND_MAP_FONT_SIZE,
  bodyFontSizeCss,
  mindMapFontFamilyCss,
  normalizeBodyFontSizePx,
  normalizeMindMapFontSize,
  type BodyFontSizePx,
  type MindMapFont,
  type MindMapFontSize,
  isFontValue,
} from "./fontToolbar";
import {
  CODE_BORDER_RANGE,
  CODE_RADIUS_RANGE,
  CODE_WIDTH_RANGE,
  IMAGE_BORDER_RANGE,
  IMAGE_RADIUS_RANGE,
  migrateLetterSpacingToPt,
  migrateParagraphMeasureToPt,
  isImageAlign,
  isImageBorderStyle,
  isImageWidth as isSharedImageWidth,
  isImageWrap,
  normalizeInRange,
  type CodeFont,
  type CodeStyle,
  type CodeTheme,
  type HeadingId,
  type HeadingLevel,
  type HeadingStyle,
  type HeadingStyles,
  type ImageAlign,
  type ImageBorderStyle,
  type ImageWidth,
  type ImageWrap,
  type LinkStyle,
  type ParagraphAlign,
  type TextAlign,
} from "./typographySettings";
import {
  DEFAULT_CODE_FONT,
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_CODE_THEME,
  applyCodeAppearance,
  isCodeFont,
  isCodeTheme,
} from "./codeThemes";
import {
  DEFAULT_TABLE_APPEARANCE,
  DEFAULT_TABLE_BORDER_WIDTH,
  DEFAULT_TABLE_STYLE,
  TABLE_BORDER_RANGE,
  applyTableAppearance,
  isTableStyle,
  type TableStyle,
} from "./tableSettings";
import {
  DEFAULT_BLOCKQUOTE_WEIGHT,
  DEFAULT_HR_WEIGHT,
  DEFAULT_LIST_STYLE,
  applyElementChromeAppearance,
  isListStyle,
  isRuleWeight,
  type ListStyle,
  type RuleWeight,
} from "./elementChromeSettings";
import {
  isPageNumberStart,
  type PageNumberStart,
} from "./pageNumberStart";
import { isPaperSize, paperDimensions } from "./articlePaper";
import type { ArticlePaperOrientation, ArticlePaperSize } from "./articlePaper";
import {
  TOC_DEPTH_RANGE,
  isChapterBreak,
  isHeadingNumbering,
  type ChapterBreak,
  type HeadingNumbering,
} from "./articleStructure";
export type { ChapterBreak, HeadingNumbering } from "./articleStructure";

export type { PageNumberStart } from "./pageNumberStart";

export const ARTICLE_SETTINGS_PLUGIN_ID = "jupyterlab-kuusi:article";

export type ArticleFont = MindMapFont;
export type ArticleFontSize = MindMapFontSize;
export type ArticleBodyFontSize = BodyFontSizePx;
/** Unitless line-height multiplier (0.5–3). */
export type ArticleLineHeight = number;
/** Paragraph margin-block in pt (0–48), Word-style. */
export type ArticleParagraphSpacing = number;
/** First-line indent in pt (0–72), Word-style. */
export type ArticleParagraphIndent = number;
export type ArticleParagraphAlign = ParagraphAlign;
export type ArticleColumnAlign = "left" | "center";
/** CSS multi-column flow inside the reading pane (1 = single column). */
export type ArticleColumns = 1 | 2;
export type ArticlePageLayout = "scroll" | "paged";
export type { ArticlePaperSize, ArticlePaperOrientation } from "./articlePaper";
export type ArticleLinkStyle = LinkStyle;
export type ArticleCodeStyle = CodeStyle;
export type ArticleImageWidth = ImageWidth;
export type ArticleImageAlign = ImageAlign;
export type ArticleImageWrap = ImageWrap;
export type ArticleImageBorderStyle = ImageBorderStyle;
export type ArticleMeasure = "narrow" | "reading" | "wide" | "full";
/** Horizontal page inset in rem; top/bottom follow proportional CSS. */
export type ArticlePadding = number;

export const ARTICLE_PADDING_MIN = 0.5;
/** 8 rem ≈ 34 mm: enough for ordinary printed margins (it used to stop at 17 mm). */
export const ARTICLE_PADDING_MAX = 8;
export const ARTICLE_PADDING_STEP = 0.25;
export const ARTICLE_PADDING_DEFAULT = 2;
export type ArticleBackground =
  | "theme"
  | "paper"
  | "newspaper"
  | "eye-care"
  | "ink"
  | "sepia"
  | "mist";
export type ArticleBackgroundPattern =
  | "none"
  | "plain"
  | "grid"
  | "dots"
  | "lines"
  | "notebook";
export type ArticleHeaderAlign = TextAlign;
export type ArticlePageNumber = "none" | "page" | "page-of-total";
export type ArticlePageNumberPosition = "header" | "footer";
export type ArticleHeaderLevel = HeadingLevel;
export type ArticleHeaderId = HeadingId;
export type ArticleTheme =
  | "notebook"
  | "essay"
  | "magazine"
  | "night"
  | "academic"
  | "minimal";

/** Below ~0.9 lines overlap; Slides and Mind Map already start at 0.9. */
export const ARTICLE_LINE_HEIGHT_MIN = 0.9;
export const ARTICLE_LINE_HEIGHT_MAX = 3;
export const ARTICLE_LINE_HEIGHT_STEP = 0.05;
export const ARTICLE_PARAGRAPH_SPACING_MIN = 0;
export const ARTICLE_PARAGRAPH_SPACING_MAX = 48;
export const ARTICLE_PARAGRAPH_SPACING_STEP = 1;
export const ARTICLE_PARAGRAPH_INDENT_MIN = 0;
export const ARTICLE_PARAGRAPH_INDENT_MAX = 72;
export const ARTICLE_PARAGRAPH_INDENT_STEP = 1;
export const ARTICLE_LETTER_SPACING_MIN = 0;
export const ARTICLE_LETTER_SPACING_MAX = 3;
export const ARTICLE_LETTER_SPACING_STEP = 0.05;

/** Paper sheet edge thickness (px). */
export const ARTICLE_PAPER_BORDER_RANGE = { min: 0, max: 12, step: 1 } as const;
/** Soft drop-shadow blur radius around each paper sheet (px). */
export const ARTICLE_PAPER_SHADOW_WIDTH_RANGE = {
  min: 0,
  max: 64,
  step: 1,
} as const;
export const ARTICLE_PAPER_BORDER_DEFAULT = 1;
export const ARTICLE_PAPER_SHADOW_WIDTH_DEFAULT = 28;

export type ArticleHeaderStyle = HeadingStyle;

export type ArticleHeaders = HeadingStyles;

export type ArticleSettings = {
  theme: ArticleTheme;
  measure: ArticleMeasure;
  padding: ArticlePadding;
  columnAlign: ArticleColumnAlign;
  columns: ArticleColumns;
  pageLayout: ArticlePageLayout;
  paperSize: ArticlePaperSize;
  paperOrientation: ArticlePaperOrientation;
  /** Paper sheet edge thickness in px. */
  paperBorderWidth: number;
  /** Empty string uses a soft default edge color. */
  paperBorderColor: string;
  /** Soft drop shadow around each paper sheet. */
  paperShadow: boolean;
  /** Soft shadow blur radius in px. */
  paperShadowWidth: number;
  imageWidth: ArticleImageWidth;
  imageAlign: ArticleImageAlign;
  imageWrap: ArticleImageWrap;
  imageBorderStyle: ArticleImageBorderStyle;
  imageBorderWidth: number;
  imageBorderColor: string;
  imageRadius: number;
  /** Paper surface of the reading column. */
  background: ArticleBackground;
  backgroundPattern: ArticleBackgroundPattern;
  /** Solid color of the pane behind the paper. */
  viewBackground: ArticleBackground;
  /** Empty string uses `viewBackground`; otherwise a CSS color. */
  viewBackgroundColor: string;
  font: ArticleFont;
  fontSize: ArticleBodyFontSize;
  /** Empty string follows the Article page foreground. */
  color: string;
  /** Empty string inherits the body color for bold text. */
  strongColor: string;
  letterSpacing: number;
  lineHeight: ArticleLineHeight;
  paragraphSpacing: ArticleParagraphSpacing;
  paragraphIndent: ArticleParagraphIndent;
  paragraphAlign: ArticleParagraphAlign;
  linkStyle: ArticleLinkStyle;
  codeStyle: ArticleCodeStyle;
  codeTheme: CodeTheme;
  codeFont: CodeFont;
  codeFontSize: ArticleFontSize;
  codeFrame: boolean;
  /** Empty string follows the page foreground. */
  codeFrameColor: string;
  codeFrameRadius: number;
  codeFrameBorder: number;
  /** Code block max-width as percent of the column. */
  codeFrameWidth: number;
  tableStyle: TableStyle;
  tableBorderWidth: number;
  tableHeaderRowBold: boolean;
  tableHeaderColumnBold: boolean;
  listStyle: ListStyle;
  blockquoteWeight: RuleWeight;
  hrWeight: RuleWeight;
  headers: ArticleHeaders;
  /** Running header text for paged layout; supports {title}, {page}, {pages}. */
  pageHeaderText: string;
  pageHeaderAlign: ArticleHeaderAlign;
  /** Thin rule between the header and the text block. */
  pageHeaderRule: boolean;
  pageFooterRule: boolean;
  /** Leave the first sheet's header and footer text empty (cover / title page). */
  pageFirstDifferent: boolean;
  /** Repeat table header rows on every page a table spans (paged layout). */
  tableRepeatHeader: boolean;
  /** Running footer text for paged layout; supports {title}, {page}, {pages}. */
  pageFooterText: string;
  pageFooterAlign: ArticleHeaderAlign;
  pageNumber: ArticlePageNumber;
  pageNumberPosition: ArticlePageNumberPosition;
  pageNumberAlign: ArticleHeaderAlign;
  /** Number from the first sheet, or skip the first and start on sheet 2. */
  pageNumberStart: PageNumberStart;
  showTextCount: boolean;
  showPageCount: boolean;
  showFileSize: boolean;
  /** Prefix headings with 1 / 1.1 or 第一章 / 1.1 (shared by contents + PDF bookmarks). */
  headingNumbering: HeadingNumbering;
  /** Start every H1 (or H1/H2) on a new page. */
  chapterBreak: ChapterBreak;
  /** Contents page at the start of the document. */
  tocShow: boolean;
  /** Heading levels listed in the contents (1–4, counted from the top level). */
  tocDepth: number;
  /** Contents page heading; empty uses the localized “Contents”. */
  tocTitle: string;
};

/** Page furniture and code chrome are per-user, not part of a theme preset. */
type ArticleUserOnlyKey =
  | "codeTheme"
  | "codeFont"
  | "codeFontSize"
  | "codeFrame"
  | "codeFrameColor"
  | "codeFrameRadius"
  | "codeFrameBorder"
  | "codeFrameWidth"
  | "tableStyle"
  | "tableBorderWidth"
  | "tableHeaderRowBold"
  | "tableHeaderColumnBold"
  | "listStyle"
  | "blockquoteWeight"
  | "hrWeight"
  | "imageAlign"
  | "imageWrap"
  | "imageBorderStyle"
  | "imageBorderWidth"
  | "imageBorderColor"
  | "imageRadius"
  | "pageHeaderText"
  | "pageHeaderAlign"
  | "pageHeaderRule"
  | "pageFooterRule"
  | "pageFirstDifferent"
  | "tableRepeatHeader"
  | "pageFooterText"
  | "pageFooterAlign"
  | "pageNumber"
  | "pageNumberPosition"
  | "pageNumberAlign"
  | "pageNumberStart"
  | "viewBackgroundColor"
  | "paperBorderWidth"
  | "paperBorderColor"
  | "paperShadow"
  | "paperShadowWidth"
  | "showTextCount"
  | "showPageCount"
  | "showFileSize"
  | "headingNumbering"
  | "chapterBreak"
  | "tocShow"
  | "tocDepth"
  | "tocTitle";

export const ARTICLE_HEADER_LEVELS: ArticleHeaderLevel[] = [1, 2, 3, 4, 5, 6];

export const articleHeaderId = (level: ArticleHeaderLevel): ArticleHeaderId =>
  `h${level}`;

const HEADER_SIZE_CSS: Record<ArticleFontSize, string> = {
  xxs: "0.85rem",
  xs: "0.95rem",
  sm: "1.1rem",
  md: "1.25rem",
  lg: "1.5rem",
  xl: "1.85rem",
  xxl: "2.25rem",
};

const makeHeader = (
  partial: Partial<ArticleHeaderStyle> = {},
): ArticleHeaderStyle => ({
  font: partial.font ?? DEFAULT_MIND_MAP_FONT,
  fontSize: partial.fontSize ?? DEFAULT_MIND_MAP_FONT_SIZE,
  color: partial.color ?? "",
  align: partial.align ?? "left",
});

const makeHeaders = (
  partial: Partial<Record<ArticleHeaderId, Partial<ArticleHeaderStyle>>> = {},
): ArticleHeaders => ({
  h1: makeHeader({ fontSize: "xxl", ...partial.h1 }),
  h2: makeHeader({ fontSize: "xl", ...partial.h2 }),
  h3: makeHeader({ fontSize: "lg", ...partial.h3 }),
  h4: makeHeader({ fontSize: "md", ...partial.h4 }),
  h5: makeHeader({ fontSize: "sm", ...partial.h5 }),
  h6: makeHeader({ fontSize: "xs", ...partial.h6 }),
});

const themeHeaders = (
  font: ArticleFont,
  align: ArticleHeaderAlign,
  sizes: Record<ArticleHeaderId, ArticleFontSize>,
): ArticleHeaders =>
  makeHeaders({
    h1: { font, align, fontSize: sizes.h1 },
    h2: { font, align, fontSize: sizes.h2 },
    h3: { font, align, fontSize: sizes.h3 },
    h4: { font, align, fontSize: sizes.h4 },
    h5: { font, align, fontSize: sizes.h5 },
    h6: { font, align, fontSize: sizes.h6 },
  });

export const DEFAULT_ARTICLE_SETTINGS: ArticleSettings = {
  theme: "notebook",
  measure: "reading",
  padding: ARTICLE_PADDING_DEFAULT,
  columnAlign: "center",
  columns: 1,
  pageLayout: "paged",
  paperSize: "a4",
  paperOrientation: "portrait",
  paperBorderWidth: ARTICLE_PAPER_BORDER_DEFAULT,
  paperBorderColor: "",
  paperShadow: true,
  paperShadowWidth: ARTICLE_PAPER_SHADOW_WIDTH_DEFAULT,
  imageWidth: "wide",
  imageAlign: "center",
  imageWrap: "none",
  imageBorderStyle: "none",
  imageBorderWidth: 1,
  imageBorderColor: "",
  imageRadius: 0,
  background: "theme",
  backgroundPattern: "notebook",
  viewBackground: "theme",
  viewBackgroundColor: "",
  font: DEFAULT_MIND_MAP_FONT,
  fontSize: DEFAULT_BODY_FONT_SIZE_PX,
  color: "",
  strongColor: "",
  letterSpacing: 0,
  lineHeight: 1.55,
  paragraphSpacing: 10,
  paragraphIndent: 0,
  paragraphAlign: "left",
  linkStyle: "default",
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
  tableHeaderRowBold: DEFAULT_TABLE_APPEARANCE.tableHeaderRowBold,
  tableHeaderColumnBold: DEFAULT_TABLE_APPEARANCE.tableHeaderColumnBold,
  listStyle: DEFAULT_LIST_STYLE,
  blockquoteWeight: DEFAULT_BLOCKQUOTE_WEIGHT,
  hrWeight: DEFAULT_HR_WEIGHT,
  headers: themeHeaders("notebook", "left", {
    h1: "xxl",
    h2: "xl",
    h3: "lg",
    h4: "md",
    h5: "sm",
    h6: "xs",
  }),
  pageHeaderText: "",
  pageHeaderAlign: "center",
  pageHeaderRule: false,
  pageFooterRule: false,
  pageFirstDifferent: false,
  tableRepeatHeader: true,
  pageFooterText: "",
  pageFooterAlign: "left",
  pageNumber: "none",
  pageNumberPosition: "footer",
  pageNumberAlign: "center",
  pageNumberStart: "first",
  showTextCount: false,
  showPageCount: false,
  showFileSize: false,
  headingNumbering: "none",
  chapterBreak: "none",
  tocShow: false,
  tocDepth: 3,
  tocTitle: "",
};

const headersFromLegacyTitle = (raw: {
  titleFont?: unknown;
  titleFontSize?: unknown;
  titleAlign?: unknown;
}): ArticleHeaders | null => {
  const font = isFont(raw.titleFont) ? raw.titleFont : null;
  const fontSize = normalizeMindMapFontSize(raw.titleFontSize);
  const align = isHeaderAlign(raw.titleAlign) ? raw.titleAlign : null;

  if (!font && !fontSize && !align) {
    return null;
  }

  const shared: Partial<ArticleHeaderStyle> = {};
  if (font) {
    shared.font = font;
  }
  if (align) {
    shared.align = align;
  }

  return makeHeaders({
    h1: { ...shared, fontSize: fontSize ?? "xxl" },
    h2: { ...shared, fontSize: fontSize ?? "xl" },
    h3: { ...shared, fontSize: fontSize ?? "lg" },
    h4: { ...shared, fontSize: fontSize ?? "md" },
    h5: { ...shared, fontSize: fontSize ?? "sm" },
    h6: { ...shared, fontSize: fontSize ?? "xs" },
  });
};

export const ARTICLE_THEME_PRESETS: Record<
  ArticleTheme,
  Omit<ArticleSettings, "theme" | ArticleUserOnlyKey>
> = {
  /** Jupyter-like reading column with notebook ruled paper. */
  notebook: {
    measure: "reading",
    padding: ARTICLE_PADDING_DEFAULT,
    columnAlign: "center",
    columns: 1,
    pageLayout: "paged",
    paperSize: "a4",
    paperOrientation: "portrait",
    imageWidth: "wide",
    background: "theme",
    backgroundPattern: "notebook",
    viewBackground: "theme",
    font: "notebook",
    fontSize: 14,
    color: "",
    strongColor: "",
    letterSpacing: 0,
    lineHeight: 1.55,
    paragraphSpacing: 10,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "default",
    codeStyle: "muted",
    headers: themeHeaders("notebook", "left", {
      h1: "xxl",
      h2: "xl",
      h3: "lg",
      h4: "md",
      h5: "sm",
      h6: "xs",
    }),
  },
  /** Narrow literary column: warm paper, serif body, first-line indent. */
  essay: {
    measure: "narrow",
    padding: 2.5,
    columnAlign: "center",
    columns: 1,
    pageLayout: "paged",
    paperSize: "a4",
    paperOrientation: "portrait",
    imageWidth: "natural",
    background: "sepia",
    backgroundPattern: "none",
    viewBackground: "paper",
    font: "georgia",
    fontSize: 15,
    color: "",
    strongColor: "",
    letterSpacing: 0.35,
    lineHeight: 1.85,
    paragraphSpacing: 18,
    paragraphIndent: 28,
    paragraphAlign: "left",
    linkStyle: "underline",
    codeStyle: "plain",
    headers: themeHeaders("garamond", "left", {
      h1: "xxl",
      h2: "xl",
      h3: "lg",
      h4: "md",
      h5: "sm",
      h6: "xs",
    }),
  },
  /** Dense magazine spread: wide measure, two columns, centered display titles. */
  magazine: {
    measure: "wide",
    padding: 1.25,
    columnAlign: "center",
    columns: 2,
    pageLayout: "paged",
    paperSize: "a4",
    paperOrientation: "portrait",
    imageWidth: "full",
    background: "newspaper",
    backgroundPattern: "none",
    viewBackground: "newspaper",
    font: "helvetica",
    fontSize: 13,
    color: "",
    strongColor: "",
    letterSpacing: 0,
    lineHeight: 1.45,
    paragraphSpacing: 6,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "accent",
    codeStyle: "contrast",
    headers: themeHeaders("helvetica", "center", {
      h1: "xxl",
      h2: "xl",
      h3: "lg",
      h4: "md",
      h5: "sm",
      h6: "xs",
    }),
  },
  /** Dark ink canvas with larger type for low-light reading. */
  night: {
    measure: "reading",
    padding: 2.25,
    columnAlign: "center",
    columns: 1,
    pageLayout: "paged",
    paperSize: "a4",
    paperOrientation: "portrait",
    imageWidth: "wide",
    background: "ink",
    backgroundPattern: "none",
    viewBackground: "ink",
    font: "system-ui",
    fontSize: 16,
    color: "",
    strongColor: "",
    letterSpacing: 0.15,
    lineHeight: 1.7,
    paragraphSpacing: 14,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "accent",
    codeStyle: "contrast",
    headers: themeHeaders("system-ui", "left", {
      h1: "xl",
      h2: "lg",
      h3: "md",
      h4: "sm",
      h5: "xs",
      h6: "xxs",
    }),
  },
  /** Journal-style serif: justified body, restrained headings, cool mist page. */
  academic: {
    measure: "reading",
    padding: 2.5,
    columnAlign: "center",
    columns: 1,
    pageLayout: "paged",
    paperSize: "a4",
    paperOrientation: "portrait",
    imageWidth: "natural",
    background: "mist",
    backgroundPattern: "none",
    viewBackground: "mist",
    font: "times",
    fontSize: 12,
    color: "",
    strongColor: "",
    letterSpacing: 0,
    lineHeight: 1.9,
    paragraphSpacing: 0,
    paragraphIndent: 24,
    paragraphAlign: "justify",
    linkStyle: "underline",
    codeStyle: "muted",
    headers: themeHeaders("times", "center", {
      h1: "xl",
      h2: "lg",
      h3: "md",
      h4: "sm",
      h5: "xs",
      h6: "xxs",
    }),
  },
  /** Airy sans column: plain surface, generous margins, quiet hierarchy. */
  minimal: {
    measure: "narrow",
    padding: 3.5,
    columnAlign: "left",
    columns: 1,
    pageLayout: "paged",
    paperSize: "a4",
    paperOrientation: "portrait",
    imageWidth: "natural",
    background: "theme",
    backgroundPattern: "plain",
    viewBackground: "theme",
    font: "system-ui",
    fontSize: 14,
    color: "",
    strongColor: "",
    letterSpacing: 0.5,
    lineHeight: 1.75,
    paragraphSpacing: 20,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "default",
    codeStyle: "plain",
    headers: themeHeaders("system-ui", "left", {
      h1: "lg",
      h2: "md",
      h3: "sm",
      h4: "sm",
      h5: "xs",
      h6: "xxs",
    }),
  },
};

/** Theme stamps layout, page chrome, typography, and headings. */
export const articleThemeChrome = (
  theme: ArticleTheme,
): Omit<(typeof ARTICLE_THEME_PRESETS)[ArticleTheme], never> => {
  const preset = ARTICLE_THEME_PRESETS[theme];
  return {
    measure: preset.measure,
    padding: preset.padding,
    columnAlign: preset.columnAlign,
    columns: preset.columns,
    pageLayout: preset.pageLayout,
    paperSize: preset.paperSize,
    paperOrientation: preset.paperOrientation,
    imageWidth: preset.imageWidth,
    background: preset.background,
    backgroundPattern: preset.backgroundPattern,
    viewBackground: preset.viewBackground,
    font: preset.font,
    fontSize: preset.fontSize,
    color: preset.color,
    strongColor: preset.strongColor,
    letterSpacing: preset.letterSpacing,
    lineHeight: preset.lineHeight,
    paragraphSpacing: preset.paragraphSpacing,
    paragraphIndent: preset.paragraphIndent,
    paragraphAlign: preset.paragraphAlign,
    linkStyle: preset.linkStyle,
    codeStyle: preset.codeStyle,
    headers: preset.headers,
  };
};

const isFont = (value: unknown): value is ArticleFont => isFontValue(value);

const clampArticleNumber = (
  value: number,
  min: number,
  max: number,
  step: number,
): number => {
  const clamped = Math.min(max, Math.max(min, value));
  const steps = Math.round((clamped - min) / step);
  return Number((min + steps * step).toFixed(2));
};

const normalizeLineHeight = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampArticleNumber(
      value,
      ARTICLE_LINE_HEIGHT_MIN,
      ARTICLE_LINE_HEIGHT_MAX,
      ARTICLE_LINE_HEIGHT_STEP,
    );
  }

  // Legacy named presets from the first Article capsule.
  if (value === "compact") {
    return 1.4;
  }
  if (value === "reading") {
    return 1.6;
  }
  if (value === "loose") {
    return 1.8;
  }

  return fallback;
};

const normalizeParagraphSpacing = (
  value: unknown,
  fallback: number,
): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampArticleNumber(
      migrateParagraphMeasureToPt(value),
      ARTICLE_PARAGRAPH_SPACING_MIN,
      ARTICLE_PARAGRAPH_SPACING_MAX,
      ARTICLE_PARAGRAPH_SPACING_STEP,
    );
  }

  if (value === "compact") {
    return 7;
  }
  if (value === "reading") {
    return 12;
  }
  if (value === "loose") {
    return 19;
  }

  return fallback;
};

const normalizeParagraphIndent = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampArticleNumber(
      migrateParagraphMeasureToPt(value),
      ARTICLE_PARAGRAPH_INDENT_MIN,
      ARTICLE_PARAGRAPH_INDENT_MAX,
      ARTICLE_PARAGRAPH_INDENT_STEP,
    );
  }

  if (value === "none") {
    return 0;
  }
  if (value === "half") {
    return 12;
  }
  if (value === "full") {
    return 24;
  }

  return fallback;
};

const isParagraphAlign = (value: unknown): value is ArticleParagraphAlign =>
  value === "left" || value === "justify";

const isColumnAlign = (value: unknown): value is ArticleColumnAlign =>
  value === "left" || value === "center";

const isColumns = (value: unknown): value is ArticleColumns =>
  value === 1 || value === 2;

const isPageLayout = (value: unknown): value is ArticlePageLayout =>
  value === "scroll" || value === "paged";


const isPaperOrientation = (
  value: unknown,
): value is ArticlePaperOrientation =>
  value === "portrait" || value === "landscape";

const isLinkStyle = (value: unknown): value is ArticleLinkStyle =>
  value === "default" || value === "underline" || value === "accent";

const isCodeStyle = (value: unknown): value is ArticleCodeStyle =>
  value === "plain" || value === "muted" || value === "contrast";

const isImageWidth = isSharedImageWidth;

const isMeasure = (value: unknown): value is ArticleMeasure =>
  value === "narrow" ||
  value === "reading" ||
  value === "wide" ||
  value === "full";

const normalizePadding = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampArticleNumber(
      value,
      ARTICLE_PADDING_MIN,
      ARTICLE_PADDING_MAX,
      ARTICLE_PADDING_STEP,
    );
  }

  // Legacy named presets from the first Article capsule.
  if (value === "compact") {
    return 1.5;
  }
  if (value === "reading") {
    return ARTICLE_PADDING_DEFAULT;
  }
  if (value === "loose") {
    return 2.75;
  }

  return fallback;
};

const isBackground = (value: unknown): value is ArticleBackground =>
  value === "theme" ||
  value === "paper" ||
  value === "newspaper" ||
  value === "eye-care" ||
  value === "ink" ||
  value === "sepia" ||
  value === "mist";

const isBackgroundPattern = (
  value: unknown,
): value is ArticleBackgroundPattern =>
  value === "none" ||
  value === "plain" ||
  value === "grid" ||
  value === "dots" ||
  value === "lines" ||
  value === "notebook";

const isHeaderAlign = (value: unknown): value is ArticleHeaderAlign =>
  value === "left" || value === "center" || value === "right";

const isPageNumber = (value: unknown): value is ArticlePageNumber =>
  value === "none" || value === "page" || value === "page-of-total";

const isPageNumberPosition = (
  value: unknown,
): value is ArticlePageNumberPosition =>
  value === "header" || value === "footer";

const ARTICLE_PAGE_TEXT_MAX = 200;

const normalizePageText = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value.slice(0, ARTICLE_PAGE_TEXT_MAX) : fallback;

const isTheme = (value: unknown): value is ArticleTheme =>
  value === "notebook" ||
  value === "essay" ||
  value === "magazine" ||
  value === "night" ||
  value === "academic" ||
  value === "minimal";

const normalizeLetterSpacing = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampArticleNumber(
      migrateLetterSpacingToPt(value),
      ARTICLE_LETTER_SPACING_MIN,
      ARTICLE_LETTER_SPACING_MAX,
      ARTICLE_LETTER_SPACING_STEP,
    );
  }
  return fallback;
};

const isColor = (value: unknown): value is string =>
  typeof value === "string" &&
  (value === "" || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value));

const normalizeHeaderStyle = (
  value: unknown,
  fallback: ArticleHeaderStyle,
): ArticleHeaderStyle => {
  const raw =
    value && typeof value === "object"
      ? (value as Partial<ArticleHeaderStyle>)
      : {};

  return {
    font: isFont(raw.font) ? raw.font : fallback.font,
    fontSize: normalizeMindMapFontSize(raw.fontSize) ?? fallback.fontSize,
    color: isColor(raw.color) ? raw.color : fallback.color,
    align: isHeaderAlign(raw.align) ? raw.align : fallback.align,
  };
};

const normalizeHeaders = (value: unknown): ArticleHeaders => {
  const defaults = DEFAULT_ARTICLE_SETTINGS.headers;
  const raw =
    value && typeof value === "object"
      ? (value as Partial<Record<ArticleHeaderId, unknown>>)
      : {};

  return {
    h1: normalizeHeaderStyle(raw.h1, defaults.h1),
    h2: normalizeHeaderStyle(raw.h2, defaults.h2),
    h3: normalizeHeaderStyle(raw.h3, defaults.h3),
    h4: normalizeHeaderStyle(raw.h4, defaults.h4),
    h5: normalizeHeaderStyle(raw.h5, defaults.h5),
    h6: normalizeHeaderStyle(raw.h6, defaults.h6),
  };
};

export const normalizeArticleSettings = (value: unknown): ArticleSettings => {
  const defaults = DEFAULT_ARTICLE_SETTINGS;
  const raw =
    value && typeof value === "object"
      ? (value as Partial<ArticleSettings> & {
          page?: unknown;
          titleFont?: unknown;
          titleFontSize?: unknown;
          titleAlign?: unknown;
        })
      : {};
  const legacyBackground = isBackground(raw.page) ? raw.page : null;
  const hasHeaders =
    raw.headers && typeof raw.headers === "object" && raw.headers !== null;
  const headers = hasHeaders
    ? normalizeHeaders(raw.headers)
    : (headersFromLegacyTitle(raw) ?? defaults.headers);

  return {
    theme: isTheme(raw.theme) ? raw.theme : defaults.theme,
    measure: isMeasure(raw.measure) ? raw.measure : defaults.measure,
    padding: normalizePadding(raw.padding, defaults.padding),
    columnAlign: isColumnAlign(raw.columnAlign)
      ? raw.columnAlign
      : defaults.columnAlign,
    columns: isColumns(raw.columns) ? raw.columns : defaults.columns,
    pageLayout: isPageLayout(raw.pageLayout)
      ? raw.pageLayout
      : defaults.pageLayout,
    paperSize: isPaperSize(raw.paperSize) ? raw.paperSize : defaults.paperSize,
    paperOrientation: isPaperOrientation(raw.paperOrientation)
      ? raw.paperOrientation
      : defaults.paperOrientation,
    paperBorderWidth: normalizeInRange(
      raw.paperBorderWidth,
      ARTICLE_PAPER_BORDER_RANGE,
      defaults.paperBorderWidth,
    ),
    paperBorderColor: isColor(raw.paperBorderColor)
      ? raw.paperBorderColor
      : defaults.paperBorderColor,
    paperShadow:
      typeof raw.paperShadow === "boolean"
        ? raw.paperShadow
        : defaults.paperShadow,
    paperShadowWidth: normalizeInRange(
      raw.paperShadowWidth,
      ARTICLE_PAPER_SHADOW_WIDTH_RANGE,
      defaults.paperShadowWidth,
    ),
    imageWidth: isImageWidth(raw.imageWidth)
      ? raw.imageWidth
      : defaults.imageWidth,
    imageAlign: isImageAlign(raw.imageAlign)
      ? raw.imageAlign
      : defaults.imageAlign,
    imageWrap: isImageWrap(raw.imageWrap) ? raw.imageWrap : defaults.imageWrap,
    imageBorderStyle: isImageBorderStyle(raw.imageBorderStyle)
      ? raw.imageBorderStyle
      : defaults.imageBorderStyle,
    imageBorderWidth: normalizeInRange(
      raw.imageBorderWidth,
      IMAGE_BORDER_RANGE,
      defaults.imageBorderWidth,
    ),
    imageBorderColor: isColor(raw.imageBorderColor)
      ? raw.imageBorderColor
      : defaults.imageBorderColor,
    imageRadius: normalizeInRange(
      raw.imageRadius,
      IMAGE_RADIUS_RANGE,
      defaults.imageRadius,
    ),
    background: isBackground(raw.background)
      ? raw.background
      : (legacyBackground ?? defaults.background),
    backgroundPattern: isBackgroundPattern(raw.backgroundPattern)
      ? raw.backgroundPattern
      : defaults.backgroundPattern,
    viewBackground: isBackground(raw.viewBackground)
      ? raw.viewBackground
      : defaults.viewBackground,
    viewBackgroundColor: isColor(raw.viewBackgroundColor)
      ? raw.viewBackgroundColor
      : defaults.viewBackgroundColor,
    font: isFont(raw.font) ? raw.font : defaults.font,
    fontSize: normalizeBodyFontSizePx(raw.fontSize, defaults.fontSize),
    color: isColor(raw.color) ? raw.color : defaults.color,
    strongColor: isColor(raw.strongColor) ? raw.strongColor : defaults.strongColor,
    letterSpacing: normalizeLetterSpacing(
      raw.letterSpacing,
      defaults.letterSpacing,
    ),
    lineHeight: normalizeLineHeight(raw.lineHeight, defaults.lineHeight),
    paragraphSpacing: normalizeParagraphSpacing(
      raw.paragraphSpacing,
      defaults.paragraphSpacing,
    ),
    paragraphIndent: normalizeParagraphIndent(
      raw.paragraphIndent,
      defaults.paragraphIndent,
    ),
    paragraphAlign: isParagraphAlign(raw.paragraphAlign)
      ? raw.paragraphAlign
      : defaults.paragraphAlign,
    linkStyle: isLinkStyle(raw.linkStyle) ? raw.linkStyle : defaults.linkStyle,
    codeStyle: isCodeStyle(raw.codeStyle) ? raw.codeStyle : defaults.codeStyle,
    codeTheme: isCodeTheme(raw.codeTheme) ? raw.codeTheme : defaults.codeTheme,
    codeFont: isCodeFont(raw.codeFont) ? raw.codeFont : defaults.codeFont,
    codeFontSize:
      normalizeMindMapFontSize(raw.codeFontSize) ?? defaults.codeFontSize,
    // Before the frame toggle, Plain and Contrast code blocks were framed.
    codeFrame:
      typeof raw.codeFrame === "boolean"
        ? raw.codeFrame
        : isCodeStyle(raw.codeStyle)
          ? raw.codeStyle !== "muted"
          : defaults.codeFrame,
    codeFrameColor: isColor(raw.codeFrameColor)
      ? raw.codeFrameColor
      : defaults.codeFrameColor,
    codeFrameRadius: normalizeInRange(
      raw.codeFrameRadius,
      CODE_RADIUS_RANGE,
      defaults.codeFrameRadius,
    ),
    codeFrameBorder: normalizeInRange(
      raw.codeFrameBorder,
      CODE_BORDER_RANGE,
      defaults.codeFrameBorder,
    ),
    codeFrameWidth: normalizeInRange(
      raw.codeFrameWidth,
      CODE_WIDTH_RANGE,
      defaults.codeFrameWidth,
    ),
    tableStyle: isTableStyle(raw.tableStyle)
      ? raw.tableStyle
      : defaults.tableStyle,
    tableBorderWidth: normalizeInRange(
      raw.tableBorderWidth,
      TABLE_BORDER_RANGE,
      defaults.tableBorderWidth,
    ),
    tableHeaderRowBold:
      typeof raw.tableHeaderRowBold === "boolean"
        ? raw.tableHeaderRowBold
        : defaults.tableHeaderRowBold,
    tableHeaderColumnBold:
      typeof raw.tableHeaderColumnBold === "boolean"
        ? raw.tableHeaderColumnBold
        : defaults.tableHeaderColumnBold,
    listStyle: isListStyle(raw.listStyle) ? raw.listStyle : defaults.listStyle,
    blockquoteWeight: isRuleWeight(raw.blockquoteWeight)
      ? raw.blockquoteWeight
      : defaults.blockquoteWeight,
    hrWeight: isRuleWeight(raw.hrWeight) ? raw.hrWeight : defaults.hrWeight,
    headers,
    pageHeaderText: normalizePageText(
      raw.pageHeaderText,
      defaults.pageHeaderText,
    ),
    pageHeaderRule:
      typeof raw.pageHeaderRule === "boolean"
        ? raw.pageHeaderRule
        : defaults.pageHeaderRule,
    pageFooterRule:
      typeof raw.pageFooterRule === "boolean"
        ? raw.pageFooterRule
        : defaults.pageFooterRule,
    tableRepeatHeader:
      typeof raw.tableRepeatHeader === "boolean"
        ? raw.tableRepeatHeader
        : defaults.tableRepeatHeader,
    pageFirstDifferent:
      typeof raw.pageFirstDifferent === "boolean"
        ? raw.pageFirstDifferent
        : defaults.pageFirstDifferent,
    pageHeaderAlign: isHeaderAlign(raw.pageHeaderAlign)
      ? raw.pageHeaderAlign
      : defaults.pageHeaderAlign,
    pageFooterText: normalizePageText(
      raw.pageFooterText,
      defaults.pageFooterText,
    ),
    pageFooterAlign: isHeaderAlign(raw.pageFooterAlign)
      ? raw.pageFooterAlign
      : defaults.pageFooterAlign,
    pageNumber: isPageNumber(raw.pageNumber)
      ? raw.pageNumber
      : defaults.pageNumber,
    pageNumberPosition: isPageNumberPosition(raw.pageNumberPosition)
      ? raw.pageNumberPosition
      : defaults.pageNumberPosition,
    pageNumberAlign: isHeaderAlign(raw.pageNumberAlign)
      ? raw.pageNumberAlign
      : defaults.pageNumberAlign,
    pageNumberStart: isPageNumberStart(raw.pageNumberStart)
      ? raw.pageNumberStart
      : defaults.pageNumberStart,
    showTextCount:
      typeof raw.showTextCount === "boolean"
        ? raw.showTextCount
        : defaults.showTextCount,
    showPageCount:
      typeof raw.showPageCount === "boolean"
        ? raw.showPageCount
        : defaults.showPageCount,
    showFileSize:
      typeof raw.showFileSize === "boolean"
        ? raw.showFileSize
        : defaults.showFileSize,
    headingNumbering: isHeadingNumbering(raw.headingNumbering)
      ? raw.headingNumbering
      : defaults.headingNumbering,
    chapterBreak: isChapterBreak(raw.chapterBreak)
      ? raw.chapterBreak
      : defaults.chapterBreak,
    tocShow:
      typeof raw.tocShow === "boolean" ? raw.tocShow : defaults.tocShow,
    tocDepth:
      typeof raw.tocDepth === "number" && Number.isFinite(raw.tocDepth)
        ? Math.min(
            TOC_DEPTH_RANGE.max,
            Math.max(TOC_DEPTH_RANGE.min, Math.round(raw.tocDepth)),
          )
        : defaults.tocDepth,
    tocTitle: normalizePageText(raw.tocTitle, defaults.tocTitle),
  };
};

export const updateArticleHeader = (
  headers: ArticleHeaders,
  id: ArticleHeaderId,
  partial: Partial<ArticleHeaderStyle>,
): ArticleHeaders => ({
  ...headers,
  [id]: {
    ...headers[id],
    ...partial,
  },
});

export const applyArticleAppearance = (
  host: HTMLElement,
  settings: ArticleSettings,
): void => {
  host.classList.add("jp-KuusiArticle-paper");
  host.dataset.kuusiArticleTheme = settings.theme;
  host.dataset.kuusiArticleMeasure = settings.measure;
  host.dataset.kuusiArticlePadding = String(settings.padding);
  host.style.setProperty("--kuusi-article-padding-x", `${settings.padding}rem`);
  host.style.setProperty(
    "--kuusi-article-padding-top",
    `calc(${settings.padding}rem * 1.125)`,
  );
  host.style.setProperty(
    "--kuusi-article-padding-bottom",
    `calc(${settings.padding}rem * 2)`,
  );
  host.dataset.kuusiArticleColumnAlign = settings.columnAlign;
  host.dataset.kuusiArticleColumns = String(settings.columns);
  host.dataset.kuusiArticlePageLayout = settings.pageLayout;
  host.dataset.kuusiArticlePaperSize = settings.paperSize;
  host.dataset.kuusiArticleTableRepeatHeader = settings.tableRepeatHeader ? "1" : "0";
  {
    const paper = paperDimensions(settings.paperSize, settings.paperOrientation);
    host.style.setProperty("--kuusi-article-paper-max-width", `${paper.widthMm}mm`);
    host.style.setProperty(
      "--kuusi-article-paper-ratio",
      `${paper.widthMm} / ${paper.heightMm}`,
    );
  }
  host.dataset.kuusiArticlePaperOrientation = settings.paperOrientation;
  host.dataset.kuusiArticlePaperShadow = settings.paperShadow ? "1" : "0";
  host.style.setProperty(
    "--kuusi-article-paper-border-width",
    `${settings.paperBorderWidth}px`,
  );
  if (settings.paperBorderColor) {
    host.style.setProperty(
      "--kuusi-article-paper-border-color",
      settings.paperBorderColor,
    );
  } else {
    host.style.removeProperty("--kuusi-article-paper-border-color");
  }
  host.style.setProperty(
    "--kuusi-article-paper-shadow-width",
    `${settings.paperShadowWidth}px`,
  );
  if (settings.pageLayout !== "paged") {
    host.style.removeProperty("--kuusi-article-paper-height");
  }
  host.dataset.kuusiArticleImageWidth = settings.imageWidth;
  host.dataset.kuusiArticleImageAlign = settings.imageAlign;
  host.dataset.kuusiArticleImageWrap = settings.imageWrap;
  host.dataset.kuusiArticleImageBorder = settings.imageBorderStyle;
  host.dataset.kuusiArticleBackground = settings.background;
  host.dataset.kuusiArticleBackgroundPattern = settings.backgroundPattern;
  host.dataset.kuusiArticleViewBackground = settings.viewBackground;
  if (settings.viewBackgroundColor) {
    host.style.setProperty("--kuusi-article-desk", settings.viewBackgroundColor);
  } else {
    host.style.removeProperty("--kuusi-article-desk");
  }
  host.dataset.kuusiArticleFont = settings.font;
  host.dataset.kuusiArticleFontSize = String(settings.fontSize);
  host.style.setProperty(
    "--kuusi-article-font-size",
    bodyFontSizeCss(settings.fontSize),
  );
  host.dataset.kuusiArticleParagraphAlign = settings.paragraphAlign;
  host.dataset.kuusiArticleLinkStyle = settings.linkStyle;
  host.dataset.kuusiArticleCodeStyle = settings.codeStyle;
  host.dataset.kuusiArticleCodeFrame = settings.codeFrame ? "1" : "0";
  applyCodeAppearance(
    host,
    {
      codeTheme: settings.codeTheme,
      codeFont: settings.codeFont,
      codeFontSize: settings.codeFontSize,
    },
    "kuusiArticleCodeTheme",
  );
  applyTableAppearance(host, {
    tableStyle: settings.tableStyle,
    tableBorderWidth: settings.tableBorderWidth,
    tableHeaderRowBold: settings.tableHeaderRowBold,
    tableHeaderColumnBold: settings.tableHeaderColumnBold,
  });
  applyElementChromeAppearance(host, {
    listStyle: settings.listStyle,
    blockquoteWeight: settings.blockquoteWeight,
    hrWeight: settings.hrWeight,
  });
  host.style.setProperty(
    "--kuusi-article-code-radius",
    `${settings.codeFrameRadius}px`,
  );
  host.style.setProperty(
    "--kuusi-article-code-border-width",
    `${settings.codeFrameBorder}px`,
  );
  host.style.setProperty(
    "--kuusi-article-code-width",
    `${settings.codeFrameWidth}%`,
  );
  host.style.setProperty(
    "--kuusi-article-image-border-width",
    `${settings.imageBorderWidth}px`,
  );
  host.style.setProperty(
    "--kuusi-article-image-border-style",
    settings.imageBorderStyle,
  );
  host.style.setProperty(
    "--kuusi-article-image-radius",
    `${settings.imageRadius}px`,
  );
  if (settings.imageBorderColor) {
    host.style.setProperty(
      "--kuusi-article-image-border-color",
      settings.imageBorderColor,
    );
  } else {
    host.style.removeProperty("--kuusi-article-image-border-color");
  }
  if (settings.codeFrameColor) {
    host.style.setProperty(
      "--kuusi-article-code-border-color",
      settings.codeFrameColor,
    );
  } else {
    host.style.removeProperty("--kuusi-article-code-border-color");
  }
  delete host.dataset.kuusiArticleLineHeight;
  delete host.dataset.kuusiArticleParagraphSpacing;
  delete host.dataset.kuusiArticleParagraphIndent;
  delete host.dataset.kuusiArticlePage;
  delete host.dataset.kuusiArticleTitleFont;
  delete host.dataset.kuusiArticleTitleFontSize;
  delete host.dataset.kuusiArticleTitleAlign;
  host.style.removeProperty("--kuusi-article-title-font-family");
  host.style.setProperty(
    "--kuusi-article-font-family",
    mindMapFontFamilyCss(settings.font),
  );
  host.style.setProperty(
    "--kuusi-article-body-color",
    settings.color || "var(--kuusi-article-page-fg)",
  );
  if (settings.strongColor) {
    host.style.setProperty("--kuusi-article-strong-color", settings.strongColor);
  } else {
    host.style.removeProperty("--kuusi-article-strong-color");
  }
  host.style.setProperty(
    "--kuusi-article-letter-spacing",
    `${settings.letterSpacing}pt`,
  );
  host.style.setProperty(
    "--kuusi-article-line-height",
    String(settings.lineHeight),
  );
  host.style.setProperty(
    "--kuusi-article-paragraph-spacing",
    `${settings.paragraphSpacing}pt`,
  );
  host.style.setProperty(
    "--kuusi-article-paragraph-indent",
    `${settings.paragraphIndent}pt`,
  );

  ARTICLE_HEADER_LEVELS.forEach((level) => {
    const id = articleHeaderId(level);
    const style = settings.headers[id];
    host.style.setProperty(
      `--kuusi-article-${id}-font-family`,
      mindMapFontFamilyCss(style.font),
    );
    host.style.setProperty(
      `--kuusi-article-${id}-font-size`,
      HEADER_SIZE_CSS[style.fontSize],
    );
    host.style.setProperty(
      `--kuusi-article-${id}-color`,
      style.color || "inherit",
    );
    host.style.setProperty(`--kuusi-article-${id}-align`, style.align);
  });
};

const sharedArticleManagers = new WeakMap<ISettingRegistry, ArticleSettingsManager>();

export class ArticleSettingsManager {
  private _settings: ArticleSettings = { ...DEFAULT_ARTICLE_SETTINGS };

  private _plugin: ISettingRegistry.ISettings | null = null;

  /** Hover preview overlay: shown to listeners but never persisted. */
  private _preview: ArticleSettings | null = null;

  private _writing = 0;

  private _listeners = new Set<(settings: ArticleSettings) => void>();

  readonly changed = {
    connect: (fn: (settings: ArticleSettings) => void) => {
      this._listeners.add(fn);
      return {
        disconnect: () => {
          this._listeners.delete(fn);
        },
      };
    },
  };

  private _ready: Promise<void> | null = null;

  constructor(private _registry: ISettingRegistry) {}

  /**
   * The one manager per setting registry. Notebook Article and Markdown
   * Article are created by different plugins but share these settings, so
   * they share this instance (one copy of the state, one hover preview).
   */
  static shared(registry: ISettingRegistry): ArticleSettingsManager {
    let manager = sharedArticleManagers.get(registry);

    if (!manager) {
      manager = new ArticleSettingsManager(registry);
      sharedArticleManagers.set(registry, manager);
    }

    return manager;
  }

  get settings(): ArticleSettings {
    return this._preview ?? this._settings;
  }

  /** Loads the settings once; later calls return the same promise. */
  ready(): Promise<void> {
    this._ready ??= this._load();
    return this._ready;
  }

  private async _load(): Promise<void> {
    try {
      const plugin = await this._registry.load(ARTICLE_SETTINGS_PLUGIN_ID);
      this._plugin = plugin;
      this._settings = normalizeArticleSettings(plugin.composite);
      plugin.changed.connect(() => {
        if (this._writing > 0) {
          return;
        }

        this._preview = null;
        this._settings = normalizeArticleSettings(plugin.composite);
        this._emit();
      });
    } catch (error) {
      console.warn(
        "jupyterlab-kuusi: Article settings unavailable, using defaults",
        error,
      );
      this._plugin = null;
      this._settings = { ...DEFAULT_ARTICLE_SETTINGS };
    }
  }

  async applyTheme(theme: ArticleTheme): Promise<void> {
    await this.update({
      theme,
      ...articleThemeChrome(theme),
    });
  }

  async updateHeader(
    id: ArticleHeaderId,
    partial: Partial<ArticleHeaderStyle>,
  ): Promise<void> {
    await this.update({
      headers: updateArticleHeader(this._settings.headers, id, partial),
    });
  }

  async update(partial: Partial<ArticleSettings>): Promise<void> {
    this._preview = null;
    const previous = this._settings;
    const next = normalizeArticleSettings({
      ...this._settings,
      ...partial,
      headers: partial.headers
        ? normalizeHeaders(partial.headers)
        : this._settings.headers,
    });

    this._settings = next;
    this._emit();

    if (!this._plugin) {
      return;
    }

    const writes: Promise<void>[] = [];
    const enqueue = <K extends keyof ArticleSettings>(
      key: K,
      changed: boolean,
      value: ArticleSettings[K],
    ): void => {
      if (changed) {
        writes.push(this._plugin!.set(key, value as unknown as JSONValue));
      }
    };

    enqueue("theme", next.theme !== previous.theme, next.theme);
    enqueue("measure", next.measure !== previous.measure, next.measure);
    enqueue("padding", next.padding !== previous.padding, next.padding);
    enqueue(
      "columnAlign",
      next.columnAlign !== previous.columnAlign,
      next.columnAlign,
    );
    enqueue("columns", next.columns !== previous.columns, next.columns);
    enqueue(
      "pageLayout",
      next.pageLayout !== previous.pageLayout,
      next.pageLayout,
    );
    enqueue(
      "paperSize",
      next.paperSize !== previous.paperSize,
      next.paperSize,
    );
    enqueue(
      "paperOrientation",
      next.paperOrientation !== previous.paperOrientation,
      next.paperOrientation,
    );
    enqueue(
      "imageWidth",
      next.imageWidth !== previous.imageWidth,
      next.imageWidth,
    );
    enqueue(
      "background",
      next.background !== previous.background,
      next.background,
    );
    enqueue(
      "backgroundPattern",
      next.backgroundPattern !== previous.backgroundPattern,
      next.backgroundPattern,
    );
    enqueue(
      "viewBackground",
      next.viewBackground !== previous.viewBackground,
      next.viewBackground,
    );
    enqueue("font", next.font !== previous.font, next.font);
    enqueue("fontSize", next.fontSize !== previous.fontSize, next.fontSize);
    enqueue("color", next.color !== previous.color, next.color);
    enqueue("strongColor", next.strongColor !== previous.strongColor, next.strongColor);
    enqueue(
      "letterSpacing",
      next.letterSpacing !== previous.letterSpacing,
      next.letterSpacing,
    );
    enqueue(
      "lineHeight",
      next.lineHeight !== previous.lineHeight,
      next.lineHeight,
    );
    enqueue(
      "paragraphSpacing",
      next.paragraphSpacing !== previous.paragraphSpacing,
      next.paragraphSpacing,
    );
    enqueue(
      "paragraphIndent",
      next.paragraphIndent !== previous.paragraphIndent,
      next.paragraphIndent,
    );
    enqueue(
      "paragraphAlign",
      next.paragraphAlign !== previous.paragraphAlign,
      next.paragraphAlign,
    );
    enqueue(
      "linkStyle",
      next.linkStyle !== previous.linkStyle,
      next.linkStyle,
    );
    enqueue(
      "codeStyle",
      next.codeStyle !== previous.codeStyle,
      next.codeStyle,
    );
    enqueue(
      "headers",
      JSON.stringify(next.headers) !== JSON.stringify(previous.headers),
      next.headers,
    );
    (
      [
        "codeTheme",
        "codeFont",
        "codeFontSize",
        "codeFrame",
        "codeFrameColor",
        "codeFrameRadius",
        "codeFrameBorder",
        "codeFrameWidth",
        "tableStyle",
        "tableBorderWidth",
        "tableHeaderRowBold",
        "tableHeaderColumnBold",
        "listStyle",
        "blockquoteWeight",
        "hrWeight",
        "imageAlign",
        "imageWrap",
        "imageBorderStyle",
        "imageBorderWidth",
        "imageBorderColor",
        "imageRadius",
        "pageHeaderText",
        "pageHeaderAlign",
        "pageHeaderRule",
        "pageFooterRule",
        "pageFirstDifferent",
        "tableRepeatHeader",
        "pageFooterText",
        "pageFooterAlign",
        "pageNumber",
        "pageNumberPosition",
        "pageNumberAlign",
        "pageNumberStart",
        "viewBackgroundColor",
        "paperBorderWidth",
        "paperBorderColor",
        "paperShadow",
        "paperShadowWidth",
        "showTextCount",
        "showPageCount",
        "showFileSize",
        "headingNumbering",
        "chapterBreak",
        "tocShow",
        "tocDepth",
        "tocTitle",
      ] as const
    ).forEach((key) => {
      enqueue(key, next[key] !== previous[key], next[key]);
    });

    if (writes.length === 0) {
      return;
    }

    this._writing += 1;
    try {
      await Promise.all(writes);
    } catch (error) {
      console.warn("jupyterlab-kuusi: Failed to persist Article settings", error);
    } finally {
      this._writing -= 1;
    }
  }

  /**
   * Show `partial` on top of the saved settings without writing it. Pass null
   * (or call update) to drop the overlay.
   */
  setPreview(partial: Partial<ArticleSettings> | null): void {
    this._preview = partial ? normalizeArticleSettings({ ...this._settings, ...partial }) : null;
    this._emit();
  }

  private _emit(): void {
    this._listeners.forEach((listener) => {
      listener(this.settings);
    });
  }
}

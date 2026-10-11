import type { ISettingRegistry } from "@jupyterlab/settingregistry";
import type { JSONValue } from "@lumino/coreutils";

import {
  DEFAULT_MIND_MAP_FONT,
  mindMapFontFamilyCss,
  normalizeBodyFontSizePx,
  nearestHeadingStep,
  normalizeMindMapFontSize,
  type BodyFontSizePx,
  type MindMapFont,
  type MindMapFontSize,
} from "../fontToolbar";
import {
  CODE_BORDER_RANGE,
  CODE_RADIUS_RANGE,
  CODE_WIDTH_RANGE,
  HEADING_LEVELS,
  IMAGE_BORDER_RANGE,
  IMAGE_RADIUS_RANGE,
  LETTER_SPACING_RANGE,
  PARAGRAPH_INDENT_RANGE,
  PARAGRAPH_SPACING_RANGE,
  headingId,
  isCodeStyle,
  isImageAlign,
  isImageBorderStyle,
  isImageWidth,
  isImageWrap,
  isLinkStyle,
  isParagraphAlign,
  isTextAlign,
  isTypographyColor,
  isTypographyFont,
  makeHeadingStyle,
  migrateLetterSpacingToPt,
  migrateParagraphMeasureToPt,
  normalizeHeadingStyles,
  normalizeInRange,
  type CodeFont,
  type CodeStyle,
  type CodeTheme,
  type HeadingStyles,
  type ImageAlign,
  type ImageBorderStyle,
  type ImageWidth,
  type ImageWrap,
  type LinkStyle,
  type NumberRange,
  type ParagraphAlign,
  type TextAlign,
} from "../typographySettings";
import {
  DEFAULT_CODE_FONT,
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_CODE_THEME,
  applyCodeAppearance,
  isCodeFont,
  isCodeTheme,
} from "../codeThemes";
import {
  DEFAULT_TABLE_APPEARANCE,
  DEFAULT_TABLE_BORDER_WIDTH,
  DEFAULT_TABLE_STYLE,
  TABLE_BORDER_RANGE,
  applyTableAppearance,
  isTableStyle,
  type TableStyle,
} from "../tableSettings";
import {
  DEFAULT_BLOCKQUOTE_WEIGHT,
  DEFAULT_HR_WEIGHT,
  DEFAULT_LIST_STYLE,
  applyElementChromeAppearance,
  isListStyle,
  isRuleWeight,
  type ListStyle,
  type RuleWeight,
} from "../elementChromeSettings";
import type { MarkdownSlideSplitMode } from "./splitMarkdownSlides";
import {
  isSlidesHeaderSource,
  type SlidesHeaderSource,
} from "./slidesHeader";
import {
  isPageNumberStart,
  type PageNumberStart,
} from "../pageNumberStart";

export type { SlidesHeaderSource } from "./slidesHeader";
export { isSlidesHeaderSource } from "./slidesHeader";
export type { PageNumberStart } from "../pageNumberStart";

export const SLIDES_SETTINGS_PLUGIN_ID = "jupyterlab-kuusi:markdown-slides";

export const isSlidesTheme = (value: unknown): value is SlidesTheme =>
  value === "classic" ||
  value === "night" ||
  value === "forest" ||
  value === "ocean" ||
  value === "slate" ||
  value === "paper" ||
  value === "metropolis" ||
  value === "madrid" ||
  value === "berlin" ||
  value === "copenhagen" ||
  value === "singapore";

export type SlidesTheme =
  | "classic"
  | "night"
  | "forest"
  | "ocean"
  | "slate"
  | "paper"
  | "metropolis"
  | "madrid"
  | "berlin"
  | "copenhagen"
  | "singapore";

export type SlidesRatio = "16:9" | "4:3" | "1:1";

export type SlidesPadding = "compact" | "normal" | "loose";

export type SlidesContentAlign = "top" | "center" | "bottom";

/** On-slide footer page number format (not the under-stage nav counter). */
export type SlidesPageNumberStyle = "page" | "page-of-total" | "dash";

export type SlidesFont = MindMapFont;
export type SlidesFontSize = BodyFontSizePx;

export const SLIDES_LINE_HEIGHT_RANGE: NumberRange = {
  min: 0.9,
  max: 2.4,
  step: 0.05,
};

export type SlidesSettings = {
  theme: SlidesTheme;
  ratio: SlidesRatio;
  splitMode: MarkdownSlideSplitMode;
  padding: SlidesPadding;
  contentAlign: SlidesContentAlign;
  font: SlidesFont;
  fontSize: SlidesFontSize;
  lineHeight: number;
  letterSpacing: number;
  /** Empty string follows the theme foreground. */
  textColor: string;
  /** Empty inherits body text color for bold. */
  strongColor: string;
  /** Margin between paragraphs and list items, in pt. */
  paragraphSpacing: number;
  paragraphIndent: number;
  paragraphAlign: ParagraphAlign;
  linkStyle: LinkStyle;
  /** Per-level heading styles; the default font follows the body font. */
  headers: HeadingStyles;
  /** Empty string follows the theme accent. */
  accentColor: string;
  showNavButtons: boolean;
  showPageNumber: boolean;
  /** On-slide footer page label: `3`, `3 / 12`, or `3 – 12`. */
  pageNumberStyle: SlidesPageNumberStyle;
  /** Horizontal placement of the on-slide page number. */
  pageNumberAlign: TextAlign;
  /** Number from the first slide, or skip the first and start on slide 2. */
  pageNumberStart: PageNumberStart;
  showHeader: boolean;
  /** Heading level or custom text for the in-stage header bar. */
  headerSource: SlidesHeaderSource;
  /** Used when headerSource is "custom". */
  headerCustomText: string;
  showFooter: boolean;
  showProgress: boolean;
  stageShadow: boolean;
  codeStyle: CodeStyle;
  codeTheme: CodeTheme;
  codeFont: CodeFont;
  codeFontSize: MindMapFontSize;
  /** Draw a bordered frame around fenced code blocks. */
  codeFrame: boolean;
  /** Empty string follows the theme code border color. */
  codeFrameColor: string;
  /** Border radius in px. */
  codeFrameRadius: number;
  /** Border stroke width in px. */
  codeFrameBorder: number;
  /** Code block max-width as percent of the slide content. */
  codeFrameWidth: number;
  tableStyle: TableStyle;
  tableBorderWidth: number;
  tableHeaderRowBold: boolean;
  tableHeaderColumnBold: boolean;
  listStyle: ListStyle;
  blockquoteWeight: RuleWeight;
  hrWeight: RuleWeight;
  imageWidth: ImageWidth;
  imageAlign: ImageAlign;
  imageWrap: ImageWrap;
  imageBorderStyle: ImageBorderStyle;
  imageBorderWidth: number;
  imageBorderColor: string;
  imageRadius: number;
  showTextCount: boolean;
  showPageCount: boolean;
  showFileSize: boolean;
};

/** Heading sizes are relative to the slide body size (which tracks the stage). */
const SLIDES_HEADING_SIZE_EM: Record<MindMapFontSize, string> = {
  xxs: "0.9em",
  xs: "1em",
  sm: "1.1em",
  md: "1.2em",
  lg: "1.35em",
  xl: "1.75em",
  xxl: "2.1em",
};

const slidesHeadings = (
  font: SlidesFont,
  align: TextAlign,
  h1: MindMapFontSize,
  h2: MindMapFontSize,
): HeadingStyles => ({
  h1: makeHeadingStyle({ font, align, fontSize: h1 }),
  h2: makeHeadingStyle({ font, align, fontSize: h2 }),
  h3: makeHeadingStyle({ font, align: "left", fontSize: "md" }),
  h4: makeHeadingStyle({ font, align: "left", fontSize: "sm" }),
  h5: makeHeadingStyle({ font, align: "left", fontSize: "xs" }),
  h6: makeHeadingStyle({ font, align: "left", fontSize: "xxs" }),
});

/**
 * Layout / typography / chrome stamped when selecting a Slides theme.
 * Ratio, split mode, code palette, and image chrome stay per-user.
 */
type SlidesThemeChrome = Pick<
  SlidesSettings,
  | "padding"
  | "contentAlign"
  | "font"
  | "fontSize"
  | "lineHeight"
  | "letterSpacing"
  | "textColor"
  | "strongColor"
  | "paragraphSpacing"
  | "paragraphIndent"
  | "paragraphAlign"
  | "linkStyle"
  | "headers"
  | "accentColor"
  | "showHeader"
  | "showFooter"
  | "showProgress"
  | "showPageNumber"
  | "stageShadow"
  | "codeStyle"
>;

export const SLIDES_THEME_PRESETS: Record<SlidesTheme, SlidesThemeChrome> = {
  classic: {
    padding: "normal",
    contentAlign: "top",
    font: "notebook",
    fontSize: 14,
    lineHeight: 1.45,
    letterSpacing: 0,
    textColor: "",
    strongColor: "",
    paragraphSpacing: 5,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "default",
    headers: slidesHeadings("notebook", "left", "xl", "lg"),
    accentColor: "",
    showHeader: true,
    showFooter: true,
    showProgress: false,
    showPageNumber: true,
    stageShadow: true,
    codeStyle: "muted",
  },
  night: {
    padding: "loose",
    contentAlign: "center",
    font: "system-ui",
    fontSize: 16,
    lineHeight: 1.5,
    letterSpacing: 0.2,
    textColor: "",
    strongColor: "",
    paragraphSpacing: 8,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "accent",
    headers: slidesHeadings("system-ui", "left", "xxl", "xl"),
    accentColor: "",
    showHeader: false,
    showFooter: true,
    showProgress: false,
    showPageNumber: true,
    stageShadow: true,
    codeStyle: "contrast",
  },
  forest: {
    padding: "normal",
    contentAlign: "top",
    font: "georgia",
    fontSize: 15,
    lineHeight: 1.55,
    letterSpacing: 0.15,
    textColor: "",
    strongColor: "",
    paragraphSpacing: 7,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "underline",
    headers: slidesHeadings("georgia", "left", "xl", "lg"),
    accentColor: "",
    showHeader: true,
    showFooter: true,
    showProgress: false,
    showPageNumber: true,
    stageShadow: true,
    codeStyle: "muted",
  },
  ocean: {
    padding: "normal",
    contentAlign: "center",
    font: "helvetica",
    fontSize: 14,
    lineHeight: 1.45,
    letterSpacing: 0.1,
    textColor: "",
    strongColor: "",
    paragraphSpacing: 6,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "accent",
    headers: slidesHeadings("helvetica", "center", "xxl", "xl"),
    accentColor: "",
    showHeader: false,
    showFooter: true,
    showProgress: true,
    showPageNumber: true,
    stageShadow: true,
    codeStyle: "contrast",
  },
  slate: {
    padding: "compact",
    contentAlign: "top",
    font: "segoe-ui",
    fontSize: 14,
    lineHeight: 1.4,
    letterSpacing: 0,
    textColor: "",
    strongColor: "",
    paragraphSpacing: 4,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "accent",
    headers: slidesHeadings("segoe-ui", "left", "xl", "lg"),
    accentColor: "",
    showHeader: true,
    showFooter: false,
    showProgress: true,
    showPageNumber: true,
    stageShadow: false,
    codeStyle: "contrast",
  },
  paper: {
    padding: "loose",
    contentAlign: "top",
    font: "georgia",
    fontSize: 15,
    lineHeight: 1.6,
    letterSpacing: 0.3,
    textColor: "",
    strongColor: "",
    paragraphSpacing: 9,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "underline",
    headers: slidesHeadings("garamond", "left", "xl", "lg"),
    accentColor: "",
    showHeader: true,
    showFooter: true,
    showProgress: false,
    showPageNumber: true,
    stageShadow: true,
    codeStyle: "plain",
  },
  metropolis: {
    padding: "compact",
    contentAlign: "top",
    font: "helvetica",
    fontSize: 14,
    lineHeight: 1.35,
    letterSpacing: 0.05,
    textColor: "",
    strongColor: "",
    paragraphSpacing: 4,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "accent",
    headers: slidesHeadings("helvetica", "left", "xxl", "xl"),
    accentColor: "",
    showHeader: true,
    showFooter: false,
    showProgress: true,
    showPageNumber: true,
    stageShadow: false,
    codeStyle: "muted",
  },
  madrid: {
    padding: "normal",
    contentAlign: "top",
    font: "arial",
    fontSize: 14,
    lineHeight: 1.4,
    letterSpacing: 0,
    textColor: "",
    strongColor: "",
    paragraphSpacing: 5,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "default",
    headers: slidesHeadings("arial", "left", "xl", "lg"),
    accentColor: "",
    showHeader: true,
    showFooter: true,
    showProgress: false,
    showPageNumber: true,
    stageShadow: true,
    codeStyle: "muted",
  },
  berlin: {
    padding: "compact",
    contentAlign: "top",
    font: "system-ui",
    fontSize: 14,
    lineHeight: 1.4,
    letterSpacing: 0.1,
    textColor: "",
    strongColor: "",
    paragraphSpacing: 4,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "accent",
    headers: slidesHeadings("system-ui", "left", "xl", "lg"),
    accentColor: "",
    showHeader: false,
    showFooter: true,
    showProgress: true,
    showPageNumber: true,
    stageShadow: false,
    codeStyle: "contrast",
  },
  copenhagen: {
    padding: "loose",
    contentAlign: "top",
    font: "system-ui",
    fontSize: 14,
    lineHeight: 1.5,
    letterSpacing: 0.2,
    textColor: "",
    strongColor: "",
    paragraphSpacing: 7,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "default",
    headers: slidesHeadings("system-ui", "left", "xl", "lg"),
    accentColor: "",
    showHeader: true,
    showFooter: true,
    showProgress: false,
    showPageNumber: true,
    stageShadow: false,
    codeStyle: "plain",
  },
  singapore: {
    padding: "normal",
    contentAlign: "center",
    font: "helvetica",
    fontSize: 15,
    lineHeight: 1.4,
    letterSpacing: 0.05,
    textColor: "",
    strongColor: "",
    paragraphSpacing: 6,
    paragraphIndent: 0,
    paragraphAlign: "left",
    linkStyle: "accent",
    headers: slidesHeadings("helvetica", "center", "xxl", "xl"),
    accentColor: "",
    showHeader: true,
    showFooter: false,
    showProgress: true,
    showPageNumber: true,
    stageShadow: true,
    codeStyle: "muted",
  },
};

export const slidesThemeChrome = (
  theme: SlidesTheme,
): SlidesThemeChrome => ({ ...SLIDES_THEME_PRESETS[theme] });

export const DEFAULT_SLIDES_SETTINGS: SlidesSettings = {
  theme: "classic",
  ratio: "16:9",
  splitMode: "auto",
  ...SLIDES_THEME_PRESETS.classic,
  showNavButtons: true,
  pageNumberStyle: "page-of-total",
  pageNumberAlign: "right",
  pageNumberStart: "first",
  headerSource: "h1",
  headerCustomText: "",
  codeTheme: DEFAULT_CODE_THEME,
  codeFont: DEFAULT_CODE_FONT,
  codeFontSize: DEFAULT_CODE_FONT_SIZE,
  codeFrame: true,
  codeFrameColor: "",
  codeFrameRadius: 8,
  codeFrameBorder: 1,
  codeFrameWidth: 100,
  tableStyle: DEFAULT_TABLE_STYLE,
  tableBorderWidth: DEFAULT_TABLE_BORDER_WIDTH,
  tableHeaderRowBold: DEFAULT_TABLE_APPEARANCE.tableHeaderRowBold,
  tableHeaderColumnBold: DEFAULT_TABLE_APPEARANCE.tableHeaderColumnBold,
  listStyle: DEFAULT_LIST_STYLE,
  blockquoteWeight: DEFAULT_BLOCKQUOTE_WEIGHT,
  hrWeight: DEFAULT_HR_WEIGHT,
  imageWidth: "wide",
  imageAlign: "center",
  imageWrap: "none",
  imageBorderStyle: "none",
  imageBorderWidth: 1,
  imageBorderColor: "",
  imageRadius: 0,
  showTextCount: false,
  showPageCount: false,
  showFileSize: false,
};

/** Pre-0.3 `headingScale` (H1/H2 only) → per-level heading sizes. */
const LEGACY_HEADING_SCALE: Record<string, HeadingStyles> = {
  sm: slidesHeadings("notebook", "left", "lg", "md"),
  md: slidesHeadings("notebook", "left", "xl", "lg"),
  lg: slidesHeadings("notebook", "left", "xxl", "xl"),
};

/** Pre-0.3 `listDensity` → paragraph spacing (em). */
const LEGACY_LIST_DENSITY: Record<string, number> = {
  compact: 3,
  normal: 5,
  loose: 8,
};

const isRatio = (value: unknown): value is SlidesRatio =>
  value === "16:9" || value === "4:3" || value === "1:1";

const isSplitMode = (value: unknown): value is MarkdownSlideSplitMode =>
  value === "auto" || value === "rules" || value === "headings";

const isPadding = (value: unknown): value is SlidesPadding =>
  value === "compact" || value === "normal" || value === "loose";

const isContentAlign = (value: unknown): value is SlidesContentAlign =>
  value === "top" || value === "center" || value === "bottom";

const isPageNumberStyle = (value: unknown): value is SlidesPageNumberStyle =>
  value === "page" || value === "page-of-total" || value === "dash";

const normalizeBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

export const normalizeSlidesSettings = (value: unknown): SlidesSettings => {
  const defaults = DEFAULT_SLIDES_SETTINGS;
  const raw =
    value && typeof value === "object"
      ? (value as Partial<SlidesSettings> & {
          headingScale?: unknown;
          listDensity?: unknown;
        })
      : {};
  const hasHeaders =
    raw.headers !== null &&
    typeof raw.headers === "object" &&
    Object.keys(raw.headers).length > 0;
  const headerDefaults =
    (typeof raw.headingScale === "string" &&
      LEGACY_HEADING_SCALE[raw.headingScale]) ||
    defaults.headers;
  const spacingDefault =
    (typeof raw.listDensity === "string" &&
      LEGACY_LIST_DENSITY[raw.listDensity]) ||
    defaults.paragraphSpacing;

  return {
    theme: isSlidesTheme(raw.theme) ? raw.theme : defaults.theme,
    ratio: isRatio(raw.ratio) ? raw.ratio : defaults.ratio,
    splitMode: isSplitMode(raw.splitMode) ? raw.splitMode : defaults.splitMode,
    padding: isPadding(raw.padding) ? raw.padding : defaults.padding,
    contentAlign: isContentAlign(raw.contentAlign)
      ? raw.contentAlign
      : defaults.contentAlign,
    font: isTypographyFont(raw.font) ? raw.font : defaults.font,
    fontSize: normalizeBodyFontSizePx(raw.fontSize, defaults.fontSize),
    lineHeight: normalizeInRange(
      raw.lineHeight,
      SLIDES_LINE_HEIGHT_RANGE,
      defaults.lineHeight,
    ),
    letterSpacing: normalizeInRange(
      typeof raw.letterSpacing === "number"
        ? migrateLetterSpacingToPt(raw.letterSpacing)
        : raw.letterSpacing,
      LETTER_SPACING_RANGE,
      defaults.letterSpacing,
    ),
    textColor: isTypographyColor(raw.textColor)
      ? raw.textColor
      : defaults.textColor,
    strongColor: isTypographyColor(raw.strongColor)
      ? raw.strongColor
      : defaults.strongColor,
    paragraphSpacing: normalizeInRange(
      typeof raw.paragraphSpacing === "number"
        ? migrateParagraphMeasureToPt(raw.paragraphSpacing)
        : raw.paragraphSpacing,
      PARAGRAPH_SPACING_RANGE,
      spacingDefault,
    ),
    paragraphIndent: normalizeInRange(
      typeof raw.paragraphIndent === "number"
        ? migrateParagraphMeasureToPt(raw.paragraphIndent)
        : raw.paragraphIndent,
      PARAGRAPH_INDENT_RANGE,
      defaults.paragraphIndent,
    ),
    paragraphAlign: isParagraphAlign(raw.paragraphAlign)
      ? raw.paragraphAlign
      : defaults.paragraphAlign,
    linkStyle: isLinkStyle(raw.linkStyle) ? raw.linkStyle : defaults.linkStyle,
    headers: hasHeaders
      ? normalizeHeadingStyles(raw.headers, defaults.headers)
      : headerDefaults,
    accentColor: isTypographyColor(raw.accentColor)
      ? raw.accentColor
      : defaults.accentColor,
    showNavButtons: normalizeBoolean(
      raw.showNavButtons,
      defaults.showNavButtons,
    ),
    showPageNumber: normalizeBoolean(
      raw.showPageNumber,
      defaults.showPageNumber,
    ),
    pageNumberStyle: isPageNumberStyle(raw.pageNumberStyle)
      ? raw.pageNumberStyle
      : defaults.pageNumberStyle,
    pageNumberAlign: isTextAlign(raw.pageNumberAlign)
      ? raw.pageNumberAlign
      : defaults.pageNumberAlign,
    pageNumberStart: isPageNumberStart(raw.pageNumberStart)
      ? raw.pageNumberStart
      : defaults.pageNumberStart,
    showHeader: normalizeBoolean(raw.showHeader, defaults.showHeader),
    headerSource: isSlidesHeaderSource(raw.headerSource)
      ? raw.headerSource
      : defaults.headerSource,
    headerCustomText:
      typeof raw.headerCustomText === "string"
        ? raw.headerCustomText
        : defaults.headerCustomText,
    showFooter: normalizeBoolean(raw.showFooter, defaults.showFooter),
    showProgress: normalizeBoolean(raw.showProgress, defaults.showProgress),
    stageShadow: normalizeBoolean(raw.stageShadow, defaults.stageShadow),
    codeStyle: isCodeStyle(raw.codeStyle) ? raw.codeStyle : defaults.codeStyle,
    codeTheme: isCodeTheme(raw.codeTheme) ? raw.codeTheme : defaults.codeTheme,
    codeFont: isCodeFont(raw.codeFont) ? raw.codeFont : defaults.codeFont,
    codeFontSize:
      normalizeMindMapFontSize(raw.codeFontSize) ?? defaults.codeFontSize,
    codeFrame: normalizeBoolean(raw.codeFrame, defaults.codeFrame),
    codeFrameColor: isTypographyColor(raw.codeFrameColor)
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
    imageBorderColor: isTypographyColor(raw.imageBorderColor)
      ? raw.imageBorderColor
      : defaults.imageBorderColor,
    imageRadius: normalizeInRange(
      raw.imageRadius,
      IMAGE_RADIUS_RANGE,
      defaults.imageRadius,
    ),
    showTextCount: normalizeBoolean(raw.showTextCount, defaults.showTextCount),
    showPageCount: normalizeBoolean(raw.showPageCount, defaults.showPageCount),
    showFileSize: normalizeBoolean(raw.showFileSize, defaults.showFileSize),
  };
};

const setOrRemove = (
  host: HTMLElement,
  property: string,
  value: string,
): void => {
  if (value) {
    host.style.setProperty(property, value);
  } else {
    host.style.removeProperty(property);
  }
};

export const applySlidesAppearance = (
  host: HTMLElement,
  settings: SlidesSettings,
): void => {
  host.classList.add("jp-KuusiMarkdownSlides");
  host.dataset.kuusiSlidesTheme = settings.theme;
  host.dataset.kuusiSlidesRatio = settings.ratio;
  host.dataset.kuusiSlidesSplit = settings.splitMode;
  host.dataset.kuusiSlidesPadding = settings.padding;
  host.dataset.kuusiSlidesAlign = settings.contentAlign;
  host.dataset.kuusiSlidesFont = settings.font;
  host.dataset.kuusiSlidesFontSize = String(settings.fontSize);
  host.style.setProperty("--kuusi-slides-font-size-px", String(settings.fontSize));
  host.style.removeProperty("--kuusi-slides-font-size");
  host.dataset.kuusiSlidesParagraphAlign = settings.paragraphAlign;
  host.dataset.kuusiSlidesLinkStyle = settings.linkStyle;
  host.dataset.kuusiSlidesCodeStyle = settings.codeStyle;
  applyCodeAppearance(
    host,
    {
      codeTheme: settings.codeTheme,
      codeFont: settings.codeFont,
      codeFontSize: settings.codeFontSize,
    },
    "kuusiSlidesCodeTheme",
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
  host.dataset.kuusiSlidesShowNav = settings.showNavButtons ? "1" : "0";
  // Under-stage counter is view chrome (with nav), not the on-slide footer page.
  host.dataset.kuusiSlidesShowCounter = settings.showNavButtons ? "1" : "0";
  host.dataset.kuusiSlidesShowHeader = settings.showHeader ? "1" : "0";
  host.dataset.kuusiSlidesShowFooter = settings.showFooter ? "1" : "0";
  host.dataset.kuusiSlidesShowPageNumber = settings.showPageNumber ? "1" : "0";
  host.dataset.kuusiSlidesPageNumberAlign = settings.pageNumberAlign;
  host.dataset.kuusiSlidesPageNumberStyle = settings.pageNumberStyle;
  host.dataset.kuusiSlidesShowProgress = settings.showProgress ? "1" : "0";
  host.dataset.kuusiSlidesShadow = settings.stageShadow ? "1" : "0";
  host.dataset.kuusiSlidesCodeFrame = settings.codeFrame ? "1" : "0";
  host.dataset.kuusiSlidesImageWidth = settings.imageWidth;
  host.dataset.kuusiSlidesImageAlign = settings.imageAlign;
  host.dataset.kuusiSlidesImageWrap = settings.imageWrap;
  host.dataset.kuusiSlidesImageBorder = settings.imageBorderStyle;
  delete host.dataset.kuusiSlidesDensity;
  delete host.dataset.kuusiSlidesHeadingScale;
  host.style.setProperty(
    "--kuusi-slides-font-family",
    mindMapFontFamilyCss(settings.font),
  );
  host.style.setProperty(
    "--kuusi-slides-line-height",
    String(settings.lineHeight),
  );
  host.style.setProperty(
    "--kuusi-slides-letter-spacing",
    `${settings.letterSpacing}pt`,
  );
  host.style.setProperty(
    "--kuusi-slides-paragraph-spacing",
    `${settings.paragraphSpacing}pt`,
  );
  host.style.setProperty(
    "--kuusi-slides-paragraph-indent",
    `${settings.paragraphIndent}pt`,
  );
  host.style.setProperty(
    "--kuusi-slides-code-radius",
    `${settings.codeFrameRadius}px`,
  );
  host.style.setProperty(
    "--kuusi-slides-code-border-width",
    `${settings.codeFrameBorder}px`,
  );
  host.style.setProperty(
    "--kuusi-slides-code-width",
    `${settings.codeFrameWidth}%`,
  );
  setOrRemove(host, "--kuusi-slides-page-fg", settings.textColor);
  setOrRemove(host, "--kuusi-slides-strong-color", settings.strongColor);
  setOrRemove(host, "--kuusi-slides-accent", settings.accentColor);
  setOrRemove(host, "--kuusi-slides-code-border-color", settings.codeFrameColor);
  host.style.setProperty(
    "--kuusi-slides-image-border-width",
    `${settings.imageBorderWidth}px`,
  );
  host.style.setProperty(
    "--kuusi-slides-image-border-style",
    settings.imageBorderStyle,
  );
  host.style.setProperty(
    "--kuusi-slides-image-radius",
    `${settings.imageRadius}px`,
  );
  setOrRemove(
    host,
    "--kuusi-slides-image-border-color",
    settings.imageBorderColor,
  );

  HEADING_LEVELS.forEach((level) => {
    const id = headingId(level);
    const style = settings.headers[id];
    host.style.setProperty(
      `--kuusi-slides-${id}-font-size`,
      SLIDES_HEADING_SIZE_EM[
        typeof style.fontSize === "number"
          ? nearestHeadingStep(style.fontSize)
          : style.fontSize
      ],
    );
    setOrRemove(
      host,
      `--kuusi-slides-${id}-font-family`,
      style.font === DEFAULT_MIND_MAP_FONT ? "" : mindMapFontFamilyCss(style.font),
    );
    setOrRemove(host, `--kuusi-slides-${id}-color`, style.color);
    host.style.setProperty(`--kuusi-slides-${id}-align`, style.align);
  });
};

/** Only split mode rebuilds the outline slide list from source. */
export const slidesSettingsNeedSourceRebuild = (
  previous: SlidesSettings,
  next: SlidesSettings,
): boolean => previous.splitMode !== next.splitMode;

/**
 * Typography / padding / chrome height changes need overflow re-pagination
 * even when the source outline is unchanged.
 */
export const slidesSettingsNeedOverflowReflow = (
  previous: SlidesSettings,
  next: SlidesSettings,
): boolean => {
  if (slidesSettingsNeedSourceRebuild(previous, next)) {
    return false;
  }

  return (
    previous.padding !== next.padding ||
    previous.contentAlign !== next.contentAlign ||
    previous.font !== next.font ||
    previous.fontSize !== next.fontSize ||
    previous.lineHeight !== next.lineHeight ||
    previous.letterSpacing !== next.letterSpacing ||
    previous.paragraphSpacing !== next.paragraphSpacing ||
    previous.paragraphIndent !== next.paragraphIndent ||
    previous.paragraphAlign !== next.paragraphAlign ||
    previous.headers !== next.headers ||
    previous.showHeader !== next.showHeader ||
    previous.headerSource !== next.headerSource ||
    previous.headerCustomText !== next.headerCustomText ||
    previous.showFooter !== next.showFooter ||
    previous.showProgress !== next.showProgress ||
    previous.showPageNumber !== next.showPageNumber ||
    previous.pageNumberStyle !== next.pageNumberStyle ||
    previous.pageNumberAlign !== next.pageNumberAlign ||
    previous.pageNumberStart !== next.pageNumberStart ||
    previous.codeStyle !== next.codeStyle ||
    previous.codeTheme !== next.codeTheme ||
    previous.codeFont !== next.codeFont ||
    previous.codeFontSize !== next.codeFontSize ||
    previous.codeFrame !== next.codeFrame ||
    previous.codeFrameRadius !== next.codeFrameRadius ||
    previous.codeFrameBorder !== next.codeFrameBorder ||
    previous.codeFrameWidth !== next.codeFrameWidth ||
    previous.imageWidth !== next.imageWidth ||
    previous.imageAlign !== next.imageAlign ||
    previous.imageWrap !== next.imageWrap ||
    previous.imageBorderStyle !== next.imageBorderStyle ||
    previous.imageBorderWidth !== next.imageBorderWidth ||
    previous.imageRadius !== next.imageRadius ||
    previous.ratio !== next.ratio ||
    previous.theme !== next.theme
  );
};

const SLIDES_SETTING_KEYS: Array<keyof SlidesSettings> = [
  "theme",
  "ratio",
  "splitMode",
  "padding",
  "contentAlign",
  "font",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "textColor",
  "strongColor",
  "paragraphSpacing",
  "paragraphIndent",
  "paragraphAlign",
  "linkStyle",
  "headers",
  "accentColor",
  "showNavButtons",
  "showPageNumber",
  "pageNumberStyle",
  "pageNumberAlign",
  "pageNumberStart",
  "showHeader",
  "headerSource",
  "headerCustomText",
  "showFooter",
  "showProgress",
  "stageShadow",
  "codeStyle",
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
  "imageWidth",
  "imageAlign",
  "imageWrap",
  "imageBorderStyle",
  "imageBorderWidth",
  "imageBorderColor",
  "imageRadius",
  "showTextCount",
  "showPageCount",
  "showFileSize",
];

export class SlidesSettingsManager {
  private _settings: SlidesSettings = { ...DEFAULT_SLIDES_SETTINGS };

  private _plugin: ISettingRegistry.ISettings | null = null;

  /** Hover preview overlay: shown to listeners but never persisted. */
  private _preview: SlidesSettings | null = null;

  private _writing = 0;

  private _listeners = new Set<(settings: SlidesSettings) => void>();

  readonly changed = {
    connect: (fn: (settings: SlidesSettings) => void) => {
      this._listeners.add(fn);
      return {
        disconnect: () => {
          this._listeners.delete(fn);
        },
      };
    },
  };

  constructor(private _registry: ISettingRegistry) {}

  get settings(): SlidesSettings {
    return this._preview ?? this._settings;
  }

  async ready(): Promise<void> {
    try {
      const plugin = await this._registry.load(SLIDES_SETTINGS_PLUGIN_ID);
      this._plugin = plugin;
      this._settings = normalizeSlidesSettings(plugin.composite);
      plugin.changed.connect(() => {
        if (this._writing > 0) {
          return;
        }

        this._preview = null;
        this._settings = normalizeSlidesSettings(plugin.composite);
        this._emit();
      });
      this._emit();
    } catch (error) {
      console.warn(
        "jupyterlab-kuusi: Slides settings unavailable, using defaults",
        error,
      );
      this._plugin = null;
      this._settings = { ...DEFAULT_SLIDES_SETTINGS };
      this._emit();
    }
  }

  async applyTheme(theme: SlidesTheme): Promise<void> {
    await this.update({
      theme,
      ...slidesThemeChrome(theme),
    });
  }

  async update(partial: Partial<SlidesSettings>): Promise<void> {
    this._preview = null;
    const previous = this._settings;
    const next = normalizeSlidesSettings({ ...this._settings, ...partial });
    this._settings = next;
    this._emit();

    if (!this._plugin) {
      return;
    }

    const writes = SLIDES_SETTING_KEYS.filter(
      (key) => JSON.stringify(next[key]) !== JSON.stringify(previous[key]),
    ).map((key) =>
      this._plugin!.set(key, next[key] as unknown as JSONValue),
    );

    if (writes.length === 0) {
      return;
    }

    this._writing += 1;
    try {
      await Promise.all(writes);
    } catch (error) {
      console.warn("jupyterlab-kuusi: Failed to persist Slides settings", error);
    } finally {
      this._writing -= 1;
    }
  }

  /**
   * Show `partial` on top of the saved settings without writing it. Pass null
   * (or call update) to drop the overlay.
   */
  setPreview(partial: Partial<SlidesSettings> | null): void {
    this._preview = partial ? normalizeSlidesSettings({ ...this._settings, ...partial }) : null;
    this._emit();
  }

  private _emit(): void {
    this._listeners.forEach((fn) => fn(this.settings));
  }
}

import type { ISettingRegistry } from "@jupyterlab/settingregistry";
import type { JSONValue } from "@lumino/coreutils";
import {
  ARTICLE_PADDING_MAX,
  ARTICLE_PADDING_MIN,
  ARTICLE_PADDING_STEP,
  ARTICLE_THEME_PRESETS,
  DEFAULT_ARTICLE_SETTINGS,
  applyArticleAppearance,
  articleThemeChrome,
  type ArticleBackground,
  type ArticleBackgroundPattern,
  type ArticleSettings,
  type ArticleTheme,
  type PageNumberStart,
} from "./articleSettings";
import {
  isPageNumberStart,
} from "./pageNumberStart";
import {
  DEFAULT_CODE_FONT,
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_CODE_THEME,
  isCodeFont,
  isCodeTheme,
} from "./codeThemes";
import {
  DEFAULT_TABLE_APPEARANCE,
  DEFAULT_TABLE_BORDER_WIDTH,
  DEFAULT_TABLE_STYLE,
  TABLE_BORDER_RANGE,
  isTableStyle,
} from "./tableSettings";
import {
  normalizeBodyFontSizePx,
  normalizeMindMapFontSize,
  type MindMapFont,
  isFontValue,
} from "./fontToolbar";
import {
  CODE_BORDER_RANGE,
  CODE_RADIUS_RANGE,
  CODE_WIDTH_RANGE,
  IMAGE_BORDER_RANGE,
  IMAGE_RADIUS_RANGE,
  LETTER_SPACING_RANGE,
  PARAGRAPH_INDENT_RANGE,
  PARAGRAPH_SPACING_RANGE,
  isImageAlign,
  isImageBorderStyle,
  isImageWidth,
  isImageWrap,
  migrateLetterSpacingToPt,
  migrateParagraphMeasureToPt,
  normalizeInRange,
  DEFAULT_TYPOGRAPHY_VALUES,
  isListStyle,
  isRuleWeight,
  type CodeStyle,
  type HeadingStyles,
  type ImageAlign,
  type ImageBorderStyle,
  type ImageWidth,
  type ImageWrap,
  type LinkStyle,
  type ParagraphAlign,
  type TypographyValues,
} from "./typographySettings";

export const BOOK_SETTINGS_PLUGIN_ID = "jupyterlab-kuusi:book";

export type BookTheme = ArticleTheme;
/** Pages visible at once: 1 = single, 2 = facing spread. */
export type BookColumns = 1 | 2;
export type BookColumnFill = "balance" | "auto";

export type BookSettings = TypographyValues & {
  theme: BookTheme;
  columns: BookColumns;
  /** Gap between columns, in rem. */
  columnGap: number;
  columnFill: BookColumnFill;
  columnRule: boolean;
  padding: number;
  background: ArticleBackground;
  backgroundPattern: ArticleBackgroundPattern;
  viewBackground: ArticleBackground;
  viewBackgroundColor: string;
  showTextCount: boolean;
  showPageCount: boolean;
  showFileSize: boolean;
  /** Number from the first spread, or skip the first and start on spread 2. */
  pageNumberStart: PageNumberStart;
};

export const BOOK_COLUMN_GAP_MIN = 1;
export const BOOK_COLUMN_GAP_MAX = 4;
export const BOOK_COLUMN_GAP_STEP = 0.01;
export const BOOK_COLUMN_GAP_DEFAULT = 2.5;

export const BOOK_PADDING_MIN = ARTICLE_PADDING_MIN;
export const BOOK_PADDING_MAX = ARTICLE_PADDING_MAX;
export const BOOK_PADDING_STEP = ARTICLE_PADDING_STEP;

const BACKGROUNDS: ArticleBackground[] = [
  "theme",
  "paper",
  "newspaper",
  "eye-care",
  "ink",
  "sepia",
  "mist",
];

const PATTERNS: ArticleBackgroundPattern[] = [
  "none",
  "plain",
  "grid",
  "dots",
  "lines",
  "notebook",
];

const isBackground = (value: unknown): value is ArticleBackground =>
  typeof value === "string" &&
  (BACKGROUNDS as string[]).includes(value);

const isPattern = (value: unknown): value is ArticleBackgroundPattern =>
  typeof value === "string" && (PATTERNS as string[]).includes(value);

const isColumns = (value: unknown): value is BookColumns =>
  value === 1 || value === 2;

const isColumnFill = (value: unknown): value is BookColumnFill =>
  value === "balance" || value === "auto";

const isParagraphAlign = (value: unknown): value is ParagraphAlign =>
  value === "left" || value === "justify";

const isLinkStyle = (value: unknown): value is LinkStyle =>
  value === "default" || value === "underline" || value === "accent";

const isCodeStyle = (value: unknown): value is CodeStyle =>
  value === "plain" || value === "muted" || value === "contrast";

const isFont = (value: unknown): value is MindMapFont => isFontValue(value);

const BOOK_THEMES: BookTheme[] = [
  "notebook",
  "essay",
  "magazine",
  "night",
  "academic",
  "minimal",
];

const isTheme = (value: unknown): value is BookTheme =>
  typeof value === "string" && (BOOK_THEMES as string[]).includes(value);

/** Map Article theme chrome onto Book (keeps column layout intact). */
export const bookThemeChrome = (theme: BookTheme): Partial<BookSettings> => {
  const chrome = articleThemeChrome(theme);
  return {
    theme,
    padding: chrome.padding,
    background: chrome.background,
    backgroundPattern: chrome.backgroundPattern,
    viewBackground: chrome.viewBackground,
    font: chrome.font,
    fontSize: chrome.fontSize,
    color: chrome.color,
    strongColor: chrome.strongColor,
    letterSpacing: chrome.letterSpacing,
    lineHeight: chrome.lineHeight,
    paragraphSpacing: chrome.paragraphSpacing,
    paragraphIndent: chrome.paragraphIndent,
    paragraphAlign: chrome.paragraphAlign,
    linkStyle: chrome.linkStyle,
    codeStyle: chrome.codeStyle,
    headers: { ...chrome.headers },
  };
};

export const DEFAULT_BOOK_SETTINGS: BookSettings = {
  theme: "essay",
  columns: 2,
  columnGap: BOOK_COLUMN_GAP_DEFAULT,
  columnFill: "auto",
  columnRule: false,
  padding: ARTICLE_THEME_PRESETS.essay.padding,
  background: ARTICLE_THEME_PRESETS.essay.background,
  backgroundPattern: ARTICLE_THEME_PRESETS.essay.backgroundPattern,
  viewBackground: ARTICLE_THEME_PRESETS.essay.viewBackground,
  viewBackgroundColor: "",
  font: ARTICLE_THEME_PRESETS.essay.font,
  fontSize: ARTICLE_THEME_PRESETS.essay.fontSize,
  color: "",
  strongColor: "",
  letterSpacing: ARTICLE_THEME_PRESETS.essay.letterSpacing,
  lineHeight: ARTICLE_THEME_PRESETS.essay.lineHeight,
  paragraphSpacing: ARTICLE_THEME_PRESETS.essay.paragraphSpacing,
  paragraphIndent: ARTICLE_THEME_PRESETS.essay.paragraphIndent,
  paragraphAlign: ARTICLE_THEME_PRESETS.essay.paragraphAlign,
  linkStyle: ARTICLE_THEME_PRESETS.essay.linkStyle,
  headers: { ...ARTICLE_THEME_PRESETS.essay.headers },
  codeStyle: ARTICLE_THEME_PRESETS.essay.codeStyle,
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
  listStyle: DEFAULT_TYPOGRAPHY_VALUES.listStyle,
  blockquoteWeight: DEFAULT_TYPOGRAPHY_VALUES.blockquoteWeight,
  hrWeight: DEFAULT_TYPOGRAPHY_VALUES.hrWeight,
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
  pageNumberStart: "first",
};

const normalizeHeaders = (value: unknown): HeadingStyles => {
  const base = DEFAULT_BOOK_SETTINGS.headers;
  if (!value || typeof value !== "object") {
    return { ...base };
  }
  return { ...base, ...(value as HeadingStyles) };
};

export const normalizeBookSettings = (raw: unknown): BookSettings => {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const defaults = DEFAULT_BOOK_SETTINGS;

  return {
    theme: isTheme(source.theme) ? source.theme : defaults.theme,
    columns: isColumns(source.columns)
      ? source.columns
      : source.columns === 3
        ? 2
        : defaults.columns,
    columnGap: normalizeInRange(
      source.columnGap,
      {
        min: BOOK_COLUMN_GAP_MIN,
        max: BOOK_COLUMN_GAP_MAX,
        step: BOOK_COLUMN_GAP_STEP,
      },
      defaults.columnGap,
    ),
    columnFill: isColumnFill(source.columnFill)
      ? source.columnFill
      : defaults.columnFill,
    columnRule:
      typeof source.columnRule === "boolean"
        ? source.columnRule
        : defaults.columnRule,
    padding: normalizeInRange(
      source.padding,
      {
        min: BOOK_PADDING_MIN,
        max: BOOK_PADDING_MAX,
        step: BOOK_PADDING_STEP,
      },
      defaults.padding,
    ),
    background: isBackground(source.background)
      ? source.background
      : defaults.background,
    backgroundPattern: isPattern(source.backgroundPattern)
      ? source.backgroundPattern
      : defaults.backgroundPattern,
    viewBackground: isBackground(source.viewBackground)
      ? source.viewBackground
      : defaults.viewBackground,
    viewBackgroundColor:
      typeof source.viewBackgroundColor === "string"
        ? source.viewBackgroundColor
        : defaults.viewBackgroundColor,
    font: isFont(source.font) ? source.font : defaults.font,
    fontSize:
      normalizeBodyFontSizePx(source.fontSize, defaults.fontSize),
    color: typeof source.color === "string" ? source.color : defaults.color,
    strongColor:
      typeof source.strongColor === "string"
        ? source.strongColor
        : defaults.strongColor,
    letterSpacing: normalizeInRange(
      typeof source.letterSpacing === "number"
        ? migrateLetterSpacingToPt(source.letterSpacing)
        : source.letterSpacing,
      LETTER_SPACING_RANGE,
      defaults.letterSpacing,
    ),
    lineHeight: normalizeInRange(
      source.lineHeight,
      { min: 0.9, max: 2.4, step: 0.05 },
      defaults.lineHeight,
    ),
    paragraphSpacing: normalizeInRange(
      typeof source.paragraphSpacing === "number"
        ? migrateParagraphMeasureToPt(source.paragraphSpacing)
        : source.paragraphSpacing,
      PARAGRAPH_SPACING_RANGE,
      defaults.paragraphSpacing,
    ),
    paragraphIndent: normalizeInRange(
      typeof source.paragraphIndent === "number"
        ? migrateParagraphMeasureToPt(source.paragraphIndent)
        : source.paragraphIndent,
      PARAGRAPH_INDENT_RANGE,
      defaults.paragraphIndent,
    ),
    paragraphAlign: isParagraphAlign(source.paragraphAlign)
      ? source.paragraphAlign
      : defaults.paragraphAlign,
    linkStyle: isLinkStyle(source.linkStyle)
      ? source.linkStyle
      : defaults.linkStyle,
    headers: normalizeHeaders(source.headers),
    codeStyle: isCodeStyle(source.codeStyle)
      ? source.codeStyle
      : defaults.codeStyle,
    codeTheme: isCodeTheme(source.codeTheme)
      ? source.codeTheme
      : defaults.codeTheme,
    codeFont: isCodeFont(source.codeFont) ? source.codeFont : defaults.codeFont,
    codeFontSize:
      normalizeMindMapFontSize(source.codeFontSize) ?? defaults.codeFontSize,
    codeFrame:
      typeof source.codeFrame === "boolean"
        ? source.codeFrame
        : defaults.codeFrame,
    codeFrameColor:
      typeof source.codeFrameColor === "string"
        ? source.codeFrameColor
        : defaults.codeFrameColor,
    codeFrameRadius: normalizeInRange(
      source.codeFrameRadius,
      CODE_RADIUS_RANGE,
      defaults.codeFrameRadius,
    ),
    codeFrameBorder: normalizeInRange(
      source.codeFrameBorder,
      CODE_BORDER_RANGE,
      defaults.codeFrameBorder,
    ),
    codeFrameWidth: normalizeInRange(
      source.codeFrameWidth,
      CODE_WIDTH_RANGE,
      defaults.codeFrameWidth,
    ),
    tableStyle: isTableStyle(source.tableStyle)
      ? source.tableStyle
      : defaults.tableStyle,
    tableBorderWidth: normalizeInRange(
      source.tableBorderWidth,
      TABLE_BORDER_RANGE,
      defaults.tableBorderWidth,
    ),
    tableHeaderRowBold:
      typeof source.tableHeaderRowBold === "boolean"
        ? source.tableHeaderRowBold
        : defaults.tableHeaderRowBold,
    tableHeaderColumnBold:
      typeof source.tableHeaderColumnBold === "boolean"
        ? source.tableHeaderColumnBold
        : defaults.tableHeaderColumnBold,
    listStyle: isListStyle(source.listStyle)
      ? source.listStyle
      : defaults.listStyle,
    blockquoteWeight: isRuleWeight(source.blockquoteWeight)
      ? source.blockquoteWeight
      : defaults.blockquoteWeight,
    hrWeight: isRuleWeight(source.hrWeight)
      ? source.hrWeight
      : defaults.hrWeight,
    imageWidth: isImageWidth(source.imageWidth)
      ? source.imageWidth
      : defaults.imageWidth,
    imageAlign: isImageAlign(source.imageAlign)
      ? source.imageAlign
      : defaults.imageAlign,
    imageWrap: isImageWrap(source.imageWrap)
      ? source.imageWrap
      : defaults.imageWrap,
    imageBorderStyle: isImageBorderStyle(source.imageBorderStyle)
      ? source.imageBorderStyle
      : defaults.imageBorderStyle,
    imageBorderWidth: normalizeInRange(
      source.imageBorderWidth,
      IMAGE_BORDER_RANGE,
      defaults.imageBorderWidth,
    ),
    imageBorderColor:
      typeof source.imageBorderColor === "string"
        ? source.imageBorderColor
        : defaults.imageBorderColor,
    imageRadius: normalizeInRange(
      source.imageRadius,
      IMAGE_RADIUS_RANGE,
      defaults.imageRadius,
    ),
    showTextCount:
      typeof source.showTextCount === "boolean"
        ? source.showTextCount
        : defaults.showTextCount,
    showPageCount:
      typeof source.showPageCount === "boolean"
        ? source.showPageCount
        : defaults.showPageCount,
    showFileSize:
      typeof source.showFileSize === "boolean"
        ? source.showFileSize
        : defaults.showFileSize,
    pageNumberStart: isPageNumberStart(source.pageNumberStart)
      ? source.pageNumberStart
      : defaults.pageNumberStart,
  };
};

/** Map Book → Article so we reuse Article paper / typography CSS. */
export const bookSettingsToArticle = (
  settings: BookSettings,
): ArticleSettings => ({
  ...DEFAULT_ARTICLE_SETTINGS,
  theme: settings.theme,
  measure: "full",
  pageLayout: "scroll",
  columnAlign: "center",
  padding: settings.padding,
  background: settings.background,
  backgroundPattern: settings.backgroundPattern,
  viewBackground: settings.viewBackground,
  viewBackgroundColor: settings.viewBackgroundColor,
  font: settings.font,
  fontSize: settings.fontSize,
  color: settings.color,
  strongColor: settings.strongColor,
  letterSpacing: settings.letterSpacing,
  lineHeight: settings.lineHeight,
  paragraphSpacing: settings.paragraphSpacing,
  paragraphIndent: settings.paragraphIndent,
  paragraphAlign: settings.paragraphAlign,
  linkStyle: settings.linkStyle,
  headers: settings.headers,
  codeStyle: settings.codeStyle,
  codeTheme: settings.codeTheme,
  codeFont: settings.codeFont,
  codeFontSize: settings.codeFontSize,
  codeFrame: settings.codeFrame,
  codeFrameColor: settings.codeFrameColor,
  codeFrameRadius: settings.codeFrameRadius,
  codeFrameBorder: settings.codeFrameBorder,
  codeFrameWidth: settings.codeFrameWidth,
  tableStyle: settings.tableStyle,
  tableBorderWidth: settings.tableBorderWidth,
  tableHeaderRowBold: settings.tableHeaderRowBold,
  tableHeaderColumnBold: settings.tableHeaderColumnBold,
  listStyle: settings.listStyle,
  blockquoteWeight: settings.blockquoteWeight,
  hrWeight: settings.hrWeight,
  imageWidth: settings.imageWidth as ImageWidth,
  imageAlign: settings.imageAlign as ImageAlign,
  imageWrap: settings.imageWrap as ImageWrap,
  imageBorderStyle: settings.imageBorderStyle as ImageBorderStyle,
  imageBorderWidth: settings.imageBorderWidth,
  imageBorderColor: settings.imageBorderColor,
  imageRadius: settings.imageRadius,
});

export const applyBookAppearance = (
  host: HTMLElement,
  settings: BookSettings,
): void => {
  applyArticleAppearance(host, bookSettingsToArticle(settings));
  host.classList.add("jp-KuusiBook-paper");
  host.dataset.kuusiBookColumns = String(settings.columns);
  // Facing pages always fill in reading order (left → right).
  host.dataset.kuusiBookColumnFill = "auto";
  host.dataset.kuusiBookColumnRule = settings.columnRule ? "1" : "0";
  host.style.setProperty("--kuusi-book-columns", String(settings.columns));
  host.style.setProperty("--kuusi-book-spine", `${settings.columnGap}rem`);
  host.style.setProperty(
    "--kuusi-book-column-gap",
    `${settings.columnGap}rem`,
  );
  // Fixed physical page widths (A4 / half-A4 for facing). Pane must not resize them.
  host.style.setProperty(
    "--kuusi-book-page-w",
    settings.columns === 1 ? "210mm" : "105mm",
  );
  host.style.setProperty("--kuusi-book-page-h", "297mm");
};

export class BookSettingsManager {
  private _settings: BookSettings = { ...DEFAULT_BOOK_SETTINGS };

  private _plugin: ISettingRegistry.ISettings | null = null;

  /** Hover preview overlay: shown to listeners but never persisted. */
  private _preview: BookSettings | null = null;

  private _writing = 0;

  private _listeners = new Set<(settings: BookSettings) => void>();

  readonly changed = {
    connect: (fn: (settings: BookSettings) => void) => {
      this._listeners.add(fn);
      return {
        disconnect: () => {
          this._listeners.delete(fn);
        },
      };
    },
  };

  constructor(private _registry: ISettingRegistry) {}

  get settings(): BookSettings {
    return this._preview ?? this._settings;
  }

  async ready(): Promise<void> {
    try {
      const plugin = await this._registry.load(BOOK_SETTINGS_PLUGIN_ID);
      this._plugin = plugin;
      this._settings = normalizeBookSettings(plugin.composite);
      plugin.changed.connect(() => {
        if (this._writing > 0) {
          return;
        }

        this._preview = null;
        this._settings = normalizeBookSettings(plugin.composite);
        this._emit();
      });
    } catch (error) {
      console.warn(
        "jupyterlab-kuusi: Book settings unavailable, using defaults",
        error,
      );
      this._plugin = null;
      this._settings = { ...DEFAULT_BOOK_SETTINGS };
    }
  }

  async applyTheme(theme: BookTheme): Promise<void> {
    await this.update(bookThemeChrome(theme));
  }

  async update(partial: Partial<BookSettings>): Promise<void> {
    this._preview = null;
    const previous = this._settings;
    const next = normalizeBookSettings({
      ...this._settings,
      ...partial,
      headers: partial.headers ?? this._settings.headers,
    });

    this._settings = next;
    this._emit();

    if (!this._plugin) {
      return;
    }

    const writes: Promise<void>[] = [];
    const enqueue = <K extends keyof BookSettings>(
      key: K,
      changed: boolean,
      value: BookSettings[K],
    ): void => {
      if (changed) {
        writes.push(this._plugin!.set(key, value as unknown as JSONValue));
      }
    };

    (Object.keys(next) as Array<keyof BookSettings>).forEach((key) => {
      enqueue(key, next[key] !== previous[key], next[key]);
    });

    if (writes.length === 0) {
      return;
    }

    this._writing += 1;
    try {
      await Promise.all(writes);
    } finally {
      this._writing -= 1;
    }
  }

  /**
   * Show `partial` on top of the saved settings without writing it. Pass null
   * (or call update) to drop the overlay.
   */
  setPreview(partial: Partial<BookSettings> | null): void {
    this._preview = partial ? normalizeBookSettings({ ...this._settings, ...partial }) : null;
    this._emit();
  }

  private _emit(): void {
    this._listeners.forEach((fn) => {
      fn(this.settings);
    });
  }
}

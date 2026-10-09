import { APPEARANCE_COLOR_SWATCHES, BACKGROUND_COLOR_SWATCHES } from "./colorPicker";
import { createThemeCapsule } from "./themeCapsule";
import {
  legendColumns,
  legendPageLayout,
  legendPageNumberFormat,
  legendPageNumberPosition,
  legendPageNumberStart,
  legendPaperOrientation,
  legendPaperSize,
} from "./optionLegends";
import { appendMenuFooterAction, createKeyedReset } from "./menuFooter";
import type { KuusiTranslator } from "./kuusiI18n";
import { CAPSULE_MENU_SECONDARY, createCapsuleDropdown } from "./capsuleDropdown";
import { presetMatches } from "./themeRestore";
import { renderPanelWidgets, type PanelWidget } from "./panelWidgets";
import { mountSecondaryMenu } from "./secondaryMenu";
import { buildStatusPanelWidgets } from "./statusDisplay";
import { getTextAlignOptions, type TypographyModel } from "./typographyMenus";
import {
  ARTICLE_LINE_HEIGHT_MAX,
  ARTICLE_LINE_HEIGHT_MIN,
  ARTICLE_LINE_HEIGHT_STEP,
  ARTICLE_PADDING_MAX,
  ARTICLE_PADDING_MIN,
  ARTICLE_PADDING_STEP,
  ARTICLE_PAPER_BORDER_RANGE,
  ARTICLE_PAPER_SHADOW_WIDTH_RANGE,
  type ArticleBackground,
  type ArticleBackgroundPattern,
  type ArticleColumns,
  type ArticleHeaderAlign,
  type ArticleMeasure,
  type ArticlePageLayout,
  type ArticlePageNumber,
  type ArticlePageNumberPosition,
  type ArticlePaperOrientation,
  type ArticlePaperSize,
  ARTICLE_COLUMN_RULE_WIDTH_RANGE,
  articleThemeChrome,
  type ArticleColumnRuleStyle,
  autoPageMarginsMm,
  DEFAULT_ARTICLE_SETTINGS,
  type ArticleSettings,
  type ArticleSettingsManager,
  type ArticleTheme,
  type ChapterBreak,
  type HeadingNumbering,
  type PageNumberStart,
} from "./articleSettings";
import { TOC_DEPTH_RANGE } from "./articleStructure";

type PageSection =
  | "layout"
  | "paper"
  | "columns"
  | "measure"
  | "padding"
  | "background"
  | "view"
  | "status"
  | "contents"
  | "chapters"
  | "margins"
  | "typesetting"
  | "blocks"
  | "watermark"
  | "export"
  | FurnitureSection;
type FurnitureSection = "header" | "footer" | "numbers";

let lastPageSection: PageSection = "layout";

/** Article settings as seen by the shared Text / Paragraph / Headings / Code / Image menus. */
export const createArticleTypographyModel = (
  manager: ArticleSettingsManager,
): TypographyModel => ({
  scope: "article",
  view: "article",
  get: () => manager.settings,
  update: (partial) => {
    void manager.update(partial);
  },
  lineHeightRange: {
    min: ARTICLE_LINE_HEIGHT_MIN,
    max: ARTICLE_LINE_HEIGHT_MAX,
    step: ARTICLE_LINE_HEIGHT_STEP,
  },
});

/** 1 rem = 16 CSS px = 4.233 mm: show the printed size next to the CSS unit. */
const MM_PER_REM = 25.4 / 6;

const formatPaddingRem = (value: number): string =>
  `${value.toFixed(2)}rem · ${(value * MM_PER_REM).toFixed(1)} mm`;

const appendHint = (panel: HTMLElement, text: string): void => {
  const hint = document.createElement("div");
  hint.className = "jp-KuusiPanelWidget-hint";
  hint.textContent = text;
  panel.appendChild(hint);
};

const getMeasures = (
  t: KuusiTranslator,
): Array<{ value: ArticleMeasure; label: string; title: string }> => [
  {
    value: "narrow",
    label: t.measureNarrow(),
    title: t.measureNarrowTitle(),
  },
  {
    value: "reading",
    label: t.measureReading(),
    title: t.measureReadingTitle(),
  },
  {
    value: "wide",
    label: t.measureWide(),
    title: t.measureWideTitle(),
  },
  {
    value: "full",
    label: t.measureFull(),
    title: t.measureFullTitle(),
  },
];

const getBackgrounds = (
  t: KuusiTranslator,
): Array<{ value: ArticleBackground; label: string; title: string }> => [
  { value: "theme", label: t.pageTheme(), title: t.pageThemeTitle() },
  { value: "paper", label: t.pagePaper(), title: t.pagePaperTitle() },
  {
    value: "newspaper",
    label: t.pageNewspaper(),
    title: t.pageNewspaperTitle(),
  },
  { value: "eye-care", label: t.pageEyeCare(), title: t.pageEyeCareTitle() },
  { value: "ink", label: t.pageInk(), title: t.pageInkTitle() },
  { value: "sepia", label: t.pageSepia(), title: t.pageSepiaTitle() },
  { value: "mist", label: t.pageMist(), title: t.pageMistTitle() },
];

const getViewBackgrounds = (
  t: KuusiTranslator,
): Array<{ value: ArticleBackground; label: string; title: string }> => [
  { value: "theme", label: t.pageTheme(), title: t.viewThemeTitle() },
  { value: "paper", label: t.pagePaper(), title: t.pagePaperTitle() },
  {
    value: "newspaper",
    label: t.pageNewspaper(),
    title: t.pageNewspaperTitle(),
  },
  { value: "eye-care", label: t.pageEyeCare(), title: t.pageEyeCareTitle() },
  { value: "ink", label: t.pageInk(), title: t.pageInkTitle() },
  { value: "sepia", label: t.pageSepia(), title: t.pageSepiaTitle() },
  { value: "mist", label: t.pageMist(), title: t.pageMistTitle() },
];

const getPatterns = (
  t: KuusiTranslator,
): Array<{
  value: ArticleBackgroundPattern;
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
    value: "lines",
    label: t.backgroundLines(),
    title: t.backgroundLinesTitle(),
  },
  {
    value: "notebook",
    label: t.backgroundNotebook(),
    title: t.backgroundNotebookTitle(),
  },
];

const getThemes = (
  t: KuusiTranslator,
): Array<{ value: ArticleTheme; label: string; title: string }> => [
  {
    value: "notebook",
    label: t.articleThemeNotebook(),
    title: t.articleThemeNotebookTitle(),
  },
  {
    value: "essay",
    label: t.articleThemeEssay(),
    title: t.articleThemeEssayTitle(),
  },
  {
    value: "magazine",
    label: t.articleThemeMagazine(),
    title: t.articleThemeMagazineTitle(),
  },
  {
    value: "night",
    label: t.articleThemeNight(),
    title: t.articleThemeNightTitle(),
  },
  {
    value: "academic",
    label: t.articleThemeAcademic(),
    title: t.articleThemeAcademicTitle(),
  },
  {
    value: "minimal",
    label: t.articleThemeMinimal(),
    title: t.articleThemeMinimalTitle(),
  },
];

const getPageLayouts = (
  t: KuusiTranslator,
): Array<{ value: ArticlePageLayout; label: string; title: string }> => [
  {
    value: "scroll",
    label: t.pageLayoutScroll(),
    title: t.pageLayoutScrollTitle(),
  },
  {
    value: "paged",
    label: t.pageLayoutPaged(),
    title: t.pageLayoutPagedTitle(),
  },
];

const getPaperSizes = (
  t: KuusiTranslator,
): Array<{ value: ArticlePaperSize; label: string; title: string }> => [
  {
    value: "a4",
    label: t.paperSizeA4(),
    title: t.paperSizeA4Title(),
  },
  {
    value: "a3",
    label: t.paperSizeA3(),
    title: t.paperSizeA3Title(),
  },
  {
    value: "a5",
    label: t.paperSizeA5(),
    title: t.paperSizeA5Title(),
  },
  {
    value: "b5",
    label: t.paperSizeB5(),
    title: t.paperSizeB5Title(),
  },
  {
    value: "letter",
    label: t.paperSizeLetter(),
    title: t.paperSizeLetterTitle(),
  },
  {
    value: "legal",
    label: t.paperSizeLegal(),
    title: t.paperSizeLegalTitle(),
  },
];

const getPaperOrientations = (
  t: KuusiTranslator,
): Array<{ value: ArticlePaperOrientation; label: string; title: string }> => [
  {
    value: "portrait",
    label: t.paperOrientationPortrait(),
    title: t.paperOrientationPortraitTitle(),
  },
  {
    value: "landscape",
    label: t.paperOrientationLandscape(),
    title: t.paperOrientationLandscapeTitle(),
  },
];

const createMeasurePreview = (measure: ArticleMeasure): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = `jp-KuusiArticleMeasure-preview jp-KuusiArticleMeasure-preview--${measure}`;
  preview.setAttribute("aria-hidden", "true");
  const bar = document.createElement("span");
  bar.className = "jp-KuusiArticleMeasure-previewBar";
  preview.appendChild(bar);
  return preview;
};

const createBackgroundPreview = (background: ArticleBackground): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = "jp-KuusiArticlePage-preview";
  preview.dataset.kuusiArticlePagePreview = background;
  preview.setAttribute("aria-hidden", "true");
  return preview;
};

const createViewBackgroundPreview = (
  background: ArticleBackground,
): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = "jp-KuusiArticleView-preview";
  preview.dataset.kuusiArticleViewPreview = background;
  preview.setAttribute("aria-hidden", "true");
  return preview;
};

const createPatternPreview = (
  pattern: ArticleBackgroundPattern,
): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = "jp-KuusiArticlePattern-preview";
  preview.dataset.kuusiArticlePatternPreview = pattern;
  preview.setAttribute("aria-hidden", "true");
  return preview;
};

const createThemeThumbnail = (theme: ArticleTheme): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = "jp-KuusiArticleTheme-preview";
  preview.dataset.kuusiArticleThemePreview = theme;
  preview.setAttribute("aria-hidden", "true");
  const title = document.createElement("span");
  title.className = "jp-KuusiArticleTheme-previewTitle";
  preview.appendChild(title);
  return preview;
};

export const createArticleThemeToolbar = (
  root: HTMLElement,
  manager: ArticleSettingsManager,
  t: KuusiTranslator,
): HTMLElement =>
  createThemeCapsule({
    root,
    t,
    toolbarClass: "jp-KuusiArticle-theme-toolbar",
    dropdownClass: "jp-KuusiArticleThemeDropdown",
    triggerClass: "jp-KuusiArticleThemeDropdown-trigger",
    ariaLabel: t.articleTheme(),
    themes: () => getThemes(t),
    current: () => manager.settings.theme,
    thumbnail: (value) => createThemeThumbnail(value as ArticleTheme),
    apply: (value) => manager.applyTheme(value as ArticleTheme),
    preview: (value) =>
      manager.setPreview(
        value === null
          ? null
          : {
              theme: value as ArticleTheme,
              ...articleThemeChrome(value as ArticleTheme),
            },
      ),
    isCustomized: () =>
      !presetMatches(
        manager.settings,
        articleThemeChrome(manager.settings.theme),
      ),
    connect: (listener) => manager.changed.connect(listener),
  });

const ARTICLE_PAGE_KEYS = [
  "pageLayout",
  "paperSize",
  "paperOrientation",
  "columns",
  "columnAlign",
  "measure",
  "padding",
  "background",
  "backgroundPattern",
  "viewBackground",
  "viewBackgroundColor",
  "paperBorderColor",
  "paperBorderWidth",
  "paperShadow",
  "paperShadowWidth",
  "pageHeaderRule",
  "pageFooterRule",
  "pageFirstDifferent",
  "tableRepeatHeader",
  "headingNumbering",
  "chapterBreak",
  "tocShow",
  "tocDepth",
  "tocTitle",
  "coverPage",
  "marginTopMm",
  "marginBottomMm",
  "marginLeftMm",
  "marginRightMm",
  "marginGutterMm",
  "watermarkText",
  "pageHeaderMirror",
  "orphanLines",
  "hyphenate",
  "indentChars",
  "codeLineNumbers",
  "codeTabSize",
  "imageCaptions",
  "linkFootnotes",
  "tableFontPercent",
  "tableBandColor",
  "columnRule",
  "columnRuleStyle",
  "columnRuleWidth",
  "columnRuleColor",
] as const satisfies ReadonlyArray<keyof ArticleSettings>;

export const createArticlePageToolbar = (
  root: HTMLElement,
  manager: ArticleSettingsManager,
  t: KuusiTranslator,
): HTMLElement => {
  const pageReset = createKeyedReset<ArticleSettings>({
    keys: ARTICLE_PAGE_KEYS,
    getSettings: () => manager.settings,
    baseline: (settings) => ({
      ...DEFAULT_ARTICLE_SETTINGS,
      ...articleThemeChrome(settings.theme),
    }),
    update: (partial) => manager.update(partial),
  });

  return createCapsuleDropdown(root, {
    isCustomized: pageReset.isCustomized,
    connectSync: (listener) => manager.changed.connect(listener),
    footer: (menu, rebuild) => {
      appendMenuFooterAction(menu, {
        label: t.resetPageSettings(),
        title: t.resetPageSettingsTitle(),
        disabled: !pageReset.isCustomized(),
        onClick: () => {
          pageReset.reset();
          rebuild();
        },
      });
    },
    toolbarClass: "jp-KuusiArticle-page-toolbar",
    dropdownClass: "jp-KuusiArticlePageDropdown",
    triggerClass: "jp-KuusiArticlePageDropdown-trigger",
    ariaLabel: t.articlePage(),
    triggerLabel: t.page(),
    // 18 tabs + 5 group captions: taller than the default menu.
    menuClassName: `${CAPSULE_MENU_SECONDARY} jp-KuusiSecondaryMenu-host--tall`,
    fillMenu: (menu, rebuild) => {
      const settings = manager.settings;
      mountSecondaryMenu(menu, {
        ariaLabel: t.articlePage(),
        sections: [
          { id: "layout", label: t.pageLayout(), group: t.layout() },
          { id: "paper", label: t.paperSize(), group: t.layout() },
          { id: "columns", label: t.columns(), group: t.layout() },
          { id: "measure", label: t.measure(), group: t.layout() },
          { id: "margins", label: t.marginsSection(), group: t.layout() },
          { id: "typesetting", label: t.typesettingSection(), group: t.layout() },
          { id: "padding", label: t.padding(), group: t.surface() },
          { id: "watermark", label: t.watermarkSection(), group: t.surface() },
          { id: "background", label: t.background(), group: t.surface() },
          { id: "view", label: t.viewBackground(), group: t.surface() },
          { id: "header", label: t.pageHeader(), group: t.headerFooter() },
          { id: "footer", label: t.pageFooter(), group: t.headerFooter() },
          { id: "numbers", label: t.pageNumbers(), group: t.headerFooter() },
          { id: "contents", label: t.contentsSection(), group: t.groupStructure() },
          { id: "chapters", label: t.chaptersSection(), group: t.groupStructure() },
          { id: "blocks", label: t.blocksSection(), group: t.groupStructure() },
          { id: "export", label: t.exportSection(), group: t.groupDisplay() },
          {
            id: "status",
            label: t.backgroundStatusSection(),
            group: t.groupDisplay(),
          },
        ],
        getActive: () => lastPageSection,
        setActive: (id) => {
          lastPageSection = id;
        },
        fillSection: (id, panel) => {
          if (id === "header" || id === "footer" || id === "numbers") {
            fillFurnitureSection(id, panel, manager, t, rebuild);
            return;
          }

          if (
            id === "margins" ||
            id === "typesetting" ||
            id === "blocks" ||
            id === "watermark" ||
            id === "export"
          ) {
            fillExtraSection(id, panel, manager, t, rebuild);
            return;
          }

          if (id === "contents" || id === "chapters") {
            fillStructureSection(id, panel, manager, t, rebuild);
            return;
          }

          if (id === "layout") {
            renderPanelWidgets(panel, [
              {
                kind: "choice",
                value: settings.pageLayout,
                options: getPageLayouts(t).map(({ value, label, title }) => ({
                  value,
                  label,
                  title,
                  preview: () => legendPageLayout(value),
                })),
                onChange: (value) => {
                  void manager.update({
                    pageLayout: value as ArticlePageLayout,
                  });
                  rebuild();
                },
              },
              {
                kind: "toggle",
                label: t.tableRepeatHeader(),
                title: t.tableRepeatHeaderTitle(),
                value: settings.tableRepeatHeader,
                onChange: (tableRepeatHeader) => {
                  void manager.update({ tableRepeatHeader });
                },
              },
            ]);
            return;
          }

          if (id === "paper") {
            if (settings.pageLayout !== "paged") {
              appendHint(panel, t.paperSwitchesToPaged());
            }

            renderPanelWidgets(panel, [
              {
                kind: "choice",
                value: settings.paperSize,
                options: getPaperSizes(t).map(({ value, label, title }) => ({
                  value,
                  label,
                  title,
                  preview: () => legendPaperSize(value),
                })),
                onChange: (value) => {
                  void manager.update({
                    paperSize: value as ArticlePaperSize,
                    // Size/orientation only apply to paper sheets.
                    pageLayout: "paged",
                  });
                  rebuild();
                },
              },
              {
                kind: "choice",
                value: settings.paperOrientation,
                options: getPaperOrientations(t).map(
                  ({ value, label, title }) => ({
                    value,
                    label,
                    title,
                    preview: () => legendPaperOrientation(value),
                  }),
                ),
                onChange: (value) => {
                  void manager.update({
                    paperOrientation: value as ArticlePaperOrientation,
                    pageLayout: "paged",
                  });
                  rebuild();
                },
              },
              {
                kind: "color",
                sectionLabel: t.paperBorderColor(),
                value: settings.paperBorderColor,
                swatches: APPEARANCE_COLOR_SWATCHES,
                includeDefaultSwatch: true,
                onChange: (paperBorderColor) => {
                  void manager.update({
                    paperBorderColor,
                    pageLayout: "paged",
                  });
                },
              },
              {
                kind: "slider",
                label: t.paperBorderWidth(),
                value: settings.paperBorderWidth,
                min: ARTICLE_PAPER_BORDER_RANGE.min,
                max: ARTICLE_PAPER_BORDER_RANGE.max,
                step: ARTICLE_PAPER_BORDER_RANGE.step,
                formatValue: (value) => `${Math.round(value)} px`,
                onChange: (paperBorderWidth) => {
                  void manager.update({
                    paperBorderWidth: Math.round(paperBorderWidth),
                    pageLayout: "paged",
                  });
                },
              },
              {
                kind: "toggle",
                label: t.paperShadow(),
                title: t.paperShadowTitle(),
                value: settings.paperShadow,
                onChange: (paperShadow) => {
                  void manager.update({
                    paperShadow,
                    pageLayout: "paged",
                  });
                  rebuild();
                },
              },
              {
                kind: "slider",
                label: t.paperShadowWidth(),
                value: settings.paperShadowWidth,
                min: ARTICLE_PAPER_SHADOW_WIDTH_RANGE.min,
                max: ARTICLE_PAPER_SHADOW_WIDTH_RANGE.max,
                step: ARTICLE_PAPER_SHADOW_WIDTH_RANGE.step,
                formatValue: (value) => `${Math.round(value)} px`,
                onChange: (paperShadowWidth) => {
                  void manager.update({
                    paperShadowWidth: Math.round(paperShadowWidth),
                    pageLayout: "paged",
                  });
                },
              },
            ]);
            return;
          }

          if (id === "columns") {
            renderPanelWidgets(panel, [
              {
                kind: "choice",
                value: String(settings.columns),
                options: [
                  {
                    value: "1",
                    label: t.columnsOne(),
                    title: t.columnsOneTitle(),
                    preview: () => legendColumns("1"),
                  },
                  {
                    value: "2",
                    label: t.columnsTwo(),
                    title: t.columnsTwoTitle(),
                    preview: () => legendColumns("2"),
                  },
                ],
                onChange: (value) => {
                  void manager.update({
                    columns: Number(value) as ArticleColumns,
                  });
                  rebuild();
                },
              },
              ...(settings.columns === 2
                ? ([
                    {
                      kind: "toggle",
                      label: t.columnRule(),
                      title: t.columnRuleTitle(),
                      value: settings.columnRule,
                      onChange: (columnRule: boolean) => {
                        void manager.update({ columnRule });
                        rebuild();
                      },
                    },
                    ...(settings.columnRule
                      ? ([
                          {
                            kind: "slider",
                            label: t.columnRuleWidth(),
                            value: settings.columnRuleWidth,
                            min: ARTICLE_COLUMN_RULE_WIDTH_RANGE.min,
                            max: ARTICLE_COLUMN_RULE_WIDTH_RANGE.max,
                            step: ARTICLE_COLUMN_RULE_WIDTH_RANGE.step,
                            formatValue: (value: number) => `${value} px`,
                            editable: true,
                            inputStep: 0.5,
                            onChange: (columnRuleWidth: number) => {
                              void manager.update({ columnRuleWidth });
                            },
                          },
                          {
                            kind: "choice",
                            sectionLabel: t.columnRuleStyle(),
                            value: settings.columnRuleStyle,
                            options: [
                              { value: "solid", label: t.ruleSolid() },
                              { value: "dashed", label: t.ruleDashed() },
                              { value: "dotted", label: t.ruleDotted() },
                              { value: "double", label: t.ruleDouble() },
                            ],
                            onChange: (value: string) => {
                              void manager.update({
                                columnRuleStyle: value as ArticleColumnRuleStyle,
                              });
                            },
                          },
                          {
                            kind: "color",
                            sectionLabel: t.columnRuleColor(),
                            value: settings.columnRuleColor,
                            swatches: APPEARANCE_COLOR_SWATCHES,
                            includeDefaultSwatch: true,
                            onChange: (columnRuleColor: string) => {
                              void manager.update({ columnRuleColor });
                            },
                          },
                        ] as PanelWidget[])
                      : []),
                  ] as PanelWidget[])
                : []),
            ]);
            return;
          }

          if (id === "measure") {
            renderPanelWidgets(panel, [
              {
                kind: "choice",
                value: settings.measure,
                options: getMeasures(t).map(({ value, label, title }) => ({
                  value,
                  label,
                  title,
                  preview: () => createMeasurePreview(value),
                })),
                onChange: (value) => {
                  void manager.update({ measure: value as ArticleMeasure });
                  rebuild();
                },
              },
            ]);

            if (settings.pageLayout === "paged") {
              appendHint(panel, t.measurePagedHint());
            }

            return;
          }

          if (id === "padding") {
            renderPanelWidgets(panel, [
              {
                kind: "slider",
                label: t.padding(),
                value: settings.padding,
                min: ARTICLE_PADDING_MIN,
                max: ARTICLE_PADDING_MAX,
                step: ARTICLE_PADDING_STEP,
                formatValue: formatPaddingRem,
                onChange: (padding) => {
                  void manager.update({ padding });
                },
              },
            ]);
            appendHint(panel, t.paddingHint());
            return;
          }

          if (id === "background") {
            renderPanelWidgets(panel, [
              {
                kind: "choice",
                sectionLabel: t.color(),
                value: settings.background,
                options: getBackgrounds(t).map(({ value, label, title }) => ({
                  value,
                  label,
                  title,
                  preview: () => createBackgroundPreview(value),
                })),
                onChange: (value) => {
                  void manager.update({
                    background: value as ArticleBackground,
                  });
                  rebuild();
                },
              },
              {
                kind: "choice",
                sectionLabel: t.backgroundPattern(),
                value: settings.backgroundPattern,
                options: getPatterns(t).map(({ value, label, title }) => ({
                  value,
                  label,
                  title,
                  preview: () => createPatternPreview(value),
                })),
                onChange: (value) => {
                  void manager.update({
                    backgroundPattern: value as ArticleBackgroundPattern,
                  });
                  rebuild();
                },
              },
            ]);
            return;
          }

          if (id === "view") {
            renderPanelWidgets(panel, [
              {
                kind: "choice",
                sectionLabel: t.color(),
                value: settings.viewBackgroundColor
                  ? ""
                  : settings.viewBackground,
                options: getViewBackgrounds(t).map(
                  ({ value, label, title }) => ({
                    value,
                    label,
                    title,
                    preview: () => createViewBackgroundPreview(value),
                  }),
                ),
                onChange: (value) => {
                  void manager.update({
                    viewBackground: value as ArticleBackground,
                    viewBackgroundColor: "",
                  });
                  rebuild();
                },
              },
              {
                kind: "color",
                sectionLabel: t.backgroundCustomColor(),
                value: settings.viewBackgroundColor,
                swatches: BACKGROUND_COLOR_SWATCHES,
                onChange: (color) => {
                  void manager.update({ viewBackgroundColor: color });
                  rebuild();
                },
              },
            ]);
            return;
          }

          if (id === "status") {
            renderPanelWidgets(
              panel,
              buildStatusPanelWidgets(
                t,
                {
                  getShowTextCount: () => manager.settings.showTextCount,
                  onShowTextCountChange: (show) => {
                    void manager.update({ showTextCount: show });
                  },
                  getShowPageCount: () => manager.settings.showPageCount,
                  onShowPageCountChange: (show) => {
                    void manager.update({ showPageCount: show });
                  },
                  getShowFileSize: () => manager.settings.showFileSize,
                  onShowFileSizeChange: (show) => {
                    void manager.update({ showFileSize: show });
                  },
                },
                rebuild,
              ),
            );
          }
        },
      });
    },
  });
};

const getPageNumberFormats = (
  t: KuusiTranslator,
): Array<{
  value: ArticlePageNumber;
  label: string;
  title: string;
  preview: () => HTMLElement;
}> =>
  (
    [
      {
        value: "none",
        label: t.pageNumberNone(),
        title: t.pageNumberNoneTitle(),
      },
      {
        value: "page",
        label: t.pageNumberPage(),
        title: t.pageNumberPageTitle(),
      },
      {
        value: "page-of-total",
        label: t.pageNumberPageOfTotal(),
        title: t.pageNumberPageOfTotalTitle(),
      },
    ] as const
  ).map((option) => ({
    ...option,
    preview: () => legendPageNumberFormat(option.value),
  }));

const getPageNumberStarts = (
  t: KuusiTranslator,
): Array<{
  value: PageNumberStart;
  label: string;
  title: string;
  preview: () => HTMLElement;
}> =>
  (
    [
      {
        value: "first",
        label: t.pageNumberStartFirst(),
        title: t.pageNumberStartFirstTitle(),
      },
      {
        value: "second",
        label: t.pageNumberStartSecond(),
        title: t.pageNumberStartSecondTitle(),
      },
    ] as const
  ).map((option) => ({
    ...option,
    preview: () => legendPageNumberStart(option.value),
  }));

const getPageNumberPositions = (
  t: KuusiTranslator,
): Array<{
  value: ArticlePageNumberPosition;
  label: string;
  title: string;
  preview: () => HTMLElement;
}> =>
  (
    [
      {
        value: "header",
        label: t.pageNumberInHeader(),
        title: t.pageNumberInHeaderTitle(),
      },
      {
        value: "footer",
        label: t.pageNumberInFooter(),
        title: t.pageNumberInFooterTitle(),
      },
    ] as const
  ).map((option) => ({
    ...option,
    preview: () => legendPageNumberPosition(option.value),
  }));

const fillStructureSection = (
  id: "contents" | "chapters",
  panel: HTMLElement,
  manager: ArticleSettingsManager,
  t: KuusiTranslator,
  rebuild: () => void,
): void => {
  const settings = manager.settings;

  if (id === "contents") {
    renderPanelWidgets(panel, [
      {
        kind: "toggle",
        label: t.coverPage(),
        title: t.coverPageTitle(),
        value: settings.coverPage,
        onChange: (coverPage) => {
          void manager.update({ coverPage });
        },
      },
      {
        kind: "toggle",
        label: t.contentsShow(),
        title: t.contentsShowTitle(),
        value: settings.tocShow,
        onChange: (tocShow) => {
          void manager.update({ tocShow });
          rebuild();
        },
      },
      {
        kind: "slider",
        label: t.contentsDepth(),
        value: settings.tocDepth,
        min: TOC_DEPTH_RANGE.min,
        max: TOC_DEPTH_RANGE.max,
        step: 1,
        formatValue: (value: number) => `H1–H${value}`,
        onChange: (tocDepth) => {
          void manager.update({ tocDepth });
        },
      },
      {
        kind: "text",
        label: t.contentsTitleLabel(),
        placeholder: t.contentsDefaultTitle(),
        maxLength: 60,
        value: settings.tocTitle,
        onChange: (tocTitle) => {
          void manager.update({ tocTitle });
        },
      },
    ]);
    return;
  }

  if (settings.pageLayout !== "paged") {
    appendHint(panel, t.structurePagedOnly());
  }

  renderPanelWidgets(panel, [
    {
      kind: "choice",
      sectionLabel: t.headingNumbering(),
      value: settings.headingNumbering,
      options: [
        {
          value: "none",
          label: t.headingNumberingNone(),
          title: t.headingNumberingNoneTitle(),
        },
        {
          value: "decimal",
          label: t.headingNumberingDecimal(),
          title: t.headingNumberingDecimalTitle(),
        },
        {
          value: "chinese",
          label: t.headingNumberingChinese(),
          title: t.headingNumberingChineseTitle(),
        },
      ],
      onChange: (value) => {
        void manager.update({ headingNumbering: value as HeadingNumbering });
        rebuild();
      },
    },
    {
      kind: "choice",
      sectionLabel: t.chapterBreak(),
      value: settings.chapterBreak,
      options: [
        {
          value: "none",
          label: t.chapterBreakNone(),
          title: t.chapterBreakNoneTitle(),
        },
        {
          value: "h1",
          label: t.chapterBreakH1(),
          title: t.chapterBreakH1Title(),
        },
        {
          value: "h2",
          label: t.chapterBreakH2(),
          title: t.chapterBreakH2Title(),
        },
      ],
      onChange: (value) => {
        void manager.update({ chapterBreak: value as ChapterBreak });
        rebuild();
      },
    },
  ]);
};

const numberSlider = (
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  format: (value: number) => string,
  onChange: (value: number) => void,
): PanelWidget => ({
  kind: "slider",
  label,
  value,
  min,
  max,
  step,
  formatValue: format,
  onChange,
});

const fillExtraSection = (
  id: "margins" | "typesetting" | "blocks" | "watermark" | "export",
  panel: HTMLElement,
  manager: ArticleSettingsManager,
  t: KuusiTranslator,
  rebuild: () => void,
): void => {
  const s = manager.settings;
  const auto = autoPageMarginsMm(s);
  // A side left at 0 follows the theme, so show the margin actually in effect
  // and park the slider there instead of at 0 / "Auto".
  // Back to 0 = follow the theme: redraw so the field shows the themed value.
  const refreshIfReset = (value: number) => (): void => {
    if (value === 0) {
      rebuild();
    }
  };
  const marginSlider = (
    label: string,
    stored: number,
    themed: number | undefined,
    onChange: (value: number) => void,
  ): PanelWidget => ({
    kind: "slider",
    label,
    value: stored > 0 ? stored : (themed ?? 0),
    min: 0,
    max: 60,
    step: 0.1,
    formatValue: (value) => `${Number(value.toFixed(1))}`,
    // Type an exact value (one decimal); 0 returns the side to the theme.
    editable: true,
    inputStep: 0.1,
    onChange,
  });

  if (id === "margins") {
    renderPanelWidgets(panel, [
      marginSlider(t.marginTop(), s.marginTopMm, auto?.top, (marginTopMm) => {
        void manager.update({ marginTopMm }).then(refreshIfReset(marginTopMm));
      }),
      marginSlider(t.marginBottom(), s.marginBottomMm, auto?.bottom, (marginBottomMm) => {
        void manager.update({ marginBottomMm }).then(refreshIfReset(marginBottomMm));
      }),
      marginSlider(t.marginLeft(), s.marginLeftMm, auto?.left, (marginLeftMm) => {
        void manager.update({ marginLeftMm }).then(refreshIfReset(marginLeftMm));
      }),
      marginSlider(t.marginRight(), s.marginRightMm, auto?.right, (marginRightMm) => {
        void manager.update({ marginRightMm }).then(refreshIfReset(marginRightMm));
      }),
      numberSlider(
        t.marginGutter(),
        s.marginGutterMm,
        0,
        30,
        1,
        (value) => (value > 0 ? `${value} mm` : "0"),
        (marginGutterMm) => {
          void manager.update({ marginGutterMm });
        },
      ),
    ]);
    appendHint(panel, t.marginsHint());
    return;
  }

  if (id === "typesetting") {
    const presets = ["1", "1.15", "1.5", "2"];
    const current = presets.find((p) => Math.abs(Number(p) - s.lineHeight) < 0.01);
    renderPanelWidgets(panel, [
      {
        kind: "choice",
        sectionLabel: t.lineSpacingPresets(),
        value: current ?? "",
        options: presets.map((value) => ({
          value,
          label: `${value}×`,
          title: `${value}×`,
        })),
        onChange: (value) => {
          void manager.update({ lineHeight: Number(value) });
          rebuild();
        },
      },
      numberSlider(
        t.orphanLines(),
        s.orphanLines,
        1,
        4,
        1,
        (value) => String(value),
        (orphanLines) => {
          void manager.update({ orphanLines });
        },
      ),
      {
        kind: "toggle",
        label: t.hyphenation(),
        title: t.hyphenationTitle(),
        value: s.hyphenate,
        onChange: (hyphenate) => {
          void manager.update({ hyphenate });
        },
      },
      numberSlider(
        t.indentChars(),
        s.indentChars,
        0,
        4,
        0.5,
        (value) => `${value} ${t.indentCharsFormat()}`,
        (indentChars) => {
          void manager.update({ indentChars });
        },
      ),
    ]);
    return;
  }

  if (id === "blocks") {
    renderPanelWidgets(panel, [
      {
        kind: "toggle",
        label: t.codeLineNumbers(),
        value: s.codeLineNumbers,
        onChange: (codeLineNumbers) => {
          void manager.update({ codeLineNumbers });
        },
      },
      numberSlider(
        t.codeTabSize(),
        s.codeTabSize,
        2,
        8,
        1,
        (value) => String(value),
        (codeTabSize) => {
          void manager.update({ codeTabSize });
        },
      ),
      {
        kind: "toggle",
        label: t.imageCaptions(),
        title: t.imageCaptionsTitle(),
        value: s.imageCaptions,
        onChange: (imageCaptions) => {
          void manager.update({ imageCaptions });
        },
      },
      {
        kind: "toggle",
        label: t.linkFootnotes(),
        title: t.linkFootnotesTitle(),
        value: s.linkFootnotes,
        onChange: (linkFootnotes) => {
          void manager.update({ linkFootnotes });
        },
      },
      numberSlider(
        t.tableFontSize(),
        s.tableFontPercent,
        60,
        100,
        5,
        (value) => `${value}%`,
        (tableFontPercent) => {
          void manager.update({ tableFontPercent });
        },
      ),
      {
        kind: "color",
        sectionLabel: t.tableBandColor(),
        value: s.tableBandColor,
        swatches: APPEARANCE_COLOR_SWATCHES,
        includeDefaultSwatch: true,
        onChange: (tableBandColor) => {
          void manager.update({ tableBandColor });
        },
      },
    ]);
    return;
  }

  if (id === "watermark") {
    if (s.pageLayout !== "paged") {
      appendPagedOnlyHint(panel, t);
    }

    renderPanelWidgets(panel, [
      {
        kind: "text",
        label: t.watermarkText(),
        placeholder: "DRAFT",
        maxLength: 40,
        value: s.watermarkText,
        onChange: (watermarkText) => {
          void manager.update({ watermarkText });
        },
      },
    ]);
    return;
  }

  renderPanelWidgets(panel, [
    {
      kind: "toggle",
      label: t.pdfBookmarksLabel(),
      title: t.pdfBookmarksTitle(),
      value: s.pdfBookmarks,
      onChange: (pdfBookmarks) => {
        void manager.update({ pdfBookmarks });
      },
    },
    {
      kind: "choice",
      sectionLabel: t.pdfQualityLabel(),
      value: s.pdfQuality,
      options: [
        { value: "standard", label: t.pdfQualityStandard(), title: "JPEG 0.92" },
        { value: "high", label: t.pdfQualityHigh(), title: "JPEG 1.0" },
      ],
      onChange: (value) => {
        void manager.update({ pdfQuality: value as "standard" | "high" });
        rebuild();
      },
    },
  ]);
};

const appendPagedOnlyHint = (panel: HTMLElement, t: KuusiTranslator): void => {
  const hint = document.createElement("div");
  hint.className = "jp-KuusiPanelWidget-hint";
  hint.textContent = t.pageFurniturePagedOnly();
  panel.appendChild(hint);
};

const fillFurnitureSection = (
  id: FurnitureSection,
  panel: HTMLElement,
  manager: ArticleSettingsManager,
  t: KuusiTranslator,
  rebuild: () => void,
): void => {
  const settings = manager.settings;
  const alignOptions = getTextAlignOptions(t);
  if (settings.pageLayout !== "paged") {
    appendPagedOnlyHint(panel, t);
  }

  if (id === "header" || id === "footer") {
    const isHeader = id === "header";
    renderPanelWidgets(panel, [
      {
        kind: "text",
        label: t.pageFurnitureText(),
        title: t.pageFurnitureTextTitle(),
        placeholder: isHeader ? "{title}" : "{title} — {page}",
        maxLength: 200,
        value: isHeader
          ? settings.pageHeaderText
          : settings.pageFooterText,
        onChange: (value) => {
          void manager.update(
            isHeader
              ? { pageHeaderText: value }
              : { pageFooterText: value },
          );
        },
      },
      {
        kind: "choice",
        sectionLabel: t.pageFurnitureAlign(),
        value: isHeader
          ? settings.pageHeaderAlign
          : settings.pageFooterAlign,
        options: alignOptions,
        onChange: (value) => {
          const align = value as ArticleHeaderAlign;
          void manager.update(
            isHeader
              ? { pageHeaderAlign: align }
              : { pageFooterAlign: align },
          );
          rebuild();
        },
      },
    ]);
    renderPanelWidgets(panel, [
      {
        kind: "toggle",
        label: t.pageRule(),
        title: t.pageRuleTitle(),
        value: isHeader ? settings.pageHeaderRule : settings.pageFooterRule,
        onChange: (value) => {
          void manager.update(
            isHeader ? { pageHeaderRule: value } : { pageFooterRule: value },
          );
        },
      },
      {
        kind: "toggle",
        label: t.pageMirror(),
        title: t.pageMirrorTitle(),
        value: settings.pageHeaderMirror,
        onChange: (pageHeaderMirror) => {
          void manager.update({ pageHeaderMirror });
        },
      },
      {
        kind: "toggle",
        label: t.pageFirstDifferent(),
        title: t.pageFirstDifferentTitle(),
        value: settings.pageFirstDifferent,
        onChange: (pageFirstDifferent) => {
          void manager.update({ pageFirstDifferent });
        },
      },
    ]);
    appendHint(panel, t.pageTokensHint());
    return;
  }

  renderPanelWidgets(panel, [
    {
      kind: "choice",
      sectionLabel: t.pageNumberFormat(),
      value: settings.pageNumber,
      options: getPageNumberFormats(t),
      onChange: (value) => {
        void manager.update({
          pageNumber: value as ArticlePageNumber,
        });
        rebuild();
      },
    },
    {
      kind: "choice",
      sectionLabel: t.pageNumberStart(),
      value: settings.pageNumberStart,
      options: getPageNumberStarts(t),
      onChange: (value) => {
        void manager.update({
          pageNumberStart: value as PageNumberStart,
        });
        rebuild();
      },
    },
    {
      kind: "choice",
      sectionLabel: t.pageNumberPosition(),
      value: settings.pageNumberPosition,
      options: getPageNumberPositions(t),
      onChange: (value) => {
        void manager.update({
          pageNumberPosition: value as ArticlePageNumberPosition,
        });
        rebuild();
      },
    },
    {
      kind: "choice",
      sectionLabel: t.pageFurnitureAlign(),
      value: settings.pageNumberAlign,
      options: alignOptions,
      onChange: (value) => {
        void manager.update({
          pageNumberAlign: value as ArticleHeaderAlign,
        });
        rebuild();
      },
    },
  ]);
};


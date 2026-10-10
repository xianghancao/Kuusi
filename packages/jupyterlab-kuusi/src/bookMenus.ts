import { createThemeCapsule } from "./themeCapsule";
import { appendMenuFooterAction, createKeyedReset } from "./menuFooter";
import type { KuusiTranslator } from "./kuusiI18n";
import { CAPSULE_MENU_SECONDARY, createCapsuleDropdown } from "./capsuleDropdown";
import { BACKGROUND_COLOR_SWATCHES } from "./colorPicker";
import { renderPanelWidgets } from "./panelWidgets";
import { mountSecondaryMenu } from "./secondaryMenu";
import { buildStatusPanelWidgets } from "./statusDisplay";
import { presetMatches } from "./themeRestore";
import {
  formatMmLength,
  mmToRem,
  MM_RANGES,
  remToMm,
} from "./lengthUnits";
import type { TypographyModel } from "./typographyMenus";
import {
  bookThemeChrome,
  DEFAULT_BOOK_SETTINGS,
  type BookColumns,
  type BookSettings,
  type BookSettingsManager,
  type BookTheme,
} from "./bookSettings";
import type { ArticleBackground, ArticleBackgroundPattern, PageNumberStart } from "./articleSettings";

type PageSection =
  | "spread"
  | "gap"
  | "padding"
  | "background"
  | "view"
  | "numbers"
  | "status";

let lastPageSection: PageSection = "spread";

/** Book settings as seen by the shared Text / Paragraph / Headings menus. */
export const createBookTypographyModel = (
  manager: BookSettingsManager,
): TypographyModel => ({
  scope: "article",
  view: "book",
  get: () => manager.settings,
  update: (partial) => {
    void manager.update(partial);
  },
  lineHeightRange: { min: 0.9, max: 2.4, step: 0.05 },
});


const getThemes = (
  t: KuusiTranslator,
): Array<{ value: BookTheme; label: string; title: string }> => [
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

const createThemeThumbnail = (theme: BookTheme): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = "jp-KuusiArticleTheme-preview";
  preview.dataset.kuusiArticleThemePreview = theme;
  const title = document.createElement("span");
  title.className = "jp-KuusiArticleTheme-previewTitle";
  title.textContent = "Aa";
  preview.appendChild(title);
  return preview;
};

export const createBookThemeToolbar = (
  root: HTMLElement,
  manager: BookSettingsManager,
  t: KuusiTranslator,
): HTMLElement =>
  createThemeCapsule({
    root,
    t,
    toolbarClass: "jp-KuusiBook-theme-toolbar",
    dropdownClass: "jp-KuusiBookThemeDropdown",
    triggerClass: "jp-KuusiBookThemeDropdown-trigger",
    ariaLabel: t.articleTheme(),
    themes: () => getThemes(t),
    current: () => manager.settings.theme,
    thumbnail: (value) => createThemeThumbnail(value as BookTheme),
    apply: (value) => manager.applyTheme(value as BookTheme),
    preview: (value) =>
      manager.setPreview(
        value === null ? null : bookThemeChrome(value as BookTheme),
      ),
    isCustomized: () =>
      !presetMatches(
        manager.settings,
        bookThemeChrome(manager.settings.theme),
      ),
    connect: (listener) => manager.changed.connect(listener),
  });

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
const BOOK_PAGE_KEYS = [
  "columns",
  "columnGap",
  "columnFill",
  "columnRule",
  "padding",
  "background",
  "backgroundPattern",
  "viewBackground",
  "viewBackgroundColor",
] as const satisfies ReadonlyArray<keyof BookSettings>;

export const createBookPageToolbar = (
  root: HTMLElement,
  manager: BookSettingsManager,
  t: KuusiTranslator,
): HTMLElement => {
  const pageReset = createKeyedReset<BookSettings>({
    keys: BOOK_PAGE_KEYS,
    getSettings: () => manager.settings,
    baseline: (settings) => ({
      ...DEFAULT_BOOK_SETTINGS,
      ...bookThemeChrome(settings.theme),
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
    toolbarClass: "jp-KuusiBook-page-toolbar",
    dropdownClass: "jp-KuusiBookPageDropdown",
    triggerClass: "jp-KuusiBookPageDropdown-trigger",
    ariaLabel: t.bookPage(),
    triggerLabel: t.page(),
    menuClassName: CAPSULE_MENU_SECONDARY,
    fillMenu: (menu, rebuild) => {
      const settings = manager.settings;
      mountSecondaryMenu(menu, {
        ariaLabel: t.bookPage(),
        sections: [
          { id: "spread", label: t.bookSpread(), group: t.layout() },
          { id: "gap", label: t.bookSpine(), group: t.layout() },
          { id: "padding", label: t.padding(), group: t.surface() },
          { id: "background", label: t.background(), group: t.surface() },
          { id: "view", label: t.viewBackground(), group: t.surface() },
          { id: "numbers", label: t.pageNumbers(), group: t.headerFooter() },
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
          if (id === "spread") {
            renderPanelWidgets(panel, [
              {
                kind: "choice",
                value: String(settings.columns),
                options: [
                  {
                    value: "1",
                    label: t.bookSpreadOne(),
                    title: t.bookSpreadOneTitle(),
                  },
                  {
                    value: "2",
                    label: t.bookSpreadTwo(),
                    title: t.bookSpreadTwoTitle(),
                  },
                ],
                onChange: (value) => {
                  void manager.update({
                    columns: Number(value) as BookColumns,
                  });
                  rebuild();
                },
              },
              {
                kind: "choice",
                sectionLabel: t.bookSpineRule(),
                value: settings.columnRule ? "on" : "off",
                options: [
                  {
                    value: "on",
                    label: t.columnRuleOn(),
                    title: t.bookSpineRuleOnTitle(),
                  },
                  {
                    value: "off",
                    label: t.columnRuleOff(),
                    title: t.bookSpineRuleOffTitle(),
                  },
                ],
                onChange: (value) => {
                  void manager.update({ columnRule: value === "on" });
                  rebuild();
                },
              },
            ]);
            return;
          }

          if (id === "gap") {
            renderPanelWidgets(panel, [
              {
                kind: "slider",
                label: t.bookSpine(),
                value: remToMm(settings.columnGap),
                min: MM_RANGES.bookGap.min,
                max: MM_RANGES.bookGap.max,
                step: MM_RANGES.bookGap.step,
                formatValue: formatMmLength,
                onChange: (gapMm) => {
                  void manager.update({ columnGap: mmToRem(gapMm) });
                },
              },
            ]);
            return;
          }

          if (id === "padding") {
            renderPanelWidgets(panel, [
              {
                kind: "slider",
                label: t.padding(),
                value: remToMm(settings.padding),
                min: MM_RANGES.padding.min,
                max: MM_RANGES.padding.max,
                step: MM_RANGES.padding.step,
                formatValue: formatMmLength,
                onChange: (paddingMm) => {
                  void manager.update({ padding: mmToRem(paddingMm) });
                },
              },
            ]);
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
                },
              },
            ]);
            return;
          }

          if (id === "numbers") {
            renderPanelWidgets(panel, [
              {
                kind: "choice",
                sectionLabel: t.pageNumberStart(),
                value: settings.pageNumberStart,
                options: [
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
                ],
                onChange: (value) => {
                  void manager.update({
                    pageNumberStart: value as PageNumberStart,
                  });
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

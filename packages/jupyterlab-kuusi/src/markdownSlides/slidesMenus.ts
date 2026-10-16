import { createThemeCapsule } from "../themeCapsule";
import { appendMenuFooterAction, createKeyedReset } from "../menuFooter";
import type { KuusiTranslator } from "../kuusiI18n";
import {
  CAPSULE_MENU_SECONDARY,
  createCapsuleDropdown,
} from "../capsuleDropdown";
import { presetMatches } from "../themeRestore";
import { APPEARANCE_COLOR_SWATCHES } from "../colorPicker";
import { appendDropdownSection } from "../formatToolbar";
import { renderPanelWidgets } from "../panelWidgets";
import { mountSecondaryMenu } from "../secondaryMenu";
import { buildStatusPanelWidgets } from "../statusDisplay";
import type { TypographyModel } from "../typographyMenus";
import {
  DEFAULT_SLIDES_SETTINGS,
  SLIDES_LINE_HEIGHT_RANGE,
  SLIDES_HEADER_HEIGHT_RANGE,
  SLIDES_CHROME_FONT_SIZE_RANGE,
  SLIDES_FOOTER_RULE_RANGE,
  SLIDES_CHROME_OPACITY_RANGE,
  SLIDES_PROGRESS_HEIGHT_RANGE,
  slidesThemeChrome,
  type SlidesSettings,
  type SlidesContentAlign,
  type SlidesHeaderSource,
  type SlidesPadding,
  type SlidesPageNumberStyle,
  type SlidesRatio,
  type SlidesSettingsManager,
  type SlidesTheme,
  type PageNumberStart,
} from "./slidesSettings";
import type { MarkdownSlideSplitMode } from "./splitMarkdownSlides";
import type { MindMapFont } from "../fontToolbar";
import { buildFontWidgets, getTextAlignOptions } from "../typographyMenus";
import type { TextAlign } from "../typographySettings";

type PageSection =
  | "ratio"
  | "split"
  | "align"
  | "padding"
  | "chrome"
  | "status";

type FurnitureSection =
  | "header"
  | "headerStyle"
  | "footer"
  | "footerStyle"
  | "progress";

let lastFurnitureSection: FurnitureSection = "header";

let lastPageSection: PageSection = "ratio";

/** Slides settings as seen by the shared Text / Paragraph / Headings / Code menus. */
export const createSlidesTypographyModel = (
  manager: SlidesSettingsManager,
): TypographyModel => ({
  scope: "slides",
  view: "slides",
  get: () => {
    const settings = manager.settings;
    return { ...settings, color: settings.textColor };
  },
  update: (partial) => {
    const { color, ...rest } = partial;
    void manager.update(
      color === undefined ? rest : { ...rest, textColor: color },
    );
  },
  preview: (partial) => {
    if (!partial) {
      manager.setPreview(null);
      return;
    }
    const { color, ...rest } = partial;
    manager.setPreview(
      color === undefined ? rest : { ...rest, textColor: color },
    );
  },
  lineHeightRange: SLIDES_LINE_HEIGHT_RANGE,
});

const getThemes = (
  t: KuusiTranslator,
): Array<{ value: SlidesTheme; label: string; title: string }> => [
  {
    value: "classic",
    label: t.slidesThemeClassic(),
    title: t.slidesThemeClassicTitle(),
  },
  {
    value: "night",
    label: t.slidesThemeNight(),
    title: t.slidesThemeNightTitle(),
  },
  {
    value: "forest",
    label: t.slidesThemeForest(),
    title: t.slidesThemeForestTitle(),
  },
  {
    value: "ocean",
    label: t.slidesThemeOcean(),
    title: t.slidesThemeOceanTitle(),
  },
  {
    value: "slate",
    label: t.slidesThemeSlate(),
    title: t.slidesThemeSlateTitle(),
  },
  {
    value: "paper",
    label: t.slidesThemePaper(),
    title: t.slidesThemePaperTitle(),
  },
  {
    value: "metropolis",
    label: t.slidesThemeMetropolis(),
    title: t.slidesThemeMetropolisTitle(),
  },
  {
    value: "madrid",
    label: t.slidesThemeMadrid(),
    title: t.slidesThemeMadridTitle(),
  },
  {
    value: "berlin",
    label: t.slidesThemeBerlin(),
    title: t.slidesThemeBerlinTitle(),
  },
  {
    value: "copenhagen",
    label: t.slidesThemeCopenhagen(),
    title: t.slidesThemeCopenhagenTitle(),
  },
  {
    value: "singapore",
    label: t.slidesThemeSingapore(),
    title: t.slidesThemeSingaporeTitle(),
  },
];

const getRatios = (
  t: KuusiTranslator,
): Array<{ value: SlidesRatio; label: string; title: string }> => [
  {
    value: "16:9",
    label: t.slidesRatioWidescreen(),
    title: t.slidesRatioWidescreenTitle(),
  },
  {
    value: "4:3",
    label: t.slidesRatioClassic(),
    title: t.slidesRatioClassicTitle(),
  },
  {
    value: "1:1",
    label: t.slidesRatioSquare(),
    title: t.slidesRatioSquareTitle(),
  },
];

const getSplitModes = (
  t: KuusiTranslator,
): Array<{ value: MarkdownSlideSplitMode; label: string; title: string }> => [
  {
    value: "auto",
    label: t.slidesSplitAuto(),
    title: t.slidesSplitAutoTitle(),
  },
  {
    value: "rules",
    label: t.slidesSplitRules(),
    title: t.slidesSplitRulesTitle(),
  },
  {
    value: "headings",
    label: t.slidesSplitHeadings(),
    title: t.slidesSplitHeadingsTitle(),
  },
];

const getPaddings = (
  t: KuusiTranslator,
): Array<{ value: SlidesPadding; label: string; title: string }> => [
  {
    value: "compact",
    label: t.paddingCompact(),
    title: t.slidesPaddingCompactTitle(),
  },
  {
    value: "normal",
    label: t.slidesPaddingNormal(),
    title: t.slidesPaddingNormalTitle(),
  },
  {
    value: "loose",
    label: t.paddingLoose(),
    title: t.slidesPaddingLooseTitle(),
  },
];

const getAligns = (
  t: KuusiTranslator,
): Array<{ value: SlidesContentAlign; label: string; title: string }> => [
  {
    value: "top",
    label: t.slidesAlignTop(),
    title: t.slidesAlignTopTitle(),
  },
  {
    value: "center",
    label: t.alignCenter(),
    title: t.slidesAlignCenterTitle(),
  },
  {
    value: "bottom",
    label: t.slidesAlignBottom(),
    title: t.slidesAlignBottomTitle(),
  },
];

const createThemeThumbnail = (theme: SlidesTheme): HTMLElement => {
  const preview = document.createElement("span");
  preview.className = `jp-KuusiSlidesTheme-preview jp-KuusiSlidesTheme-preview--${theme}`;
  preview.setAttribute("aria-hidden", "true");
  const title = document.createElement("span");
  title.className = "jp-KuusiSlidesTheme-previewTitle";
  title.textContent = "Aa";
  preview.appendChild(title);
  return preview;
};


/** Theme presets, with the accent color below the list. */
export const createSlidesThemeToolbar = (
  root: HTMLElement,
  manager: SlidesSettingsManager,
  t: KuusiTranslator,
): HTMLElement =>
  createThemeCapsule({
    root,
    t,
    toolbarClass: "jp-KuusiSlides-theme-toolbar",
    dropdownClass: "jp-KuusiSlidesThemeDropdown",
    triggerClass: "jp-KuusiSlidesThemeDropdown-trigger",
    ariaLabel: t.slidesTheme(),
    themes: () => getThemes(t),
    current: () => manager.settings.theme,
    thumbnail: (value) => createThemeThumbnail(value as SlidesTheme),
    apply: (value) => manager.applyTheme(value as SlidesTheme),
    preview: (value) =>
      manager.setPreview(
        value === null
          ? null
          : {
              theme: value as SlidesTheme,
              ...slidesThemeChrome(value as SlidesTheme),
            },
      ),
    isCustomized: () =>
      !presetMatches(
        manager.settings,
        slidesThemeChrome(manager.settings.theme),
      ),
    connect: (listener) => manager.changed.connect(listener),
    appendExtra: (menu) => {
      const accent = document.createElement("div");
      accent.className = "jp-KuusiSlidesThemeDropdown-accent";
      renderPanelWidgets(accent, [
        {
          kind: "color",
          sectionLabel: t.slidesAccentColor(),
          value: manager.settings.accentColor,
          swatches: APPEARANCE_COLOR_SWATCHES,
          includeDefaultSwatch: true,
          // No rebuild: keeps the native color picker open.
          onChange: (color) => {
            void manager.update({ accentColor: color });
          },
        },
      ]);
      menu.appendChild(accent);
    },
  });

/** Page: ratio · split · vertical align · padding. */
const SLIDES_PAGE_KEYS = [
  "ratio",
  "splitMode",
  "contentAlign",
  "padding",
  "stageShadow",
] as const satisfies ReadonlyArray<keyof SlidesSettings>;

const SLIDES_FURNITURE_KEYS = [
  "showHeader",
  "headerSource",
  "headerCustomText",
  "headerHeight",
  "headerFont",
  "headerFontSize",
  "headerColor",
  "headerTextColor",
  "headerOpacity",
  "showFooter",
  "footerText",
  "showPageNumber",
  "pageNumberStyle",
  "pageNumberAlign",
  "pageNumberStart",
  "footerRuleWidth",
  "footerColor",
  "footerBackground",
  "footerOpacity",
  "footerFont",
  "footerFontSize",
  "showProgress",
  "progressHeight",
  "progressColor",
  "progressOpacity",
  "progressShadow",
] as const satisfies ReadonlyArray<keyof SlidesSettings>;

/** Header, footer and progress bar: their own menu, beside Page. */
export const createSlidesHeaderFooterToolbar = (
  root: HTMLElement,
  manager: SlidesSettingsManager,
  t: KuusiTranslator,
): HTMLElement => {
  const reset = createKeyedReset<SlidesSettings>({
    keys: SLIDES_FURNITURE_KEYS,
    getSettings: () => manager.settings,
    baseline: (settings) => ({
      ...DEFAULT_SLIDES_SETTINGS,
      ...slidesThemeChrome(settings.theme),
    }),
    update: (partial) => manager.update(partial),
  });

  return createCapsuleDropdown(root, {
    isCustomized: reset.isCustomized,
    connectSync: (listener) => manager.changed.connect(listener),
    footer: (menu, rebuild) => {
      appendMenuFooterAction(menu, {
        label: t.resetPageSettings(),
        title: t.resetPageSettingsTitle(),
        disabled: !reset.isCustomized(),
        onClick: () => {
          reset.reset();
          rebuild();
        },
      });
    },
    toolbarClass: "jp-KuusiSlides-furniture-toolbar",
    dropdownClass: "jp-KuusiSlidesFurnitureDropdown",
    triggerClass: "jp-KuusiSlidesFurnitureDropdown-trigger",
    ariaLabel: t.headerFooter(),
    triggerLabel: t.headerFooter(),
    menuClassName: CAPSULE_MENU_SECONDARY,
    fillMenu: (menu, rebuild) => {
      mountSecondaryMenu<FurnitureSection>(menu, {
        ariaLabel: t.headerFooter(),
        sections: [
          { id: "header", label: t.pageHeader() },
          { id: "headerStyle", label: t.slidesHeaderStyle() },
          { id: "footer", label: t.pageFooter() },
          { id: "footerStyle", label: t.slidesFooterStyle() },
          { id: "progress", label: t.slidesProgress() },
        ],
        getActive: () => lastFurnitureSection,
        setActive: (id) => {
          lastFurnitureSection = id;
        },
        fillSection: (id, panel) => {
          fillSlideChromeSection(id, panel, manager, t, rebuild);
        },
      });
    },
  });
};

export const createSlidesPageToolbar = (
  root: HTMLElement,
  manager: SlidesSettingsManager,
  t: KuusiTranslator,
): HTMLElement => {
  const pageReset = createKeyedReset<SlidesSettings>({
    keys: SLIDES_PAGE_KEYS,
    getSettings: () => manager.settings,
    baseline: (settings) => ({
      ...DEFAULT_SLIDES_SETTINGS,
      ...slidesThemeChrome(settings.theme),
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
    toolbarClass: "jp-KuusiSlides-page-toolbar",
    dropdownClass: "jp-KuusiSlidesPageDropdown",
    triggerClass: "jp-KuusiSlidesPageDropdown-trigger",
    ariaLabel: t.pageSetup(),
    triggerLabel: t.page(),
    menuClassName: CAPSULE_MENU_SECONDARY,
    fillMenu: (menu, rebuild) => {
      const settings = manager.settings;
      mountSecondaryMenu<PageSection>(menu, {
        ariaLabel: t.pageSetup(),
        sections: [
          { id: "ratio", label: t.slidesRatio(), group: t.layout() },
          { id: "split", label: t.slidesSplit(), group: t.layout() },
          { id: "align", label: t.slidesAlign(), group: t.layout() },
          { id: "padding", label: t.padding(), group: t.surface() },
          { id: "chrome", label: t.slidesChrome(), group: t.surface() },
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
          if (id === "chrome") {
            fillSlideChromeSection(id, panel, manager, t, rebuild);
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
            return;
          }

          if (id === "ratio") {
            renderPanelWidgets(panel, [
              {
                kind: "choice",
                value: settings.ratio,
                options: getRatios(t),
                onChange: (value) => {
                  void manager.update({ ratio: value as SlidesRatio });
                  rebuild();
                },
              },
            ]);
            return;
          }

          if (id === "split") {
            renderPanelWidgets(panel, [
              {
                kind: "choice",
                value: settings.splitMode,
                options: getSplitModes(t),
                onChange: (value) => {
                  void manager.update({
                    splitMode: value as MarkdownSlideSplitMode,
                  });
                  rebuild();
                },
              },
            ]);
            return;
          }

          if (id === "align") {
            renderPanelWidgets(panel, [
              {
                kind: "choice",
                value: settings.contentAlign,
                options: getAligns(t),
                onChange: (value) => {
                  void manager.update({
                    contentAlign: value as SlidesContentAlign,
                  });
                  rebuild();
                },
              },
            ]);
            return;
          }

          renderPanelWidgets(panel, [
            {
              kind: "choice",
              value: settings.padding,
              options: getPaddings(t),
              onChange: (value) => {
                void manager.update({ padding: value as SlidesPadding });
                rebuild();
              },
            },
          ]);
        },
      });
    },
  });
};

type SlideChromeSection =
  | "header"
  | "headerStyle"
  | "footer"
  | "footerStyle"
  | "progress"
  | "chrome";

/** Header, footer, and presentation chrome toggles as separate secondary tabs. */
const fillSlideChromeSection = (
  id: SlideChromeSection,
  panel: HTMLElement,
  manager: SlidesSettingsManager,
  t: KuusiTranslator,
  rebuild: () => void,
): void => {
  const settings = manager.settings;

  const toggle = (
    label: string,
    title: string,
    value: boolean,
    update: (value: boolean) => void,
  ) => ({
    kind: "toggle" as const,
    label,
    title,
    value,
    onChange: (next: boolean) => {
      update(next);
      rebuild();
    },
  });

  const chromeSlider = (
    label: string,
    value: number,
    range: { min: number; max: number; step: number },
    unit: string,
    onChange: (value: number) => void,
  ) => ({
    kind: "slider" as const,
    label,
    value,
    min: range.min,
    max: range.max,
    step: range.step,
    formatValue: (v: number) => `${v}${unit}`,
    onChange,
  });

  if (id === "header") {
    const widgets: Parameters<typeof renderPanelWidgets>[1] = [
      toggle(t.header(), t.slidesHeaderTitle(), settings.showHeader, (v) => {
        void manager.update({ showHeader: v });
      }),
      {
        kind: "choice",
        sectionLabel: t.slidesHeaderSource(),
        value: settings.headerSource,
        options: [
          {
            value: "h1",
            label: t.slidesHeaderH1(),
            title: t.slidesHeaderH1Title(),
          },
          {
            value: "h2",
            label: t.slidesHeaderH2(),
            title: t.slidesHeaderH2Title(),
          },
          {
            value: "h3",
            label: t.slidesHeaderH3(),
            title: t.slidesHeaderH3Title(),
          },
          {
            value: "custom",
            label: t.slidesHeaderCustom(),
            title: t.slidesHeaderCustomTitle(),
          },
        ],
        onChange: (value) => {
          void manager.update({
            headerSource: value as SlidesHeaderSource,
          });
          rebuild();
        },
      },
    ];

    if (settings.headerSource === "custom") {
      widgets.push({
        kind: "text",
        label: t.slidesHeaderCustomText(),
        value: settings.headerCustomText,
        placeholder: t.slidesHeaderCustomPlaceholder(),
        title: t.slidesHeaderCustomTextTitle(),
        onChange: (headerCustomText) => {
          void manager.update({ headerCustomText });
        },
      });
    }

    renderPanelWidgets(panel, widgets);
    return;
  }

  if (id === "headerStyle") {
    renderPanelWidgets(panel, [
    ...buildFontWidgets(
      (settings.headerFont || settings.font) as MindMapFont,
      (headerFont) => {
        void manager.update({ headerFont });
        rebuild();
      },
      t,
    ),
    chromeSlider(
      t.slidesChromeFontSize(),
      settings.headerFontSize,
      SLIDES_CHROME_FONT_SIZE_RANGE,
      "px",
      (headerFontSize) => void manager.update({ headerFontSize }),
    ),
    chromeSlider(
      t.slidesChromeHeight(),
      settings.headerHeight,
      SLIDES_HEADER_HEIGHT_RANGE,
      "px",
      (headerHeight) => void manager.update({ headerHeight }),
    ),
    {
      kind: "color",
      sectionLabel: t.slidesChromeColor(),
      value: settings.headerColor,
      swatches: APPEARANCE_COLOR_SWATCHES,
      includeDefaultSwatch: true,
      onChange: (headerColor) => void manager.update({ headerColor }),
    },
    {
      kind: "color",
      sectionLabel: t.slidesChromeTextColor(),
      value: settings.headerTextColor,
      swatches: APPEARANCE_COLOR_SWATCHES,
      includeDefaultSwatch: true,
      onChange: (headerTextColor) => void manager.update({ headerTextColor }),
    },
    chromeSlider(
      t.slidesChromeOpacity(),
      settings.headerOpacity,
      SLIDES_CHROME_OPACITY_RANGE,
      "%",
      (headerOpacity) => void manager.update({ headerOpacity }),
    ),
    ]);
    return;
  }

  if (id === "footer") {
    renderPanelWidgets(panel, [
      toggle(
        t.slidesFooter(),
        t.slidesFooterTitle(),
        settings.showFooter,
        (v) => {
          void manager.update({ showFooter: v });
        },
      ),
      {
        kind: "text",
        label: t.slidesFooterText(),
        title: t.slidesFooterTextTitle(),
        placeholder: "{title} · {section}",
        maxLength: 200,
        value: settings.footerText,
        onChange: (footerText: string) => {
          void manager.update({ footerText });
        },
      },
      toggle(
        t.slidesPageNumber(),
        t.slidesPageNumberTitle(),
        settings.showPageNumber,
        (v) => {
          void manager.update({ showPageNumber: v });
        },
      ),
      {
        kind: "choice",
        sectionLabel: t.pageNumberFormat(),
        value: settings.pageNumberStyle,
        options: [
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
          {
            value: "dash",
            label: t.slidesPageNumberDash(),
            title: t.slidesPageNumberDashTitle(),
          },
        ],
        onChange: (value) => {
          void manager.update({
            pageNumberStyle: value as SlidesPageNumberStyle,
          });
          rebuild();
        },
      },
      {
        kind: "choice",
        sectionLabel: t.pageFurnitureAlign(),
        value: settings.pageNumberAlign,
        options: getTextAlignOptions(t),
        onChange: (value) => {
          void manager.update({
            pageNumberAlign: value as TextAlign,
          });
          rebuild();
        },
      },
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

  if (id === "footerStyle") {
    renderPanelWidgets(panel, [
      ...buildFontWidgets(
        (settings.footerFont || settings.font) as MindMapFont,
        (footerFont) => {
          void manager.update({ footerFont });
          rebuild();
        },
        t,
      ),
      {
        kind: "slider",
        label: t.slidesChromeFontSize(),
        value: settings.footerFontSize,
        min: SLIDES_CHROME_FONT_SIZE_RANGE.min,
        max: SLIDES_CHROME_FONT_SIZE_RANGE.max,
        step: SLIDES_CHROME_FONT_SIZE_RANGE.step,
        formatValue: (v: number) => `${v}px`,
        onChange: (footerFontSize: number) => {
          void manager.update({ footerFontSize });
        },
      },
      {
        kind: "slider",
        label: t.slidesFooterRule(),
        value: settings.footerRuleWidth,
        min: SLIDES_FOOTER_RULE_RANGE.min,
        max: SLIDES_FOOTER_RULE_RANGE.max,
        step: SLIDES_FOOTER_RULE_RANGE.step,
        formatValue: (v: number) => `${v}px`,
        onChange: (footerRuleWidth: number) => {
          void manager.update({ footerRuleWidth });
        },
      },
      {
        kind: "color",
        sectionLabel: t.slidesChromeTextColor(),
        value: settings.footerColor,
        swatches: APPEARANCE_COLOR_SWATCHES,
        includeDefaultSwatch: true,
        onChange: (footerColor) => void manager.update({ footerColor }),
      },
      {
        kind: "color",
        sectionLabel: t.slidesChromeBackground(),
        value: settings.footerBackground,
        swatches: APPEARANCE_COLOR_SWATCHES,
        includeDefaultSwatch: true,
        onChange: (footerBackground) => void manager.update({ footerBackground }),
      },
      {
        kind: "slider",
        label: t.slidesChromeOpacity(),
        value: settings.footerOpacity,
        min: SLIDES_CHROME_OPACITY_RANGE.min,
        max: SLIDES_CHROME_OPACITY_RANGE.max,
        step: SLIDES_CHROME_OPACITY_RANGE.step,
        formatValue: (v: number) => `${v}%`,
        onChange: (footerOpacity: number) => {
          void manager.update({ footerOpacity });
        },
      },
    ]);
    return;
  }

  if (id === "progress") {
    renderPanelWidgets(panel, [
      toggle(
        t.slidesProgress(),
        t.slidesProgressTitle(),
        settings.showProgress,
        (v) => {
          void manager.update({ showProgress: v });
        },
      ),
      {
        kind: "slider",
        label: t.slidesChromeHeight(),
        value: settings.progressHeight,
        min: SLIDES_PROGRESS_HEIGHT_RANGE.min,
        max: SLIDES_PROGRESS_HEIGHT_RANGE.max,
        step: SLIDES_PROGRESS_HEIGHT_RANGE.step,
        formatValue: (v: number) => `${v}px`,
        onChange: (progressHeight: number) => {
          void manager.update({ progressHeight });
        },
      },
      {
        kind: "color",
        sectionLabel: t.slidesChromeColor(),
        value: settings.progressColor,
        swatches: APPEARANCE_COLOR_SWATCHES,
        includeDefaultSwatch: true,
        onChange: (progressColor) => void manager.update({ progressColor }),
      },
      {
        kind: "slider",
        label: t.slidesChromeOpacity(),
        value: settings.progressOpacity,
        min: SLIDES_CHROME_OPACITY_RANGE.min,
        max: SLIDES_CHROME_OPACITY_RANGE.max,
        step: SLIDES_CHROME_OPACITY_RANGE.step,
        formatValue: (v: number) => `${v}%`,
        onChange: (progressOpacity: number) => {
          void manager.update({ progressOpacity });
        },
      },
      toggle(
        t.slidesShadow(),
        t.slidesProgressShadowTitle(),
        settings.progressShadow,
        (v) => {
          void manager.update({ progressShadow: v });
        },
      ),
    ]);
    return;
  }

  appendDropdownSection(panel, t.slidesPresentationControls());
  renderPanelWidgets(panel, [
    toggle(
      t.slidesNavButtons(),
      t.slidesNavButtonsTitle(),
      settings.showNavButtons,
      (v) => {
        void manager.update({ showNavButtons: v });
      },
    ),
  ]);

  appendDropdownSection(panel, t.slidesLook());
  renderPanelWidgets(panel, [
    toggle(
      t.slidesShadow(),
      t.slidesShadowTitle(),
      settings.stageShadow,
      (v) => {
        void manager.update({ stageShadow: v });
      },
    ),
  ]);
};

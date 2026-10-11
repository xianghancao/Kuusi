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
import { getTextAlignOptions } from "../typographyMenus";
import type { TextAlign } from "../typographySettings";

type PageSection =
  | "ratio"
  | "split"
  | "align"
  | "padding"
  | "header"
  | "footer"
  | "chrome"
  | "status";

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
          { id: "header", label: t.pageHeader(), group: t.headerFooter() },
          { id: "footer", label: t.pageFooter(), group: t.headerFooter() },
          { id: "chrome", label: t.slidesChrome(), group: t.headerFooter() },
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
          if (id === "header" || id === "footer" || id === "chrome") {
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

type SlideChromeSection = "header" | "footer" | "chrome";

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
    toggle(
      t.slidesProgress(),
      t.slidesProgressTitle(),
      settings.showProgress,
      (v) => {
        void manager.update({ showProgress: v });
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

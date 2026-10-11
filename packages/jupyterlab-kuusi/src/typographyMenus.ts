import {
  formatPtLength,
  PT_RANGES,
  ptToPxLength,
  pxToPtLength,
} from "./lengthUnits";
import {
  CODE_FONT_OPTIONS,
  CODE_THEMES,
  type CodeFont,
  type CodeTheme,
} from "./codeThemes";
import { type TableStyle } from "./tableSettings";
import {
  type ListStyle,
  type RuleWeight,
} from "./elementChromeSettings";
import { CAPSULE_MENU_SECONDARY, createCapsuleDropdown } from "./capsuleDropdown";
import { APPEARANCE_COLOR_SWATCHES } from "./colorPicker";
import {
  BODY_FONT_SIZE_INPUT_STEP,
  BODY_FONT_SIZE_PT_RANGE,
  BODY_FONT_SIZE_STEP,
  BODY_STEP_PT,
  FONT_OPTIONS,
  HEADING_FONT_SIZE_PT_RANGE,
  HEADING_STEP_PT,
  MIND_MAP_FONT_SIZES,
  PX_PER_PT,
  canonicalHeadingSize,
  fontSizeShortLabel,
  headingSizePx,
  nearestHeadingStep,
  ptToPx,
  pxToPt,
  clampBodyFontSizePx,
  createFontPreview,
  fontSizeLabel,
  fontSizeToSliderIndex,
  sliderIndexToFontSize,
  type BodyFontSizePx,
  type FontCategory,
  type HeadingFontSize,
  type MindMapFontSize,
  type MindMapFont,
} from "./fontToolbar";
import { appendMenuFooterAction } from "./menuFooter";
import {
  legendAlign,
  legendImageAlign,
  legendImageBorder,
  legendImageWidth,
  legendImageWrap,
  legendLinkStyle,
  legendListStyle,
  legendRuleWeight,
  legendTableStyle,
} from "./optionLegends";
import {
  applyTypographyToOtherViews,
  type KuusiViewId,
} from "./viewTypographySync";
import type { KuusiTranslator } from "./kuusiI18n";
import {
  renderPanelWidgets,
  type ChoiceOption,
  type PanelWidget,
  type SizeStep,
} from "./panelWidgets";
import { mountSecondaryMenu } from "./secondaryMenu";
import {
  resolveElementsSection,
  resolveTextMenuSection,
  type ElementsMenuSection,
  type TextMenuSection,
} from "./textMenuSections";
import {
  BODY_FONT_SIZE_RANGE,
  CODE_WIDTH_RANGE,
  HEADING_LEVELS,
  LETTER_SPACING_RANGE,
  PARAGRAPH_INDENT_RANGE,
  PARAGRAPH_SPACING_RANGE,
  TABLE_BORDER_RANGE,
  TABLE_TRANSPARENCY_RANGE,
  headingId,
  updateHeadingStyle,
  type CodeStyle,
  type HeadingId,
  type ImageAlign,
  type ImageBorderStyle,
  type ImageWidth,
  type ImageWrap,
  type LinkStyle,
  type NumberRange,
  type ParagraphAlign,
  type TextAlign,
  type TypographyValues,
} from "./typographySettings";

/** Mind-map-only: edit-mode font lives beside display Text. */
export type TypographyEditMode = {
  getFont: () => MindMapFont;
  getFontSize: () => BodyFontSizePx;
  updateFont: (font: MindMapFont) => void;
  updateFontSize: (size: BodyFontSizePx) => void;
  getUnify: () => boolean;
  setUnify: (value: boolean) => void;
  getMatchNotebook: () => boolean;
  setMatchNotebook: (value: boolean) => void;
};

/** Bridges a view's settings manager to the shared typography menus. */
export type TypographyModel = {
  /** View key: class names and remembered tabs. */
  scope: "article" | "slides" | "mindmap";
  /** Which view owns this model (Book shares the article scope). */
  view: KuusiViewId;
  get: () => TypographyValues;
  update: (partial: Partial<TypographyValues>) => void;
  /** Show `partial` without saving it; null drops the preview (menu hover). */
  preview?: (partial: Partial<TypographyValues> | null) => void;
  /** Present on Article: repeat table header rows on each page of a paged table. */
  tableRepeatHeader?: { get: () => boolean; set: (value: boolean) => void };
  lineHeightRange: NumberRange;
  /** Present on Mind Map: Text menu adds Edit / Link tabs. */
  editMode?: TypographyEditMode;
};

type ParagraphSection = "spacing" | "indent" | "align";
type CodeSection =
  | "theme"
  | "family"
  | "size"
  | "style"
  | "frame"
  | "corner"
  | "stroke"
  | "width";
type ImageSection = "layout" | "size" | "border";
type TableSection = "style" | "border" | "headers";

/** Give every option a small legend drawn from its value. */
const withLegend = (
  options: ChoiceOption[],
  legend: (value: string) => HTMLElement,
): ChoiceOption[] =>
  options.map((option) => ({ ...option, preview: () => legend(option.value) }));

const lastSections = new Map<string, string>();

const rememberedSection = <Id extends string>(
  model: TypographyModel,
  menu: string,
  fallback: Id,
): { get: () => Id; set: (id: Id) => void } => {
  const key = `${model.scope}:${menu}`;
  return {
    get: () => (lastSections.get(key) as Id | undefined) ?? fallback,
    set: (id) => {
      lastSections.set(key, id);
    },
  };
};

/**
 * Hover preview for one menu control: `build(value)` gives the unsaved
 * settings to show; null drops the overlay.
 */
const previewWith =
  <V>(
    model: TypographyModel,
    build: (value: V) => Partial<TypographyValues>,
  ): ((value: V | null) => void) | undefined =>
  model.preview
    ? (value) => model.preview?.(value === null ? null : build(value))
    : undefined;

const headingSizeSteps: SizeStep[] = MIND_MAP_FONT_SIZES.map((name) => ({
  label: fontSizeShortLabel(name),
  value: HEADING_STEP_PT[name],
}));

const bodySizeSteps: SizeStep[] = BODY_STEP_PT.map((pt, index) => ({
  label: fontSizeShortLabel(MIND_MAP_FONT_SIZES[index]),
  value: pt,
}));

const nearestHeadingStepOf = (size: HeadingFontSize): MindMapFontSize =>
  typeof size === "number" ? nearestHeadingStep(size) : size;

const FONT_SECTION_ORDER: FontCategory[] = ["default", "sans", "serif", "cjk"];

export const buildFontWidgets = (
  font: MindMapFont,
  onFontChange: (font: MindMapFont) => void,
  t: KuusiTranslator,
  onPreview?: (font: MindMapFont | null) => void,
): PanelWidget[] => {
  const sectionLabels: Record<FontCategory, string> = {
    default: t.fontSectionDefault(),
    sans: t.fontSectionSans(),
    serif: t.fontSectionSerif(),
    cjk: t.fontSectionChinese(),
  };

  return [
    {
      kind: "select",
      label: t.font(),
      value: font,
      groups: FONT_SECTION_ORDER.map((category) => ({
        label: sectionLabels[category],
        options: FONT_OPTIONS.filter(
          (option) => option.category === category,
        ).map((option) => ({
          value: option.value,
          label: option.label,
          title: option.title,
          preview: () => createFontPreview(option.previewFamily),
        })),
      })),
      onChange: (value: string) => {
        onFontChange(value as MindMapFont);
      },
      onPreview: onPreview
        ? (value: string | null) => onPreview(value as MindMapFont | null)
        : undefined,
    },
  ];
};

const getTextAlignOptionsRaw = (t: KuusiTranslator): ChoiceOption[] => [
  { value: "left", label: t.alignLeft(), title: t.alignLeftTitle() },
  { value: "center", label: t.alignCenter(), title: t.alignCenterTitle() },
  { value: "right", label: t.alignRight(), title: t.alignRightTitle() },
];

export const getTextAlignOptions = (t: KuusiTranslator): ChoiceOption[] =>
  withLegend(getTextAlignOptionsRaw(t), legendAlign);

const getParagraphAlignOptionsRaw = (t: KuusiTranslator): ChoiceOption[] => [
  { value: "left", label: t.alignLeft(), title: t.paragraphAlignLeftTitle() },
  {
    value: "justify",
    label: t.alignJustify(),
    title: t.paragraphAlignJustifyTitle(),
  },
];

const getParagraphAlignOptions = (t: KuusiTranslator): ChoiceOption[] =>
  withLegend(getParagraphAlignOptionsRaw(t), legendAlign);

const getLinkStyleOptionsRaw = (t: KuusiTranslator): ChoiceOption[] => [
  {
    value: "default",
    label: t.linkStyleDefault(),
    title: t.linkStyleDefaultTitle(),
  },
  {
    value: "underline",
    label: t.linkStyleUnderline(),
    title: t.linkStyleUnderlineTitle(),
  },
  {
    value: "accent",
    label: t.linkStyleAccent(),
    title: t.linkStyleAccentTitle(),
  },
];

const getLinkStyleOptions = (t: KuusiTranslator): ChoiceOption[] =>
  withLegend(getLinkStyleOptionsRaw(t), legendLinkStyle);

const getCodeStyleOptions = (t: KuusiTranslator): ChoiceOption[] => [
  { value: "plain", label: t.codeStylePlain(), title: t.codeStylePlainTitle() },
  { value: "muted", label: t.codeStyleMuted(), title: t.codeStyleMutedTitle() },
  {
    value: "contrast",
    label: t.codeStyleContrast(),
    title: t.codeStyleContrastTitle(),
  },
];

const CODE_THEME_LABELS: Record<
  CodeTheme,
  { label: (t: KuusiTranslator) => string; title: (t: KuusiTranslator) => string }
> = {
  notebook: {
    label: (t) => t.codeThemeNotebook(),
    title: (t) => t.codeThemeNotebookTitle(),
  },
  python: {
    label: (t) => t.codeThemePython(),
    title: (t) => t.codeThemePythonTitle(),
  },
  javascript: {
    label: (t) => t.codeThemeJavascript(),
    title: (t) => t.codeThemeJavascriptTitle(),
  },
  r: { label: (t) => t.codeThemeR(), title: (t) => t.codeThemeRTitle() },
  julia: {
    label: (t) => t.codeThemeJulia(),
    title: (t) => t.codeThemeJuliaTitle(),
  },
  sql: { label: (t) => t.codeThemeSql(), title: (t) => t.codeThemeSqlTitle() },
  rust: {
    label: (t) => t.codeThemeRust(),
    title: (t) => t.codeThemeRustTitle(),
  },
  matlab: {
    label: (t) => t.codeThemeMatlab(),
    title: (t) => t.codeThemeMatlabTitle(),
  },
  shell: {
    label: (t) => t.codeThemeShell(),
    title: (t) => t.codeThemeShellTitle(),
  },
};

const getCodeThemeOptions = (t: KuusiTranslator): ChoiceOption[] =>
  CODE_THEMES.map((value) => ({
    value,
    label: CODE_THEME_LABELS[value].label(t),
    title: CODE_THEME_LABELS[value].title(t),
  }));

const buildCodeFontWidgets = (
  selected: CodeFont,
  onSelect: (font: CodeFont) => void,
  t: KuusiTranslator,
): PanelWidget[] => [
  {
    kind: "choice",
    sectionLabel: t.font(),
    value: selected,
    options: CODE_FONT_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      title: option.title,
      preview: () => createFontPreview(option.previewFamily),
    })),
    onChange: (value) => {
      onSelect(value as CodeFont);
    },
  },
];

const formatPt = (value: number): string =>
  Number.isInteger(value) ? `${value} pt` : `${value.toFixed(2)} pt`;

const dropdownClasses = (
  model: TypographyModel,
  menu: string,
): { toolbarClass: string; dropdownClass: string; triggerClass: string } => {
  const scope =
    model.scope === "article"
      ? "Article"
      : model.scope === "slides"
        ? "Slides"
        : "MindMap";
  const name = menu.charAt(0).toUpperCase() + menu.slice(1);
  return {
    toolbarClass: `jp-Kuusi${scope}-${menu}-toolbar`,
    dropdownClass: `jp-Kuusi${scope}${name}Dropdown`,
    triggerClass: `jp-Kuusi${scope}${name}Dropdown-trigger`,
  };
};

const slider = (
  label: string,
  value: number,
  range: NumberRange,
  formatValue: (value: number) => string,
  onChange: (value: number) => void,
): PanelWidget => ({
  kind: "slider",
  label,
  value,
  min: range.min,
  max: range.max,
  step: range.step,
  formatValue,
  onChange,
});

/**
 * Text: Body (font · size · color · tracking · leading) and H1–H6 (font · size
 * · color · alignment) in one menu. The node-editing font lives in Elements.
 */
export const createTextToolbar = (
  root: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
): HTMLElement => {
  const section = rememberedSection<string>(model, "text", "body");

  return createCapsuleDropdown(root, {
    ...dropdownClasses(model, "text"),
    ariaLabel: t.textStyle(),
    triggerLabel: t.text(),
    menuClassName: `${CAPSULE_MENU_SECONDARY} jp-KuusiFontDropdown-menu`,
    footer: (menu) => {
      appendMenuFooterAction(menu, {
        label: t.applyToAllViews(),
        title: t.applyToAllViewsTitle(),
        onClick: () => {
          applyTypographyToOtherViews(model.view);
        },
      });
    },
    fillMenu: (menu, rebuild) => {
      const values = model.get();
      const updateHeading = (
        id: HeadingId,
        partial: Partial<TypographyValues["headers"][HeadingId]>,
      ): void => {
        model.update({
          headers: updateHeadingStyle(model.get().headers, id, partial),
        });
      };

      const previewHeading = (id: HeadingId, key: "font" | "color" | "align") =>
        previewWith(model, (value: string) => ({
          headers: updateHeadingStyle(model.get().headers, id, {
            [key]: value,
          } as Partial<TypographyValues["headers"][HeadingId]>),
        }));

      mountSecondaryMenu<TextMenuSection>(menu, {
        ariaLabel: t.textStyle(),
        sections: [
          { id: "body", label: t.body() },
          ...HEADING_LEVELS.map((level) => ({
            id: headingId(level) as TextMenuSection,
            label: `H${level}`,
          })),
        ],
        getActive: () => resolveTextMenuSection(section.get()),
        setActive: section.set,
        fillSection: (id, panel) => {
          if (id === "body") {
            renderPanelWidgets(panel, [
              ...buildFontWidgets(
                values.font,
                (font) => {
                  model.update({ font });
                  rebuild();
                },
                t,
                previewWith(model, (font: MindMapFont) => ({ font })),
              ),
              {
                kind: "size",
                label: t.fontSizeSection(),
                value: pxToPt(clampBodyFontSizePx(values.fontSize)),
                steps: bodySizeSteps,
                min: BODY_FONT_SIZE_PT_RANGE.min,
                max: BODY_FONT_SIZE_PT_RANGE.max,
                customLabel: t.sizeCustom(),
                onChange: (size) => {
                  model.update({ fontSize: ptToPx(size) });
                },
              },
              {
                kind: "color",
                sectionLabel: t.color(),
                value: values.color,
                swatches: APPEARANCE_COLOR_SWATCHES,
                includeDefaultSwatch: true,
                // No rebuild: keeps the native color picker open.
                onChange: (color) => {
                  model.update({ color });
                },
                onPreview: previewWith(model, (color: string) => ({ color })),
              },
              {
                kind: "color",
                sectionLabel: t.boldColor(),
                value: values.strongColor,
                swatches: APPEARANCE_COLOR_SWATCHES,
                includeDefaultSwatch: true,
                onChange: (strongColor) => {
                  model.update({ strongColor });
                },
                onPreview: previewWith(model, (strongColor: string) => ({
                  strongColor,
                })),
              },
              slider(
                t.tracking(),
                values.letterSpacing,
                LETTER_SPACING_RANGE,
                formatPt,
                (letterSpacing) => model.update({ letterSpacing }),
              ),
              slider(
                t.leading(),
                values.lineHeight,
                model.lineHeightRange,
                (value) => `${value.toFixed(2)}×`,
                (lineHeight) => model.update({ lineHeight }),
              ),
            ]);
            return;
          }

          const style = values.headers[id as HeadingId];
          renderPanelWidgets(panel, [
            ...buildFontWidgets(
              style.font,
              (font) => {
                updateHeading(id as HeadingId, { font });
                rebuild();
              },
              t,
              previewHeading(id as HeadingId, "font"),
            ),
            model.scope === "slides"
              ? {
                  kind: "slider",
                  label: t.fontSizeSection(),
                  value: fontSizeToSliderIndex(
                    nearestHeadingStepOf(style.fontSize),
                  ),
                  min: 0,
                  max: MIND_MAP_FONT_SIZES.length - 1,
                  formatValue: (index: number) =>
                    fontSizeLabel(sliderIndexToFontSize(index)),
                  onChange: (index: number) => {
                    updateHeading(id as HeadingId, {
                      fontSize: sliderIndexToFontSize(index),
                    });
                  },
                }
              : {
                  kind: "size",
                  label: t.fontSizeSection(),
                  value: pxToPt(headingSizePx(style.fontSize)),
                  steps: headingSizeSteps,
                  min: HEADING_FONT_SIZE_PT_RANGE.min,
                  max: HEADING_FONT_SIZE_PT_RANGE.max,
                  customLabel: t.sizeCustom(),
                  onChange: (size: number) => {
                    updateHeading(id as HeadingId, {
                      fontSize: canonicalHeadingSize(size * PX_PER_PT),
                    });
                  },
                },
            {
              kind: "color",
              sectionLabel: t.color(),
              value: style.color,
              swatches: APPEARANCE_COLOR_SWATCHES,
              includeDefaultSwatch: true,
              onChange: (color) => {
                updateHeading(id as HeadingId, { color });
              },
              onPreview: previewHeading(id as HeadingId, "color"),
            },
            {
              kind: "choice",
              sectionLabel: t.alignment(),
              value: style.align,
              options: getTextAlignOptions(t),
              onChange: (value) => {
                updateHeading(id as HeadingId, { align: value as TextAlign });
                rebuild();
              },
              onPreview: previewHeading(id as HeadingId, "align"),
            },
          ]);
        },
      });
    },
  });
};


/** Paragraph: spacing · indent · alignment. */
export const createParagraphToolbar = (
  root: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
): HTMLElement => {
  const section = rememberedSection<ParagraphSection>(
    model,
    "paragraph",
    "spacing",
  );

  return createCapsuleDropdown(root, {
    ...dropdownClasses(model, "paragraph"),
    ariaLabel: t.paragraphStyle(),
    triggerLabel: t.paragraph(),
    menuClassName: CAPSULE_MENU_SECONDARY,
    fillMenu: (menu, rebuild) => {
      const values = model.get();
      mountSecondaryMenu<ParagraphSection>(menu, {
        ariaLabel: t.paragraphStyle(),
        sections: [
          { id: "spacing", label: t.paragraphSpacing() },
          { id: "indent", label: t.paragraphIndent() },
          { id: "align", label: t.alignment() },
        ],
        getActive: () => {
          const raw = section.get();
          return raw === "indent" || raw === "align" ? raw : "spacing";
        },
        setActive: section.set,
        fillSection: (id, panel) => {
          if (id === "spacing") {
            renderPanelWidgets(panel, [
              slider(
                t.paragraphSpacing(),
                values.paragraphSpacing,
                PARAGRAPH_SPACING_RANGE,
                formatPt,
                (paragraphSpacing) => model.update({ paragraphSpacing }),
              ),
            ]);
            return;
          }

          if (id === "indent") {
            renderPanelWidgets(panel, [
              slider(
                t.paragraphIndent(),
                values.paragraphIndent,
                PARAGRAPH_INDENT_RANGE,
                formatPt,
                (paragraphIndent) => model.update({ paragraphIndent }),
              ),
            ]);
            return;
          }

          renderPanelWidgets(panel, [
            {
              kind: "choice",
              value: values.paragraphAlign,
              options: getParagraphAlignOptions(t),
              onChange: (value) => {
                model.update({ paragraphAlign: value as ParagraphAlign });
                rebuild();
              },
              onPreview: previewWith(model, (paragraphAlign: string) => ({
                paragraphAlign: paragraphAlign as ParagraphAlign,
              })),
            },
          ]);
        },
      });
    },
  });
};

/** Code: theme · font · size · style · frame · corner · stroke · width. */
const fillCodeSection = (
  id: CodeSection,
  panel: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
  rebuild: () => void,
  options?: { sectionHeading?: boolean },
): void => {
  const values = model.get();
  const headed = Boolean(options?.sectionHeading);

  if (id === "theme") {
    renderPanelWidgets(panel, [
      {
        kind: "choice",
        sectionLabel: headed ? t.codeTheme() : undefined,
        value: values.codeTheme,
        options: getCodeThemeOptions(t),
        onChange: (value) => {
          model.update({ codeTheme: value as CodeTheme });
          rebuild();
        },
      },
    ]);
    return;
  }

  if (id === "family") {
    renderPanelWidgets(
      panel,
      buildCodeFontWidgets(
        values.codeFont,
        (codeFont) => {
          model.update({ codeFont });
          rebuild();
        },
        t,
      ),
    );
    return;
  }

  if (id === "size") {
    renderPanelWidgets(panel, [
      {
        kind: "slider",
        label: headed ? t.fontSizeSection() : t.fontSizeSection(),
        value: fontSizeToSliderIndex(values.codeFontSize),
        min: 0,
        max: MIND_MAP_FONT_SIZES.length - 1,
        formatValue: (index) =>
          fontSizeLabel(sliderIndexToFontSize(index)),
        onChange: (index) => {
          model.update({ codeFontSize: sliderIndexToFontSize(index) });
        },
      },
    ]);
    return;
  }

  if (id === "style") {
    renderPanelWidgets(panel, [
      {
        kind: "choice",
        sectionLabel: headed ? t.style() : undefined,
        value: values.codeStyle,
        options: getCodeStyleOptions(t),
        onChange: (value) => {
          model.update({ codeStyle: value as CodeStyle });
          rebuild();
        },
      },
    ]);
    return;
  }

  if (id === "frame") {
    renderPanelWidgets(panel, [
      {
        kind: "toggle",
        label: t.slidesCodeFrame(),
        title: t.slidesCodeFrameTitle(),
        value: values.codeFrame,
        onChange: (codeFrame) => {
          model.update({ codeFrame });
          rebuild();
        },
      },
      {
        kind: "color",
        sectionLabel: t.slidesCodeFrameColor(),
        value: values.codeFrameColor,
        swatches: APPEARANCE_COLOR_SWATCHES,
        includeDefaultSwatch: true,
        onChange: (codeFrameColor) => {
          model.update({ codeFrameColor });
        },
      },
    ]);
    return;
  }

  if (id === "corner") {
    renderPanelWidgets(panel, [
      slider(
        t.corner(),
        pxToPtLength(values.codeFrameRadius),
        PT_RANGES.codeRadius,
        formatPtLength,
        (pt) => model.update({ codeFrameRadius: ptToPxLength(pt) }),
      ),
    ]);
    return;
  }

  if (id === "stroke") {
    renderPanelWidgets(panel, [
      slider(
        t.border(),
        pxToPtLength(values.codeFrameBorder),
        PT_RANGES.codeBorder,
        formatPtLength,
        (pt) => model.update({ codeFrameBorder: ptToPxLength(pt) }),
      ),
    ]);
    return;
  }

  renderPanelWidgets(panel, [
    slider(
      t.width(),
      values.codeFrameWidth,
      CODE_WIDTH_RANGE,
      (value) => `${Math.round(value)}%`,
      (value) => model.update({ codeFrameWidth: Math.round(value) }),
    ),
  ]);
};

const CODE_SECTIONS: CodeSection[] = [
  "theme",
  "family",
  "size",
  "style",
  "frame",
  "corner",
  "stroke",
  "width",
];

/** All code controls in one panel (Elements → Code). */
const fillCodePanel = (
  panel: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
  rebuild: () => void,
): void => {
  CODE_SECTIONS.forEach((id) => {
    fillCodeSection(id, panel, model, t, rebuild, { sectionHeading: true });
  });
};

export const createCodeToolbar = (
  root: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
): HTMLElement => {
  const section = rememberedSection<CodeSection>(model, "code", "theme");

  return createCapsuleDropdown(root, {
    ...dropdownClasses(model, "code"),
    ariaLabel: t.codeStyleMenu(),
    triggerLabel: t.articleCode(),
    menuClassName: CAPSULE_MENU_SECONDARY,
    fillMenu: (menu, rebuild) => {
      mountSecondaryMenu<CodeSection>(menu, {
        ariaLabel: t.codeStyleMenu(),
        sections: [
          { id: "theme", label: t.codeTheme() },
          { id: "family", label: t.font() },
          { id: "size", label: t.fontSizeSection() },
          { id: "style", label: t.style() },
          { id: "frame", label: t.slidesCodeFrame() },
          { id: "corner", label: t.corner() },
          { id: "stroke", label: t.border() },
          { id: "width", label: t.width() },
        ],
        getActive: section.get,
        setActive: section.set,
        fillSection: (id, panel) =>
          fillCodeSection(id, panel, model, t, rebuild),
      });
    },
  });
};

const getImageWidthOptionsRaw = (t: KuusiTranslator): ChoiceOption[] => [
  {
    value: "natural",
    label: t.imageWidthNatural(),
    title: t.imageWidthNaturalTitle(),
  },
  {
    value: "wide",
    label: t.imageWidthWide(),
    title: t.imageWidthWideTitle(),
  },
  {
    value: "full",
    label: t.imageWidthFull(),
    title: t.imageWidthFullTitle(),
  },
];

const getImageWidthOptions = (t: KuusiTranslator): ChoiceOption[] =>
  withLegend(getImageWidthOptionsRaw(t), legendImageWidth);

const getImageAlignOptionsRaw = (t: KuusiTranslator): ChoiceOption[] => [
  {
    value: "left",
    label: t.alignLeft(),
    title: t.imageAlignLeftTitle(),
  },
  {
    value: "center",
    label: t.alignCenter(),
    title: t.imageAlignCenterTitle(),
  },
  {
    value: "right",
    label: t.alignRight(),
    title: t.imageAlignRightTitle(),
  },
];

const getImageAlignOptions = (t: KuusiTranslator): ChoiceOption[] =>
  withLegend(getImageAlignOptionsRaw(t), legendImageAlign);

const getImageWrapOptionsRaw = (t: KuusiTranslator): ChoiceOption[] => [
  {
    value: "none",
    label: t.imageWrapNone(),
    title: t.imageWrapNoneTitle(),
  },
  {
    value: "left",
    label: t.imageWrapLeft(),
    title: t.imageWrapLeftTitle(),
  },
  {
    value: "right",
    label: t.imageWrapRight(),
    title: t.imageWrapRightTitle(),
  },
];

const getImageWrapOptions = (t: KuusiTranslator): ChoiceOption[] =>
  withLegend(getImageWrapOptionsRaw(t), legendImageWrap);

const getImageBorderStyleOptionsRaw = (t: KuusiTranslator): ChoiceOption[] => [
  {
    value: "none",
    label: t.imageBorderNone(),
    title: t.imageBorderNoneTitle(),
  },
  {
    value: "solid",
    label: t.imageBorderSolid(),
    title: t.imageBorderSolidTitle(),
  },
  {
    value: "dashed",
    label: t.imageBorderDashed(),
    title: t.imageBorderDashedTitle(),
  },
  {
    value: "dotted",
    label: t.imageBorderDotted(),
    title: t.imageBorderDottedTitle(),
  },
  {
    value: "double",
    label: t.imageBorderDouble(),
    title: t.imageBorderDoubleTitle(),
  },
];

const getImageBorderStyleOptions = (t: KuusiTranslator): ChoiceOption[] =>
  withLegend(getImageBorderStyleOptionsRaw(t), legendImageBorder);

const fillImageSection = (
  id: ImageSection,
  panel: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
  rebuild: () => void,
  options?: { sectionHeading?: boolean },
): void => {
  const values = model.get();
  const headed = Boolean(options?.sectionHeading);

  if (id === "layout") {
    renderPanelWidgets(panel, [
      {
        kind: "choice",
        sectionLabel: t.alignment(),
        value: values.imageAlign,
        options: getImageAlignOptions(t),
        onChange: (value) => {
          model.update({ imageAlign: value as ImageAlign });
          rebuild();
        },
      },
      {
        kind: "choice",
        sectionLabel: t.imageWrap(),
        value: values.imageWrap,
        options: getImageWrapOptions(t),
        onChange: (value) => {
          model.update({ imageWrap: value as ImageWrap });
          rebuild();
        },
      },
    ]);
    return;
  }

  if (id === "size") {
    renderPanelWidgets(panel, [
      {
        kind: "choice",
        sectionLabel: headed ? t.imageWidth() : undefined,
        value: values.imageWidth,
        options: getImageWidthOptions(t),
        onChange: (value) => {
          model.update({ imageWidth: value as ImageWidth });
          rebuild();
        },
      },
    ]);
    return;
  }

  renderPanelWidgets(panel, [
    {
      kind: "choice",
      sectionLabel: headed ? t.imageBorder() : t.style(),
      value: values.imageBorderStyle,
      options: getImageBorderStyleOptions(t),
      onChange: (value) => {
        model.update({
          imageBorderStyle: value as ImageBorderStyle,
        });
        rebuild();
      },
    },
    {
      kind: "color",
      sectionLabel: t.imageBorderColor(),
      value: values.imageBorderColor,
      swatches: APPEARANCE_COLOR_SWATCHES,
      includeDefaultSwatch: true,
      onChange: (imageBorderColor) => {
        model.update({ imageBorderColor });
      },
    },
    slider(
      t.border(),
      pxToPtLength(values.imageBorderWidth),
      PT_RANGES.imageBorder,
      formatPtLength,
      (pt) => model.update({ imageBorderWidth: ptToPxLength(pt) }),
    ),
    slider(
      t.corner(),
      pxToPtLength(values.imageRadius),
      PT_RANGES.imageRadius,
      formatPtLength,
      (pt) => model.update({ imageRadius: ptToPxLength(pt) }),
    ),
  ]);
};

const IMAGE_SECTIONS: ImageSection[] = ["layout", "size", "border"];

/** All image controls in one panel (Elements → Image). */
const fillImagePanel = (
  panel: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
  rebuild: () => void,
): void => {
  IMAGE_SECTIONS.forEach((id) => {
    fillImageSection(id, panel, model, t, rebuild, { sectionHeading: true });
  });
};

/** Image: layout · size · border (style, color, weight, corner). */
export const createImageToolbar = (
  root: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
): HTMLElement => {
  const section = rememberedSection<ImageSection>(model, "image", "layout");

  return createCapsuleDropdown(root, {
    ...dropdownClasses(model, "image"),
    ariaLabel: t.articleImage(),
    triggerLabel: t.articleImage(),
    menuClassName: CAPSULE_MENU_SECONDARY,
    fillMenu: (menu, rebuild) => {
      mountSecondaryMenu<ImageSection>(menu, {
        ariaLabel: t.articleImage(),
        sections: [
          { id: "layout", label: t.imageLayout() },
          { id: "size", label: t.imageWidth() },
          { id: "border", label: t.imageBorder() },
        ],
        getActive: section.get,
        setActive: section.set,
        fillSection: (id, panel) =>
          fillImageSection(id, panel, model, t, rebuild),
      });
    },
  });
};

const getTableStyleOptionsRaw = (t: KuusiTranslator): ChoiceOption[] => [
  {
    value: "plain",
    label: t.tableStylePlain(),
    title: t.tableStylePlainTitle(),
  },
  {
    value: "grid",
    label: t.tableStyleGrid(),
    title: t.tableStyleGridTitle(),
  },
  {
    value: "lines",
    label: t.tableStyleLines(),
    title: t.tableStyleLinesTitle(),
  },
  {
    value: "banded",
    label: t.tableStyleBanded(),
    title: t.tableStyleBandedTitle(),
  },
  {
    value: "booktabs",
    label: t.tableStyleBooktabs(),
    title: t.tableStyleBooktabsTitle(),
  },
  {
    value: "ruled",
    label: t.tableStyleRuled(),
    title: t.tableStyleRuledTitle(),
  },
];

const getTableStyleOptions = (t: KuusiTranslator): ChoiceOption[] =>
  withLegend(getTableStyleOptionsRaw(t), legendTableStyle);

const fillTableSection = (
  id: TableSection,
  panel: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
  rebuild: () => void,
  options?: { sectionHeading?: boolean },
): void => {
  const values = model.get();
  const headed = Boolean(options?.sectionHeading);

  if (id === "style") {
    renderPanelWidgets(panel, [
      {
        kind: "choice",
        sectionLabel: headed ? t.tableStyle() : undefined,
        value: values.tableStyle,
        options: getTableStyleOptions(t),
        onChange: (value) => {
          model.update({ tableStyle: value as TableStyle });
          rebuild();
        },
      },
      slider(
        t.tableTransparency(),
        values.tableTransparency,
        TABLE_TRANSPARENCY_RANGE,
        (value) => `${value}%`,
        (tableTransparency) => model.update({ tableTransparency }),
      ),
    ]);
    return;
  }

  if (id === "border") {
    renderPanelWidgets(panel, [
      slider(
        t.tableBorderWidth(),
        values.tableBorderWidth,
        TABLE_BORDER_RANGE,
        formatPt,
        (tableBorderWidth) => model.update({ tableBorderWidth }),
      ),
    ]);
    return;
  }

  renderPanelWidgets(panel, [
    {
      kind: "toggle",
      label: t.tableHeaderRowBold(),
      title: t.tableHeaderRowBoldTitle(),
      value: values.tableHeaderRowBold,
      onChange: (tableHeaderRowBold) => {
        model.update({ tableHeaderRowBold });
        rebuild();
      },
    },
    {
      kind: "toggle",
      label: t.tableHeaderColumnBold(),
      title: t.tableHeaderColumnBoldTitle(),
      value: values.tableHeaderColumnBold,
      onChange: (tableHeaderColumnBold) => {
        model.update({ tableHeaderColumnBold });
        rebuild();
      },
    },
    ...(model.tableRepeatHeader
      ? [
          {
            kind: "toggle" as const,
            label: t.tableRepeatHeader(),
            title: t.tableRepeatHeaderTitle(),
            value: model.tableRepeatHeader.get(),
            onChange: (value: boolean) => {
              model.tableRepeatHeader?.set(value);
            },
          },
        ]
      : []),
  ]);
};

const TABLE_SECTIONS: TableSection[] = ["style", "border", "headers"];

const fillTablePanel = (
  panel: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
  rebuild: () => void,
): void => {
  TABLE_SECTIONS.forEach((id) => {
    fillTableSection(id, panel, model, t, rebuild, { sectionHeading: true });
  });
};

type ElementsSection = ElementsMenuSection;

const getListStyleOptionsRaw = (t: KuusiTranslator): ChoiceOption[] => [
  {
    value: "compact",
    label: t.listStyleCompact(),
    title: t.listStyleCompactTitle(),
  },
  {
    value: "normal",
    label: t.listStyleNormal(),
    title: t.listStyleNormalTitle(),
  },
  {
    value: "relaxed",
    label: t.listStyleRelaxed(),
    title: t.listStyleRelaxedTitle(),
  },
];

const getListStyleOptions = (t: KuusiTranslator): ChoiceOption[] =>
  withLegend(getListStyleOptionsRaw(t), legendListStyle);

const getRuleWeightOptionsRaw = (t: KuusiTranslator): ChoiceOption[] => [
  {
    value: "light",
    label: t.ruleWeightLight(),
    title: t.ruleWeightLightTitle(),
  },
  {
    value: "normal",
    label: t.ruleWeightNormal(),
    title: t.ruleWeightNormalTitle(),
  },
  {
    value: "strong",
    label: t.ruleWeightStrong(),
    title: t.ruleWeightStrongTitle(),
  },
];

const getRuleWeightOptions = (
  t: KuusiTranslator,
  kind: "quote" | "rule",
): ChoiceOption[] =>
  withLegend(getRuleWeightOptionsRaw(t), (value) =>
    legendRuleWeight(kind, value),
  );

const fillListPanel = (
  panel: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
  rebuild: () => void,
): void => {
  const values = model.get();
  renderPanelWidgets(panel, [
    {
      kind: "choice",
      sectionLabel: t.listSpacing(),
      value: values.listStyle,
      options: getListStyleOptions(t),
      onChange: (value) => {
        model.update({ listStyle: value as ListStyle });
        rebuild();
      },
    },
  ]);
};

const fillQuotePanel = (
  panel: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
  rebuild: () => void,
): void => {
  const values = model.get();
  renderPanelWidgets(panel, [
    {
      kind: "choice",
      sectionLabel: t.blockquoteWeight(),
      value: values.blockquoteWeight,
      options: getRuleWeightOptions(t, "quote"),
      onChange: (value) => {
        model.update({ blockquoteWeight: value as RuleWeight });
        rebuild();
      },
    },
    {
      kind: "choice",
      sectionLabel: t.hrWeight(),
      value: values.hrWeight,
      options: getRuleWeightOptions(t, "rule"),
      onChange: (value) => {
        model.update({ hrWeight: value as RuleWeight });
        rebuild();
      },
    },
  ]);
};

const fillLinksPanel = (
  panel: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
  rebuild: () => void,
): void => {
  const values = model.get();
  renderPanelWidgets(panel, [
    {
      kind: "choice",
      value: values.linkStyle,
      options: getLinkStyleOptions(t),
      onChange: (value) => {
        model.update({ linkStyle: value as LinkStyle });
        rebuild();
      },
    },
  ]);
};

/**
 * Node-editing font (Mind Map only): the font used while a node's source is
 * open, and whether it follows the display font / the notebook font.
 */
const fillEditTextPanel = (
  panel: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
  rebuild: () => void,
): void => {
  const edit = model.editMode;

  if (!edit) {
    return;
  }

  const hint = document.createElement("div");
  hint.className = "jp-KuusiAppearanceDropdown-hint";
  hint.textContent = t.editTextHint();
  panel.appendChild(hint);

  const body = document.createElement("div");
  panel.appendChild(body);

  renderPanelWidgets(body, [
    {
      kind: "slider",
      label: t.fontSizeSection(),
      value: pxToPt(clampBodyFontSizePx(edit.getFontSize())),
      min: BODY_FONT_SIZE_RANGE.min,
      max: BODY_FONT_SIZE_RANGE.max,
      step: BODY_FONT_SIZE_STEP,
      editable: true,
      inputStep: BODY_FONT_SIZE_INPUT_STEP,
      formatValue: (pt: number) => `${pt}pt`,
      onChange: (size) => {
        edit.updateFontSize(ptToPx(size));
      },
    },
    ...buildFontWidgets(
      edit.getFont(),
      (font) => {
        edit.updateFont(font);
        rebuild();
      },
      t,
    ),
    {
      kind: "toggle",
      label: t.unifyEditDisplayFont(),
      value: edit.getUnify(),
      onChange: (value) => {
        edit.setUnify(value);
        rebuild();
      },
    },
    {
      kind: "toggle",
      label: t.matchNotebookFont(),
      value: edit.getMatchNotebook(),
      onChange: (value) => {
        edit.setMatchNotebook(value);
        rebuild();
      },
    },
  ]);
};

/**
 * Elements: code, image, table, list, quote/divider, and links — plus Text
 * (the node-editing font) on views that have an edit mode.
 */
export const createElementsToolbar = (
  root: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
): HTMLElement => {
  const section = rememberedSection<ElementsSection>(model, "elements", "code");

  return createCapsuleDropdown(root, {
    ...dropdownClasses(model, "elements"),
    ariaLabel: t.articleElements(),
    triggerLabel: t.articleElements(),
    menuClassName: CAPSULE_MENU_SECONDARY,
    fillMenu: (menu, rebuild) => {
      mountSecondaryMenu<ElementsSection>(menu, {
        ariaLabel: t.articleElements(),
        sections: [
          ...(model.editMode
            ? [{ id: "text" as const, label: t.text() }]
            : []),
          { id: "code", label: t.articleCode() },
          { id: "image", label: t.articleImage() },
          { id: "table", label: t.articleTable() },
          { id: "list", label: t.articleList() },
          { id: "quote", label: t.articleQuote() },
          { id: "links", label: t.linkStyle() },
        ],
        getActive: () =>
          resolveElementsSection(
            lastSections.get(`${model.scope}:elements`) ?? section.get(),
            Boolean(model.editMode),
          ),
        setActive: section.set,
        fillSection: (id, panel) => {
          if (id === "text") {
            fillEditTextPanel(panel, model, t, rebuild);
            return;
          }
          if (id === "code") {
            fillCodePanel(panel, model, t, rebuild);
            return;
          }
          if (id === "table") {
            fillTablePanel(panel, model, t, rebuild);
            return;
          }
          if (id === "list") {
            fillListPanel(panel, model, t, rebuild);
            return;
          }
          if (id === "quote") {
            fillQuotePanel(panel, model, t, rebuild);
            return;
          }
          if (id === "links") {
            fillLinksPanel(panel, model, t, rebuild);
            return;
          }
          fillImagePanel(panel, model, t, rebuild);
        },
      });
    },
  });
};

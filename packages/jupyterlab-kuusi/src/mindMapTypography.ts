import type { BodyFontSizePx, MindMapFont } from "./fontToolbar";
import {
  type NumberRange,
  type TypographyValues,
} from "./typographySettings";

/** Body / heading / code / image fields. Display font stays displayFont. */
export type MindMapTypographyFields = Omit<TypographyValues, "font" | "fontSize">;

export const MIND_MAP_LINE_HEIGHT_RANGE: NumberRange = {
  min: 0.9,
  max: 2.4,
  step: 0.05,
};

export type MindMapTypographySource = MindMapTypographyFields & {
  displayFont: MindMapFont;
  displayFontSize: BodyFontSizePx;
};

export type MindMapFontBridge = {
  unifyEditDisplayFont: boolean;
  matchNotebookFont: boolean;
};

export const mindMapSettingsToTypography = (
  settings: MindMapTypographySource,
): TypographyValues => ({
  font: settings.displayFont,
  fontSize: settings.displayFontSize,
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
  tableTransparency: settings.tableTransparency,
  tableHeaderRowBold: settings.tableHeaderRowBold,
  tableHeaderColumnBold: settings.tableHeaderColumnBold,
  tableHeaderRowAlign: settings.tableHeaderRowAlign,
  tableHeaderColumnAlign: settings.tableHeaderColumnAlign,
  tableColumnWidth: settings.tableColumnWidth,
  listStyle: settings.listStyle,
  blockquoteWeight: settings.blockquoteWeight,
  hrWeight: settings.hrWeight,
  hrThickness: settings.hrThickness,
  hrColor: settings.hrColor,
  hrStyle: settings.hrStyle,
  codeBackground: settings.codeBackground,
  blockquoteBackground: settings.blockquoteBackground,
  blockquoteColor: settings.blockquoteColor,
  blockquoteBarColor: settings.blockquoteBarColor,
  imageWidth: settings.imageWidth,
  imageAlign: settings.imageAlign,
  imageWrap: settings.imageWrap,
  imageBorderStyle: settings.imageBorderStyle,
  imageBorderWidth: settings.imageBorderWidth,
  imageBorderColor: settings.imageBorderColor,
  imageRadius: settings.imageRadius,
  imageScale: settings.imageScale,
});

export const typographyPatch = (
  settings: MindMapFontBridge,
  partial: Partial<TypographyValues>,
): Partial<MindMapTypographyFields> & {
  displayFont?: MindMapFont;
  displayFontSize?: BodyFontSizePx;
  editFont?: MindMapFont;
  editFontSize?: BodyFontSizePx;
  matchNotebookFont?: boolean;
} => {
  const { font, fontSize, ...rest } = partial;
  const patch: Partial<MindMapTypographyFields> & {
    displayFont?: MindMapFont;
    displayFontSize?: BodyFontSizePx;
    editFont?: MindMapFont;
    editFontSize?: BodyFontSizePx;
    matchNotebookFont?: boolean;
  } = { ...rest };

  if (font !== undefined) {
    patch.displayFont = font;
    patch.matchNotebookFont =
      font === "notebook" ? settings.matchNotebookFont : false;

    if (settings.unifyEditDisplayFont) {
      patch.editFont = font;
    }
  }

  if (fontSize !== undefined) {
    patch.displayFontSize = fontSize;

    if (settings.unifyEditDisplayFont) {
      patch.editFontSize = fontSize;
    }
  }

  return patch;
};

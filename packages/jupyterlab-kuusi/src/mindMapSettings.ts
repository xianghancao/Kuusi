import { isEdgeBranchColors } from "./edgeStyling";
import {
  DEFAULT_VIEW_BEHAVIOR,
  normalizeViewBehavior,
  type ViewBehaviorSettings,
} from "./viewBehavior";
import { normalizeLevelStyles } from "./levelStyles";
import type { ISettingRegistry } from "@jupyterlab/settingregistry";
import type { JSONValue } from "@lumino/coreutils";
import type { LayoutDensity, TreeDirection } from "kuusi-kernel";
import { LAYOUT_CHILD_GAP, LAYOUT_NODE_WIDTH, LAYOUT_SIBLING_GAP } from "kuusi-kernel";
import {
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
} from "./appearanceToolbar";
import {
  DEFAULT_MIND_MAP_BACKGROUND,
  DEFAULT_MIND_MAP_BACKGROUND_COLOR,
  DEFAULT_MIND_MAP_BACKGROUND_PATTERN,
  LEGACY_BACKGROUND_PATTERNS,
  type MindMapBackground,
  type MindMapBackgroundPattern,
} from "./backgroundToolbar";
import {
  applyFontToScene,
  DEFAULT_BODY_FONT_SIZE_PX,
  DEFAULT_MIND_MAP_FONT,
  MIND_MAP_FONT_SIZE_REM,
  mindMapFontFamilyCss,
  normalizeBodyFontSizePx,
  type BodyFontSizePx,
  type MindMapFont,
  isFontValue,
} from "./fontToolbar";
import { DEFAULT_MIND_MAP_THEME, normalizeMindMapTheme, type MindMapTheme } from "./styleToolbar";
import {
  applyCodeAppearance,
} from "./codeThemes";
import { applyTableAppearance } from "./tableSettings";
import { applyElementChromeAppearance } from "./elementChromeSettings";
import {
  DEFAULT_TYPOGRAPHY_VALUES,
  HEADING_LEVELS,
  headingId,
  normalizeTypographyValues,
} from "./typographySettings";
import { type MindMapTypographyFields } from "./mindMapTypography";

export const MIND_MAP_SETTINGS_PLUGIN_ID = "jupyterlab-kuusi:plugin";

export type { MindMapTypographyFields } from "./mindMapTypography";
export {
  MIND_MAP_LINE_HEIGHT_RANGE,
  mindMapSettingsToTypography,
} from "./mindMapTypography";

export type MindMapUserSettings = {
  theme: MindMapTheme;
  editFont: MindMapFont;
  displayFont: MindMapFont;
  editFontSize: BodyFontSizePx;
  displayFontSize: BodyFontSizePx;
  unifyEditDisplayFont: boolean;
  matchNotebookFont: boolean;
  layoutDensity: LayoutDensity;
  siblingGap: number;
  childGap: number;
  equalNodeWidth: boolean;
  /** Fit each card to its content width, capped by `nodeWidth`. */
  adaptiveNodeWidth: boolean;
  nodeWidth: number;
  treeDirection: TreeDirection;
  background: MindMapBackground;
  backgroundPattern: MindMapBackgroundPattern;
  backgroundColor: string;
  /** Show disk last-modified time in the bottom-left of the mind map canvas. */
  showUpdatedTimestamp: boolean;
  /** Show node count beside zoom. */
  showNodeCount: boolean;
  /** Show character / word count beside zoom. */
  showTextCount: boolean;
  /** Show page count beside zoom (usually unused for mind maps). */
  showPageCount: boolean;
  /** Show document file size beside zoom. */
  showFileSize: boolean;
  appearance: AppearanceSettings;
} & ViewBehaviorSettings &
  MindMapTypographyFields;

export const DEFAULT_MIND_MAP_USER_SETTINGS: MindMapUserSettings = {
  theme: DEFAULT_MIND_MAP_THEME,
  editFont: DEFAULT_MIND_MAP_FONT,
  displayFont: DEFAULT_MIND_MAP_FONT,
  editFontSize: DEFAULT_BODY_FONT_SIZE_PX,
  displayFontSize: DEFAULT_BODY_FONT_SIZE_PX,
  unifyEditDisplayFont: false,
  matchNotebookFont: false,
  color: DEFAULT_TYPOGRAPHY_VALUES.color,
  strongColor: DEFAULT_TYPOGRAPHY_VALUES.strongColor,
  letterSpacing: DEFAULT_TYPOGRAPHY_VALUES.letterSpacing,
  lineHeight: DEFAULT_TYPOGRAPHY_VALUES.lineHeight,
  paragraphSpacing: DEFAULT_TYPOGRAPHY_VALUES.paragraphSpacing,
  paragraphIndent: DEFAULT_TYPOGRAPHY_VALUES.paragraphIndent,
  paragraphAlign: DEFAULT_TYPOGRAPHY_VALUES.paragraphAlign,
  linkStyle: DEFAULT_TYPOGRAPHY_VALUES.linkStyle,
  headers: DEFAULT_TYPOGRAPHY_VALUES.headers,
  codeStyle: DEFAULT_TYPOGRAPHY_VALUES.codeStyle,
  codeTheme: DEFAULT_TYPOGRAPHY_VALUES.codeTheme,
  codeFont: DEFAULT_TYPOGRAPHY_VALUES.codeFont,
  codeFontSize: DEFAULT_TYPOGRAPHY_VALUES.codeFontSize,
  codeFrame: DEFAULT_TYPOGRAPHY_VALUES.codeFrame,
  codeFrameColor: DEFAULT_TYPOGRAPHY_VALUES.codeFrameColor,
  codeFrameRadius: DEFAULT_TYPOGRAPHY_VALUES.codeFrameRadius,
  codeFrameBorder: DEFAULT_TYPOGRAPHY_VALUES.codeFrameBorder,
  codeFrameWidth: DEFAULT_TYPOGRAPHY_VALUES.codeFrameWidth,
  tableStyle: DEFAULT_TYPOGRAPHY_VALUES.tableStyle,
  tableBorderWidth: DEFAULT_TYPOGRAPHY_VALUES.tableBorderWidth,
  tableHeaderRowBold: DEFAULT_TYPOGRAPHY_VALUES.tableHeaderRowBold,
  tableHeaderColumnBold: DEFAULT_TYPOGRAPHY_VALUES.tableHeaderColumnBold,
  listStyle: DEFAULT_TYPOGRAPHY_VALUES.listStyle,
  blockquoteWeight: DEFAULT_TYPOGRAPHY_VALUES.blockquoteWeight,
  hrWeight: DEFAULT_TYPOGRAPHY_VALUES.hrWeight,
  imageWidth: DEFAULT_TYPOGRAPHY_VALUES.imageWidth,
  imageAlign: DEFAULT_TYPOGRAPHY_VALUES.imageAlign,
  imageWrap: DEFAULT_TYPOGRAPHY_VALUES.imageWrap,
  imageBorderStyle: DEFAULT_TYPOGRAPHY_VALUES.imageBorderStyle,
  imageBorderWidth: DEFAULT_TYPOGRAPHY_VALUES.imageBorderWidth,
  imageBorderColor: DEFAULT_TYPOGRAPHY_VALUES.imageBorderColor,
  imageRadius: DEFAULT_TYPOGRAPHY_VALUES.imageRadius,
  layoutDensity: "normal",
  siblingGap: LAYOUT_SIBLING_GAP.default,
  childGap: LAYOUT_CHILD_GAP.default,
  equalNodeWidth: false,
  adaptiveNodeWidth: false,
  nodeWidth: LAYOUT_NODE_WIDTH.default,
  treeDirection: "LR",
  background: DEFAULT_MIND_MAP_BACKGROUND,
  backgroundPattern: DEFAULT_MIND_MAP_BACKGROUND_PATTERN,
  backgroundColor: DEFAULT_MIND_MAP_BACKGROUND_COLOR,
  showUpdatedTimestamp: true,
  showNodeCount: true,
  showTextCount: false,
  showPageCount: false,
  showFileSize: false,
  appearance: { ...DEFAULT_APPEARANCE },
  ...DEFAULT_VIEW_BEHAVIOR,
};

const isFont = (value: unknown): value is MindMapFont => isFontValue(value);

const isLayoutDensity = (value: unknown): value is LayoutDensity =>
  value === "compact" || value === "normal" || value === "loose";

const clampLayoutGap = (
  value: unknown,
  spec: { min: number; max: number; default: number },
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return spec.default;
  }

  return Math.min(spec.max, Math.max(spec.min, Math.round(value)));
};

const clampNodeWidthSetting = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return LAYOUT_NODE_WIDTH.default;
  }

  return Math.min(
    LAYOUT_NODE_WIDTH.max,
    Math.max(LAYOUT_NODE_WIDTH.min, Math.round(value)),
  );
};

const isTreeDirection = (value: unknown): value is TreeDirection =>
  value === "TB" || value === "BT" || value === "LR" || value === "RL";

const isBackground = (value: unknown): value is MindMapBackground =>
  value === "default" ||
  value === "eye-care" ||
  value === "newspaper" ||
  value === "business-blue" ||
  value === "sea-blue" ||
  value === "tech-blue" ||
  value === "grass-green" ||
  value === "avocado" ||
  value === "stone-gray" ||
  value === "red-wall" ||
  value === "ink" ||
  value === "custom";

const isBackgroundPattern = (
  value: unknown,
): value is MindMapBackgroundPattern =>
  value === "none" ||
  value === "plain" ||
  value === "grid" ||
  value === "grid-dense" ||
  value === "dots" ||
  value === "dots-dense" ||
  value === "gradient";

const isLegacyBackgroundPattern = (
  value: unknown,
): value is (typeof LEGACY_BACKGROUND_PATTERNS)[number] =>
  typeof value === "string" &&
  (LEGACY_BACKGROUND_PATTERNS as readonly string[]).includes(value);

const normalizeBackground = (value: unknown): MindMapBackground =>
  isBackground(value) ? value : DEFAULT_MIND_MAP_BACKGROUND;

const normalizeBackgroundPattern = (
  value: unknown,
): MindMapBackgroundPattern =>
  isBackgroundPattern(value) ? value : DEFAULT_MIND_MAP_BACKGROUND_PATTERN;

const isEdgeLineStyle = (
  value: unknown,
): value is AppearanceSettings["edgeStyle"] =>
  value === "solid" ||
  value === "dashed" ||
  value === "dotted" ||
  value === "long-dash" ||
  value === "dash-dot" ||
  value === "dense-dot" ||
  value === "sparse-dash";

const isEdgeRouteStyle = (
  value: unknown,
): value is AppearanceSettings["edgeRoute"] =>
  value === "straight" ||
  value === "curve" ||
  value === "orthogonal" ||
  value === "rounded-orthogonal";

const isBorderLineStyle = (
  value: unknown,
): value is AppearanceSettings["nodeBorderStyle"] =>
  value === "solid" || value === "dashed" || value === "dotted";

const isNodeBorderCorner = (
  value: unknown,
): value is AppearanceSettings["nodeBorderCorner"] =>
  value === "sharp" || value === "rounded" || value === "ellipse";

const isEdgeArrowDirection = (
  value: unknown,
): value is AppearanceSettings["edgeArrowDirection"] =>
  value === "none" ||
  value === "end" ||
  value === "start" ||
  value === "both";

const isEdgeArrowStyle = (
  value: unknown,
): value is AppearanceSettings["edgeArrowStyle"] =>
  value === "triangle" ||
  value === "stealth" ||
  value === "diamond" ||
  value === "circle" ||
  value === "open";

const normalizeAppearance = (value: unknown): AppearanceSettings => {
  const defaults = DEFAULT_MIND_MAP_USER_SETTINGS.appearance;

  if (!value || typeof value !== "object") {
    return { ...defaults };
  }

  const appearance = value as Partial<AppearanceSettings>;

  return {
    edgeStyle: isEdgeLineStyle(appearance.edgeStyle)
      ? appearance.edgeStyle
      : defaults.edgeStyle,
    edgeRoute: isEdgeRouteStyle(appearance.edgeRoute)
      ? appearance.edgeRoute
      : defaults.edgeRoute,
    edgeArrowDirection: isEdgeArrowDirection(appearance.edgeArrowDirection)
      ? appearance.edgeArrowDirection
      : defaults.edgeArrowDirection,
    edgeArrowStyle: isEdgeArrowStyle(appearance.edgeArrowStyle)
      ? appearance.edgeArrowStyle
      : defaults.edgeArrowStyle,
    edgeWidth:
      typeof appearance.edgeWidth === "string"
        ? appearance.edgeWidth
        : defaults.edgeWidth,
    edgeColor:
      typeof appearance.edgeColor === "string"
        ? appearance.edgeColor
        : defaults.edgeColor,
    nodeFillColor:
      typeof appearance.nodeFillColor === "string"
        ? appearance.nodeFillColor
        : defaults.nodeFillColor,
    nodeBorderStyle: isBorderLineStyle(appearance.nodeBorderStyle)
      ? appearance.nodeBorderStyle
      : defaults.nodeBorderStyle,
    nodeBorderWidth:
      typeof appearance.nodeBorderWidth === "string"
        ? appearance.nodeBorderWidth
        : defaults.nodeBorderWidth,
    nodeBorderColor:
      typeof appearance.nodeBorderColor === "string"
        ? appearance.nodeBorderColor
        : defaults.nodeBorderColor,
    nodeBorderCorner: isNodeBorderCorner(appearance.nodeBorderCorner)
      ? appearance.nodeBorderCorner
      : defaults.nodeBorderCorner,
    nodeBorderRadius:
      typeof appearance.nodeBorderRadius === "string"
        ? appearance.nodeBorderRadius
        : defaults.nodeBorderRadius,
    selectionGlowColor:
      typeof appearance.selectionGlowColor === "string"
        ? appearance.selectionGlowColor
        : defaults.selectionGlowColor,
    selectionGlowWidth:
      typeof appearance.selectionGlowWidth === "string"
        ? appearance.selectionGlowWidth
        : defaults.selectionGlowWidth,
    hoverGlowColor:
      typeof appearance.hoverGlowColor === "string"
        ? appearance.hoverGlowColor
        : defaults.hoverGlowColor,
    hoverGlowWidth:
      typeof appearance.hoverGlowWidth === "string"
        ? appearance.hoverGlowWidth
        : defaults.hoverGlowWidth,
    edgeTaper:
      typeof appearance.edgeTaper === "boolean"
        ? appearance.edgeTaper
        : defaults.edgeTaper,
    edgeMinWidth:
      typeof appearance.edgeMinWidth === "string"
        ? appearance.edgeMinWidth
        : defaults.edgeMinWidth,
    edgeBranchColors: isEdgeBranchColors(appearance.edgeBranchColors)
      ? appearance.edgeBranchColors
      : defaults.edgeBranchColors,
    levelStyles: normalizeLevelStyles(appearance.levelStyles),
    nodePaddingX:
      typeof appearance.nodePaddingX === "string"
        ? appearance.nodePaddingX
        : defaults.nodePaddingX,
    nodePaddingY:
      typeof appearance.nodePaddingY === "string"
        ? appearance.nodePaddingY
        : defaults.nodePaddingY,
  };
};

export const normalizeMindMapUserSettings = (
  value: unknown,
): MindMapUserSettings => {
  const defaults = DEFAULT_MIND_MAP_USER_SETTINGS;
  const raw = (value && typeof value === "object" ? value : {}) as Partial<
    MindMapUserSettings & { appearance?: unknown }
  >;

  const legacyPattern = isLegacyBackgroundPattern(raw.background)
    ? raw.background
    : null;

  const legacyFont = isFont((raw as { font?: unknown }).font)
    ? ((raw as { font: MindMapFont }).font)
    : null;
  const legacyFontSize = normalizeBodyFontSizePx(
    (raw as { fontSize?: unknown }).fontSize,
    defaults.displayFontSize,
  );
  const displayFont = isFont(raw.displayFont)
    ? raw.displayFont
    : (legacyFont ?? defaults.displayFont);
  const displayFontSize = normalizeBodyFontSizePx(
    raw.displayFontSize ?? legacyFontSize,
    defaults.displayFontSize,
  );
  const { font: _font, fontSize: _fontSize, ...typography } =
    normalizeTypographyValues(
      {
        ...raw,
        font: displayFont,
        fontSize: displayFontSize,
      },
      {
        ...DEFAULT_TYPOGRAPHY_VALUES,
        font: displayFont,
        fontSize: displayFontSize,
        headers: defaults.headers,
      },
    );

  return {
    theme: normalizeMindMapTheme(raw.theme) ?? defaults.theme,
    editFont: isFont(raw.editFont)
      ? raw.editFont
      : (legacyFont ?? defaults.editFont),
    displayFont,
    editFontSize: normalizeBodyFontSizePx(
      raw.editFontSize ?? legacyFontSize,
      defaults.editFontSize,
    ),
    displayFontSize,
    unifyEditDisplayFont:
      typeof raw.unifyEditDisplayFont === "boolean"
        ? raw.unifyEditDisplayFont
        : defaults.unifyEditDisplayFont,
    matchNotebookFont:
      typeof raw.matchNotebookFont === "boolean"
        ? raw.matchNotebookFont
        : defaults.matchNotebookFont,
    ...typography,
    layoutDensity: isLayoutDensity(raw.layoutDensity)
      ? raw.layoutDensity
      : defaults.layoutDensity,
    siblingGap: clampLayoutGap(raw.siblingGap, LAYOUT_SIBLING_GAP),
    childGap: clampLayoutGap(raw.childGap, LAYOUT_CHILD_GAP),
    equalNodeWidth:
      typeof raw.equalNodeWidth === "boolean"
        ? raw.equalNodeWidth
        : defaults.equalNodeWidth,
    adaptiveNodeWidth:
      typeof raw.adaptiveNodeWidth === "boolean"
        ? raw.adaptiveNodeWidth
        : defaults.adaptiveNodeWidth,
    nodeWidth: clampNodeWidthSetting(raw.nodeWidth),
    treeDirection: isTreeDirection(raw.treeDirection)
      ? raw.treeDirection
      : defaults.treeDirection,
    background: legacyPattern
      ? defaults.background
      : normalizeBackground(raw.background),
    backgroundPattern: legacyPattern
      ? legacyPattern
      : normalizeBackgroundPattern(raw.backgroundPattern),
    backgroundColor:
      typeof raw.backgroundColor === "string"
        ? raw.backgroundColor
        : defaults.backgroundColor,
    showUpdatedTimestamp:
      typeof raw.showUpdatedTimestamp === "boolean"
        ? raw.showUpdatedTimestamp
        : defaults.showUpdatedTimestamp,
    showNodeCount:
      typeof raw.showNodeCount === "boolean"
        ? raw.showNodeCount
        : defaults.showNodeCount,
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
    ...normalizeViewBehavior(raw),
    appearance: normalizeAppearance(raw.appearance),
  };
};

const MIND_MAP_TYPOGRAPHY_KEYS: Array<keyof MindMapTypographyFields> = [
  "color",
  "strongColor",
  "letterSpacing",
  "lineHeight",
  "paragraphSpacing",
  "paragraphIndent",
  "paragraphAlign",
  "linkStyle",
  "headers",
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
];

/** Fields that change node size and need a mind-map relayout. */
export const mindMapTypographyGeometryKey = (
  settings: MindMapUserSettings,
): string =>
  [
    settings.displayFont,
    settings.displayFontSize,
    settings.letterSpacing,
    settings.lineHeight,
    settings.paragraphSpacing,
    settings.paragraphIndent,
    settings.paragraphAlign,
    settings.codeStyle,
    settings.codeTheme,
    settings.codeFont,
    settings.codeFontSize,
    settings.codeFrame,
    settings.codeFrameRadius,
    settings.codeFrameBorder,
    settings.codeFrameWidth,
    settings.imageWidth,
    settings.imageWrap,
    JSON.stringify(settings.headers),
  ].join("|");

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

/** Display typography + per-level headings + code/image on the mind-map scene. */
export const applyMindMapTypography = (
  scene: HTMLElement,
  settings: MindMapUserSettings,
): void => {
  applyFontToScene(
    scene,
    settings.editFont,
    settings.displayFont,
    settings.editFontSize,
    settings.displayFontSize,
  );
  scene.dataset.kuusiParagraphAlign = settings.paragraphAlign;
  scene.dataset.kuusiLinkStyle = settings.linkStyle;
  scene.dataset.kuusiCodeStyle = settings.codeStyle;
  scene.dataset.kuusiCodeFrame = settings.codeFrame ? "1" : "0";
  applyCodeAppearance(
    scene,
    {
      codeTheme: settings.codeTheme,
      codeFont: settings.codeFont,
      codeFontSize: settings.codeFontSize,
    },
    "kuusiCodeTheme",
    // Node cards take their background from JupyterLab's theme.
    { followLabTheme: true },
  );
  applyTableAppearance(scene, {
    tableStyle: settings.tableStyle,
    tableBorderWidth: settings.tableBorderWidth,
    tableHeaderRowBold: settings.tableHeaderRowBold,
    tableHeaderColumnBold: settings.tableHeaderColumnBold,
  });
  applyElementChromeAppearance(scene, {
    listStyle: settings.listStyle,
    blockquoteWeight: settings.blockquoteWeight,
    hrWeight: settings.hrWeight,
  });
  scene.dataset.kuusiImageWidth = settings.imageWidth;
  scene.dataset.kuusiImageAlign = settings.imageAlign;
  scene.dataset.kuusiImageWrap = settings.imageWrap;
  scene.dataset.kuusiImageBorder = settings.imageBorderStyle;
  scene.style.setProperty(
    "--kuusi-mindmap-font-family-display",
    mindMapFontFamilyCss(settings.displayFont),
  );
  scene.style.setProperty(
    "--kuusi-mindmap-body-color",
    settings.color || "inherit",
  );
  if (settings.strongColor) {
    scene.style.setProperty("--kuusi-mindmap-strong-color", settings.strongColor);
  } else {
    scene.style.removeProperty("--kuusi-mindmap-strong-color");
  }
  scene.style.setProperty(
    "--kuusi-mindmap-letter-spacing",
    `${settings.letterSpacing}pt`,
  );
  scene.style.setProperty(
    "--kuusi-mindmap-line-height",
    String(settings.lineHeight),
  );
  scene.style.setProperty(
    "--kuusi-mindmap-paragraph-spacing",
    `${settings.paragraphSpacing}pt`,
  );
  scene.style.setProperty(
    "--kuusi-mindmap-paragraph-indent",
    `${settings.paragraphIndent}pt`,
  );
  scene.style.setProperty(
    "--kuusi-mindmap-paragraph-align",
    settings.paragraphAlign,
  );
  scene.style.setProperty(
    "--kuusi-mindmap-code-radius",
    `${settings.codeFrameRadius}px`,
  );
  scene.style.setProperty(
    "--kuusi-mindmap-code-border-width",
    `${settings.codeFrameBorder}px`,
  );
  scene.style.setProperty(
    "--kuusi-mindmap-code-width",
    `${settings.codeFrameWidth}%`,
  );
  scene.style.setProperty(
    "--kuusi-mindmap-image-border-width",
    `${settings.imageBorderWidth}px`,
  );
  scene.style.setProperty(
    "--kuusi-mindmap-image-border-style",
    settings.imageBorderStyle,
  );
  scene.style.setProperty(
    "--kuusi-mindmap-image-radius",
    `${settings.imageRadius}px`,
  );
  setOrRemove(scene, "--kuusi-mindmap-code-border-color", settings.codeFrameColor);
  setOrRemove(
    scene,
    "--kuusi-mindmap-image-border-color",
    settings.imageBorderColor,
  );

  HEADING_LEVELS.forEach((level) => {
    const id = headingId(level);
    const style = settings.headers[id];
    scene.style.setProperty(
      `--kuusi-mindmap-${id}-font-family`,
      mindMapFontFamilyCss(style.font),
    );
    scene.style.setProperty(
      `--kuusi-mindmap-${id}-font-size`,
      MIND_MAP_FONT_SIZE_REM[style.fontSize],
    );
    scene.style.setProperty(
      `--kuusi-mindmap-${id}-color`,
      style.color || "inherit",
    );
    scene.style.setProperty(`--kuusi-mindmap-${id}-align`, style.align);
  });
};

export class MindMapSettingsManager {
  private _settings: MindMapUserSettings = {
    ...DEFAULT_MIND_MAP_USER_SETTINGS,
  };

  private _plugin: ISettingRegistry.ISettings | null = null;

  /** Hover preview overlay: shown to listeners but never persisted. */
  private _preview: MindMapUserSettings | null = null;

  /** Suppress plugin.changed → emit while we are writing our own update. */
  private _writing = 0;

  private _listeners = new Set<(settings: MindMapUserSettings) => void>();

  readonly changed = {
    connect: (fn: (settings: MindMapUserSettings) => void) => {
      this._listeners.add(fn);
      return {
        disconnect: () => {
          this._listeners.delete(fn);
        },
      };
    },
  };

  constructor(private _registry: ISettingRegistry) {}

  get settings(): MindMapUserSettings {
    return this._preview ?? this._settings;
  }

  async ready(): Promise<void> {
    const plugin = await this._registry.load(MIND_MAP_SETTINGS_PLUGIN_ID);
    this._plugin = plugin;
    this._settings = normalizeMindMapUserSettings(plugin.composite);
    plugin.changed.connect(() => {
      if (this._writing > 0) {
        return;
      }

      this._preview = null;
      this._settings = normalizeMindMapUserSettings(plugin.composite);
      this._emit();
    });
  }

  async update(partial: Partial<MindMapUserSettings>): Promise<void> {
    this._preview = null;
    const previous = this._settings;
    const next = normalizeMindMapUserSettings({
      ...this._settings,
      ...partial,
      appearance: partial.appearance
        ? { ...this._settings.appearance, ...partial.appearance }
        : this._settings.appearance,
    });

    this._settings = next;
    this._emit();

    if (!this._plugin) {
      return;
    }

    const writes: Promise<void>[] = [];
    const enqueue = <K extends keyof MindMapUserSettings>(
      key: K,
      changed: boolean,
      value: MindMapUserSettings[K],
    ): void => {
      if (changed) {
        writes.push(this._plugin!.set(key, value as unknown as JSONValue));
      }
    };

    enqueue("theme", next.theme !== previous.theme, next.theme);
    enqueue("editFont", next.editFont !== previous.editFont, next.editFont);
    enqueue(
      "displayFont",
      next.displayFont !== previous.displayFont,
      next.displayFont,
    );
    enqueue(
      "editFontSize",
      next.editFontSize !== previous.editFontSize,
      next.editFontSize,
    );
    enqueue(
      "displayFontSize",
      next.displayFontSize !== previous.displayFontSize,
      next.displayFontSize,
    );
    enqueue(
      "unifyEditDisplayFont",
      next.unifyEditDisplayFont !== previous.unifyEditDisplayFont,
      next.unifyEditDisplayFont,
    );
    enqueue(
      "matchNotebookFont",
      next.matchNotebookFont !== previous.matchNotebookFont,
      next.matchNotebookFont,
    );
    MIND_MAP_TYPOGRAPHY_KEYS.forEach((key) => {
      const changed =
        key === "headers"
          ? JSON.stringify(next.headers) !== JSON.stringify(previous.headers)
          : next[key] !== previous[key];
      enqueue(key, changed, next[key]);
    });
    enqueue(
      "layoutDensity",
      next.layoutDensity !== previous.layoutDensity,
      next.layoutDensity,
    );
    enqueue(
      "siblingGap",
      next.siblingGap !== previous.siblingGap,
      next.siblingGap,
    );
    enqueue("childGap", next.childGap !== previous.childGap, next.childGap);
    enqueue(
      "equalNodeWidth",
      next.equalNodeWidth !== previous.equalNodeWidth,
      next.equalNodeWidth,
    );
    enqueue(
      "adaptiveNodeWidth",
      next.adaptiveNodeWidth !== previous.adaptiveNodeWidth,
      next.adaptiveNodeWidth,
    );
    enqueue("nodeWidth", next.nodeWidth !== previous.nodeWidth, next.nodeWidth);
    enqueue(
      "treeDirection",
      next.treeDirection !== previous.treeDirection,
      next.treeDirection,
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
      "backgroundColor",
      next.backgroundColor !== previous.backgroundColor,
      next.backgroundColor,
    );
    enqueue(
      "showUpdatedTimestamp",
      next.showUpdatedTimestamp !== previous.showUpdatedTimestamp,
      next.showUpdatedTimestamp,
    );
    enqueue(
      "showNodeCount",
      next.showNodeCount !== previous.showNodeCount,
      next.showNodeCount,
    );
    enqueue(
      "showTextCount",
      next.showTextCount !== previous.showTextCount,
      next.showTextCount,
    );
    enqueue(
      "showPageCount",
      next.showPageCount !== previous.showPageCount,
      next.showPageCount,
    );
    enqueue(
      "showFileSize",
      next.showFileSize !== previous.showFileSize,
      next.showFileSize,
    );
    (
      [
        "zoomMinPercent",
        "zoomMaxPercent",
        "wheelZoomSpeed",
        "wheelBehavior",
        "openView",
      ] as const
    ).forEach((key) => {
      enqueue(key, next[key] !== previous[key], next[key]);
    });

    if (
      JSON.stringify(next.appearance) !== JSON.stringify(previous.appearance)
    ) {
      writes.push(
        this._plugin.set("appearance", next.appearance as unknown as JSONValue),
      );
    }

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
  setPreview(partial: Partial<MindMapUserSettings> | null): void {
    this._preview = partial ? normalizeMindMapUserSettings({
      ...this._settings,
      ...partial,
      appearance: partial.appearance
        ? { ...this._settings.appearance, ...partial.appearance }
        : this._settings.appearance,
    }) : null;
    this._emit();
  }

  private _emit(): void {
    this._listeners.forEach((listener) => {
      listener(this.settings);
    });
  }
}

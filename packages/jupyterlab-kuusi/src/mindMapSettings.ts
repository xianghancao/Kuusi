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
import { DEFAULT_MIND_MAP_FONT, DEFAULT_MIND_MAP_FONT_SIZE, normalizeMindMapFontSize, type MindMapFont, type MindMapFontSize } from "./fontToolbar";
import { DEFAULT_MIND_MAP_THEME, normalizeMindMapTheme, type MindMapTheme } from "./styleToolbar";

export const MIND_MAP_SETTINGS_PLUGIN_ID = "jupyterlab-kuusi:plugin";

export type MindMapUserSettings = {
  theme: MindMapTheme;
  editFont: MindMapFont;
  displayFont: MindMapFont;
  editFontSize: MindMapFontSize;
  displayFontSize: MindMapFontSize;
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
  appearance: AppearanceSettings;
};

export const DEFAULT_MIND_MAP_USER_SETTINGS: MindMapUserSettings = {
  theme: DEFAULT_MIND_MAP_THEME,
  editFont: DEFAULT_MIND_MAP_FONT,
  displayFont: DEFAULT_MIND_MAP_FONT,
  editFontSize: DEFAULT_MIND_MAP_FONT_SIZE,
  displayFontSize: DEFAULT_MIND_MAP_FONT_SIZE,
  unifyEditDisplayFont: false,
  matchNotebookFont: false,
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
  appearance: { ...DEFAULT_APPEARANCE },
};

const isFont = (value: unknown): value is MindMapFont =>
  value === "notebook" ||
  value === "system-ui" ||
  value === "arial" ||
  value === "helvetica" ||
  value === "segoe-ui" ||
  value === "verdana" ||
  value === "georgia" ||
  value === "times" ||
  value === "palatino" ||
  value === "garamond" ||
  value === "cambria";

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
  const legacyFontSize = normalizeMindMapFontSize(
    (raw as { fontSize?: unknown }).fontSize,
  );

  return {
    theme: normalizeMindMapTheme(raw.theme) ?? defaults.theme,
    editFont: isFont(raw.editFont)
      ? raw.editFont
      : (legacyFont ?? defaults.editFont),
    displayFont: isFont(raw.displayFont)
      ? raw.displayFont
      : (legacyFont ?? defaults.displayFont),
    editFontSize:
      normalizeMindMapFontSize(raw.editFontSize) ??
      legacyFontSize ??
      defaults.editFontSize,
    displayFontSize:
      normalizeMindMapFontSize(raw.displayFontSize) ??
      legacyFontSize ??
      defaults.displayFontSize,
    unifyEditDisplayFont:
      typeof raw.unifyEditDisplayFont === "boolean"
        ? raw.unifyEditDisplayFont
        : defaults.unifyEditDisplayFont,
    matchNotebookFont:
      typeof raw.matchNotebookFont === "boolean"
        ? raw.matchNotebookFont
        : defaults.matchNotebookFont,
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
    appearance: normalizeAppearance(raw.appearance),
  };
};

export class MindMapSettingsManager {
  private _settings: MindMapUserSettings = {
    ...DEFAULT_MIND_MAP_USER_SETTINGS,
  };

  private _plugin: ISettingRegistry.ISettings | null = null;

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
    return this._settings;
  }

  async ready(): Promise<void> {
    const plugin = await this._registry.load(MIND_MAP_SETTINGS_PLUGIN_ID);
    this._plugin = plugin;
    this._settings = normalizeMindMapUserSettings(plugin.composite);
    plugin.changed.connect(() => {
      if (this._writing > 0) {
        return;
      }

      this._settings = normalizeMindMapUserSettings(plugin.composite);
      this._emit();
    });
  }

  async update(partial: Partial<MindMapUserSettings>): Promise<void> {
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

  private _emit(): void {
    this._listeners.forEach((listener) => {
      listener(this._settings);
    });
  }
}

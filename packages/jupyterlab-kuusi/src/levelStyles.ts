export type LevelId = "root" | "l1" | "l2" | "deep";

export const LEVEL_IDS: readonly LevelId[] = ["root", "l1", "l2", "deep"];

/** Empty string means "follow the map-wide setting". */
export type LevelStyle = {
  fill: string;
  borderColor: string;
  borderWidth: string;
  borderRadius: string;
};

export type LevelStyles = Record<LevelId, LevelStyle>;

export const emptyLevelStyle = (): LevelStyle => ({
  fill: "",
  borderColor: "",
  borderWidth: "",
  borderRadius: "",
});

export const emptyLevelStyles = (): LevelStyles => ({
  root: emptyLevelStyle(),
  l1: emptyLevelStyle(),
  l2: emptyLevelStyle(),
  deep: emptyLevelStyle(),
});

export const normalizeLevelStyles = (value: unknown): LevelStyles => {
  const result = emptyLevelStyles();

  if (!value || typeof value !== "object") {
    return result;
  }

  const record = value as Partial<Record<LevelId, Partial<LevelStyle>>>;

  LEVEL_IDS.forEach((id) => {
    const raw = record[id];

    if (!raw || typeof raw !== "object") {
      return;
    }

    (Object.keys(result[id]) as Array<keyof LevelStyle>).forEach((key) => {
      const entry = raw[key];

      if (typeof entry === "string") {
        result[id][key] = entry;
      }
    });
  });

  return result;
};

/** Map a node's depth (0 = map root) to its style bucket. */
export const levelIdForDepth = (depth: number): LevelId => {
  if (depth <= 0) {
    return "root";
  }

  if (depth === 1) {
    return "l1";
  }

  if (depth === 2) {
    return "l2";
  }

  return "deep";
};

export const hasAnyLevelStyle = (styles: LevelStyles): boolean =>
  LEVEL_IDS.some((id) =>
    (Object.values(styles[id]) as string[]).some((value) => value !== ""),
  );

const PROP_VARS: Array<{
  prop: keyof LevelStyle;
  cssVar: string;
  /** Matching key in a node's own `metadata.kuusi.frameStyle`. */
  frameKey: "background" | "borderColor" | "borderWidth" | "borderRadius";
}> = [
  { prop: "fill", cssVar: "--kuusi-node-background", frameKey: "background" },
  {
    prop: "borderColor",
    cssVar: "--kuusi-node-border-color",
    frameKey: "borderColor",
  },
  {
    prop: "borderWidth",
    cssVar: "--kuusi-node-border-width",
    frameKey: "borderWidth",
  },
  {
    prop: "borderRadius",
    cssVar: "--kuusi-node-border-radius",
    frameKey: "borderRadius",
  },
];

/**
 * Stamp one node with its level's style. A node's own frame style (per-node
 * fill / border from cell metadata) always wins, so those properties are
 * skipped. Only variables this function set earlier are ever removed.
 */
export const applyLevelStyleToNode = (
  node: HTMLElement,
  level: LevelId,
  style: LevelStyle,
  ownFrame: Partial<Record<string, unknown>>,
  resolveForeground: (fill: string) => string,
): void => {
  node.dataset.kuusiLevel = level;

  const previous = new Set(
    (node.dataset.kuusiLevelApplied ?? "").split(",").filter(Boolean),
  );
  const applied: string[] = [];

  PROP_VARS.forEach(({ prop, cssVar, frameKey }) => {
    const ownValue = ownFrame[frameKey];
    const hasOwn = typeof ownValue === "string" && ownValue !== "";
    const value = style[prop];

    if (value && !hasOwn) {
      node.style.setProperty(cssVar, value);
      applied.push(prop);
    } else if (previous.has(prop) && !hasOwn) {
      node.style.removeProperty(cssVar);
    }
  });

  const foreground = applied.includes("fill")
    ? resolveForeground(style.fill)
    : "";

  if (foreground) {
    node.style.setProperty("--kuusi-node-foreground", foreground);
    node.dataset.kuusiLevelContrast = "1";
  } else if (previous.has("fill") || node.dataset.kuusiLevelContrast) {
    if (node.dataset.kuusiLevelContrast) {
      node.style.removeProperty("--kuusi-node-foreground");
      delete node.dataset.kuusiLevelContrast;
    }
  }

  if (applied.length > 0) {
    node.dataset.kuusiLevelApplied = applied.join(",");
  } else {
    delete node.dataset.kuusiLevelApplied;
  }
};

/**
 * Lightweight list / blockquote / horizontal-rule chrome for Article, Book,
 * Slides, and Mind Map — Elements menu companions to Table.
 */

export type ListStyle = "compact" | "normal" | "relaxed";

export type RuleWeight = "light" | "normal" | "strong";

export const LIST_STYLES: readonly ListStyle[] = [
  "compact",
  "normal",
  "relaxed",
] as const;

export const RULE_WEIGHTS: readonly RuleWeight[] = [
  "light",
  "normal",
  "strong",
] as const;

export const DEFAULT_LIST_STYLE: ListStyle = "normal";
export const DEFAULT_BLOCKQUOTE_WEIGHT: RuleWeight = "normal";
export const DEFAULT_HR_WEIGHT: RuleWeight = "normal";

const LIST_STYLE_SET = new Set<string>(LIST_STYLES);
const RULE_WEIGHT_SET = new Set<string>(RULE_WEIGHTS);

export const isListStyle = (value: unknown): value is ListStyle =>
  typeof value === "string" && LIST_STYLE_SET.has(value);

export const isRuleWeight = (value: unknown): value is RuleWeight =>
  typeof value === "string" && RULE_WEIGHT_SET.has(value);

export type ElementChromeSettings = {
  listStyle: ListStyle;
  blockquoteWeight: RuleWeight;
  hrWeight: RuleWeight;
};

export const DEFAULT_ELEMENT_CHROME: ElementChromeSettings = {
  listStyle: DEFAULT_LIST_STYLE,
  blockquoteWeight: DEFAULT_BLOCKQUOTE_WEIGHT,
  hrWeight: DEFAULT_HR_WEIGHT,
};

/** Stamp list / quote / hr weight onto a render host. */
export const applyElementChromeAppearance = (
  host: HTMLElement,
  settings: ElementChromeSettings,
): void => {
  host.dataset.kuusiListStyle = settings.listStyle;
  host.dataset.kuusiBlockquoteWeight = settings.blockquoteWeight;
  host.dataset.kuusiHrWeight = settings.hrWeight;
};

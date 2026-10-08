/**
 * Tab ids for the merged Text menu (Body + H1–H6) and the Elements menu, plus
 * how a remembered tab from an older layout maps onto them.
 */

export const HEADING_SECTION_IDS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

export type TextMenuSection = "body" | (typeof HEADING_SECTION_IDS)[number];

/** The old Text menu used family / size / color / … tabs; they all live in Body now. */
export const resolveTextMenuSection = (
  raw: string | undefined,
): TextMenuSection =>
  (HEADING_SECTION_IDS as readonly string[]).includes(raw ?? "")
    ? (raw as TextMenuSection)
    : "body";

export type ElementsMenuSection =
  | "text"
  | "code"
  | "image"
  | "table"
  | "list"
  | "quote"
  | "links";

/**
 * `image-*` / `table-*` are sub-tab ids remembered from older versions.
 * `text` (the node-editing font) only exists when the view has an edit mode.
 */
export const resolveElementsSection = (
  raw: string | undefined,
  hasEditText: boolean,
): ElementsMenuSection => {
  const value = raw ?? "code";

  if (value === "text") {
    return hasEditText ? "text" : "code";
  }

  if (value === "image" || value.startsWith("image-")) {
    return "image";
  }

  if (value === "table" || value.startsWith("table-")) {
    return "table";
  }

  if (value === "list" || value === "quote" || value === "links") {
    return value;
  }

  return "code";
};

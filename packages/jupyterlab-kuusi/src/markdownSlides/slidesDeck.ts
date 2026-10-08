import {
  isSlidesTheme,
  type SlidesTheme,
} from "./slidesSettings";
import { stripYamlFrontMatter } from "./splitMarkdownSlides";

export type SlidesDeckMeta = {
  title?: string;
  author?: string;
  date?: string;
  /** Short title for the Beamer-style footer. */
  shortTitle?: string;
  /** Optional document theme override (does not persist to settings). */
  theme?: SlidesTheme;
  /** Show in-stage footer (short title + page). Default true when title exists. */
  footer?: boolean;
  /** Auto-insert a title slide from front matter. Default true when title is set. */
  titlePage?: boolean;
};

const unquote = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const parseYamlScalarMap = (yaml: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!match) {
      continue;
    }
    result[match[1].toLowerCase()] = unquote(match[2]);
  }
  return result;
};

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return undefined;
};

/**
 * Parse optional YAML front matter into deck presentation metadata.
 *
 * Supported keys: title, author, date, shortTitle / short-title,
 * theme, footer / paginate.
 */
export const parseSlidesDeckMeta = (
  source: string,
): { meta: SlidesDeckMeta; body: string; bodyStartLine: number } => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    const stripped = stripYamlFrontMatter(source);
    return { meta: {}, body: stripped.body, bodyStartLine: stripped.bodyStartLine };
  }

  const map = parseYamlScalarMap(match[1]);
  const themeRaw = map.theme;
  const footerRaw = parseBoolean(map.footer ?? map.paginate);
  const titlePageRaw = parseBoolean(map.titlepage ?? map["title-page"]);

  const meta: SlidesDeckMeta = {
    title: map.title || undefined,
    author: map.author || undefined,
    date: map.date || undefined,
    shortTitle: map.shorttitle || map["short-title"] || map.title || undefined,
    theme: themeRaw && isSlidesTheme(themeRaw) ? themeRaw : undefined,
    footer: footerRaw,
    titlePage: titlePageRaw,
  };

  const bodyStartLine = (match[0].match(/\n/g) ?? []).length;
  return {
    meta,
    body: source.slice(match[0].length),
    bodyStartLine,
  };
};

export const buildTitleSlideMarkdown = (meta: SlidesDeckMeta): string => {
  const lines: string[] = ["<!-- _class: title -->", ""];
  if (meta.title) {
    lines.push(`# ${meta.title}`, "");
  }
  if (meta.author) {
    lines.push(`**${meta.author}**`, "");
  }
  if (meta.date) {
    lines.push(meta.date, "");
  }
  return lines.join("\n").trim();
};

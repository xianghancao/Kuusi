/**
 * Code block appearance: language-inspired syntax palettes + monospace fonts.
 * Token colors ride JupyterLab's `--jp-mirror-editor-*` variables (CodeMirror
 * highlight spans). The highlight StyleModule must be mounted once so those
 * spans actually receive color rules in Markdown / Article views.
 */

import { jupyterHighlightStyle } from "@jupyterlab/codemirror";
import { StyleModule } from "style-mod";

import {
  MIND_MAP_FONT_SIZE_REM,
  type MindMapFontSize,
} from "./fontToolbar";

export type CodeTheme =
  | "notebook"
  | "python"
  | "javascript"
  | "r"
  | "julia"
  | "sql"
  | "rust"
  | "matlab"
  | "shell";

export type CodeFont =
  | "mono"
  | "menlo"
  | "consolas"
  | "monaco"
  | "source-code-pro"
  | "fira-code"
  | "jetbrains-mono"
  | "cascadia";

export type CodeThemeColors = {
  /** Base text inside code blocks when a token has no style. */
  foreground: string;
  keyword: string;
  atom: string;
  number: string;
  def: string;
  builtin: string;
  variable: string;
  variable2: string;
  punctuation: string;
  property: string;
  operator: string;
  comment: string;
  string: string;
  string2: string;
  bracket: string;
  tag: string;
  attribute: string;
  meta: string;
  header: string;
  quote: string;
  link: string;
};

export const CODE_THEMES: readonly CodeTheme[] = [
  "notebook",
  "python",
  "javascript",
  "r",
  "julia",
  "sql",
  "rust",
  "matlab",
  "shell",
] as const;

/** Follow JupyterLab theme token colors (no Kuusi palette override). */
export const DEFAULT_CODE_THEME: CodeTheme = "notebook";
export const DEFAULT_CODE_FONT: CodeFont = "mono";
export const DEFAULT_CODE_FONT_SIZE: MindMapFontSize = "xs";

const CODE_THEME_SET = new Set<string>(CODE_THEMES);

export const isCodeTheme = (value: unknown): value is CodeTheme =>
  typeof value === "string" && CODE_THEME_SET.has(value);

export type CodeFontOption = {
  value: CodeFont;
  label: string;
  title: string;
  previewFamily: string;
};

export const CODE_FONT_OPTIONS: CodeFontOption[] = [
  {
    value: "mono",
    label: "Mono",
    title: "System / Jupyter monospace",
    previewFamily: "var(--jp-code-font-family, ui-monospace, monospace)",
  },
  {
    value: "menlo",
    label: "Menlo",
    title: "Menlo / Monaco stack",
    previewFamily: 'Menlo, Monaco, "Courier New", monospace',
  },
  {
    value: "consolas",
    label: "Consolas",
    title: "Consolas / Cascadia",
    previewFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
  },
  {
    value: "monaco",
    label: "Monaco",
    title: "Monaco",
    previewFamily: "Monaco, Menlo, monospace",
  },
  {
    value: "source-code-pro",
    label: "Source Code",
    title: "Source Code Pro",
    previewFamily: '"Source Code Pro", "SF Mono", Menlo, monospace',
  },
  {
    value: "fira-code",
    label: "Fira Code",
    title: "Fira Code",
    previewFamily: '"Fira Code", "SF Mono", Menlo, monospace',
  },
  {
    value: "jetbrains-mono",
    label: "JetBrains",
    title: "JetBrains Mono",
    previewFamily: '"JetBrains Mono", Menlo, monospace',
  },
  {
    value: "cascadia",
    label: "Cascadia",
    title: "Cascadia Mono",
    previewFamily: '"Cascadia Mono", Consolas, monospace',
  },
];

const CODE_FONT_SET = new Set<string>(
  CODE_FONT_OPTIONS.map((option) => option.value),
);

export const isCodeFont = (value: unknown): value is CodeFont =>
  typeof value === "string" && CODE_FONT_SET.has(value);

export const codeFontFamilyCss = (font: CodeFont): string =>
  CODE_FONT_OPTIONS.find((option) => option.value === font)?.previewFamily ??
  CODE_FONT_OPTIONS[0].previewFamily;

export const codeFontSizeCss = (size: MindMapFontSize): string =>
  MIND_MAP_FONT_SIZE_REM[size];

/** Language-inspired token palettes (readable on light paper). */
export const CODE_THEME_COLORS: Record<
  Exclude<CodeTheme, "notebook">,
  CodeThemeColors
> = {
  python: {
    foreground: "#1f2933",
    keyword: "#0550ae",
    atom: "#953800",
    number: "#0550ae",
    def: "#8250df",
    builtin: "#cf222e",
    variable: "#1f2328",
    variable2: "#953800",
    punctuation: "#6e7781",
    property: "#0550ae",
    operator: "#cf222e",
    comment: "#6a737d",
    string: "#0a3069",
    string2: "#0a3069",
    bracket: "#1f2328",
    tag: "#116329",
    attribute: "#953800",
    meta: "#6a737d",
    header: "#0550ae",
    quote: "#116329",
    link: "#0969da",
  },
  javascript: {
    foreground: "#24292f",
    keyword: "#cf222e",
    atom: "#0550ae",
    number: "#0550ae",
    def: "#8250df",
    builtin: "#953800",
    variable: "#24292f",
    variable2: "#953800",
    punctuation: "#6e7781",
    property: "#0550ae",
    operator: "#cf222e",
    comment: "#6a737d",
    string: "#0a3069",
    string2: "#0a3069",
    bracket: "#24292f",
    tag: "#116329",
    attribute: "#953800",
    meta: "#6a737d",
    header: "#cf222e",
    quote: "#116329",
    link: "#0969da",
  },
  r: {
    foreground: "#1b1f23",
    keyword: "#0031b3",
    atom: "#5c2d91",
    number: "#098658",
    def: "#267f99",
    builtin: "#0451a5",
    variable: "#1b1f23",
    variable2: "#001080",
    punctuation: "#5c6370",
    property: "#0451a5",
    operator: "#0031b3",
    comment: "#008000",
    string: "#a31515",
    string2: "#a31515",
    bracket: "#1b1f23",
    tag: "#800000",
    attribute: "#0451a5",
    meta: "#5c6370",
    header: "#0031b3",
    quote: "#008000",
    link: "#0000ee",
  },
  julia: {
    foreground: "#2b2b2b",
    keyword: "#a8224a",
    atom: "#9558b2",
    number: "#4063d8",
    def: "#389826",
    builtin: "#9558b2",
    variable: "#2b2b2b",
    variable2: "#cb3c33",
    punctuation: "#6e6a86",
    property: "#4063d8",
    operator: "#cb3c33",
    comment: "#6e6a86",
    string: "#389826",
    string2: "#389826",
    bracket: "#2b2b2b",
    tag: "#9558b2",
    attribute: "#4063d8",
    meta: "#6e6a86",
    header: "#a8224a",
    quote: "#389826",
    link: "#4063d8",
  },
  sql: {
    foreground: "#1f2328",
    keyword: "#0000ff",
    atom: "#098658",
    number: "#098658",
    def: "#795e26",
    builtin: "#0000ff",
    variable: "#001080",
    variable2: "#001080",
    punctuation: "#5c6370",
    property: "#001080",
    operator: "#0000ff",
    comment: "#008000",
    string: "#a31515",
    string2: "#a31515",
    bracket: "#1f2328",
    tag: "#800000",
    attribute: "#0451a5",
    meta: "#5c6370",
    header: "#0000ff",
    quote: "#008000",
    link: "#0000ee",
  },
  rust: {
    foreground: "#1c1917",
    keyword: "#b45309",
    atom: "#9a3412",
    number: "#1d4ed8",
    def: "#7c3aed",
    builtin: "#b45309",
    variable: "#1c1917",
    variable2: "#9a3412",
    punctuation: "#78716c",
    property: "#1d4ed8",
    operator: "#b45309",
    comment: "#78716c",
    string: "#15803d",
    string2: "#15803d",
    bracket: "#1c1917",
    tag: "#9a3412",
    attribute: "#1d4ed8",
    meta: "#78716c",
    header: "#b45309",
    quote: "#15803d",
    link: "#1d4ed8",
  },
  matlab: {
    foreground: "#1b1b1b",
    keyword: "#0000ff",
    atom: "#a020f0",
    number: "#800080",
    def: "#0000ff",
    builtin: "#ff00ff",
    variable: "#1b1b1b",
    variable2: "#a0522d",
    punctuation: "#666666",
    property: "#0000ff",
    operator: "#0000ff",
    comment: "#228b22",
    string: "#a020f0",
    string2: "#a020f0",
    bracket: "#1b1b1b",
    tag: "#800000",
    attribute: "#a0522d",
    meta: "#666666",
    header: "#0000ff",
    quote: "#228b22",
    link: "#0000ee",
  },
  shell: {
    foreground: "#1f2933",
    keyword: "#0f766e",
    atom: "#b45309",
    number: "#1d4ed8",
    def: "#7c3aed",
    builtin: "#0f766e",
    variable: "#1f2933",
    variable2: "#b45309",
    punctuation: "#64748b",
    property: "#1d4ed8",
    operator: "#0f766e",
    comment: "#64748b",
    string: "#15803d",
    string2: "#15803d",
    bracket: "#1f2933",
    tag: "#0f766e",
    attribute: "#b45309",
    meta: "#64748b",
    header: "#0f766e",
    quote: "#15803d",
    link: "#1d4ed8",
  },
};

/** Mirror CSS vars we stamp (and clear for notebook). */
const MIRROR_CSS_VARS = [
  "--jp-mirror-editor-keyword-color",
  "--jp-mirror-editor-atom-color",
  "--jp-mirror-editor-number-color",
  "--jp-mirror-editor-def-color",
  "--jp-mirror-editor-builtin-color",
  "--jp-mirror-editor-variable-color",
  "--jp-mirror-editor-variable-2-color",
  "--jp-mirror-editor-punctuation-color",
  "--jp-mirror-editor-property-color",
  "--jp-mirror-editor-operator-color",
  "--jp-mirror-editor-comment-color",
  "--jp-mirror-editor-string-color",
  "--jp-mirror-editor-string-2-color",
  "--jp-mirror-editor-bracket-color",
  "--jp-mirror-editor-tag-color",
  "--jp-mirror-editor-attribute-color",
  "--jp-mirror-editor-meta-color",
  "--jp-mirror-editor-header-color",
  "--jp-mirror-editor-quote-color",
  "--jp-mirror-editor-link-color",
] as const;

const THEME_VAR_MAP: Array<[keyof CodeThemeColors, string]> = [
  ["keyword", "--jp-mirror-editor-keyword-color"],
  ["atom", "--jp-mirror-editor-atom-color"],
  ["number", "--jp-mirror-editor-number-color"],
  ["def", "--jp-mirror-editor-def-color"],
  ["builtin", "--jp-mirror-editor-builtin-color"],
  ["variable", "--jp-mirror-editor-variable-color"],
  ["variable2", "--jp-mirror-editor-variable-2-color"],
  ["punctuation", "--jp-mirror-editor-punctuation-color"],
  ["property", "--jp-mirror-editor-property-color"],
  ["operator", "--jp-mirror-editor-operator-color"],
  ["comment", "--jp-mirror-editor-comment-color"],
  ["string", "--jp-mirror-editor-string-color"],
  ["string2", "--jp-mirror-editor-string-2-color"],
  ["bracket", "--jp-mirror-editor-bracket-color"],
  ["tag", "--jp-mirror-editor-tag-color"],
  ["attribute", "--jp-mirror-editor-attribute-color"],
  ["meta", "--jp-mirror-editor-meta-color"],
  ["header", "--jp-mirror-editor-header-color"],
  ["quote", "--jp-mirror-editor-quote-color"],
  ["link", "--jp-mirror-editor-link-color"],
];

let highlightStylesMounted = false;

/**
 * Mount Lab's CM6 highlight StyleModule once so Markdown fence spans
 * (from highlightTree) actually get token colors. Editors mount this
 * themselves; Article/Book may never open a CM editor.
 */
export const ensureCodeHighlightStyles = (): void => {
  if (highlightStylesMounted || typeof document === "undefined") {
    return;
  }
  // Set first so a throw / re-entry cannot loop.
  highlightStylesMounted = true;

  try {
    const mod = jupyterHighlightStyle.module;
    if (mod) {
      StyleModule.mount(document, mod);
    }
  } catch (error) {
    console.warn("jupyterlab-kuusi: code highlight styles unavailable", error);
  }
};

const clearMirrorOverrides = (host: HTMLElement): void => {
  host.style.removeProperty("--kuusi-code-fg");
  for (const cssVar of MIRROR_CSS_VARS) {
    host.style.removeProperty(cssVar);
  }
};

/** Stamp syntax palette + monospace face onto a render host. */
export const applyCodeAppearance = (
  host: HTMLElement,
  settings: {
    codeTheme: CodeTheme;
    codeFont: CodeFont;
    codeFontSize: MindMapFontSize;
  },
  datasetKey:
    | "kuusiArticleCodeTheme"
    | "kuusiSlidesCodeTheme"
    | "kuusiCodeTheme" = "kuusiCodeTheme",
): void => {
  ensureCodeHighlightStyles();

  host.dataset[datasetKey] = settings.codeTheme;
  host.style.setProperty(
    "--kuusi-code-font-family",
    codeFontFamilyCss(settings.codeFont),
  );
  host.style.setProperty(
    "--kuusi-code-font-size",
    codeFontSizeCss(settings.codeFontSize),
  );

  if (settings.codeTheme === "notebook") {
    clearMirrorOverrides(host);
    // Match classic Lab rendered / notebook code cells: theme tokens + Lab face.
    host.style.setProperty(
      "--kuusi-code-fg",
      "var(--jp-content-font-color1)",
    );
    host.style.setProperty(
      "--kuusi-code-font-family",
      settings.codeFont === "mono"
        ? "var(--jp-code-font-family, ui-monospace, monospace)"
        : codeFontFamilyCss(settings.codeFont),
    );
    host.style.setProperty(
      "--kuusi-code-font-size",
      settings.codeFontSize === DEFAULT_CODE_FONT_SIZE
        ? "var(--jp-code-font-size, 13px)"
        : codeFontSizeCss(settings.codeFontSize),
    );
    return;
  }

  const colors = CODE_THEME_COLORS[settings.codeTheme];
  host.style.setProperty("--kuusi-code-fg", colors.foreground);
  for (const [key, cssVar] of THEME_VAR_MAP) {
    host.style.setProperty(cssVar, colors[key]);
  }
};

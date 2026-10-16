/**
 * Table appearance for Markdown/HTML tables in Article, Book, Slides, Mind Map.
 * Presets lean on Word table styles and LaTeX booktabs / ruled tables.
 */

export type TableStyle =
  | "plain"
  | "grid"
  | "lines"
  | "banded"
  | "booktabs"
  | "ruled";

export const TABLE_STYLES: readonly TableStyle[] = [
  "plain",
  "grid",
  "lines",
  "banded",
  "booktabs",
  "ruled",
] as const;

export const DEFAULT_TABLE_STYLE: TableStyle = "booktabs";
/** Word-like hairline; LaTeX booktabs often ~0.08em ≈ 0.8–1pt. */
export const DEFAULT_TABLE_BORDER_WIDTH = 0.75;

export const TABLE_BORDER_RANGE = { min: 0.25, max: 3, step: 0.25 } as const;

/** 0 keeps the theme's opaque row fills, 100 lets the page show through. */
export const DEFAULT_TABLE_TRANSPARENCY = 100;
export const TABLE_TRANSPARENCY_RANGE = { min: 0, max: 100, step: 5 } as const;

const TABLE_STYLE_SET = new Set<string>(TABLE_STYLES);

export const isTableStyle = (value: unknown): value is TableStyle =>
  typeof value === "string" && TABLE_STYLE_SET.has(value);

/** Header text alignment; auto keeps the table style's own (centered header row). */
export type TableAlign = "auto" | "left" | "center" | "right";

export const TABLE_ALIGNS: readonly TableAlign[] = [
  "auto",
  "left",
  "center",
  "right",
];

export const isTableAlign = (value: unknown): value is TableAlign =>
  typeof value === "string" && (TABLE_ALIGNS as readonly string[]).includes(value);

/** Column sizing: auto fits each column to its content, equal gives every column the same width. */
export type TableColumnWidth = "auto" | "equal";

export const TABLE_COLUMN_WIDTHS: readonly TableColumnWidth[] = [
  "auto",
  "equal",
];

export const isTableColumnWidth = (value: unknown): value is TableColumnWidth =>
  typeof value === "string" &&
  (TABLE_COLUMN_WIDTHS as readonly string[]).includes(value);

export type TableAppearanceSettings = {
  tableStyle: TableStyle;
  /** Rule / grid stroke in pt. */
  tableBorderWidth: number;
  /** Table cell fill transparency in percent (100 = see-through). */
  tableTransparency: number;
  tableHeaderRowBold: boolean;
  tableHeaderColumnBold: boolean;
  tableHeaderRowAlign: TableAlign;
  tableHeaderColumnAlign: TableAlign;
  tableColumnWidth: TableColumnWidth;
};

export const DEFAULT_TABLE_APPEARANCE: TableAppearanceSettings = {
  tableStyle: DEFAULT_TABLE_STYLE,
  tableBorderWidth: DEFAULT_TABLE_BORDER_WIDTH,
  tableTransparency: DEFAULT_TABLE_TRANSPARENCY,
  tableHeaderRowBold: true,
  tableHeaderColumnBold: false,
  tableHeaderRowAlign: "auto",
  tableHeaderColumnAlign: "auto",
  tableColumnWidth: "auto",
};

/** Stamp table palette onto a render host (shared data attrs for one CSS file). */
export const applyTableAppearance = (
  host: HTMLElement,
  settings: TableAppearanceSettings,
): void => {
  host.dataset.kuusiTableStyle = settings.tableStyle;
  host.dataset.kuusiTableHeaderRowBold = settings.tableHeaderRowBold
    ? "1"
    : "0";
  host.dataset.kuusiTableHeaderColBold = settings.tableHeaderColumnBold
    ? "1"
    : "0";
  host.dataset.kuusiTableHeaderRowAlign = settings.tableHeaderRowAlign;
  host.dataset.kuusiTableHeaderColAlign = settings.tableHeaderColumnAlign;
  host.dataset.kuusiTableColumns = settings.tableColumnWidth;
  host.style.setProperty(
    "--kuusi-table-fill",
    `${100 - settings.tableTransparency}%`,
  );
  host.style.setProperty(
    "--kuusi-table-border-width",
    `${settings.tableBorderWidth}pt`,
  );
};

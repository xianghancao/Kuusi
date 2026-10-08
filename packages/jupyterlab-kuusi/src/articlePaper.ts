/** Physical paper sizes for the paged Article layout (portrait, millimetres). */
export type ArticlePaperSize = "a4" | "a3" | "a5" | "b5" | "letter" | "legal";
export type ArticlePaperOrientation = "portrait" | "landscape";

export const ARTICLE_PAPER_SIZES: Record<
  ArticlePaperSize,
  { widthMm: number; heightMm: number; cssName: string }
> = {
  a4: { widthMm: 210, heightMm: 297, cssName: "A4" },
  a3: { widthMm: 297, heightMm: 420, cssName: "A3" },
  a5: { widthMm: 148, heightMm: 210, cssName: "A5" },
  b5: { widthMm: 176, heightMm: 250, cssName: "B5" },
  letter: { widthMm: 215.9, heightMm: 279.4, cssName: "letter" },
  legal: { widthMm: 215.9, heightMm: 355.6, cssName: "legal" },
};

export const isPaperSize = (value: unknown): value is ArticlePaperSize =>
  typeof value === "string" && value in ARTICLE_PAPER_SIZES;

export const paperDimensions = (
  size: string | null | undefined,
  orientation: string | null | undefined,
): { widthMm: number; heightMm: number; cssName: string } => {
  const spec = isPaperSize(size) ? ARTICLE_PAPER_SIZES[size] : ARTICLE_PAPER_SIZES.a4;

  return orientation === "landscape"
    ? { widthMm: spec.heightMm, heightMm: spec.widthMm, cssName: spec.cssName }
    : { ...spec };
};

const MM_PER_IN = 25.4;
export const mmToPt = (mm: number): number => (mm / MM_PER_IN) * 72;

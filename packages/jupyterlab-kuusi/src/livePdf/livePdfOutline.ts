import type * as pdfjs from "pdfjs-dist";

export type PdfOutlineEntry = {
  title: string;
  page: number;
  items: PdfOutlineEntry[];
};

type OutlineNode = {
  title: string;
  dest: string | unknown[] | null;
  items?: OutlineNode[];
};

const resolveOutlinePage = async (
  pdf: pdfjs.PDFDocumentProxy,
  dest: string | unknown[] | null,
): Promise<number | null> => {
  if (!dest) {
    return null;
  }

  try {
    let explicitDest = dest;

    if (typeof dest === "string") {
      const namedDest = await pdf.getDestination(dest);

      if (!namedDest) {
        return null;
      }

      explicitDest = namedDest;
    }

    if (!Array.isArray(explicitDest) || explicitDest.length === 0) {
      return null;
    }

    const pageIndex = await pdf.getPageIndex(
      explicitDest[0] as Parameters<typeof pdf.getPageIndex>[0],
    );

    return pageIndex + 1;
  } catch {
    return null;
  }
};

const buildOutlineLevel = async (
  pdf: pdfjs.PDFDocumentProxy,
  items: OutlineNode[],
): Promise<PdfOutlineEntry[]> => {
  const entries: PdfOutlineEntry[] = [];

  for (const item of items) {
    const page = (await resolveOutlinePage(pdf, item.dest)) ?? 1;
    const children = item.items?.length
      ? await buildOutlineLevel(pdf, item.items)
      : [];

    entries.push({
      title: item.title?.trim() || "Untitled",
      page,
      items: children,
    });
  }

  return entries;
};

export const buildPdfOutline = async (
  pdf: pdfjs.PDFDocumentProxy,
): Promise<PdfOutlineEntry[]> => {
  const outline = await pdf.getOutline();

  if (!outline?.length) {
    return [];
  }

  return buildOutlineLevel(pdf, outline as OutlineNode[]);
};

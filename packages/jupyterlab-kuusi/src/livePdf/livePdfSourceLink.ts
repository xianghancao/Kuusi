const pdfToTexSource = new Map<string, string>();

export const linkPdfToTexSource = (pdfPath: string, texPath: string): void => {
  pdfToTexSource.set(pdfPath, texPath);
};

export const takePdfSourceLink = (pdfPath: string): boolean => {
  const linked = pdfToTexSource.has(pdfPath);
  pdfToTexSource.delete(pdfPath);
  return linked;
};

export const clearPdfSourceLink = (pdfPath: string): void => {
  pdfToTexSource.delete(pdfPath);
};

export const getPdfTexSource = (pdfPath: string): string | null =>
  pdfToTexSource.get(pdfPath) ?? null;

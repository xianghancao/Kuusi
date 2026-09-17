import type { IDocumentManager } from "@jupyterlab/docmanager";

/** Smallest valid single-page PDF (blank letter-sized page). */
const MINIMAL_PDF_BYTES = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
149
%%EOF`;

const encodePdfAsBase64 = (pdf: string): string => {
  const bytes = new TextEncoder().encode(pdf);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }

  return btoa(binary);
};

/** Create an untitled PDF seeded with a blank page for Kuusi Live PDF. */
export const createKuusiLivePdfFile = async (
  docManager: IDocumentManager,
  directory: string,
): Promise<string> => {
  const created = await docManager.newUntitled({
    path: directory,
    type: "file",
    ext: ".pdf",
  });

  await docManager.services.contents.save(created.path, {
    type: "file",
    format: "base64",
    content: encodePdfAsBase64(MINIMAL_PDF_BYTES),
  });

  return created.path;
};

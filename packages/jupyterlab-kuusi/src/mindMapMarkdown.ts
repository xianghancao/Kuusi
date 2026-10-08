import type { IDocumentManager } from "@jupyterlab/docmanager";

import { buildNewMarkdownMindMapContent } from "./markdownMindMapWidget";

/** Create a `.md` file seeded for Kuusi and return its path. */
export const createKuusiMindMapMarkdown = async (
  docManager: IDocumentManager,
  directory: string,
): Promise<string> => {
  const created = await docManager.newUntitled({
    path: directory,
    type: "file",
    ext: ".md",
  });

  await docManager.services.contents.save(created.path, {
    type: "file",
    format: "text",
    content: buildNewMarkdownMindMapContent(),
  });

  return created.path;
};

import type { IDocumentManager } from "@jupyterlab/docmanager";
import type { PartialJSONValue } from "@lumino/coreutils";

/** Default H1 root for new Kuusi mind maps. */
export const MIND_MAP_ROOT_CELL_SOURCE = "# Root Node\n";

export const buildNewMindMapNotebookContent = (): PartialJSONValue => ({
  cells: [
    {
      cell_type: "markdown",
      metadata: {},
      source: MIND_MAP_ROOT_CELL_SOURCE,
    },
  ],
  metadata: {
    kernelspec: {
      name: "",
      display_name: "",
    },
    language_info: {
      name: "",
    },
  },
  nbformat: 4,
  nbformat_minor: 5,
});

/** Create an untitled notebook seeded for Kuusi mind map (no kernel, H1 root). */
export const createKuusiMindMapNotebook = async (
  docManager: IDocumentManager,
  directory: string,
): Promise<string> => {
  const created = await docManager.newUntitled({
    path: directory,
    type: "notebook",
  });

  await docManager.services.contents.save(created.path, {
    type: "notebook",
    format: "json",
    content: buildNewMindMapNotebookContent(),
  });

  return created.path;
};

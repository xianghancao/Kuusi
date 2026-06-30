import { createDefaultSheetViewState, emptyDoc, rootId } from "./mindmap";
import type { JSONContent, MindMapSheet, MindNode, SheetViewState } from "./types";

export const LUMEN_NOTEBOOK_METADATA_KEY = "lumen";

export type NotebookCell = {
  cell_type: "code" | "markdown" | "raw";
  source: string | string[];
  metadata?: Record<string, unknown>;
};

export type NotebookContent = {
  nbformat?: number;
  nbformat_minor?: number;
  metadata?: Record<string, unknown>;
  cells: NotebookCell[];
};

export type LumenCellMetadata = {
  node_id?: string;
  parent_id?: string | null;
};

const joinCellSource = (source: string | string[]) =>
  Array.isArray(source) ? source.join("") : source;

const getCellMetadata = (cell: NotebookCell): LumenCellMetadata => {
  const lumen = cell.metadata?.[LUMEN_NOTEBOOK_METADATA_KEY];

  if (!lumen || typeof lumen !== "object") {
    return {};
  }

  const record = lumen as Record<string, unknown>;

  return {
    node_id: typeof record.node_id === "string" ? record.node_id : undefined,
    parent_id:
      record.parent_id === null || typeof record.parent_id === "string"
        ? record.parent_id
        : undefined,
  };
};

const markdownCellToContent = (source: string): JSONContent => ({
  type: "doc",
  content: source.trim()
    ? [{ type: "paragraph", content: [{ type: "text", text: source.trim() }] }]
    : [{ type: "paragraph" }],
});

/**
 * MVP adapter: each notebook cell becomes a direct child of the root node.
 * Structured metadata round-trips will be added in a follow-up iteration.
 */
export const notebookToMindMapSheet = (
  notebook: NotebookContent,
  title = "Imported Notebook",
): { sheet: MindMapSheet; viewState: SheetViewState } => {
  const nodes: Record<string, MindNode> = {
    [rootId]: {
      id: rootId,
      content: emptyDoc(title),
      children: [],
      parent: null,
    },
  };
  let nextIndex = 2;
  const childIds: string[] = [];

  notebook.cells.forEach((cell, cellIndex) => {
    const metadata = getCellMetadata(cell);
    const id = metadata.node_id ?? `node-${nextIndex}`;
    nextIndex = Math.max(nextIndex, Number(id.replace("node-", "")) + 1);
    const source = joinCellSource(cell.source).trim();
    const label =
      source.split("\n").find((line) => line.trim())?.trim() ||
      `${cell.cell_type} cell ${cellIndex + 1}`;

    let content: JSONContent;

    if (cell.cell_type === "markdown") {
      content = markdownCellToContent(source || label);
    } else if (cell.cell_type === "code") {
      content = {
        type: "doc",
        content: [
          {
            type: "codeBlock",
            attrs: { language: "python" },
            content: source ? [{ type: "text", text: source }] : undefined,
          },
        ],
      };
    } else {
      content = markdownCellToContent(source || label);
    }

    nodes[id] = {
      id,
      content,
      children: [],
      parent: rootId,
    };
    childIds.push(id);
  });

  nodes[rootId] = {
    ...nodes[rootId],
    children: childIds,
  };

  const sheet: MindMapSheet = {
    id: "sheet-1",
    title,
    root_id: rootId,
    nodes,
  };

  return {
    sheet,
    viewState: createDefaultSheetViewState(nodes),
  };
};

export const mindMapSheetToNotebook = (
  sheet: MindMapSheet,
  viewState?: SheetViewState,
): NotebookContent => {
  const visit = (nodeId: string): NotebookCell[] => {
    const node = sheet.nodes[nodeId];

    if (!node) {
      return [];
    }

    const cells: NotebookCell[] = [];

    if (node.parent !== null) {
      const firstLine =
        node.content.content?.[0]?.content?.[0]?.text?.split("\n")[0]?.trim() ||
        "Untitled node";

      const isCodeBlock = node.content.content?.some(
        (block) => block.type === "codeBlock",
      );

      cells.push({
        cell_type: isCodeBlock ? "code" : "markdown",
        metadata: {
          [LUMEN_NOTEBOOK_METADATA_KEY]: {
            node_id: node.id,
            parent_id: node.parent,
          },
        },
        source: isCodeBlock
          ? [
              (node.content.content?.find((block) => block.type === "codeBlock")
                ?.content?.[0]?.text as string | undefined) ?? "",
            ]
          : [firstLine],
      });
    }

    node.children.forEach((childId) => {
      cells.push(...visit(childId));
    });

    return cells;
  };

  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      [LUMEN_NOTEBOOK_METADATA_KEY]: {
        root_id: sheet.root_id,
        viewState: viewState ?? null,
      },
    },
    cells: visit(sheet.root_id),
  };
};

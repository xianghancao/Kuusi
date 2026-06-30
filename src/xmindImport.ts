import JSZip from "jszip";
import { applyTreeLayout, emptyDoc, rootId } from "./mindmap";
import type { MindMapSheet, MindNode, SheetViewState } from "./types";

const MAX_SHEETS = 20;

type XMindTopic = {
  id?: string;
  title?: string;
  children?: {
    attached?: XMindTopic[];
  };
};

type XMindSheet = {
  rootTopic?: XMindTopic;
  title?: string;
};

const getSheets = (content: unknown): XMindSheet[] => {
  if (Array.isArray(content)) {
    return content as XMindSheet[];
  }

  if (content && typeof content === "object" && "sheets" in content) {
    const sheets = (content as { sheets?: unknown }).sheets;

    if (Array.isArray(sheets)) {
      return sheets as XMindSheet[];
    }
  }

  return [content as XMindSheet];
};

const topicTitle = (topic: XMindTopic, fallback: string) => {
  const title = topic.title?.trim();

  return title || fallback;
};

export const importXMindFile = async (
  file: File,
): Promise<{
  sheets: MindMapSheet[];
  viewState: Record<string, SheetViewState>;
}> => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const contentFile = zip.file("content.json");

  if (!contentFile) {
    throw new Error("Only newer XMind files with content.json are supported");
  }

  const content = JSON.parse(await contentFile.async("text")) as unknown;
  const sourceSheets = getSheets(content)
    .filter((sheet) => sheet.rootTopic)
    .slice(0, MAX_SHEETS);

  if (!sourceSheets.length) {
    throw new Error("XMind file does not contain a root topic");
  }

  const viewState: Record<string, SheetViewState> = {};
  const sheets: MindMapSheet[] = sourceSheets.map((sheet, sheetIndex) => {
    const nodes: Record<string, MindNode> = {};
    let nextIndex = 1;

    const convertTopic = (topic: XMindTopic, parent: string | null): string => {
      const id = `node-${nextIndex}`;
      nextIndex += 1;

      const children = topic.children?.attached ?? [];
      const childIds = children.map((child) => convertTopic(child, id));

      nodes[id] = {
        id,
        content: emptyDoc(topicTitle(topic, "Untitled")),
        children: childIds,
        parent,
      };

      return id;
    };

    convertTopic(sheet.rootTopic!, null);

    const sheetId = `sheet-${sheetIndex + 1}`;
    const nodeViewState = applyTreeLayout(
      nodes,
      Object.fromEntries(
        Object.keys(nodes).map((id) => [id, { position: { x: 0, y: 0 } }]),
      ),
    );

    viewState[sheetId] = {
      layoutSpacing: "standard",
      nodes: nodeViewState,
    };

    return {
      id: sheetId,
      title:
        sheet.title?.trim() ||
        sheet.rootTopic?.title?.trim() ||
        `Sheet ${sheetIndex + 1}`,
      root_id: rootId,
      nodes,
    };
  });

  return { sheets, viewState };
};

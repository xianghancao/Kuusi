import {
  applyTreeLayout,
  createBlankNodes,
  createDefaultSheetViewState,
  rootId,
} from "./mindmap";
import type {
  LayoutSpacing,
  MindMapFile,
  MindMapSheet,
  MindNode,
  NodeViewState,
  SheetViewState,
} from "./types";

export const MAX_SHEETS = 20;
export const LUMEN_FILE_EXTENSIONS = [".lumen.json", ".mindmap.json"] as const;

type LegacyMindNode = MindNode & {
  position?: { x: number; y: number };
  dimensions?: { width: number; height: number };
  collapsed?: boolean;
};

const splitNodesAndViewState = (
  nodes: Record<string, LegacyMindNode>,
  layoutSpacing: LayoutSpacing = "standard",
  root = rootId,
): { nodes: Record<string, MindNode>; viewState: SheetViewState } => {
  const nextNodes: Record<string, MindNode> = {};
  const viewNodes: Record<string, NodeViewState> = {};

  Object.entries(nodes).forEach(([id, node]) => {
    nextNodes[id] = {
      id: node.id,
      content: node.content,
      children: node.children,
      parent: node.parent,
    };
    viewNodes[id] = {
      position:
        node.position ?? (id === root ? { x: 120, y: 120 } : { x: 0, y: 0 }),
      dimensions: node.dimensions,
      collapsed: node.collapsed,
    };
  });

  return {
    nodes: nextNodes,
    viewState: {
      layoutSpacing,
      nodes: viewNodes,
    },
  };
};

const assertSingleRoot = (nodes: Record<string, MindNode>, root: string) => {
  const rootNodes = Object.values(nodes).filter((node) => node.parent === null);

  if (rootNodes.length !== 1 || rootNodes[0]?.id !== root) {
    throw new Error("Mind map must contain exactly one root node");
  }
};

export const createMindMapFile = (
  sheets: MindMapSheet[],
  activeSheetId: string,
  viewState: Record<string, SheetViewState>,
): MindMapFile => ({
  version: "1.1",
  active_sheet_id: activeSheetId,
  sheets,
  viewState,
});

export const createEmptyMindMapFile = (
  title = "Sheet 1",
): {
  file: MindMapFile;
  activeSheetId: string;
  viewState: Record<string, SheetViewState>;
} => {
  const nodes = createBlankNodes();
  const sheet: MindMapSheet = {
    id: "sheet-1",
    title,
    root_id: rootId,
    nodes,
  };
  const viewState = {
    "sheet-1": createDefaultSheetViewState(nodes),
  };

  return {
    file: createMindMapFile([sheet], sheet.id, viewState),
    activeSheetId: sheet.id,
    viewState,
  };
};

export const parseMindMapFile = (
  text: string,
): {
  sheets: MindMapSheet[];
  activeSheetId: string;
  viewState: Record<string, SheetViewState>;
} => {
  const parsed = JSON.parse(text) as MindMapFile;

  if (parsed.version !== "1.0" && parsed.version !== "1.1") {
    throw new Error("Unsupported mindmap file");
  }

  if (Array.isArray(parsed.sheets) && parsed.sheets.length > 0) {
    const viewState: Record<string, SheetViewState> = {};
    const sheets = parsed.sheets.slice(0, MAX_SHEETS).map((sheet) => {
      const legacyNodes = sheet.nodes as Record<string, LegacyMindNode>;
      const migrated = splitNodesAndViewState(
        legacyNodes,
        parsed.viewState?.[sheet.id]?.layoutSpacing ?? "standard",
        sheet.root_id,
      );
      const savedViewState = parsed.viewState?.[sheet.id];
      const hasSavedCoordinates = Boolean(savedViewState?.nodes);
      const hasLegacyCoordinates = Object.values(legacyNodes).some((node) =>
        Boolean(node.position),
      );

      const nextViewState = {
        ...migrated.viewState,
        ...savedViewState,
        nodes: {
          ...migrated.viewState.nodes,
          ...savedViewState?.nodes,
        },
      };
      viewState[sheet.id] =
        hasSavedCoordinates || hasLegacyCoordinates
          ? nextViewState
          : {
              ...nextViewState,
              nodes: applyTreeLayout(
                migrated.nodes,
                nextViewState.nodes,
                sheet.root_id,
                nextViewState.layoutSpacing,
              ),
            };

      return {
        ...sheet,
        nodes: migrated.nodes,
      };
    });

    sheets.forEach((sheet) => assertSingleRoot(sheet.nodes, sheet.root_id));

    return {
      sheets,
      activeSheetId:
        sheets.find((sheet) => sheet.id === parsed.active_sheet_id)?.id ??
        sheets[0].id,
      viewState,
    };
  }

  if (parsed.nodes && parsed.root_id) {
    const legacyNodes = parsed.nodes as Record<string, LegacyMindNode>;
    const migrated = splitNodesAndViewState(legacyNodes, "standard", parsed.root_id);
    assertSingleRoot(migrated.nodes, parsed.root_id);
    const hasLegacyCoordinates = Object.values(legacyNodes).some((node) =>
      Boolean(node.position),
    );
    const viewState = hasLegacyCoordinates
      ? migrated.viewState
      : {
          ...migrated.viewState,
          nodes: applyTreeLayout(
            migrated.nodes,
            migrated.viewState.nodes,
            parsed.root_id,
            migrated.viewState.layoutSpacing,
          ),
        };

    return {
      sheets: [
        {
          id: "sheet-1",
          title: "Sheet 1",
          root_id: parsed.root_id,
          nodes: migrated.nodes,
        },
      ],
      activeSheetId: "sheet-1",
      viewState: {
        "sheet-1": viewState,
      },
    };
  }

  throw new Error("Unsupported mindmap file");
};

export const serializeMindMapFile = (
  sheets: MindMapSheet[],
  activeSheetId: string,
  viewState: Record<string, SheetViewState>,
  pretty = true,
): string =>
  JSON.stringify(
    createMindMapFile(sheets, activeSheetId, viewState),
    null,
    pretty ? 2 : 0,
  );

export const isLumenFilePath = (path: string) =>
  LUMEN_FILE_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension));

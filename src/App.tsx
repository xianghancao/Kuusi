import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  ViewportPortal,
  type Node,
  type NodeChange,
  type NodeTypes,
  useReactFlow,
} from "@xyflow/react";
import type { JSONContent } from "@tiptap/react";
import {
  isMarkdownLike,
  markdownToTiptapContent,
  MindMapNode,
  type MindMapNodeData,
} from "./MindMapNode";
import { RichContentView } from "./RichContentView";
import {
  applyTreeLayout,
  createInitialNodes,
  emptyDoc,
  getChildInsertPosition,
  getSiblingInsertPosition,
  getVisibleNodeIds,
  removeNodeAndDescendants,
  rootId,
  toFlowEdges,
  toFlowNodes,
} from "./mindmap";
import type {
  LayoutSpacing,
  MindMapFile,
  MindMapSheet,
  MindNode,
  NodeViewState,
  SheetViewState,
} from "./types";
import { importXMindFile } from "./xmindImport";

const MAX_SHEETS = 20;
const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 78;
const DRAG_INTENT_THRESHOLD = 10;
const SNAP_GUIDE_THRESHOLD = 30;

const layoutSpacingOptions: Array<{ value: LayoutSpacing; label: string }> = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "spacious", label: "Spacious" },
];

type ViewMode = "mindmap" | "document" | "outline";
type BackgroundTheme = "day" | "dark" | "paper";
type ViewDisplayFont = "sans" | "serif" | "mono";
type ViewDisplaySize = "small" | "medium" | "large";
type AlignmentMode = "snap" | "guide";

type AlignmentGuideState = {
  horizontal?: { y: number; x1: number; x2: number };
  snapBox?: { x: number; y: number; width: number; height: number };
  vertical?: { x: number; y1: number; y2: number };
};

type StructuralDropKind = "child" | "sibling-before" | "sibling-after";

type StructuralDropTarget = {
  distance: number;
  guides: AlignmentGuideState;
  kind: StructuralDropKind;
  parentId: string;
  previewPosition: { x: number; y: number };
  targetId: string;
};

type InternalClipboard = {
  markdown: string;
  nodes: Record<string, MindNode>;
  rootIds: string[];
};

type ViewDisplayPreferences = {
  documentBlocksAligned: boolean;
  font: ViewDisplayFont;
  size: ViewDisplaySize;
};

const backgroundThemeOptions: Array<{
  value: BackgroundTheme;
  label: string;
}> = [
  { value: "day", label: "Day" },
  { value: "dark", label: "Dark" },
  { value: "paper", label: "Paper" },
];

const viewDisplayFontOptions: Array<{
  value: ViewDisplayFont;
  label: string;
  family: string;
}> = [
  {
    value: "sans",
    label: "Sans",
    family:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    value: "serif",
    label: "Serif",
    family: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    value: "mono",
    label: "Mono",
    family:
      '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  },
];

const viewDisplaySizeOptions: Array<{
  value: ViewDisplaySize;
  label: string;
  baseSize: number;
  headingSize: number;
  metaSize: number;
  tableSize: number;
}> = [
  {
    value: "small",
    label: "Small",
    baseSize: 13,
    headingSize: 14,
    metaSize: 10,
    tableSize: 12,
  },
  {
    value: "medium",
    label: "Medium",
    baseSize: 15,
    headingSize: 16,
    metaSize: 12,
    tableSize: 14,
  },
  {
    value: "large",
    label: "Large",
    baseSize: 17,
    headingSize: 18,
    metaSize: 13,
    tableSize: 16,
  },
];

const defaultViewDisplayPreferences: ViewDisplayPreferences = {
  documentBlocksAligned: true,
  font: "sans",
  size: "medium",
};

const viewDisplayPreferenceStorageKey = "lumen.viewDisplayPreferences";
const autoSaveStorageKey = "lumen.autosave";

const isViewDisplayFont = (value: unknown): value is ViewDisplayFont =>
  viewDisplayFontOptions.some((option) => option.value === value);

const isViewDisplaySize = (value: unknown): value is ViewDisplaySize =>
  viewDisplaySizeOptions.some((option) => option.value === value);

const loadViewDisplayPreferences = (): ViewDisplayPreferences => {
  try {
    const rawPreferences = window.localStorage.getItem(
      viewDisplayPreferenceStorageKey,
    );

    if (!rawPreferences) {
      return defaultViewDisplayPreferences;
    }

    const parsed = JSON.parse(rawPreferences) as Partial<ViewDisplayPreferences>;
    const font = isViewDisplayFont(parsed.font)
      ? parsed.font
      : defaultViewDisplayPreferences.font;
    const size = isViewDisplaySize(parsed.size)
      ? parsed.size
      : defaultViewDisplayPreferences.size;
    const documentBlocksAligned =
      typeof parsed.documentBlocksAligned === "boolean"
        ? parsed.documentBlocksAligned
        : defaultViewDisplayPreferences.documentBlocksAligned;

    return { documentBlocksAligned, font, size };
  } catch {
    return defaultViewDisplayPreferences;
  }
};

const getLayoutSpacingLabel = (spacing: LayoutSpacing) =>
  layoutSpacingOptions.find((option) => option.value === spacing)?.label ??
  "Standard";

const getViewNodeDimensions = (viewNode?: NodeViewState) => ({
  height: viewNode?.dimensions?.height ?? DEFAULT_NODE_HEIGHT,
  width: viewNode?.dimensions?.width ?? DEFAULT_NODE_WIDTH,
});

const getViewNodeRect = (
  nodeId: string,
  viewState: Record<string, NodeViewState>,
  overridePosition?: { x: number; y: number },
) => {
  const viewNode = viewState[nodeId];
  const position = overridePosition ?? viewNode?.position ?? { x: 0, y: 0 };
  const dimensions = getViewNodeDimensions(viewNode);

  return {
    bottom: position.y + dimensions.height,
    centerX: position.x + dimensions.width / 2,
    centerY: position.y + dimensions.height / 2,
    height: dimensions.height,
    left: position.x,
    right: position.x + dimensions.width,
    top: position.y,
    width: dimensions.width,
  };
};

const isNodeInSubtree = (
  nodes: Record<string, MindNode>,
  ancestorId: string,
  candidateId: string,
) => {
  const toVisit = [ancestorId];

  for (let index = 0; index < toVisit.length; index += 1) {
    const currentId = toVisit[index];

    if (currentId === candidateId) {
      return true;
    }

    nodes[currentId]?.children.forEach((childId) => toVisit.push(childId));
  }

  return false;
};

const getStructuralDropTarget = (
  nodeId: string,
  position: { x: number; y: number },
  nodes: Record<string, MindNode>,
  viewState: Record<string, NodeViewState>,
  root: string,
) => {
  const draggedNode = nodes[nodeId];

  if (!draggedNode?.parent) {
    return {
      guides: {} satisfies AlignmentGuideState,
      position,
      structuralDrop: undefined,
    };
  }

  const draggedRect = getViewNodeRect(nodeId, viewState, position);
  const visibleIds = getVisibleNodeIds(nodes, root, viewState);
  const targets: StructuralDropTarget[] = [];
  const useTarget = (target: StructuralDropTarget) => {
    if (target.distance > SNAP_GUIDE_THRESHOLD) {
      return;
    }

    targets.push(target);
  };

  for (const candidateId of visibleIds) {
    const candidate = nodes[candidateId];

    if (
      !candidate ||
      candidateId === nodeId ||
      isNodeInSubtree(nodes, nodeId, candidateId)
    ) {
      continue;
    }

    const candidateRect = getViewNodeRect(candidateId, viewState);
    const childPreviewPosition = {
      x: candidateRect.right + SNAP_GUIDE_THRESHOLD,
      y: candidateRect.centerY - draggedRect.height / 2,
    };
    const childDistance = Math.hypot(
      draggedRect.left - candidateRect.right,
      draggedRect.centerY - candidateRect.centerY,
    );

    useTarget({
      distance: childDistance,
      guides: {
        snapBox: {
          height: draggedRect.height,
          width: draggedRect.width,
          x: childPreviewPosition.x,
          y: childPreviewPosition.y,
        },
        vertical: {
          x: candidateRect.right,
          y1: Math.min(candidateRect.top, childPreviewPosition.y),
          y2: Math.max(candidateRect.bottom, childPreviewPosition.y + draggedRect.height),
        },
      },
      kind: "child",
      parentId: candidateId,
      previewPosition: childPreviewPosition,
      targetId: candidateId,
    });

    if (!candidate.parent) {
      continue;
    }

    const siblings = nodes[candidate.parent]?.children ?? [];
    const targetIndex = siblings.indexOf(candidateId);

    if (targetIndex < 0) {
      continue;
    }

    const beforePreviewPosition = {
      x: candidateRect.left,
      y: candidateRect.top - draggedRect.height - SNAP_GUIDE_THRESHOLD,
    };
    const beforeDistance = Math.hypot(
      draggedRect.bottom - candidateRect.top,
      draggedRect.centerX - candidateRect.centerX,
    );

    useTarget({
      distance: beforeDistance,
      guides: {
        horizontal: {
          x1: Math.min(candidateRect.left, beforePreviewPosition.x),
          x2: Math.max(candidateRect.right, beforePreviewPosition.x + draggedRect.width),
          y: candidateRect.top,
        },
        snapBox: {
          height: draggedRect.height,
          width: draggedRect.width,
          x: beforePreviewPosition.x,
          y: beforePreviewPosition.y,
        },
      },
      kind: "sibling-before",
      parentId: candidate.parent,
      previewPosition: beforePreviewPosition,
      targetId: candidateId,
    });

    const afterPreviewPosition = {
      x: candidateRect.left,
      y: candidateRect.bottom + SNAP_GUIDE_THRESHOLD,
    };
    const afterDistance = Math.hypot(
      draggedRect.top - candidateRect.bottom,
      draggedRect.centerX - candidateRect.centerX,
    );

    useTarget({
      distance: afterDistance,
      guides: {
        horizontal: {
          x1: Math.min(candidateRect.left, afterPreviewPosition.x),
          x2: Math.max(candidateRect.right, afterPreviewPosition.x + draggedRect.width),
          y: candidateRect.bottom,
        },
        snapBox: {
          height: draggedRect.height,
          width: draggedRect.width,
          x: afterPreviewPosition.x,
          y: afterPreviewPosition.y,
        },
      },
      kind: "sibling-after",
      parentId: candidate.parent,
      previewPosition: afterPreviewPosition,
      targetId: candidateId,
    });
  }

  const closestTarget = targets.sort((left, right) => left.distance - right.distance)[0];

  return {
    guides: closestTarget?.guides ?? ({} satisfies AlignmentGuideState),
    position: closestTarget?.previewPosition ?? position,
    structuralDrop: closestTarget,
  };
};

const moveNodeToStructuralTarget = (
  nodes: Record<string, MindNode>,
  nodeId: string,
  target: StructuralDropTarget,
) => {
  const movedNode = nodes[nodeId];
  const sourceParentId = movedNode?.parent;
  const targetParentId = target.kind === "child" ? target.targetId : target.parentId;

  if (
    !movedNode ||
    !sourceParentId ||
    !nodes[sourceParentId] ||
    !nodes[targetParentId] ||
    isNodeInSubtree(nodes, nodeId, targetParentId)
  ) {
    return null;
  }

  const nextNodes = { ...nodes };
  nextNodes[sourceParentId] = {
    ...nodes[sourceParentId],
    children: nodes[sourceParentId].children.filter((childId) => childId !== nodeId),
  };

  nextNodes[nodeId] = {
    ...movedNode,
    parent: targetParentId,
  };

  const targetParent = nextNodes[targetParentId];
  const targetChildren = targetParent.children.filter((childId) => childId !== nodeId);
  const targetIndex = targetChildren.indexOf(target.targetId);
  const insertIndex =
    target.kind === "child"
      ? targetChildren.length
      : target.kind === "sibling-before"
        ? targetIndex
        : targetIndex + 1;

  if (target.kind !== "child" && targetIndex < 0) {
    return null;
  }

  const boundedInsertIndex = Math.min(Math.max(0, insertIndex), targetChildren.length);
  nextNodes[targetParentId] = {
    ...targetParent,
    children: [
      ...targetChildren.slice(0, boundedInsertIndex),
      nodeId,
      ...targetChildren.slice(boundedInsertIndex),
    ],
  };

  return nextNodes;
};

const cloneJsonContent = (content: JSONContent) =>
  JSON.parse(JSON.stringify(content)) as JSONContent;

const collectSubtreeIds = (nodes: Record<string, MindNode>, nodeId: string) => {
  const ids: string[] = [];
  const visit = (currentId: string) => {
    const node = nodes[currentId];

    if (!node) {
      return;
    }

    ids.push(currentId);
    node.children.forEach(visit);
  };

  visit(nodeId);
  return ids;
};

const getTopLevelNodeIds = (nodes: Record<string, MindNode>, nodeIds: string[]) =>
  nodeIds.filter(
    (nodeId) =>
      nodes[nodeId] &&
      !nodeIds.some(
        (candidateId) =>
          candidateId !== nodeId && isNodeInSubtree(nodes, candidateId, nodeId),
      ),
  );

const createClipboardSnapshot = (
  nodes: Record<string, MindNode>,
  rootIds: string[],
): InternalClipboard => {
  const clipboardNodes: Record<string, MindNode> = {};

  rootIds.forEach((rootNodeId) => {
    collectSubtreeIds(nodes, rootNodeId).forEach((nodeId) => {
      const node = nodes[nodeId];

      if (!node) {
        return;
      }

      clipboardNodes[nodeId] = {
        ...node,
        content: cloneJsonContent(node.content),
        children: [...node.children],
      };
    });
  });

  const clipboard = { markdown: "", nodes: clipboardNodes, rootIds };

  return {
    ...clipboard,
    markdown: renderClipboardMarkdown(clipboard),
  };
};

const renderInlineMarkdown = (content: JSONContent[] | undefined): string =>
  content
    ?.map((child) => {
      if (child.type === "text") {
        const marks = child.marks ?? [];
        let text = child.text ?? "";

        marks.forEach((mark) => {
          if (mark.type === "code") {
            text = `\`${text}\``;
          } else if (mark.type === "bold") {
            text = `**${text}**`;
          } else if (mark.type === "italic") {
            text = `*${text}*`;
          } else if (mark.type === "strike") {
            text = `~~${text}~~`;
          } else if (mark.type === "link" && typeof mark.attrs?.href === "string") {
            text = `[${text}](${mark.attrs.href})`;
          }
        });

        return text;
      }

      if (child.type === "inlineMath" && typeof child.attrs?.latex === "string") {
        return `$${child.attrs.latex}$`;
      }

      return renderInlineMarkdown(child.content);
    })
    .join("") ?? "";

const renderBlockMarkdown = (node: JSONContent, orderedIndex = 1): string => {
  if (node.type === "paragraph") {
    return renderInlineMarkdown(node.content);
  }

  if (node.type === "heading") {
    const level =
      typeof node.attrs?.level === "number" ? Math.min(6, node.attrs.level) : 1;
    return `${"#".repeat(level)} ${renderInlineMarkdown(node.content)}`;
  }

  if (node.type === "blockMath" && typeof node.attrs?.latex === "string") {
    return `$$\n${node.attrs.latex}\n$$`;
  }

  if (node.type === "codeBlock") {
    const language =
      typeof node.attrs?.language === "string" ? node.attrs.language : "";
    return `\`\`\`${language}\n${renderInlineMarkdown(node.content)}\n\`\`\``;
  }

  if (node.type === "image" && typeof node.attrs?.src === "string") {
    return `![${node.attrs.alt ?? ""}](${node.attrs.src})`;
  }

  if (node.type === "bulletList" || node.type === "orderedList") {
    return (
      node.content
        ?.map((item, index) => renderBlockMarkdown(item, index + 1))
        .join("\n") ?? ""
    );
  }

  if (node.type === "taskList") {
    return (
      node.content
        ?.map((item) => renderBlockMarkdown(item))
        .join("\n") ?? ""
    );
  }

  if (node.type === "listItem") {
    return `- ${node.content?.map((child) => renderBlockMarkdown(child)).join(" ") ?? ""}`;
  }

  if (node.type === "taskItem") {
    const checked = node.attrs?.checked ? "x" : " ";
    return `- [${checked}] ${
      node.content?.map((child) => renderBlockMarkdown(child)).join(" ") ?? ""
    }`;
  }

  if (node.type === "orderedListItem") {
    return `${orderedIndex}. ${
      node.content?.map((child) => renderBlockMarkdown(child)).join(" ") ?? ""
    }`;
  }

  return node.content?.map((child) => renderBlockMarkdown(child)).join("\n") ?? "";
};

const renderContentMarkdown = (content: JSONContent) =>
  content.content
    ?.map((block) => renderBlockMarkdown(block))
    .filter(Boolean)
    .join("\n\n") ?? "";

const renderSubtreeMarkdown = (
  nodes: Record<string, MindNode>,
  nodeId: string,
  depth = 0,
): string => {
  const node = nodes[nodeId];

  if (!node) {
    return "";
  }

  const contentMarkdown = renderContentMarkdown(node.content);
  const childrenMarkdown = node.children
    .map((childId) => renderSubtreeMarkdown(nodes, childId, depth + 1))
    .filter(Boolean)
    .join("\n\n");

  return [contentMarkdown, childrenMarkdown].filter(Boolean).join("\n\n");
};

const renderClipboardMarkdown = (clipboard: InternalClipboard) =>
  clipboard.rootIds
    .map((nodeId) => renderSubtreeMarkdown(clipboard.nodes, nodeId))
    .filter(Boolean)
    .join("\n\n");

const shouldUseNativeUndo = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    Boolean(target.closest(".node-editor")) ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
};

const shouldHandleMapTab = (
  target: EventTarget | null,
  activeView: ViewMode,
  isSplitView: boolean,
) => {
  if (activeView !== "mindmap" && !isSplitView) {
    return false;
  }

  if (!(target instanceof HTMLElement)) {
    return activeView === "mindmap";
  }

  return !target.closest(
    [
      ".document-main-view",
      ".outline-main-view",
      ".toolbar",
      ".sheet-tabs",
      ".floating-view-controls",
      ".floating-outline-panel",
      ".toolbar-menu",
      ".modal-backdrop",
      ".split-resizer",
    ].join(", "),
  );
};

const nodeTypes = {
  mindMapNode: MindMapNode,
} satisfies NodeTypes;

const createDefaultSheet = (title = "Sheet 1"): MindMapSheet => ({
  id: "sheet-1",
  title,
  root_id: rootId,
  nodes: createInitialNodes(),
});

type LegacyMindNode = MindNode & {
  position?: { x: number; y: number };
  dimensions?: { width: number; height: number };
  collapsed?: boolean;
};

const createDefaultSheetViewState = (
  nodes: Record<string, MindNode>,
  layoutSpacing: LayoutSpacing = "standard",
): SheetViewState => ({
  layoutSpacing,
  nodes: applyTreeLayout(
    nodes,
    Object.fromEntries(
      Object.keys(nodes).map((id) => [
        id,
        { position: id === rootId ? { x: 120, y: 120 } : { x: 0, y: 0 } },
      ]),
    ),
    rootId,
    layoutSpacing,
  ),
});

const splitNodesAndViewState = (
  nodes: Record<string, LegacyMindNode>,
  layoutSpacing: LayoutSpacing = "standard",
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
        node.position ?? (id === rootId ? { x: 120, y: 120 } : { x: 0, y: 0 }),
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

const createMindMapFile = (
  sheets: MindMapSheet[],
  activeSheetId: string,
  viewState: Record<string, SheetViewState>,
): MindMapFile => ({
  version: "1.1",
  active_sheet_id: activeSheetId,
  sheets,
  viewState,
});

const parseMindMapFile = (
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
      );
      const savedViewState = parsed.viewState?.[sheet.id];
      const hasSavedCoordinates = Boolean(savedViewState?.nodes);
      const hasLegacyCoordinates = Object.values(legacyNodes).some(
        (node) => Boolean(node.position),
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
    const migrated = splitNodesAndViewState(legacyNodes);
    assertSingleRoot(migrated.nodes, parsed.root_id);
    const hasLegacyCoordinates = Object.values(legacyNodes).some(
      (node) => Boolean(node.position),
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

const nextIndexFromNodes = (nodes: Record<string, MindNode>) =>
  Math.max(
    1,
    ...Object.keys(nodes)
      .map((id) => Number(id.replace("node-", "")))
      .filter(Number.isFinite),
  ) + 1;

type MindMapSnapshot = {
  nodes: Record<string, MindNode>;
  viewState: SheetViewState;
  selectedNodeId: string | null;
  nextNodeIndex: number;
};

const cloneMindNodes = (nodes: Record<string, MindNode>) =>
  JSON.parse(JSON.stringify(nodes)) as Record<string, MindNode>;

const cloneSheetViewState = (viewState: SheetViewState) =>
  JSON.parse(JSON.stringify(viewState)) as SheetViewState;

const cloneSheetViewStates = (viewStates: Record<string, SheetViewState>) =>
  JSON.parse(JSON.stringify(viewStates)) as Record<string, SheetViewState>;

const createSheetId = (sheets: MindMapSheet[]) => {
  for (let index = 1; index <= MAX_SHEETS; index += 1) {
    const id = `sheet-${index}`;

    if (!sheets.some((sheet) => sheet.id === id)) {
      return id;
    }
  }

  return `sheet-${Date.now()}`;
};

const getNodePreviewText = (content: MindNode["content"]) => {
  const parts: string[] = [];

  const visit = (node: MindNode["content"]) => {
    if (node.text) {
      parts.push(node.text);
    }

    const attrs = node.attrs as
      | { alt?: unknown; latex?: unknown; src?: unknown }
      | undefined;

    if (
      (node.type === "inlineMath" || node.type === "blockMath") &&
      typeof attrs?.latex === "string"
    ) {
      parts.push(node.type === "blockMath" ? `$$${attrs.latex}$$` : `$${attrs.latex}$`);
    }

    if (node.type === "image") {
      parts.push(
        typeof attrs?.alt === "string" && attrs.alt.trim()
          ? `[image: ${attrs.alt}]`
          : "[image]",
      );
    }

    node.content?.forEach((child) => visit(child));
  };

  visit(content);

  const text = parts.join(" ").replace(/\s+/g, " ").trim();

  if (!text) {
    return "Untitled node";
  }

  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
};

const getNodeFirstLineText = (content: MindNode["content"]) => {
  const collectText = (node: MindNode["content"]) => {
    const parts: string[] = [];

    const visit = (current: MindNode["content"]) => {
      if (current.text) {
        parts.push(current.text);
      }

      const attrs = current.attrs as
        | { alt?: unknown; latex?: unknown }
        | undefined;

      if (
        (current.type === "inlineMath" || current.type === "blockMath") &&
        typeof attrs?.latex === "string"
      ) {
        parts.push(
          current.type === "blockMath" ? `$$${attrs.latex}$$` : `$${attrs.latex}$`,
        );
      }

      if (current.type === "image") {
        parts.push(
          typeof attrs?.alt === "string" && attrs.alt.trim()
            ? `[image: ${attrs.alt}]`
            : "[image]",
        );
      }

      current.content?.forEach((child) => visit(child));
    };

    visit(node);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };

  const firstLine =
    content.content?.map((child) => collectText(child)).find(Boolean) ?? "";

  if (!firstLine) {
    return "Untitled node";
  }

  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
};

const getDocumentNodeTypography = (depth: number, displaySize: ViewDisplaySize) => {
  const sizePreset =
    viewDisplaySizeOptions.find((option) => option.value === displaySize) ??
    viewDisplaySizeOptions[1];
  const baseSize = sizePreset.baseSize;

  if (depth === 0) {
    return {
      "--document-node-font-size": `${baseSize + 7}px`,
      "--document-node-font-weight": 700,
    };
  }

  if (depth === 1) {
    return {
      "--document-node-font-size": `${baseSize + 3}px`,
      "--document-node-font-weight": 700,
    };
  }

  if (depth === 2) {
    return {
      "--document-node-font-size": `${baseSize + 1}px`,
      "--document-node-font-weight": 650,
    };
  }

  return {
    "--document-node-font-size": `${baseSize}px`,
    "--document-node-font-weight": 500,
  };
};

const createDemoTreeNodes = (): Record<string, MindNode> => {
  const nodes: Record<string, MindNode> = {
    [rootId]: {
      id: rootId,
      content: emptyDoc("Demo Tree: 66 nodes"),
      children: [],
      parent: null,
    },
  };
  let nextIndex = 2;

  const createNode = (parent: string, text: string) => {
    const id = `node-${nextIndex}`;
    nextIndex += 1;

    nodes[id] = {
      id,
      content: emptyDoc(text),
      children: [],
      parent,
    };
    nodes[parent] = {
      ...nodes[parent],
      children: [...nodes[parent].children, id],
    };

    return id;
  };

  for (let topicIndex = 1; topicIndex <= 5; topicIndex += 1) {
    const topicId = createNode(rootId, `Topic ${topicIndex}`);

    for (let detailIndex = 1; detailIndex <= 4; detailIndex += 1) {
      const detailId = createNode(
        topicId,
        `Topic ${topicIndex}.${detailIndex}`,
      );

      for (let leafIndex = 1; leafIndex <= 2; leafIndex += 1) {
        createNode(
          detailId,
          `Note ${topicIndex}.${detailIndex}.${leafIndex}`,
        );
      }
    }
  }

  return nodes;
};

function MindMapApp() {
  const reactFlow = useReactFlow<Node<MindMapNodeData>>();
  const [sheets, setSheets] = useState<MindMapSheet[]>(() => [
    createDefaultSheet(),
  ]);
  const [activeSheetId, setActiveSheetId] = useState("sheet-1");
  const [mindNodes, setMindNodes] = useState(createInitialNodes);
  const [sheetViewStates, setSheetViewStates] = useState<
    Record<string, SheetViewState>
  >(() => ({
    "sheet-1": createDefaultSheetViewState(createInitialNodes()),
  }));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(rootId);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    () => new Set([rootId]),
  );
  const [editingNodeId, setEditingNodeId] = useState<string | null>(rootId);
  const [nextNodeIndex, setNextNodeIndex] = useState(() =>
    nextIndexFromNodes(createInitialNodes()),
  );
  const [layoutSpacing, setLayoutSpacing] =
    useState<LayoutSpacing>("standard");
  const [alignmentMode, setAlignmentMode] = useState<AlignmentMode>("snap");
  const [backgroundTheme, setBackgroundTheme] =
    useState<BackgroundTheme>("dark");
  const [, setStatus] = useState("Ready");
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [editingSheetTitle, setEditingSheetTitle] = useState("");
  const [sheetMenu, setSheetMenu] = useState<{
    sheetId: string;
    x: number;
    y: number;
  } | null>(null);
  const [draggedSheetId, setDraggedSheetId] = useState<string | null>(null);
  const [dragOverSheetId, setDragOverSheetId] = useState<string | null>(null);
  const [draggedDocumentNodeId, setDraggedDocumentNodeId] = useState<string | null>(
    null,
  );
  const [documentDropTarget, setDocumentDropTarget] = useState<{
    nodeId: string;
    position: "before" | "after";
  } | null>(null);
  const [transientNodePositions, setTransientNodePositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuideState>({});
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewMode>("mindmap");
  const [isSplitView, setIsSplitView] = useState(false);
  const [isSplitReversed, setIsSplitReversed] = useState(false);
  const [splitRightPercent, setSplitRightPercent] = useState(42);
  const [isFullscreenLike, setIsFullscreenLike] = useState(false);
  const [viewDisplayPreferences, setViewDisplayPreferences] =
    useState<ViewDisplayPreferences>(loadViewDisplayPreferences);
  const [isDocumentOpen, setIsDocumentOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [outlinePanelPosition, setOutlinePanelPosition] = useState({
    x: 18,
    y: 132,
  });
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const createNodeRef = useRef<
    | ((
        parentId: string | null,
        position: { x: number; y: number },
        insertAfterNodeId?: string,
      ) => void)
    | null
  >(null);
  const deleteNodeRef = useRef<((nodeId: string) => void) | null>(null);
  const documentNodeRefs = useRef<Record<string, HTMLElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const floatingControlsRef = useRef<HTMLDivElement | null>(null);
  const flowWrapRef = useRef<HTMLElement | null>(null);
  const hasPositionedOutlinePanelRef = useRef(false);
  const internalClipboardRef = useRef<InternalClipboard | null>(null);
  const lastPasteRef = useRef<{
    pastedRootIds: string[];
    targetParentId: string;
  } | null>(null);
  const lastDragSnapRef = useRef<{
    guides: AlignmentGuideState;
    nodeId: string;
    position: { x: number; y: number };
    structuralDrop?: StructuralDropTarget;
  } | null>(null);
  const lastDragPositionRef = useRef<{
    nodeId: string;
    position: { x: number; y: number };
  } | null>(null);
  const manualResizeNodeIdsRef = useRef<Set<string>>(new Set());
  const dragStartPositionRef = useRef<{
    nodeId: string;
    position: { x: number; y: number };
  } | null>(null);
  const pendingNewNodeEditRef = useRef<string | null>(null);
  const didInitialCenterRef = useRef(false);
  const historyRef = useRef<MindMapSnapshot[]>([]);
  const redoRef = useRef<MindMapSnapshot[]>([]);

  const activeSheet = useMemo(
    () => sheets.find((sheet) => sheet.id === activeSheetId) ?? sheets[0],
    [activeSheetId, sheets],
  );
  const activeRootId = activeSheet?.root_id ?? rootId;
  const activeSheetViewState = useMemo(
    () =>
      sheetViewStates[activeSheetId] ??
      createDefaultSheetViewState(mindNodes, layoutSpacing),
    [activeSheetId, layoutSpacing, mindNodes, sheetViewStates],
  );
  const activeNodeViewState = activeSheetViewState.nodes;
  const mapStats = useMemo(() => {
    const nodeIds = Object.keys(mindNodes);
    const viewNodeIds = Object.keys(activeNodeViewState);
    const visibleIds = getVisibleNodeIds(
      mindNodes,
      activeRootId,
      activeNodeViewState,
    );
    const missingViewStateCount = nodeIds.filter(
      (id) => !activeNodeViewState[id],
    ).length;
    const staleViewStateCount = viewNodeIds.filter((id) => !mindNodes[id]).length;
    const collapsedCount = nodeIds.filter(
      (id) => activeNodeViewState[id]?.collapsed,
    ).length;
    const positionedCount = nodeIds.filter(
      (id) => activeNodeViewState[id]?.position,
    ).length;
    const measuredCount = nodeIds.filter(
      (id) => activeNodeViewState[id]?.dimensions,
    ).length;

    const getDepth = (nodeId: string, depth = 0): number => {
      const node = mindNodes[nodeId];

      if (!node || node.children.length === 0) {
        return depth;
      }

      return Math.max(
        depth,
        ...node.children.map((childId) => getDepth(childId, depth + 1)),
      );
    };

    return {
      collapsedCount,
      hiddenCount: nodeIds.length - visibleIds.size,
      maxDepth: getDepth(activeRootId),
      measuredCount,
      missingViewStateCount,
      nodeCount: nodeIds.length,
      positionedCount,
      staleViewStateCount,
      visibleCount: visibleIds.size,
      viewStateCount: viewNodeIds.length,
    };
  }, [activeNodeViewState, activeRootId, mindNodes]);
  const edges = useMemo(
    () => toFlowEdges(mindNodes, activeRootId, activeNodeViewState),
    [activeNodeViewState, activeRootId, mindNodes],
  );

  useEffect(() => {
    if (!selectedNodeId || mindNodes[selectedNodeId]) {
      return;
    }

    setSelectedNodeId(activeRootId);
    setSelectedNodeIds(new Set([activeRootId]));
  }, [activeRootId, mindNodes, selectedNodeId]);

  const focusNodeInCanvas = useCallback(
    (
      nodeId: string,
      viewState: Record<string, NodeViewState> = activeNodeViewState,
      duration = 520,
      align: "center" | "top" = "center",
    ) => {
      const viewNode = viewState[nodeId];
      const position = viewNode?.position;

      if (!position) {
        return;
      }

      window.requestAnimationFrame(() => {
        const nodeHeight = viewNode.dimensions?.height ?? DEFAULT_NODE_HEIGHT;
        const currentZoom = reactFlow.getZoom();
        const targetY =
          align === "top"
            ? position.y + nodeHeight / 2 + 120
            : position.y + nodeHeight / 2;

        reactFlow.setCenter(
          position.x + (viewNode.dimensions?.width ?? DEFAULT_NODE_WIDTH) / 2,
          targetY,
          { duration, zoom: currentZoom },
        );
      });
    },
    [activeNodeViewState, reactFlow],
  );

  const selectDocumentNode = useCallback(
    (nodeId: string, duration = 360) => {
      setSelectedNodeId(nodeId);
      setSelectedNodeIds(new Set([nodeId]));
      lastPasteRef.current = null;

      if (!isSplitView) {
        return;
      }

      window.requestAnimationFrame(() => {
        focusNodeInCanvas(nodeId, activeNodeViewState, duration, "center");
      });
    },
    [activeNodeViewState, focusNodeInCanvas, isSplitView],
  );

  const focusNodeFromOutline = useCallback(
    (nodeId: string, edit = false) => {
      const node = mindNodes[nodeId];

      if (!node) {
        return;
      }

      setSelectedNodeId(nodeId);
      setSelectedNodeIds(new Set([nodeId]));
      setEditingNodeId(edit ? nodeId : null);
      focusNodeInCanvas(nodeId, activeNodeViewState, 240, "top");

      window.requestAnimationFrame(() => {
        documentNodeRefs.current[nodeId]?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });

      setStatus(`${edit ? "Editing" : "Selected"} ${getNodePreviewText(node.content)}`);
    },
    [activeNodeViewState, focusNodeInCanvas, mindNodes],
  );

  const renderOutlineNode = useCallback(
    (nodeId: string, depth = 0): ReactNode => {
      if (depth > 2) {
        return null;
      }

      const node = mindNodes[nodeId];

      if (!node) {
        return null;
      }

      const isCollapsed = Boolean(activeNodeViewState[nodeId]?.collapsed);

      return (
        <li key={nodeId}>
          <button
            type="button"
            className={nodeId === selectedNodeId ? "is-selected" : ""}
            style={{ paddingLeft: 12 + depth * 14 }}
            onClick={() => focusNodeFromOutline(nodeId)}
            onDoubleClick={() => focusNodeFromOutline(nodeId, true)}
          >
            <span>{getNodeFirstLineText(node.content)}</span>
            {isCollapsed ? <small>folded</small> : null}
          </button>
          {node.children.length > 0 && depth < 2 ? (
            <ol>
              {node.children.map((childId) => renderOutlineNode(childId, depth + 1))}
            </ol>
          ) : null}
        </li>
      );
    },
    [activeNodeViewState, focusNodeFromOutline, mindNodes, selectedNodeId],
  );

  const getSyncedSheets = useCallback(
    () =>
      sheets.map((sheet) =>
        sheet.id === activeSheetId
          ? { ...sheet, nodes: cloneMindNodes(mindNodes) }
          : sheet,
      ),
    [activeSheetId, mindNodes, sheets],
  );

  const getSyncedViewStates = useCallback(
    () => ({
      ...cloneSheetViewStates(sheetViewStates),
      [activeSheetId]: cloneSheetViewState(activeSheetViewState),
    }),
    [activeSheetId, activeSheetViewState, sheetViewStates],
  );

  const pushHistory = useCallback(() => {
    historyRef.current = [
      ...historyRef.current,
      {
        nodes: cloneMindNodes(mindNodes),
        viewState: cloneSheetViewState(activeSheetViewState),
        selectedNodeId,
        nextNodeIndex,
      },
    ].slice(-50);
    redoRef.current = [];
  }, [activeSheetViewState, mindNodes, nextNodeIndex, selectedNodeId]);

  const fitCanvasToNodes = useCallback(
    (
      duration = 240,
      nodes = mindNodes,
      viewState = activeNodeViewState,
      root = activeRootId,
    ) => {
      window.requestAnimationFrame(() => {
        const visibleIds = getVisibleNodeIds(nodes, root, viewState);
        const visibleBounds = Array.from(visibleIds).reduce<{
          maxX: number;
          maxY: number;
          minX: number;
          minY: number;
        } | null>((bounds, nodeId) => {
          const position = viewState[nodeId]?.position ?? { x: 0, y: 0 };
          const dimensions = viewState[nodeId]?.dimensions ?? {
            height: DEFAULT_NODE_HEIGHT,
            width: DEFAULT_NODE_WIDTH,
          };
          const nextBounds = {
            maxX: position.x + dimensions.width,
            maxY: position.y + dimensions.height,
            minX: position.x,
            minY: position.y,
          };

          if (!bounds) {
            return nextBounds;
          }

          return {
            maxX: Math.max(bounds.maxX, nextBounds.maxX),
            maxY: Math.max(bounds.maxY, nextBounds.maxY),
            minX: Math.min(bounds.minX, nextBounds.minX),
            minY: Math.min(bounds.minY, nextBounds.minY),
          };
        }, null);

        if (!visibleBounds) {
          return;
        }

        reactFlow.setCenter(
          (visibleBounds.minX + visibleBounds.maxX) / 2,
          (visibleBounds.minY + visibleBounds.maxY) / 2,
          { duration, zoom: 1 },
        );
      });
    },
    [activeNodeViewState, activeRootId, mindNodes, reactFlow],
  );

  useEffect(() => {
    if (didInitialCenterRef.current) {
      return;
    }

    didInitialCenterRef.current = true;
    fitCanvasToNodes(0);
  }, [fitCanvasToNodes]);

  const undoNodeChange = useCallback(() => {
    const snapshot = historyRef.current.pop();

    if (!snapshot) {
      setStatus("Nothing to undo");
      return;
    }

    redoRef.current = [
      ...redoRef.current,
      {
        nodes: cloneMindNodes(mindNodes),
        viewState: cloneSheetViewState(activeSheetViewState),
        selectedNodeId,
        nextNodeIndex,
      },
    ].slice(-50);
    setMindNodes(snapshot.nodes);
    setSheetViewStates((current) => ({
      ...current,
      [activeSheetId]: snapshot.viewState,
    }));
    setLayoutSpacing(snapshot.viewState.layoutSpacing);
    setSelectedNodeId(snapshot.selectedNodeId);
    setSelectedNodeIds(
      snapshot.selectedNodeId ? new Set([snapshot.selectedNodeId]) : new Set(),
    );
    setEditingNodeId(null);
    setNextNodeIndex(snapshot.nextNodeIndex);
    setStatus("Undid node change");
  }, [activeSheetId, activeSheetViewState, mindNodes, nextNodeIndex, selectedNodeId]);

  const redoNodeChange = useCallback(() => {
    const snapshot = redoRef.current.pop();

    if (!snapshot) {
      setStatus("Nothing to redo");
      return;
    }

    historyRef.current = [
      ...historyRef.current,
      {
        nodes: cloneMindNodes(mindNodes),
        viewState: cloneSheetViewState(activeSheetViewState),
        selectedNodeId,
        nextNodeIndex,
      },
    ].slice(-50);
    setMindNodes(snapshot.nodes);
    setSheetViewStates((current) => ({
      ...current,
      [activeSheetId]: snapshot.viewState,
    }));
    setLayoutSpacing(snapshot.viewState.layoutSpacing);
    setSelectedNodeId(snapshot.selectedNodeId);
    setSelectedNodeIds(
      snapshot.selectedNodeId ? new Set([snapshot.selectedNodeId]) : new Set(),
    );
    setEditingNodeId(null);
    setNextNodeIndex(snapshot.nextNodeIndex);
    setStatus("Redid node change");
  }, [activeSheetId, activeSheetViewState, mindNodes, nextNodeIndex, selectedNodeId]);

  useEffect(() => {
    const handleUndoShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey)) {
        return;
      }

      if (shouldUseNativeUndo(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoNodeChange();
        return;
      }

      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redoNodeChange();
      }
    };

    window.addEventListener("keydown", handleUndoShortcut);

    return () => {
      window.removeEventListener("keydown", handleUndoShortcut);
    };
  }, [redoNodeChange, undoNodeChange]);

  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;

      if (!target?.closest(".mind-node")) {
        event.preventDefault();
      }
    };

    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);

    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);

  useEffect(() => {
    const updateFullscreenState = () => {
      const browserFullscreen = Boolean(document.fullscreenElement);
      const windowFullscreen =
        Math.abs(window.innerWidth - window.screen.width) <= 2 &&
        Math.abs(window.innerHeight - window.screen.height) <= 80;

      setIsFullscreenLike(browserFullscreen || windowFullscreen);
    };

    updateFullscreenState();
    document.addEventListener("fullscreenchange", updateFullscreenState);
    window.addEventListener("resize", updateFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
      window.removeEventListener("resize", updateFullscreenState);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        viewDisplayPreferenceStorageKey,
        JSON.stringify(viewDisplayPreferences),
      );
    } catch {
      // Display preferences are optional; ignore storage failures.
    }
  }, [viewDisplayPreferences]);

  const toggleBrowserFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setStatus("Exited fullscreen");
        return;
      }

      if (!document.fullscreenEnabled) {
        setStatus("Fullscreen is not available");
        return;
      }

      await (appShellRef.current ?? document.documentElement).requestFullscreen();
      setStatus("Entered fullscreen");
    } catch {
      setStatus("Could not enter fullscreen");
    }
  }, []);

  const cycleBackgroundTheme = useCallback(() => {
    const currentIndex = backgroundThemeOptions.findIndex(
      (option) => option.value === backgroundTheme,
    );
    const nextTheme =
      backgroundThemeOptions[(currentIndex + 1) % backgroundThemeOptions.length] ??
      backgroundThemeOptions[0];

    setBackgroundTheme(nextTheme.value);
    setStatus(`Background: ${nextTheme.label}`);
  }, [backgroundTheme]);

  useEffect(() => {
    if (!sheetMenu) {
      return;
    }

    const closeMenu = () => setSheetMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [sheetMenu]);

  useEffect(() => {
    if (!isAppMenuOpen) {
      return;
    }

    const closeMenu = () => setIsAppMenuOpen(false);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isAppMenuOpen]);

  useEffect(() => {
    if (!isLayoutMenuOpen) {
      return;
    }

    const closeMenu = () => setIsLayoutMenuOpen(false);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isLayoutMenuOpen]);

  useEffect(() => {
    if (!isViewMenuOpen) {
      return;
    }

    const closeMenu = () => setIsViewMenuOpen(false);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isViewMenuOpen]);

  useEffect(() => {
    if (!isHelpOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsHelpOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isHelpOpen]);

  const updateNodeContent = useCallback(
    (nodeId: string, content: MindMapNodeData["content"]) => {
      setMindNodes((current) => ({
        ...current,
        [nodeId]: {
          ...current[nodeId],
          content,
        },
      }));
    },
    [],
  );

  const moveDocumentNode = useCallback(
    (draggedId: string, targetId: string, position: "before" | "after") => {
      if (draggedId === targetId || isNodeInSubtree(mindNodes, draggedId, targetId)) {
        return;
      }

      const draggedNode = mindNodes[draggedId];
      const targetNode = mindNodes[targetId];
      const sourceParentId = draggedNode?.parent;
      const targetParentId = targetNode?.parent;

      if (!draggedNode || !targetNode || !sourceParentId || !targetParentId) {
        return;
      }

      const sourceParent = mindNodes[sourceParentId];
      const targetParent = mindNodes[targetParentId];

      if (!sourceParent || !targetParent) {
        return;
      }

      const targetChildrenWithoutDragged = targetParent.children.filter(
        (childId) => childId !== draggedId,
      );
      const targetIndex = targetChildrenWithoutDragged.indexOf(targetId);

      if (targetIndex < 0) {
        return;
      }

      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      const nextNodes: Record<string, MindNode> = {
        ...mindNodes,
        [draggedId]: {
          ...draggedNode,
          parent: targetParentId,
        },
      };

      if (sourceParentId === targetParentId) {
        nextNodes[targetParentId] = {
          ...targetParent,
          children: [
            ...targetChildrenWithoutDragged.slice(0, insertIndex),
            draggedId,
            ...targetChildrenWithoutDragged.slice(insertIndex),
          ],
        };
      } else {
        nextNodes[sourceParentId] = {
          ...sourceParent,
          children: sourceParent.children.filter((childId) => childId !== draggedId),
        };
        nextNodes[targetParentId] = {
          ...targetParent,
          children: [
            ...targetChildrenWithoutDragged.slice(0, insertIndex),
            draggedId,
            ...targetChildrenWithoutDragged.slice(insertIndex),
          ],
        };
      }

      const laidOutNodes = applyTreeLayout(
        nextNodes,
        activeNodeViewState,
        activeRootId,
        layoutSpacing,
      );

      pushHistory();
      setMindNodes(nextNodes);
      setSheetViewStates((current) => ({
        ...current,
        [activeSheetId]: {
          ...activeSheetViewState,
          nodes: laidOutNodes,
        },
      }));
      setSelectedNodeId(draggedId);
      setSelectedNodeIds(new Set([draggedId]));
      setEditingNodeId(null);
      focusNodeInCanvas(draggedId, laidOutNodes, 240, "top");
      setStatus("Moved document block");
    },
    [
      activeNodeViewState,
      activeRootId,
      activeSheetId,
      activeSheetViewState,
      focusNodeInCanvas,
      layoutSpacing,
      mindNodes,
      pushHistory,
    ],
  );

  const renderDocumentNode = useCallback(
    (nodeId: string, depth = 0): ReactNode => {
      const node = mindNodes[nodeId];

      if (!node) {
        return null;
      }

      const dropPosition = documentDropTarget?.nodeId === nodeId
        ? documentDropTarget.position
        : null;
      const canDragNode = Boolean(node.parent);

      return (
        <section
          key={nodeId}
          ref={(element) => {
            documentNodeRefs.current[nodeId] = element;
          }}
          className={[
            "document-node-section",
            selectedNodeId === nodeId ? "is-selected" : "",
            draggedDocumentNodeId === nodeId ? "is-dragging" : "",
            dropPosition ? `is-drop-${dropPosition}` : "",
          ].join(" ")}
          data-document-node-id={nodeId}
          style={
            {
              "--document-depth": depth,
              ...getDocumentNodeTypography(depth, viewDisplayPreferences.size),
            } as CSSProperties
          }
          onPointerDownCapture={() => {
            selectDocumentNode(nodeId, 360);
          }}
          onDragOver={(event: ReactDragEvent<HTMLElement>) => {
            if (!draggedDocumentNodeId || draggedDocumentNodeId === nodeId || !node.parent) {
              return;
            }

            if (isNodeInSubtree(mindNodes, draggedDocumentNodeId, nodeId)) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            const bounds = event.currentTarget.getBoundingClientRect();
            const position =
              event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";

            setDocumentDropTarget((current) =>
              current?.nodeId === nodeId && current.position === position
                ? current
                : { nodeId, position },
            );
          }}
          onDragLeave={(event: ReactDragEvent<HTMLElement>) => {
            const nextTarget = event.relatedTarget;

            if (
              nextTarget instanceof Node &&
              event.currentTarget.contains(nextTarget)
            ) {
              return;
            }

            setDocumentDropTarget((current) =>
              current?.nodeId === nodeId ? null : current,
            );
          }}
          onDrop={(event: ReactDragEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();

            if (draggedDocumentNodeId && documentDropTarget?.nodeId === nodeId) {
              moveDocumentNode(
                draggedDocumentNodeId,
                nodeId,
                documentDropTarget.position,
              );
            }

            setDraggedDocumentNodeId(null);
            setDocumentDropTarget(null);
          }}
        >
          {canDragNode ? (
            <button
              type="button"
              className="document-drag-handle"
              draggable
              title="Drag to reorder block"
              aria-label="Drag to reorder block"
              onMouseDown={(event) => {
                event.stopPropagation();
                selectDocumentNode(nodeId, 160);
              }}
              onDragStart={(event: ReactDragEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                setDraggedDocumentNodeId(nodeId);
                setDocumentDropTarget(null);
                selectDocumentNode(nodeId, 160);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", nodeId);
              }}
              onDragEnd={() => {
                setDraggedDocumentNodeId(null);
                setDocumentDropTarget(null);
              }}
            >
              ⠿
            </button>
          ) : null}
          <RichContentView
            content={node.content}
            editable
            onBlur={() => {
              setStatus(`Updated ${getNodePreviewText(node.content)}`);
            }}
            onContentChange={(content) => updateNodeContent(nodeId, content)}
            onFocus={() => {
              pushHistory();
              selectDocumentNode(nodeId, 360);
              setEditingNodeId(null);
              setStatus(`Editing ${getNodePreviewText(node.content)} in document`);
            }}
          />
          {selectedNodeId === nodeId ? (
            <div className="document-node-actions" aria-label="Document node actions">
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  selectDocumentNode(nodeId, 240);
                  createNodeRef.current?.(
                    nodeId,
                    getChildInsertPosition(
                      mindNodes,
                      activeNodeViewState,
                      nodeId,
                      layoutSpacing,
                    ),
                  );
                }}
              >
                + Child
              </button>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  selectDocumentNode(nodeId, 240);

                  if (!node.parent) {
                    createNodeRef.current?.(
                      nodeId,
                      getChildInsertPosition(
                        mindNodes,
                        activeNodeViewState,
                        nodeId,
                        layoutSpacing,
                      ),
                    );
                    return;
                  }

                  createNodeRef.current?.(
                    node.parent,
                    getSiblingInsertPosition(activeNodeViewState, nodeId, layoutSpacing),
                    nodeId,
                  );
                }}
              >
                + Sibling
              </button>
              <button
                type="button"
                className="document-node-delete-button"
                disabled={!node.parent}
                title={node.parent ? "Delete node" : "Root node cannot be deleted"}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  deleteNodeRef.current?.(nodeId);
                }}
              >
                - Delete
              </button>
            </div>
          ) : null}
          {node.children.map((childId) => renderDocumentNode(childId, depth + 1))}
        </section>
      );
    },
    [
      activeNodeViewState,
      documentDropTarget,
      draggedDocumentNodeId,
      layoutSpacing,
      mindNodes,
      moveDocumentNode,
      pushHistory,
      selectDocumentNode,
      selectedNodeId,
      updateNodeContent,
      viewDisplayPreferences.size,
    ],
  );

  const switchView = useCallback((view: ViewMode) => {
    setActiveView(view);
    setIsDocumentOpen(false);
  }, []);

  const toggleSplitView = useCallback(() => {
    setIsSplitView((current) => {
      const next = !current;

      if (next && activeView === "mindmap") {
        setActiveView("document");
      }

      return next;
    });
  }, [activeView]);

  const resizeSplitView = useCallback((clientX: number) => {
    const container = flowWrapRef.current;

    if (!container) {
      return;
    }

    const bounds = container.getBoundingClientRect();
    const rightPercent = ((bounds.right - clientX) / bounds.width) * 100;

    setSplitRightPercent(Math.min(68, Math.max(28, rightPercent)));
  }, []);

  const startSplitResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      resizeSplitView(event.clientX);

      const resize = (moveEvent: PointerEvent) => {
        resizeSplitView(moveEvent.clientX);
      };
      const stopResize = () => {
        window.removeEventListener("pointermove", resize);
        window.removeEventListener("pointerup", stopResize);
      };

      window.addEventListener("pointermove", resize);
      window.addEventListener("pointerup", stopResize);
    },
    [resizeSplitView],
  );

  const startOutlinePanelDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startY = event.clientY;
      const initialPosition = outlinePanelPosition;

      const movePanel = (moveEvent: PointerEvent) => {
        const nextX = initialPosition.x + moveEvent.clientX - startX;
        const nextY = initialPosition.y + moveEvent.clientY - startY;

        setOutlinePanelPosition({
          x: Math.min(Math.max(nextX, 12), window.innerWidth - 200),
          y: Math.min(Math.max(nextY, 64), window.innerHeight - 160),
        });
      };

      const stopDrag = () => {
        window.removeEventListener("pointermove", movePanel);
        window.removeEventListener("pointerup", stopDrag);
      };

      window.addEventListener("pointermove", movePanel);
      window.addEventListener("pointerup", stopDrag);
    },
    [outlinePanelPosition],
  );

  const positionOutlinePanelBelowControls = useCallback(() => {
    const controlsBounds = floatingControlsRef.current?.getBoundingClientRect();

    if (!controlsBounds) {
      return;
    }

    setOutlinePanelPosition({
      x: Math.min(Math.max(controlsBounds.left, 12), window.innerWidth - 200),
      y: Math.min(
        Math.max(controlsBounds.bottom + 8, 12),
        window.innerHeight - 160,
      ),
    });
  }, []);

  const openOutlinePanel = useCallback(() => {
    if (!hasPositionedOutlinePanelRef.current) {
      hasPositionedOutlinePanelRef.current = true;
      window.requestAnimationFrame(positionOutlinePanelBelowControls);
    }

    setIsOutlineOpen(true);
  }, [positionOutlinePanelBelowControls]);

  const toggleOutlinePanel = useCallback(() => {
    setIsOutlineOpen((current) => {
      const next = !current;

      if (next && !hasPositionedOutlinePanelRef.current) {
        hasPositionedOutlinePanelRef.current = true;
        window.requestAnimationFrame(positionOutlinePanelBelowControls);
      }

      return next;
    });
  }, [positionOutlinePanelBelowControls]);

  const createNode = useCallback(
    (
      parentId: string | null,
      position: { x: number; y: number },
      insertAfterNodeId?: string,
    ) => {
      pushHistory();

      const id = `node-${nextNodeIndex}`;
      const node: MindNode = {
        id,
        content: emptyDoc(),
        children: [],
        parent: parentId,
      };
      const nextNodes = {
        ...mindNodes,
        [id]: node,
      };

      if (parentId) {
        const currentChildren = mindNodes[parentId].children;
        const insertAfterIndex = insertAfterNodeId
          ? currentChildren.indexOf(insertAfterNodeId)
          : -1;
        const children =
          insertAfterIndex >= 0
            ? [
                ...currentChildren.slice(0, insertAfterIndex + 1),
                id,
                ...currentChildren.slice(insertAfterIndex + 1),
              ]
            : [...currentChildren, id];

        nextNodes[parentId] = {
          ...mindNodes[parentId],
          children,
        };
      }

      const nextViewNodes = {
        ...activeNodeViewState,
        [id]: { position },
      };

      if (parentId) {
        nextViewNodes[parentId] = {
          ...nextViewNodes[parentId],
          collapsed: false,
        };
      }

      const laidOutNodes = applyTreeLayout(
        nextNodes,
        nextViewNodes,
        activeRootId,
        layoutSpacing,
      );

      setMindNodes(nextNodes);
      setSheetViewStates((current) => ({
        ...current,
        [activeSheetId]: {
          ...activeSheetViewState,
          nodes: laidOutNodes,
        },
      }));
      setNextNodeIndex((current) => current + 1);
      setSelectedNodeId(id);
      setSelectedNodeIds(new Set([id]));
      setEditingNodeId(id);
      pendingNewNodeEditRef.current = id;
      window.requestAnimationFrame(() => {
        setSelectedNodeId(id);
        setSelectedNodeIds(new Set([id]));
        setEditingNodeId(id);
        pendingNewNodeEditRef.current = null;
      });
      focusNodeInCanvas(id, laidOutNodes);
    },
    [
      activeNodeViewState,
      activeRootId,
      activeSheetId,
      activeSheetViewState,
      focusNodeInCanvas,
      layoutSpacing,
      mindNodes,
      nextNodeIndex,
      pushHistory,
    ],
  );
  createNodeRef.current = createNode;

  const addChild = useCallback(() => {
    const parentId = selectedNodeId ?? activeRootId;
    createNode(
      parentId,
      getChildInsertPosition(
        mindNodes,
        activeNodeViewState,
        parentId,
        layoutSpacing,
      ),
    );
  }, [
    activeNodeViewState,
    activeRootId,
    createNode,
    layoutSpacing,
    mindNodes,
    selectedNodeId,
  ]);

  const addSibling = useCallback(() => {
    const currentId = selectedNodeId ?? activeRootId;
    const parentId = mindNodes[currentId]?.parent;

    if (!parentId) {
      addChild();
      return;
    }

    createNode(
      parentId,
      getSiblingInsertPosition(
        activeNodeViewState,
        currentId,
        layoutSpacing,
      ),
      currentId,
    );
  }, [
    activeNodeViewState,
    activeRootId,
    addChild,
    createNode,
    layoutSpacing,
    mindNodes,
    selectedNodeId,
  ]);

  const nodeDataById = useMemo<Record<string, MindMapNodeData>>(
    () =>
      Object.fromEntries(
        Object.values(mindNodes).map((node) => [
          node.id,
          {
            content: node.content,
            childCount: node.children.length,
            isCollapsed: Boolean(activeNodeViewState[node.id]?.collapsed),
            isEditing: editingNodeId === node.id,
            isSelected: selectedNodeIds.has(node.id),
            onEdit: () => {
              if (selectedNodeIds.size > 1) {
                return;
              }
              setEditingNodeId(node.id);
              setSelectedNodeId(node.id);
              setSelectedNodeIds(new Set([node.id]));
            },
            onFocus: () => {
              setSelectedNodeId(node.id);
              setSelectedNodeIds(new Set([node.id]));
            },
            onBlur: () =>
              setEditingNodeId((current) => (current === node.id ? null : current)),
            onAddChild: () =>
              createNode(
                node.id,
                getChildInsertPosition(
                  mindNodes,
                  activeNodeViewState,
                  node.id,
                  layoutSpacing,
                ),
              ),
            onAddSibling: () => {
              if (!node.parent) {
                createNode(
                  node.id,
                  getChildInsertPosition(
                    mindNodes,
                    activeNodeViewState,
                    node.id,
                    layoutSpacing,
                  ),
                );
                return;
              }

              createNode(
                node.parent,
                getSiblingInsertPosition(activeNodeViewState, node.id, layoutSpacing),
                node.id,
              );
            },
            onResizeStart: () => {
              manualResizeNodeIdsRef.current.add(node.id);
              pushHistory();
            },
            onToggleCollapse: () => {
              if (!node.children.length) {
                return;
              }

              pushHistory();
              const nextViewNodes = {
                ...activeNodeViewState,
                [node.id]: {
                  ...activeNodeViewState[node.id],
                  collapsed: !activeNodeViewState[node.id]?.collapsed,
                },
              };
              const laidOutNodes = applyTreeLayout(
                mindNodes,
                nextViewNodes,
                activeRootId,
                layoutSpacing,
              );

              setSheetViewStates((current) => ({
                ...current,
                [activeSheetId]: {
                  ...activeSheetViewState,
                  nodes: laidOutNodes,
                },
              }));
              setSelectedNodeId(node.id);
              setSelectedNodeIds(new Set([node.id]));
              setEditingNodeId(null);
            },
            onContentChange: (content) => updateNodeContent(node.id, content),
          },
        ]),
      ),
    [
      activeNodeViewState,
      activeSheetId,
      activeSheetViewState,
      createNode,
      editingNodeId,
      layoutSpacing,
      mindNodes,
      pushHistory,
      selectedNodeId,
      selectedNodeIds,
      updateNodeContent,
    ],
  );
  const baseFlowNodes = useMemo<Node<MindMapNodeData>[]>(
    () =>
      toFlowNodes(
        mindNodes,
        activeNodeViewState,
        (node) => nodeDataById[node.id],
        activeRootId,
      ).map((node) => ({
        ...node,
        selected: selectedNodeIds.has(node.id),
      })),
    [activeNodeViewState, activeRootId, mindNodes, nodeDataById, selectedNodeIds],
  );
  const flowNodes = useMemo<Node<MindMapNodeData>[]>(() => {
    const transientEntries = Object.entries(transientNodePositions);

    if (!transientEntries.length) {
      return baseFlowNodes;
    }

    const transientPositions = new Map(transientEntries);

    return baseFlowNodes.map((node) => {
      const position = transientPositions.get(node.id);

      if (!position) {
        return node;
      }

      return {
        ...node,
        position,
      };
    });
  }, [baseFlowNodes, transientNodePositions]);

  const deleteNodeById = useCallback(
    (nodeId: string) => {
      const protectedRootId = activeSheet?.root_id ?? rootId;

      if (nodeId === protectedRootId || !mindNodes[nodeId]?.parent) {
        setStatus("Root node cannot be deleted");
        return;
      }

      pushHistory();
      const fallbackSelectedNodeId = mindNodes[nodeId]?.parent ?? protectedRootId;
      const nextNodes = removeNodeAndDescendants(
        mindNodes,
        nodeId,
        protectedRootId,
      );
      const nextViewNodes = Object.fromEntries(
        Object.entries(activeNodeViewState).filter(([id]) => nextNodes[id]),
      );
      const laidOutNodes = applyTreeLayout(
        nextNodes,
        nextViewNodes,
        activeRootId,
        layoutSpacing,
      );

      setMindNodes(nextNodes);
      setSheetViewStates((current) => ({
        ...current,
        [activeSheetId]: {
          ...activeSheetViewState,
          nodes: laidOutNodes,
        },
      }));
      const nextSelectedNodeId = nextNodes[fallbackSelectedNodeId]
        ? fallbackSelectedNodeId
        : protectedRootId;
      setSelectedNodeId(nextSelectedNodeId);
      setSelectedNodeIds(new Set([nextSelectedNodeId]));
      setEditingNodeId(null);
    },
    [
      activeNodeViewState,
      activeRootId,
      activeSheet?.root_id,
      activeSheetId,
      activeSheetViewState,
      layoutSpacing,
      mindNodes,
      pushHistory,
    ],
  );
  deleteNodeRef.current = deleteNodeById;

  const deleteSelected = useCallback(() => {
    const protectedRootId = activeSheet?.root_id ?? rootId;
    const selectedIds = Array.from(selectedNodeIds).filter(
      (nodeId) => nodeId !== protectedRootId && mindNodes[nodeId]?.parent,
    );

    if (!selectedIds.length) {
      setStatus("Root node cannot be deleted");
      return;
    }

    if (selectedIds.length === 1) {
      deleteNodeById(selectedIds[0]);
      return;
    }

    const topLevelSelectedIds = selectedIds.filter(
      (nodeId) =>
        !selectedIds.some(
          (candidateId) =>
            candidateId !== nodeId && isNodeInSubtree(mindNodes, candidateId, nodeId),
        ),
    );
    const fallbackSelectedNodeId =
      mindNodes[topLevelSelectedIds[0]]?.parent ?? protectedRootId;

    pushHistory();
    const nextNodes = topLevelSelectedIds.reduce(
      (currentNodes, nodeId) =>
        removeNodeAndDescendants(currentNodes, nodeId, protectedRootId),
      mindNodes,
    );
    const nextViewNodes = Object.fromEntries(
      Object.entries(activeNodeViewState).filter(([id]) => nextNodes[id]),
    );
    const laidOutNodes = applyTreeLayout(
      nextNodes,
      nextViewNodes,
      activeRootId,
      layoutSpacing,
    );
    const nextSelectedNodeId = nextNodes[fallbackSelectedNodeId]
      ? fallbackSelectedNodeId
      : protectedRootId;

    setMindNodes(nextNodes);
    setSheetViewStates((current) => ({
      ...current,
      [activeSheetId]: {
        ...activeSheetViewState,
        nodes: laidOutNodes,
      },
    }));
    setSelectedNodeId(nextSelectedNodeId);
    setSelectedNodeIds(new Set([nextSelectedNodeId]));
    setEditingNodeId(null);
  }, [
    activeNodeViewState,
    activeRootId,
    activeSheet?.root_id,
    activeSheetId,
    activeSheetViewState,
    deleteNodeById,
    layoutSpacing,
    mindNodes,
    pushHistory,
    selectedNodeIds,
  ]);

  const copySelectedNodes = useCallback(async () => {
    const selectedIds = Array.from(selectedNodeIds).filter((nodeId) => mindNodes[nodeId]);

    if (!selectedIds.length) {
      setStatus("Select a node to copy");
      return null;
    }

    const rootIds = getTopLevelNodeIds(mindNodes, selectedIds);
    const clipboard = createClipboardSnapshot(mindNodes, rootIds);
    internalClipboardRef.current = clipboard;

    try {
      await navigator.clipboard?.writeText(clipboard.markdown);
    } catch {
      // System clipboard access can be unavailable; keep the internal clipboard.
    }

    setStatus(`Copied ${rootIds.length} subtree(s)`);
    return clipboard;
  }, [mindNodes, selectedNodeIds]);

  const cutSelectedNodes = useCallback(async () => {
    const protectedRootId = activeSheet?.root_id ?? rootId;
    const selectedIds = Array.from(selectedNodeIds).filter(
      (nodeId) => nodeId !== protectedRootId && mindNodes[nodeId]?.parent,
    );

    if (!selectedIds.length) {
      setStatus("Root node cannot be cut");
      return;
    }

    const rootIds = getTopLevelNodeIds(mindNodes, selectedIds);
    const clipboard = createClipboardSnapshot(mindNodes, rootIds);
    internalClipboardRef.current = clipboard;

    try {
      await navigator.clipboard?.writeText(clipboard.markdown);
    } catch {
      // System clipboard access can be unavailable; keep the internal clipboard.
    }

    const fallbackSelectedNodeId = mindNodes[rootIds[0]]?.parent ?? protectedRootId;
    pushHistory();
    const nextNodes = rootIds.reduce(
      (currentNodes, nodeId) =>
        removeNodeAndDescendants(currentNodes, nodeId, protectedRootId),
      mindNodes,
    );
    const nextViewNodes = Object.fromEntries(
      Object.entries(activeNodeViewState).filter(([id]) => nextNodes[id]),
    );
    const laidOutNodes = applyTreeLayout(
      nextNodes,
      nextViewNodes,
      activeRootId,
      layoutSpacing,
    );
    const nextSelectedNodeId = nextNodes[fallbackSelectedNodeId]
      ? fallbackSelectedNodeId
      : protectedRootId;

    setMindNodes(nextNodes);
    setSheetViewStates((current) => ({
      ...current,
      [activeSheetId]: {
        ...activeSheetViewState,
        nodes: laidOutNodes,
      },
    }));
    setSelectedNodeId(nextSelectedNodeId);
    setSelectedNodeIds(new Set([nextSelectedNodeId]));
    setEditingNodeId(null);
    setStatus(`Cut ${rootIds.length} subtree(s)`);
  }, [
    activeNodeViewState,
    activeRootId,
    activeSheet?.root_id,
    activeSheetId,
    activeSheetViewState,
    layoutSpacing,
    mindNodes,
    pushHistory,
    selectedNodeIds,
  ]);

  const pasteInternalClipboard = useCallback(
    (clipboard: InternalClipboard, targetParentId: string) => {
      let nextIndex = nextNodeIndex;
      const nextNodes: Record<string, MindNode> = { ...mindNodes };
      const newRootIds: string[] = [];

      const cloneSubtree = (sourceId: string, parentId: string): string | null => {
        const sourceNode = clipboard.nodes[sourceId];

        if (!sourceNode) {
          return null;
        }

        const newId = `node-${nextIndex}`;
        nextIndex += 1;
        const childIds = sourceNode.children
          .map((childId) => cloneSubtree(childId, newId))
          .filter((childId): childId is string => Boolean(childId));

        nextNodes[newId] = {
          id: newId,
          content: cloneJsonContent(sourceNode.content),
          children: childIds,
          parent: parentId,
        };

        return newId;
      };

      clipboard.rootIds.forEach((rootNodeId) => {
        const newRootId = cloneSubtree(rootNodeId, targetParentId);

        if (newRootId) {
          newRootIds.push(newRootId);
        }
      });

      const targetParent = nextNodes[targetParentId];

      if (!targetParent || !newRootIds.length) {
        setStatus("Nothing to paste");
        return;
      }

      nextNodes[targetParentId] = {
        ...targetParent,
        children: [...targetParent.children, ...newRootIds],
      };

      const nextViewNodes = {
        ...activeNodeViewState,
        [targetParentId]: {
          ...activeNodeViewState[targetParentId],
          collapsed: false,
        },
      };
      const laidOutNodes = applyTreeLayout(
        nextNodes,
        nextViewNodes,
        activeRootId,
        layoutSpacing,
      );

      pushHistory();
      setMindNodes(nextNodes);
      setSheetViewStates((current) => ({
        ...current,
        [activeSheetId]: {
          ...activeSheetViewState,
          nodes: laidOutNodes,
        },
      }));
      setNextNodeIndex(nextIndex);
      setSelectedNodeId(newRootIds[0]);
      setSelectedNodeIds(new Set([newRootIds[0]]));
      setEditingNodeId(null);
      lastPasteRef.current = {
        pastedRootIds: newRootIds,
        targetParentId,
      };
      focusNodeInCanvas(newRootIds[0], laidOutNodes, 240, "top");
      setStatus(`Pasted ${newRootIds.length} subtree(s)`);
    },
    [
      activeNodeViewState,
      activeRootId,
      activeSheetId,
      activeSheetViewState,
      focusNodeInCanvas,
      layoutSpacing,
      mindNodes,
      nextNodeIndex,
      pushHistory,
    ],
  );

  const pasteMarkdownAsChild = useCallback(
    (markdown: string, targetParentId: string) => {
      const trimmed = markdown.trim();

      if (!trimmed) {
        setStatus("Nothing to paste");
        return;
      }

      const id = `node-${nextNodeIndex}`;
      const nextNodes: Record<string, MindNode> = {
        ...mindNodes,
        [id]: {
          id,
          content: {
            type: "doc",
            content: isMarkdownLike(trimmed)
              ? markdownToTiptapContent(trimmed)
              : [{ type: "paragraph", content: [{ type: "text", text: trimmed }] }],
          },
          children: [],
          parent: targetParentId,
        },
      };
      const parentNode = nextNodes[targetParentId];

      if (!parentNode) {
        setStatus("Choose a target node to paste");
        return;
      }

      nextNodes[targetParentId] = {
        ...parentNode,
        children: [...parentNode.children, id],
      };

      const nextViewNodes = {
        ...activeNodeViewState,
        [id]: { position: getChildInsertPosition(mindNodes, activeNodeViewState, targetParentId, layoutSpacing) },
        [targetParentId]: {
          ...activeNodeViewState[targetParentId],
          collapsed: false,
        },
      };
      const laidOutNodes = applyTreeLayout(
        nextNodes,
        nextViewNodes,
        activeRootId,
        layoutSpacing,
      );

      pushHistory();
      setMindNodes(nextNodes);
      setSheetViewStates((current) => ({
        ...current,
        [activeSheetId]: {
          ...activeSheetViewState,
          nodes: laidOutNodes,
        },
      }));
      setNextNodeIndex((current) => current + 1);
      setSelectedNodeId(id);
      setSelectedNodeIds(new Set([id]));
      setEditingNodeId(null);
      lastPasteRef.current = {
        pastedRootIds: [id],
        targetParentId,
      };
      focusNodeInCanvas(id, laidOutNodes, 240, "top");
      setStatus("Pasted Markdown as child node");
    },
    [
      activeNodeViewState,
      activeRootId,
      activeSheetId,
      activeSheetViewState,
      focusNodeInCanvas,
      layoutSpacing,
      mindNodes,
      nextNodeIndex,
      pushHistory,
    ],
  );

  const pasteNodesOrMarkdown = useCallback(async () => {
    const repeatedPasteTarget =
      selectedNodeId &&
      lastPasteRef.current?.pastedRootIds.includes(selectedNodeId) &&
      mindNodes[lastPasteRef.current.targetParentId]
        ? lastPasteRef.current.targetParentId
        : null;
    const targetParentId = repeatedPasteTarget ?? selectedNodeId ?? activeRootId;
    let systemText = "";

    try {
      systemText = (await navigator.clipboard?.readText()) ?? "";
    } catch {
      systemText = "";
    }

    const clipboard = internalClipboardRef.current;

    if (clipboard && (!systemText || systemText === clipboard.markdown)) {
      pasteInternalClipboard(clipboard, targetParentId);
      return;
    }

    pasteMarkdownAsChild(systemText, targetParentId);
  }, [
    activeRootId,
    mindNodes,
    pasteInternalClipboard,
    pasteMarkdownAsChild,
    selectedNodeId,
  ]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    changes.forEach((change) => {
      if (change.type === "select") {
        setSelectedNodeIds((current) => {
          const next = new Set(current);

          if (change.selected) {
            next.add(change.id);
          } else {
            next.delete(change.id);
          }

          return next;
        });

        if (change.selected) {
          setSelectedNodeId(change.id);
          setEditingNodeId(null);
        }
      }

      if (change.type === "position" && change.position && change.dragging) {
        const position = change.position;
        lastDragPositionRef.current = {
          nodeId: change.id,
          position,
        };
        const snapped = getStructuralDropTarget(
          change.id,
          position,
          mindNodes,
          activeNodeViewState,
          activeRootId,
        );

        lastDragSnapRef.current = {
          guides: snapped.guides,
          nodeId: change.id,
          position: snapped.position,
          structuralDrop: snapped.structuralDrop,
        };
        setAlignmentGuides(snapped.guides);
        setTransientNodePositions((current) => {
          const currentPosition = current[change.id];

          if (
            currentPosition?.x === position.x &&
            currentPosition.y === position.y
          ) {
            return current;
          }

          return { [change.id]: position };
        });
      }
    });

    const stateChanges = changes.filter(
      (change) => change.type === "dimensions" && change.dimensions,
    );

    if (!stateChanges.length) {
      return;
    }

    setSheetViewStates((current) => {
      const currentSheetState = current[activeSheetId] ?? activeSheetViewState;
      let nextNodes = currentSheetState.nodes ?? activeNodeViewState;
      let didChange = false;

      stateChanges.forEach((change) => {
        if (change.type === "dimensions" && change.dimensions) {
          if (!mindNodes[change.id]) {
            return;
          }

          const currentNodeView = nextNodes[change.id] ?? activeNodeViewState[change.id];
          const currentDimensions = currentNodeView?.dimensions;
          const manualDimensions = manualResizeNodeIdsRef.current.has(change.id);

          if (
            currentDimensions?.width === change.dimensions.width &&
            currentDimensions.height === change.dimensions.height &&
            Boolean(currentNodeView?.manualDimensions) === manualDimensions
          ) {
            return;
          }

          nextNodes = {
            ...nextNodes,
            [change.id]: {
              ...currentNodeView,
              dimensions: change.dimensions,
              manualDimensions,
            },
          };
          didChange = true;
        }
      });

      if (!didChange) {
        return current;
      }

      return {
        ...current,
        [activeSheetId]: {
          ...currentSheetState,
          nodes: applyTreeLayout(mindNodes, nextNodes, activeRootId, layoutSpacing),
        },
      };
    });
  }, [
    activeNodeViewState,
    activeRootId,
    activeSheetId,
    activeSheetViewState,
    layoutSpacing,
    mindNodes,
  ]);

  const moveSelectionByArrow = useCallback(
    (key: string) => {
      const currentId = selectedNodeId ?? activeRootId;
      const currentNode = mindNodes[currentId];

      if (!currentNode) {
        setSelectedNodeId(activeRootId);
        setSelectedNodeIds(new Set([activeRootId]));
        return;
      }

      let nextId: string | null = null;

      if (key === "ArrowLeft") {
        nextId = currentNode.parent;
      }

      if (key === "ArrowRight") {
        nextId = activeNodeViewState[currentId]?.collapsed
          ? null
          : (currentNode.children[0] ?? null);
      }

      if ((key === "ArrowUp" || key === "ArrowDown") && currentNode.parent) {
        const siblings = mindNodes[currentNode.parent]?.children ?? [];
        const currentIndex = siblings.indexOf(currentId);
        const nextIndex =
          key === "ArrowUp" ? currentIndex - 1 : currentIndex + 1;

        nextId = siblings[nextIndex] ?? null;
      }

      if (!nextId || !mindNodes[nextId]) {
        return;
      }

      setSelectedNodeId(nextId);
      setSelectedNodeIds(new Set([nextId]));
      setEditingNodeId(null);
      lastPasteRef.current = null;
      focusNodeInCanvas(nextId, activeNodeViewState, 220, "top");
    },
    [
      activeNodeViewState,
      activeRootId,
      focusNodeInCanvas,
      mindNodes,
      selectedNodeId,
    ],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && !shouldUseNativeUndo(event.target)) {
        const key = event.key.toLowerCase();

        if (key === "c") {
          event.preventDefault();
          void copySelectedNodes();
          return;
        }

        if (key === "x") {
          event.preventDefault();
          void cutSelectedNodes();
          return;
        }

        if (key === "v") {
          event.preventDefault();
          void pasteNodesOrMarkdown();
          return;
        }
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        ((event.key.toLowerCase() === "z" && event.shiftKey) ||
          event.key.toLowerCase() === "y")
      ) {
        if (shouldUseNativeUndo(event.target)) {
          return;
        }

        event.preventDefault();
        redoNodeChange();
        return;
      }

      if (
        !event.shiftKey &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z"
      ) {
        if (shouldUseNativeUndo(event.target)) {
          return;
        }

        event.preventDefault();
        undoNodeChange();
        return;
      }

      if (editingNodeId) {
        const target = event.target instanceof Element ? event.target : null;

        if (event.key === "Escape") {
          event.preventDefault();
          setEditingNodeId(null);
          return;
        }

        if (event.key === "Enter" && !event.shiftKey) {
          if (!target?.closest(".node-editor")) {
            event.preventDefault();

            const parentId = mindNodes[editingNodeId]?.parent;

            createNode(
              parentId ?? editingNodeId,
              parentId
                ? getSiblingInsertPosition(
                    activeNodeViewState,
                    editingNodeId,
                    layoutSpacing,
                  )
                : getChildInsertPosition(
                    mindNodes,
                    activeNodeViewState,
                    editingNodeId,
                    layoutSpacing,
                  ),
              parentId ? editingNodeId : undefined,
            );
          }
        }

        return;
      }

      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight"
      ) {
        event.preventDefault();
        moveSelectionByArrow(event.key);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        addSibling();
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (shouldUseNativeUndo(event.target)) {
          return;
        }

        event.preventDefault();
        deleteSelected();
      }
    },
    [
      activeNodeViewState,
      addChild,
      addSibling,
      createNode,
      copySelectedNodes,
      cutSelectedNodes,
      deleteSelected,
      editingNodeId,
      layoutSpacing,
      mindNodes,
      moveSelectionByArrow,
      pasteNodesOrMarkdown,
      redoNodeChange,
      undoNodeChange,
    ],
  );

  const onKeyDownCapture = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing || event.key !== "Tab") {
        return;
      }

      if (!shouldHandleMapTab(event.target, activeView, isSplitView)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      addChild();
    },
    [activeView, addChild, isSplitView],
  );

  const autoLayout = useCallback(() => {
    pushHistory();
    const laidOutNodes = applyTreeLayout(
      mindNodes,
      activeNodeViewState,
      activeRootId,
      layoutSpacing,
    );

    setSheetViewStates((current) => ({
      ...current,
      [activeSheetId]: {
        ...activeSheetViewState,
        nodes: laidOutNodes,
      },
    }));
    fitCanvasToNodes(300, mindNodes, laidOutNodes, activeRootId);
    setStatus(`Layout updated: ${getLayoutSpacingLabel(layoutSpacing)}`);
  }, [
    activeNodeViewState,
    activeRootId,
    activeSheetId,
    activeSheetViewState,
    fitCanvasToNodes,
    layoutSpacing,
    mindNodes,
    pushHistory,
  ]);

  const changeLayoutSpacing = useCallback(
    (spacing: LayoutSpacing) => {
      if (spacing === layoutSpacing) {
        return;
      }

      setLayoutSpacing(spacing);
      pushHistory();
      const laidOutNodes = applyTreeLayout(
        mindNodes,
        activeNodeViewState,
        activeRootId,
        spacing,
      );

      setSheetViewStates((current) => ({
        ...current,
        [activeSheetId]: {
          ...activeSheetViewState,
          layoutSpacing: spacing,
          nodes: laidOutNodes,
        },
      }));
      fitCanvasToNodes(300, mindNodes, laidOutNodes, activeRootId);
      setStatus(`Layout spacing: ${getLayoutSpacingLabel(spacing)}`);
    },
    [
      activeNodeViewState,
      activeRootId,
      activeSheetId,
      activeSheetViewState,
      fitCanvasToNodes,
      layoutSpacing,
      mindNodes,
      pushHistory,
    ],
  );

  const createNewMap = useCallback(() => {
    pushHistory();
    internalClipboardRef.current = null;
    const sheet = createDefaultSheet();
    const viewState = createDefaultSheetViewState(sheet.nodes);

    setSheets([sheet]);
    setActiveSheetId(sheet.id);
    setMindNodes(sheet.nodes);
    setSheetViewStates({
      [sheet.id]: viewState,
    });
    setLayoutSpacing("standard");
    setSelectedNodeId(rootId);
    setSelectedNodeIds(new Set([rootId]));
    setEditingNodeId(rootId);
    setNextNodeIndex(nextIndexFromNodes(sheet.nodes));
    fitCanvasToNodes(240, sheet.nodes, viewState.nodes, sheet.root_id);
    setStatus("New map created");
  }, [fitCanvasToNodes, pushHistory]);

  const createDemoTree = useCallback(() => {
    pushHistory();
    const demoNodes = createDemoTreeNodes();
    const demoViewState = createDefaultSheetViewState(demoNodes, layoutSpacing);
    const laidOutViewState = {
      ...demoViewState,
      nodes: applyTreeLayout(
        demoNodes,
        demoViewState.nodes,
        rootId,
        layoutSpacing,
      ),
    };

    setMindNodes(demoNodes);
    setSheets(
      getSyncedSheets().map((sheet) =>
        sheet.id === activeSheetId
          ? {
              ...sheet,
              nodes: cloneMindNodes(demoNodes),
            }
          : sheet,
      ),
    );
    setSheetViewStates({
      ...getSyncedViewStates(),
      [activeSheetId]: laidOutViewState,
    });
    setSelectedNodeId(rootId);
    setSelectedNodeIds(new Set([rootId]));
    setEditingNodeId(rootId);
    setNextNodeIndex(nextIndexFromNodes(demoNodes));
    fitCanvasToNodes(300, demoNodes, laidOutViewState.nodes, rootId);
    setStatus("Demo tree created: 66 nodes");
  }, [
    activeSheetId,
    fitCanvasToNodes,
    getSyncedSheets,
    getSyncedViewStates,
    layoutSpacing,
    pushHistory,
  ]);

  const addSheet = useCallback(() => {
    if (sheets.length >= MAX_SHEETS) {
      setStatus(`A file can contain up to ${MAX_SHEETS} sheets`);
      return;
    }

    const syncedSheets = getSyncedSheets();
    const id = createSheetId(syncedSheets);
    const title = `Sheet ${syncedSheets.length + 1}`;
    const sheet: MindMapSheet = {
      id,
      title,
      root_id: rootId,
      nodes: createInitialNodes(),
    };
    const viewState = createDefaultSheetViewState(sheet.nodes);

    pushHistory();
    setSheets([...syncedSheets, sheet]);
    setActiveSheetId(id);
    setMindNodes(sheet.nodes);
    setSheetViewStates({
      ...getSyncedViewStates(),
      [id]: viewState,
    });
    setLayoutSpacing("standard");
    setSelectedNodeId(rootId);
    setSelectedNodeIds(new Set([rootId]));
    setEditingNodeId(rootId);
    setNextNodeIndex(nextIndexFromNodes(sheet.nodes));
    fitCanvasToNodes(240, sheet.nodes, viewState.nodes, sheet.root_id);
    setStatus(`Added ${title}`);
  }, [
    fitCanvasToNodes,
    getSyncedSheets,
    getSyncedViewStates,
    pushHistory,
    sheets.length,
  ]);

  const switchSheet = useCallback(
    (sheetId: string) => {
      if (sheetId === activeSheetId) {
        return;
      }

      const syncedSheets = getSyncedSheets();
      const sheet = syncedSheets.find((candidate) => candidate.id === sheetId);

      if (!sheet) {
        return;
      }

      setSheets(syncedSheets);
      setActiveSheetId(sheet.id);
      setMindNodes(cloneMindNodes(sheet.nodes));
      const nextViewState =
        sheetViewStates[sheet.id] ?? createDefaultSheetViewState(sheet.nodes);
      setLayoutSpacing(nextViewState.layoutSpacing);
      setSelectedNodeId(sheet.root_id);
      setSelectedNodeIds(new Set([sheet.root_id]));
      setEditingNodeId(sheet.root_id);
      setNextNodeIndex(nextIndexFromNodes(sheet.nodes));
      fitCanvasToNodes(240, sheet.nodes, nextViewState.nodes, sheet.root_id);
      setStatus(`Switched to ${sheet.title}`);
    },
    [activeSheetId, fitCanvasToNodes, getSyncedSheets, sheetViewStates],
  );

  const reorderSheet = useCallback(
    (draggedId: string, targetId: string, insertAfterTarget: boolean) => {
      if (draggedId === targetId) {
        return;
      }

      const syncedSheets = getSyncedSheets();
      const draggedSheet = syncedSheets.find((sheet) => sheet.id === draggedId);
      const withoutDragged = syncedSheets.filter((sheet) => sheet.id !== draggedId);
      const targetIndex = withoutDragged.findIndex((sheet) => sheet.id === targetId);

      if (!draggedSheet || targetIndex === -1) {
        return;
      }

      const insertIndex = targetIndex + (insertAfterTarget ? 1 : 0);
      setSheets([
        ...withoutDragged.slice(0, insertIndex),
        draggedSheet,
        ...withoutDragged.slice(insertIndex),
      ]);
      setSheetMenu(null);
      setStatus(`Moved ${draggedSheet.title}`);
    },
    [getSyncedSheets],
  );

  const applySheetTitle = useCallback(
    (sheetId: string, title: string) => {
      const sheet = sheets.find((candidate) => candidate.id === sheetId);
      const nextTitle = title.trim();

      if (!sheet || !nextTitle || nextTitle === sheet.title) {
        return;
      }

      setSheets(
        getSyncedSheets().map((candidate) =>
          candidate.id === sheetId
            ? {
                ...candidate,
                title: nextTitle,
              }
            : candidate,
        ),
      );
      setStatus(`Renamed sheet to ${nextTitle}`);
    },
    [getSyncedSheets, sheets],
  );

  const startSheetTitleEdit = useCallback((sheet: MindMapSheet) => {
    setEditingSheetId(sheet.id);
    setEditingSheetTitle(sheet.title);
  }, []);

  const commitSheetTitleEdit = useCallback(() => {
    if (!editingSheetId) {
      return;
    }

    applySheetTitle(editingSheetId, editingSheetTitle);
    setEditingSheetId(null);
    setEditingSheetTitle("");
  }, [applySheetTitle, editingSheetId, editingSheetTitle]);

  const cancelSheetTitleEdit = useCallback(() => {
    setEditingSheetId(null);
    setEditingSheetTitle("");
  }, []);

  const duplicateSheet = useCallback(
    (sheetId: string) => {
      if (sheets.length >= MAX_SHEETS) {
        setStatus(`A file can contain up to ${MAX_SHEETS} sheets`);
        return;
      }

      const syncedSheets = getSyncedSheets();
      const sheet = syncedSheets.find((candidate) => candidate.id === sheetId);

      if (!sheet) {
        return;
      }

      const id = createSheetId(syncedSheets);
      const duplicatedSheet: MindMapSheet = {
        ...sheet,
        id,
        title: `${sheet.title} Copy`,
        nodes: cloneMindNodes(sheet.nodes),
      };

      setSheets([...syncedSheets, duplicatedSheet]);
      setActiveSheetId(id);
      setMindNodes(cloneMindNodes(duplicatedSheet.nodes));
      const sourceViewState =
        sheetViewStates[sheetId] ?? createDefaultSheetViewState(sheet.nodes);
      setSheetViewStates({
        ...getSyncedViewStates(),
        [id]: cloneSheetViewState(sourceViewState),
      });
      setLayoutSpacing(sourceViewState.layoutSpacing);
      setSelectedNodeId(duplicatedSheet.root_id);
      setSelectedNodeIds(new Set([duplicatedSheet.root_id]));
      setEditingNodeId(duplicatedSheet.root_id);
      setEditingSheetId(null);
      setNextNodeIndex(nextIndexFromNodes(duplicatedSheet.nodes));
      fitCanvasToNodes(
        240,
        duplicatedSheet.nodes,
        sourceViewState.nodes,
        duplicatedSheet.root_id,
      );
      setStatus(`Duplicated ${sheet.title}`);
    },
    [
      fitCanvasToNodes,
      getSyncedSheets,
      getSyncedViewStates,
      sheetViewStates,
      sheets.length,
    ],
  );

  const deleteSheet = useCallback(
    (sheetId: string) => {
      const syncedSheets = getSyncedSheets();

      if (syncedSheets.length <= 1) {
        setStatus("At least one sheet is required");
        return;
      }

      const sheetIndex = syncedSheets.findIndex((sheet) => sheet.id === sheetId);

      if (sheetIndex === -1) {
        return;
      }

      const deletedSheet = syncedSheets[sheetIndex];
      const nextSheets = syncedSheets.filter((sheet) => sheet.id !== sheetId);
      const nextActiveSheet =
        sheetId === activeSheetId
          ? nextSheets[Math.max(0, sheetIndex - 1)]
          : nextSheets.find((sheet) => sheet.id === activeSheetId) ?? nextSheets[0];

      setSheets(nextSheets);
      setActiveSheetId(nextActiveSheet.id);
      setMindNodes(cloneMindNodes(nextActiveSheet.nodes));
      const nextViewStates = getSyncedViewStates();
      delete nextViewStates[sheetId];
      const nextViewState =
        nextViewStates[nextActiveSheet.id] ??
        createDefaultSheetViewState(nextActiveSheet.nodes);
      setSheetViewStates({
        ...nextViewStates,
        [nextActiveSheet.id]: nextViewState,
      });
      setLayoutSpacing(nextViewState.layoutSpacing);
      setSelectedNodeId(nextActiveSheet.root_id);
      setSelectedNodeIds(new Set([nextActiveSheet.root_id]));
      setEditingNodeId(nextActiveSheet.root_id);
      setEditingSheetId(null);
      setNextNodeIndex(nextIndexFromNodes(nextActiveSheet.nodes));
      fitCanvasToNodes(
        240,
        nextActiveSheet.nodes,
        nextViewState.nodes,
        nextActiveSheet.root_id,
      );
      setStatus(`Deleted ${deletedSheet.title}`);
    },
    [activeSheetId, fitCanvasToNodes, getSyncedSheets, getSyncedViewStates],
  );

  const saveFile = useCallback(() => {
    const syncedSheets = getSyncedSheets();
    const syncedViewStates = getSyncedViewStates();
    const blob = new Blob(
      [
        JSON.stringify(
          createMindMapFile(syncedSheets, activeSheetId, syncedViewStates),
          null,
          2,
        ),
      ],
      {
        type: "application/json",
      },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "lumen.mindmap.json";
    link.click();
    URL.revokeObjectURL(url);
    setSheets(syncedSheets);
    setSheetViewStates(syncedViewStates);
    setStatus("Saved lumen.mindmap.json");
  }, [activeSheetId, getSyncedSheets, getSyncedViewStates]);

  useEffect(() => {
    const autosave = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          autoSaveStorageKey,
          JSON.stringify(
            createMindMapFile(
              getSyncedSheets(),
              activeSheetId,
              getSyncedViewStates(),
            ),
          ),
        );
      } catch {
        // Autosave is best effort; explicit Save remains available.
      }
    }, 1500);

    return () => window.clearTimeout(autosave);
  }, [activeSheetId, getSyncedSheets, getSyncedViewStates]);

  const openFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const importFile = async () => {
      if (file.name.toLowerCase().endsWith(".xmind")) {
        const { sheets: importedSheets, viewState: importedViewState } =
          await importXMindFile(file);
        const firstSheet = importedSheets[0];
        const firstViewState =
          importedViewState[firstSheet.id] ??
          createDefaultSheetViewState(firstSheet.nodes);

        setSheets(importedSheets);
        setActiveSheetId(firstSheet.id);
        setMindNodes(firstSheet.nodes);
        setSheetViewStates(importedViewState);
        setLayoutSpacing(firstViewState.layoutSpacing);
        setSelectedNodeId(firstSheet.root_id);
        setSelectedNodeIds(new Set([firstSheet.root_id]));
        setEditingNodeId(firstSheet.root_id);
        setNextNodeIndex(nextIndexFromNodes(firstSheet.nodes));
        fitCanvasToNodes(240, firstSheet.nodes, firstViewState.nodes, firstSheet.root_id);
        setStatus(`Imported ${importedSheets.length} sheet(s) from ${file.name}`);
        return;
      }

      const {
        sheets: parsedSheets,
        activeSheetId: parsedActiveSheetId,
        viewState: parsedViewState,
      } = parseMindMapFile(await file.text());
      const activeSheet =
        parsedSheets.find((sheet) => sheet.id === parsedActiveSheetId) ??
        parsedSheets[0];
      const activeViewState =
        parsedViewState[activeSheet.id] ??
        createDefaultSheetViewState(activeSheet.nodes);

      setSheets(parsedSheets);
      setActiveSheetId(activeSheet.id);
      setMindNodes(activeSheet.nodes);
      setSheetViewStates(parsedViewState);
      setLayoutSpacing(activeViewState.layoutSpacing);
      setSelectedNodeId(activeSheet.root_id);
      setSelectedNodeIds(new Set([activeSheet.root_id]));
      setEditingNodeId(activeSheet.root_id);
      setNextNodeIndex(nextIndexFromNodes(activeSheet.nodes));
      fitCanvasToNodes(
        240,
        activeSheet.nodes,
        activeViewState.nodes,
        activeSheet.root_id,
      );
      setStatus(`Opened ${file.name}`);
    };

    pushHistory();
    internalClipboardRef.current = null;
    importFile().catch(() => setStatus(`Could not open ${file.name}`));

    event.target.value = "";
  }, [fitCanvasToNodes, pushHistory]);

  useEffect(() => {
    const handleGlobalShortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "s") {
        event.preventDefault();
        saveFile();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && key === "o") {
        event.preventDefault();
        fileInputRef.current?.click();
        setStatus("Choose a file to open");
        return;
      }

      if (
        event.key === "?" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !shouldUseNativeUndo(event.target)
      ) {
        event.preventDefault();
        setIsHelpOpen(true);
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts);

    return () => {
      window.removeEventListener("keydown", handleGlobalShortcuts);
    };
  }, [saveFile]);

  const canvasBackground =
    backgroundTheme === "dark"
      ? { color: "#30303a", gap: 24, size: 1 }
      : backgroundTheme === "paper"
        ? { color: "#dfceb8", gap: 30, size: 1 }
        : { color: "#d7e1ee", gap: 28, size: 1 };

  const mindMapView = (
    <ReactFlow
      nodes={flowNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(event, node) => {
        lastPasteRef.current = null;
        if (event.metaKey || event.ctrlKey) {
          setSelectedNodeIds((current) => {
            const next = new Set(current);

            if (next.has(node.id)) {
              next.delete(node.id);
            } else {
              next.add(node.id);
            }

            return next;
          });
          setSelectedNodeId(node.id);
          setEditingNodeId(null);
          return;
        }

        setSelectedNodeId(node.id);
        setSelectedNodeIds(new Set([node.id]));
        setEditingNodeId((current) => (current === node.id ? current : null));
      }}
      onNodeDoubleClick={(_, node) => {
        if (selectedNodeIds.size > 1) {
          return;
        }

        setSelectedNodeId(node.id);
        setSelectedNodeIds(new Set([node.id]));
        setEditingNodeId(node.id);
      }}
      onPaneClick={() => {
        lastPasteRef.current = null;
        setSelectedNodeId(null);
        setSelectedNodeIds(new Set());
        setEditingNodeId(null);
      }}
      onNodeDragStart={(_, node) => {
        pushHistory();
        setSelectedNodeId(node.id);
        setSelectedNodeIds((current) =>
          current.has(node.id) ? current : new Set([node.id]),
        );
        setEditingNodeId(null);
        setTransientNodePositions({ [node.id]: node.position });
        setAlignmentGuides({});
        lastDragSnapRef.current = null;
        dragStartPositionRef.current = {
          nodeId: node.id,
          position: node.position,
        };
        lastDragPositionRef.current = {
          nodeId: node.id,
          position: node.position,
        };
      }}
      onNodeDragStop={(_, node) => {
        const lastDragSnap = lastDragSnapRef.current;
        const lastDragPosition = lastDragPositionRef.current;
        const dragStartPosition = dragStartPositionRef.current;
        const structuralDrop =
          lastDragSnap?.nodeId === node.id ? lastDragSnap.structuralDrop : undefined;
        const rawPosition =
          lastDragPosition?.nodeId === node.id ? lastDragPosition.position : node.position;
        const dragStart =
          dragStartPosition?.nodeId === node.id
            ? dragStartPosition.position
            : activeNodeViewState[node.id]?.position;
        const dragDistance = dragStart
          ? Math.hypot(rawPosition.x - dragStart.x, rawPosition.y - dragStart.y)
          : Number.POSITIVE_INFINITY;
        const shouldReturnToStart = Boolean(
          dragStart && dragDistance < DRAG_INTENT_THRESHOLD,
        );
        lastDragSnapRef.current = null;
        lastDragPositionRef.current = null;
        dragStartPositionRef.current = null;
        setTransientNodePositions({});
        setAlignmentGuides({});

        if (alignmentMode === "snap" && !shouldReturnToStart && structuralDrop) {
          const nextNodes = moveNodeToStructuralTarget(
            mindNodes,
            node.id,
            structuralDrop,
          );

          if (nextNodes) {
            const nextViewNodes = {
              ...activeNodeViewState,
              ...(structuralDrop.kind === "child"
                ? {
                    [structuralDrop.targetId]: {
                      ...activeNodeViewState[structuralDrop.targetId],
                      collapsed: false,
                    },
                  }
                : {}),
            };
            const laidOutNodes = applyTreeLayout(
              nextNodes,
              nextViewNodes,
              activeRootId,
              layoutSpacing,
            );

            setMindNodes(nextNodes);
            setSheetViewStates((current) => {
              const currentSheetState = current[activeSheetId] ?? activeSheetViewState;

              return {
                ...current,
                [activeSheetId]: {
                  ...currentSheetState,
                  nodes: laidOutNodes,
                },
              };
            });
            setSelectedNodeId(node.id);
            setSelectedNodeIds(new Set([node.id]));
            setEditingNodeId(null);
            focusNodeInCanvas(node.id, laidOutNodes, 240);
            setStatus("Moved node and recalculated layout");
            return;
          }
        }

        const position =
          shouldReturnToStart && dragStart
            ? dragStart
            : alignmentMode === "snap"
              ? (dragStart ?? rawPosition)
              : rawPosition;

        setSheetViewStates((current) => {
          const currentSheetState = current[activeSheetId] ?? activeSheetViewState;
          const currentNodeView =
            currentSheetState.nodes[node.id] ?? activeNodeViewState[node.id];
          const currentPosition = currentNodeView?.position;

          if (
            currentPosition?.x === position.x &&
            currentPosition.y === position.y
          ) {
            return current;
          }

          return {
            ...current,
            [activeSheetId]: {
              ...currentSheetState,
              nodes: {
                ...currentSheetState.nodes,
                [node.id]: {
                  ...currentNodeView,
                  position,
                },
              },
            },
          };
        });
      }}
      nodesDraggable={!editingNodeId}
      nodeDragThreshold={6}
      deleteKeyCode={null}
      panOnDrag={false}
      panOnScroll={!editingNodeId}
      panOnScrollSpeed={1.125}
      panOnScrollMode={PanOnScrollMode.Free}
      selectionOnDrag
      selectionMode={SelectionMode.Partial}
      zoomOnScroll={false}
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background
        color={canvasBackground.color}
        gap={canvasBackground.gap}
        size={canvasBackground.size}
        variant={BackgroundVariant.Dots}
      />
      <ViewportPortal>
        {alignmentGuides.vertical ? (
          <div
            className="alignment-guide alignment-guide-vertical"
            style={{
              height: Math.max(
                1,
                alignmentGuides.vertical.y2 - alignmentGuides.vertical.y1,
              ),
              transform: `translate(${alignmentGuides.vertical.x}px, ${alignmentGuides.vertical.y1}px)`,
            }}
          />
        ) : null}
        {alignmentGuides.horizontal ? (
          <div
            className="alignment-guide alignment-guide-horizontal"
            style={{
              transform: `translate(${alignmentGuides.horizontal.x1}px, ${alignmentGuides.horizontal.y}px)`,
              width: Math.max(
                1,
                alignmentGuides.horizontal.x2 - alignmentGuides.horizontal.x1,
              ),
            }}
          />
        ) : null}
        {alignmentGuides.snapBox ? (
          <div
            className="alignment-guide-snap-box"
            style={{
              height: alignmentGuides.snapBox.height,
              transform: `translate(${alignmentGuides.snapBox.x}px, ${alignmentGuides.snapBox.y}px)`,
              width: alignmentGuides.snapBox.width,
            }}
          />
        ) : null}
      </ViewportPortal>
      <Controls showFitView={false}>
        <ControlButton
          aria-label="Center mind map at 100 percent"
          onClick={() => fitCanvasToNodes(240)}
          title="Center mind map at 100%"
        >
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            width="16"
            height="16"
          >
            <path
              d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <circle
              cx="12"
              cy="12"
              r="3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </ControlButton>
        <ControlButton
          aria-label="Switch background theme"
          onClick={cycleBackgroundTheme}
          title="Switch background theme"
        >
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            width="16"
            height="16"
          >
            <path
              d="M12 4a8 8 0 0 0 0 16h1.5a1.8 1.8 0 0 0 1.3-3.05 1.25 1.25 0 0 1 .9-2.15H16a4 4 0 0 0 0-8.8h-4Z"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <circle cx="8.5" cy="10" r="1" fill="currentColor" />
            <circle cx="11.5" cy="8" r="1" fill="currentColor" />
            <circle cx="11" cy="13" r="1" fill="currentColor" />
          </svg>
        </ControlButton>
        <ControlButton
          aria-label={
            document.fullscreenElement ? "Exit browser fullscreen" : "Enter browser fullscreen"
          }
          onClick={toggleBrowserFullscreen}
          title={
            document.fullscreenElement ? "Exit browser fullscreen" : "Enter browser fullscreen"
          }
        >
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            width="20"
            height="20"
          >
            <path
              d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.4"
            />
          </svg>
        </ControlButton>
      </Controls>
    </ReactFlow>
  );

  const viewDisplayFont =
    viewDisplayFontOptions.find(
      (option) => option.value === viewDisplayPreferences.font,
    ) ?? viewDisplayFontOptions[0];
  const viewDisplaySize =
    viewDisplaySizeOptions.find(
      (option) => option.value === viewDisplayPreferences.size,
    ) ?? viewDisplaySizeOptions[1];
  const viewDisplayStyle = {
    "--document-block-border-width": viewDisplayPreferences.documentBlocksAligned
      ? "2px"
      : "0px",
    "--document-block-padding-left": viewDisplayPreferences.documentBlocksAligned
      ? "14px"
      : "0px",
    "--document-depth-indent": viewDisplayPreferences.documentBlocksAligned
      ? "14px"
      : "0px",
    "--view-display-font": viewDisplayFont.family,
    "--view-display-size": `${viewDisplaySize.baseSize}px`,
    "--view-display-heading-size": `${viewDisplaySize.headingSize}px`,
    "--view-display-meta-size": `${viewDisplaySize.metaSize}px`,
    "--view-display-table-size": `${viewDisplaySize.tableSize}px`,
  } as CSSProperties;
  const renderViewDisplayControls = (showDocumentBlockToggle = false) => (
    <div className="view-display-controls" aria-label="View display preferences">
      {showDocumentBlockToggle ? (
        <div
          className="view-display-control-group"
          aria-label="Document block alignment"
        >
          <button
            type="button"
            aria-pressed={viewDisplayPreferences.documentBlocksAligned}
            className={
              viewDisplayPreferences.documentBlocksAligned ? "is-active" : ""
            }
            onClick={() =>
              setViewDisplayPreferences((current) => ({
                ...current,
                documentBlocksAligned: !current.documentBlocksAligned,
              }))
            }
            title="Toggle document block indentation"
          >
            Blocks
          </button>
        </div>
      ) : null}
      <div className="view-display-control-group" aria-label="Display font">
        {viewDisplayFontOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={
              viewDisplayPreferences.font === option.value ? "is-active" : ""
            }
            onClick={() =>
              setViewDisplayPreferences((current) => ({
                ...current,
                font: option.value,
              }))
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="view-display-control-group" aria-label="Display font size">
        {viewDisplaySizeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={
              viewDisplayPreferences.size === option.value ? "is-active" : ""
            }
            onClick={() =>
              setViewDisplayPreferences((current) => ({
                ...current,
                size: option.value,
              }))
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );

  const documentView = (
    <section
      className="main-view-panel document-main-view"
      style={viewDisplayStyle}
    >
      <div className="main-view-header main-view-header-controls-only">
        {renderViewDisplayControls(true)}
      </div>
      <div className="document-flow">{renderDocumentNode(activeRootId)}</div>
    </section>
  );

  const outlineView = (
    <section className="main-view-panel outline-main-view" style={viewDisplayStyle}>
      <div className="main-view-header main-view-header-controls-only">
        {renderViewDisplayControls()}
      </div>
      <ol className="outline-tree">{renderOutlineNode(activeRootId)}</ol>
    </section>
  );

  const renderMainView = (view: ViewMode) => {
    if (view === "document") {
      return documentView;
    }

    if (view === "outline") {
      return outlineView;
    }

    return mindMapView;
  };

  const splitPanelView = activeView === "mindmap" ? "document" : activeView;
  const splitLeftView = isSplitReversed
    ? renderMainView(splitPanelView)
    : mindMapView;
  const splitRightView = isSplitReversed
    ? mindMapView
    : renderMainView(splitPanelView);
  const mainViewControls = (
    <div
      ref={floatingControlsRef}
      className="floating-view-controls"
      aria-label="Main view controls"
    >
      <div className="view-switcher" aria-label="Main view">
        <button
          type="button"
          className={activeView === "mindmap" ? "is-active" : ""}
          onClick={() => switchView("mindmap")}
        >
          Map
        </button>
        <button
          type="button"
          className={activeView === "document" ? "is-active" : ""}
          onClick={() => switchView("document")}
        >
          Document
        </button>
      </div>
      <button
        type="button"
        className={
          isOutlineOpen ? "outline-view-button is-active" : "outline-view-button"
        }
        onClick={toggleOutlinePanel}
        title="Toggle floating outline"
      >
        <span>Outline</span>
        <span className="split-switch" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={isSplitView ? "split-view-button is-active" : "split-view-button"}
        onClick={toggleSplitView}
      >
        <span>Split</span>
        <span className="split-switch" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={isSplitReversed ? "swap-view-button is-active" : "swap-view-button"}
        onClick={() => setIsSplitReversed((current) => !current)}
        title="Swap split view sides"
      >
        <span>Swap</span>
        <span className="split-switch" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div
      ref={appShellRef}
      className={`app-shell theme-${backgroundTheme}${
        isFullscreenLike ? " is-fullscreen-mode" : ""
      }`}
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <header className="toolbar">
        <div className="toolbar-menu-row">
          <div className="toolbar-brand">
          <h1 className="brand-logo">
            <span className="brand-lumen">Lumen</span>
            <span className="brand-product">MindMap</span>
          </h1>
          <p>Node-first rich text mind mapping</p>
          </div>
          <div className="toolbar-top-menus">
          <div
            className="toolbar-menu-wrap"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="compact-action"
              onClick={() => {
                setIsLayoutMenuOpen(false);
                  setIsViewMenuOpen(false);
                setIsAppMenuOpen((current) => !current);
              }}
            >
              Menu
            </button>
            {isAppMenuOpen ? (
              <div className="toolbar-menu">
                <button
                  type="button"
                  onClick={() => {
                    createNewMap();
                    setIsAppMenuOpen(false);
                  }}
                >
                  New map
                </button>
                <button
                  type="button"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setIsAppMenuOpen(false);
                  }}
                >
                  Open file (⌘O)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    createDemoTree();
                    setIsAppMenuOpen(false);
                  }}
                >
                  Demo tree
                </button>
                <button
                  type="button"
                  onClick={() => {
                    switchView("document");
                    setIsAppMenuOpen(false);
                  }}
                >
                  Document view
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openOutlinePanel();
                    setIsAppMenuOpen(false);
                  }}
                >
                  Outline view
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsStatsOpen(true);
                    setIsAppMenuOpen(false);
                  }}
                >
                  Map stats
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsHelpOpen(true);
                    setIsAppMenuOpen(false);
                  }}
                >
                  Help (?)
                </button>
              </div>
            ) : null}
          </div>
            <div
              className="toolbar-menu-wrap"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="compact-action"
                onClick={() => {
                  setIsAppMenuOpen(false);
                  setIsViewMenuOpen(false);
                  setIsLayoutMenuOpen((current) => !current);
                }}
              >
                Layout
              </button>
              {isLayoutMenuOpen ? (
                <div className="toolbar-menu layout-toolbar-menu">
                  <div className="toolbar-menu-section-label">Spacing</div>
                  {layoutSpacingOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={layoutSpacing === option.value ? "is-selected" : ""}
                      onClick={() => {
                        changeLayoutSpacing(option.value);
                        setIsLayoutMenuOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                  <div className="toolbar-menu-section-label">Alignment</div>
                  <button
                    type="button"
                    className={alignmentMode === "snap" ? "is-selected" : ""}
                    onClick={() => {
                      setAlignmentMode("snap");
                      setIsLayoutMenuOpen(false);
                    }}
                  >
                    Force align
                  </button>
                  <button
                    type="button"
                    className={alignmentMode === "guide" ? "is-selected" : ""}
                    onClick={() => {
                      setAlignmentMode("guide");
                      setIsLayoutMenuOpen(false);
                    }}
                  >
                    Guide only
                  </button>
                  <div className="toolbar-menu-section-label">Actions</div>
                  <button
                    type="button"
                    onClick={() => {
                      autoLayout();
                      setIsLayoutMenuOpen(false);
                    }}
                  >
                    Auto Layout
                  </button>
                </div>
              ) : null}
            </div>
            <div
              className="toolbar-menu-wrap"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="compact-action"
                onClick={() => {
                  setIsAppMenuOpen(false);
                  setIsLayoutMenuOpen(false);
                  setIsViewMenuOpen((current) => !current);
                }}
              >
                View
              </button>
              {isViewMenuOpen ? (
                <div className="toolbar-menu view-toolbar-menu">
                  <div className="toolbar-menu-section-label">Background</div>
                {backgroundThemeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={backgroundTheme === option.value ? "is-selected" : ""}
                    onClick={() => {
                      setBackgroundTheme(option.value);
                      setIsViewMenuOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
                </div>
              ) : null}
              </div>
          </div>
        </div>
        <div className="toolbar-control-row">
          <div className="toolbar-actions">
          <button type="button" className="compact-action" onClick={saveFile}>
            Save (⌘S)
          </button>
          <button type="button" className="compact-action" onClick={undoNodeChange}>
            Undo
          </button>
          <button type="button" className="compact-action" onClick={redoNodeChange}>
            Redo
          </button>
          <button type="button" className="compact-action" onClick={addChild}>
            + Child
          </button>
          <button type="button" className="compact-action" onClick={addSibling}>
            + Sibling
          </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mindmap.json,.xmind,application/json"
          hidden
          onChange={openFile}
        />
      </header>

      {sheetMenu ? (
        <div
          className="sheet-context-menu"
          style={{ left: sheetMenu.x, top: sheetMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              const sheet = sheets.find(
                (candidate) => candidate.id === sheetMenu.sheetId,
              );

              if (sheet) {
                startSheetTitleEdit(sheet);
              }

              setSheetMenu(null);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            disabled={sheets.length >= MAX_SHEETS}
            onClick={() => {
              duplicateSheet(sheetMenu.sheetId);
              setSheetMenu(null);
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="is-danger"
            disabled={sheets.length <= 1}
            onClick={() => {
              deleteSheet(sheetMenu.sheetId);
              setSheetMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      ) : null}

      {isHelpOpen ? (
        <div
          className="help-panel-backdrop"
          onMouseDown={() => setIsHelpOpen(false)}
        >
          <section
            className="help-panel"
            aria-label="Lumen shortcuts and rich blocks"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="help-panel-header">
              <div>
                <h2>Quick Help</h2>
                <p>Keyboard-first mind mapping with rich blocks.</p>
              </div>
              <button type="button" onClick={() => setIsHelpOpen(false)}>
                Close
              </button>
            </div>

            <div className="help-grid">
              <article>
                <h3>Mind Map Flow</h3>
                <p><kbd>Tab</kbd> creates a child node.</p>
                <p><kbd>Enter</kbd> inserts a new line while editing.</p>
                <p>Press <kbd>Enter</kbd> again on an empty line to create a sibling.</p>
                <p>Click selects a node. Double-click edits it.</p>
              </article>

              <article>
                <h3>Rich Blocks</h3>
                <p><strong>Math</strong> inserts inline formula source.</p>
                <p><strong>Block</strong> inserts block formula source.</p>
                <p><strong>Task</strong> toggles a task list.</p>
                <p><strong>Table</strong> inserts a 2x2 table.</p>
              </article>

              <article>
                <h3>Markdown Shortcuts</h3>
                <p><code>$x=1$</code> for inline formulas.</p>
                <p><code>$$x=1$$</code> on its own line for block formulas.</p>
                <p><code>==highlight==</code> creates highlighted text.</p>
                <p><code>|||</code> then Space inserts a table.</p>
              </article>

              <article>
                <h3>Files & Layout</h3>
                <p><kbd>Cmd/Ctrl</kbd> + <kbd>Z</kbd> undoes node operations.</p>
                <p><kbd>Cmd/Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> redoes node operations.</p>
                <p><kbd>Cmd/Ctrl</kbd> + <kbd>S</kbd> saves the file.</p>
                <p><kbd>Cmd/Ctrl</kbd> + <kbd>O</kbd> opens a file.</p>
                <p><kbd>?</kbd> opens this help panel.</p>
                <p>Auto Layout rearranges visible nodes with dagre.</p>
                <p>Layout spacing controls compact, standard, or spacious gaps.</p>
              </article>
            </div>
          </section>
        </div>
      ) : null}

      {isDocumentOpen ? (
        <div
          className="document-panel-backdrop"
          onMouseDown={() => setIsDocumentOpen(false)}
        >
          <section
            className="document-panel"
            aria-label="Document view"
            style={viewDisplayStyle}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="help-panel-header">
              <div>
                <h2>Document View</h2>
                <p>Linear projection of the active sheet from the same nodes.</p>
              </div>
              {renderViewDisplayControls(true)}
              <button type="button" onClick={() => setIsDocumentOpen(false)}>
                Close
              </button>
            </div>

            <div className="document-flow">{renderDocumentNode(activeRootId)}</div>
          </section>
        </div>
      ) : null}

      {isOutlineOpen ? (
        <section
          className="floating-outline-panel"
          aria-label="Floating outline view"
          style={{
            ...viewDisplayStyle,
            left: outlinePanelPosition.x,
            top: outlinePanelPosition.y,
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div
            className="floating-outline-header"
            onPointerDown={startOutlinePanelDrag}
          >
            <strong>Outline</strong>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setIsOutlineOpen(false)}
              title="Close outline"
            >
              ×
            </button>
          </div>
          <ol className="outline-tree floating-outline-tree">
            {renderOutlineNode(activeRootId)}
          </ol>
        </section>
      ) : null}

      {isStatsOpen ? (
        <div
          className="stats-panel-backdrop"
          onMouseDown={() => setIsStatsOpen(false)}
        >
          <section
            className="stats-panel"
            aria-label="Current map statistics"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="help-panel-header">
              <div>
                <h2>Map Stats</h2>
                <p>Lightweight checks for the active sheet and view state.</p>
              </div>
              <button type="button" onClick={() => setIsStatsOpen(false)}>
                Close
              </button>
            </div>

            <div className="stats-grid">
              <article>
                <span>Total Nodes</span>
                <strong>{mapStats.nodeCount}</strong>
              </article>
              <article>
                <span>Visible Nodes</span>
                <strong>{mapStats.visibleCount}</strong>
              </article>
              <article>
                <span>Hidden by Folding</span>
                <strong>{mapStats.hiddenCount}</strong>
              </article>
              <article>
                <span>Collapsed Nodes</span>
                <strong>{mapStats.collapsedCount}</strong>
              </article>
              <article>
                <span>Max Depth</span>
                <strong>{mapStats.maxDepth}</strong>
              </article>
              <article>
                <span>Layout Spacing</span>
                <strong>{getLayoutSpacingLabel(layoutSpacing)}</strong>
              </article>
              <article>
                <span>Positioned Nodes</span>
                <strong>
                  {mapStats.positionedCount}/{mapStats.nodeCount}
                </strong>
              </article>
              <article>
                <span>Measured Nodes</span>
                <strong>
                  {mapStats.measuredCount}/{mapStats.nodeCount}
                </strong>
              </article>
            </div>

            <div className="stats-details">
              <p>
                File format: <strong>v1.1</strong>, with content in nodes and
                coordinates in <code>viewState</code>.
              </p>
              <p>
                View state entries: <strong>{mapStats.viewStateCount}</strong>.
                Missing entries: <strong>{mapStats.missingViewStateCount}</strong>.
                Stale entries: <strong>{mapStats.staleViewStateCount}</strong>.
              </p>
            </div>
          </section>
        </div>
      ) : null}

      <main
        ref={flowWrapRef}
        className={[
          "flow-wrap",
          isSplitView ? "is-split-view" : "",
          isSplitView && isSplitReversed ? "is-map-controls-right" : "",
        ].join(" ")}
        style={
          isSplitView
            ? ({
                "--split-right-width": `${splitRightPercent}%`,
              } as CSSProperties)
            : undefined
        }
      >
        {mainViewControls}
        {isSplitView ? (
          <>
            <section className="split-pane">{splitLeftView}</section>
            <button
              type="button"
              className="split-resizer"
              aria-label="Resize split view"
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setSplitRightPercent((current) => Math.min(68, current + 4));
                }

                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setSplitRightPercent((current) => Math.max(28, current - 4));
                }
              }}
              onPointerDown={startSplitResize}
            />
            <section className="split-pane">{splitRightView}</section>
          </>
        ) : (
          renderMainView(activeView)
        )}
      </main>

      <nav className="sheet-tabs" aria-label="Sheets">
        <div className="sheet-tab-list">
          {sheets.map((sheet) => (
            <div
              key={sheet.id}
              className={[
                "sheet-tab-wrap",
                draggedSheetId === sheet.id ? "is-dragging" : "",
                dragOverSheetId === sheet.id && draggedSheetId !== sheet.id
                  ? "is-drag-over"
                  : "",
              ].join(" ")}
              draggable={editingSheetId !== sheet.id}
              onDragStart={(event: ReactDragEvent<HTMLDivElement>) => {
                setDraggedSheetId(sheet.id);
                setDragOverSheetId(null);
                setSheetMenu(null);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", sheet.id);
              }}
              onDragOver={(event: ReactDragEvent<HTMLDivElement>) => {
                if (!draggedSheetId || draggedSheetId === sheet.id) {
                  return;
                }

                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverSheetId(sheet.id);
              }}
              onDragLeave={() => {
                setDragOverSheetId((current) =>
                  current === sheet.id ? null : current,
                );
              }}
              onDrop={(event: ReactDragEvent<HTMLDivElement>) => {
                event.preventDefault();
                event.stopPropagation();

                const sourceId =
                  draggedSheetId || event.dataTransfer.getData("text/plain");

                if (!sourceId || sourceId === sheet.id) {
                  setDraggedSheetId(null);
                  setDragOverSheetId(null);
                  return;
                }

                const bounds = event.currentTarget.getBoundingClientRect();
                reorderSheet(
                  sourceId,
                  sheet.id,
                  event.clientX > bounds.left + bounds.width / 2,
                );
                setDraggedSheetId(null);
                setDragOverSheetId(null);
              }}
              onDragEnd={() => {
                setDraggedSheetId(null);
                setDragOverSheetId(null);
              }}
            >
              {editingSheetId === sheet.id ? (
                <input
                  className="sheet-title-input"
                  value={editingSheetTitle}
                  autoFocus
                  onChange={(event) => setEditingSheetTitle(event.target.value)}
                  onBlur={commitSheetTitleEdit}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitSheetTitleEdit();
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelSheetTitleEdit();
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={sheet.id === activeSheetId ? "is-active" : ""}
                  onClick={() => switchSheet(sheet.id)}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    startSheetTitleEdit(sheet);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    const menuWidth = 160;
                    const menuHeight = 132;

                    setSheetMenu({
                      sheetId: sheet.id,
                      x: Math.min(
                        event.clientX,
                        window.innerWidth - menuWidth - 8,
                      ),
                      y: Math.max(8, event.clientY - menuHeight),
                    });
                  }}
                >
                  {sheet.title}
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="add-sheet-button"
            disabled={sheets.length >= MAX_SHEETS}
            onClick={addSheet}
          >
            + Sheet
          </button>
        </div>
        <div className="sheet-meta">
          <span>
            {activeSheet.title} · {sheets.length}/{MAX_SHEETS}
          </span>
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <MindMapApp />
    </ReactFlowProvider>
  );
}

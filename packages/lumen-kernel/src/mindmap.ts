import dagre from "dagre";
import type {
  FlowEdge,
  FlowNode,
  JSONContent,
  LayoutSpacing,
  MindNode,
  NodeViewState,
  SheetViewState,
} from "./types";

const NODE_WIDTH = 280;
const NODE_HEIGHT = 78;

const layoutSpacingPresets: Record<
  LayoutSpacing,
  { ranksep: number; nodesep: number }
> = {
  compact: { ranksep: 120, nodesep: 70 },
  standard: { ranksep: 170, nodesep: 110 },
  spacious: { ranksep: 240, nodesep: 170 },
};

const getLayoutSpacing = (spacing: LayoutSpacing = "standard") =>
  layoutSpacingPresets[spacing];

const getNodeSize = (viewState?: NodeViewState) => ({
  width: Math.max(
    NODE_WIDTH,
    Math.ceil(viewState?.dimensions?.width ?? NODE_WIDTH),
  ),
  height: Math.max(
    NODE_HEIGHT,
    Math.ceil(viewState?.dimensions?.height ?? NODE_HEIGHT),
  ),
});

export const rootId = "node-1";

export const emptyDoc = (text = ""): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: text ? [{ type: "text", text }] : undefined,
    },
  ],
});

export const createBlankNodes = (): Record<string, MindNode> => ({
  [rootId]: {
    id: rootId,
    content: emptyDoc(),
    children: [],
    parent: null,
  },
});

const rootDemoDoc = (): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Lumen Demo Map" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "The child nodes below demonstrate formulas, task lists, tables, code blocks, and highlighting.",
        },
      ],
    },
  ],
});

const formulaDemoDoc = (): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Formula Example" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Inline formula: " },
        {
          type: "inlineMath",
          attrs: { latex: "LF_t = \\frac{Lev_t}{Lev_{t-1}}" },
        },
      ],
    },
    {
      type: "blockMath",
      attrs: { latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}" },
    },
  ],
});

const taskDemoDoc = (): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Task List Example" }],
    },
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: true },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Support task lists" }],
            },
          ],
        },
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Refine the instant editing experience" }],
            },
          ],
        },
      ],
    },
  ],
});

const tableDemoDoc = (): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Table Example" }],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Feature" }] }],
            },
            {
              type: "tableHeader",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Status" }] }],
            },
          ],
        },
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Formula" }] }],
            },
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Visible" }] }],
            },
          ],
        },
      ],
    },
  ],
});

const codeDemoDoc = (): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Code and highlight example: " },
        {
          type: "text",
          text: "key concept",
          marks: [{ type: "highlight" }],
        },
      ],
    },
    {
      type: "codeBlock",
      attrs: { language: "typescript" },
      content: [
        {
          type: "text",
          text: "type MindNode = {\n  id: string;\n  children: string[];\n};",
        },
      ],
    },
  ],
});

export const createInitialNodes = (): Record<string, MindNode> => ({
  [rootId]: {
    id: rootId,
    content: rootDemoDoc(),
    children: ["node-2", "node-3", "node-4", "node-5"],
    parent: null,
  },
  "node-2": {
    id: "node-2",
    content: formulaDemoDoc(),
    children: [],
    parent: rootId,
  },
  "node-3": {
    id: "node-3",
    content: taskDemoDoc(),
    children: [],
    parent: rootId,
  },
  "node-4": {
    id: "node-4",
    content: tableDemoDoc(),
    children: [],
    parent: rootId,
  },
  "node-5": {
    id: "node-5",
    content: codeDemoDoc(),
    children: [],
    parent: rootId,
  },
});

export const getVisibleNodeIds = (
  nodes: Record<string, MindNode>,
  root = rootId,
  viewState: Record<string, NodeViewState> = {},
) => {
  const visibleIds = new Set<string>();
  const visit = (nodeId: string) => {
    const node = nodes[nodeId];

    if (!node) {
      return;
    }

    visibleIds.add(nodeId);

    if (viewState[nodeId]?.collapsed) {
      return;
    }

    node.children.forEach(visit);
  };

  visit(root);

  return visibleIds;
};

export const toFlowEdges = (
  nodes: Record<string, MindNode>,
  root = rootId,
  viewState: Record<string, NodeViewState> = {},
): FlowEdge[] => {
  const visibleIds = getVisibleNodeIds(nodes, root, viewState);

  return Object.values(nodes)
    .filter((node) => visibleIds.has(node.id) && !viewState[node.id]?.collapsed)
    .flatMap((node) =>
      node.children
        .filter((childId) => visibleIds.has(childId))
        .map((childId) => ({
          id: `${node.id}-${childId}`,
          source: node.id,
          target: childId,
          type: "smoothstep",
        })),
    );
};

export const applyTreeLayout = (
  nodes: Record<string, MindNode>,
  viewState: Record<string, NodeViewState> = {},
  root = rootId,
  spacing: LayoutSpacing = "standard",
): Record<string, NodeViewState> => {
  const graph = new dagre.graphlib.Graph();
  const visibleIds = getVisibleNodeIds(nodes, root, viewState);
  const { nodesep, ranksep } = getLayoutSpacing(spacing);

  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    nodesep,
    ranksep,
    marginx: 40,
    marginy: 40,
  });

  Object.values(nodes)
    .filter((node) => visibleIds.has(node.id))
    .forEach((node) => {
      graph.setNode(node.id, getNodeSize(viewState[node.id]));
    });

  Object.values(nodes).forEach((node) => {
    if (!visibleIds.has(node.id) || viewState[node.id]?.collapsed) {
      return;
    }

    node.children
      .filter((childId) => visibleIds.has(childId))
      .forEach((childId) => graph.setEdge(node.id, childId));
  });

  dagre.layout(graph);

  return Object.fromEntries(
    Object.entries(nodes).map(([id]) => {
      const layoutNode = graph.node(id);

      if (!layoutNode) {
        return [id, viewState[id] ?? {}];
      }
      const size = getNodeSize(viewState[id]);

      return [
        id,
        {
          ...viewState[id],
          position: {
            x: layoutNode.x - size.width / 2,
            y: layoutNode.y - size.height / 2,
          },
        },
      ];
    }),
  );
};

export const getSiblingInsertPosition = (
  viewState: Record<string, NodeViewState>,
  nodeId: string,
  spacing: LayoutSpacing = "standard",
) => {
  const nodeViewState = viewState[nodeId];
  const size = getNodeSize(nodeViewState);
  const { nodesep } = getLayoutSpacing(spacing);

  return {
    x: (nodeViewState?.position?.x ?? 0) + 40,
    y: (nodeViewState?.position?.y ?? 0) + size.height + nodesep,
  };
};

export const getChildInsertPosition = (
  nodes: Record<string, MindNode>,
  viewState: Record<string, NodeViewState>,
  nodeId: string,
  spacing: LayoutSpacing = "standard",
) => {
  const node = nodes[nodeId];
  const nodeViewState = viewState[nodeId];
  const size = getNodeSize(nodeViewState);
  const { nodesep, ranksep } = getLayoutSpacing(spacing);

  return {
    x: (nodeViewState?.position?.x ?? 0) + size.width + ranksep,
    y:
      (nodeViewState?.position?.y ?? 0) +
      (node?.children.length ?? 0) * (NODE_HEIGHT + nodesep),
  };
};

export const removeNodeAndDescendants = (
  nodes: Record<string, MindNode>,
  nodeId: string,
  protectedRootId = rootId,
) => {
  if (nodeId === protectedRootId || !nodes[nodeId]?.parent) {
    return nodes;
  }

  const nextNodes = { ...nodes };
  const toDelete: string[] = [nodeId];

  for (let index = 0; index < toDelete.length; index += 1) {
    const current = nextNodes[toDelete[index]];
    current?.children.forEach((childId) => toDelete.push(childId));
  }

  const node = nextNodes[nodeId];

  if (node?.parent) {
    nextNodes[node.parent] = {
      ...nextNodes[node.parent],
      children: nextNodes[node.parent].children.filter((id) => id !== nodeId),
    };
  }

  toDelete.forEach((id) => {
    delete nextNodes[id];
  });

  return nextNodes;
};

export const toFlowNodes = <TData extends Record<string, unknown>>(
  nodes: Record<string, MindNode>,
  viewState: Record<string, NodeViewState>,
  createData: (node: MindNode) => TData,
  root = rootId,
): FlowNode<TData>[] => {
  const visibleIds = getVisibleNodeIds(nodes, root, viewState);

  return Object.values(nodes)
    .filter((node) => visibleIds.has(node.id))
    .map((node) => {
      const dimensions = viewState[node.id]?.dimensions;
      const hasManualDimensions = Boolean(viewState[node.id]?.manualDimensions);

      return {
        id: node.id,
        type: "mindMapNode",
        position: viewState[node.id]?.position ?? { x: 0, y: 0 },
        data: createData(node),
        className: hasManualDimensions ? "has-manual-dimensions" : "is-auto-sized",
        style: hasManualDimensions
          ? {
              width: Math.max(NODE_WIDTH, Math.ceil(dimensions?.width ?? NODE_WIDTH)),
              height: dimensions?.height
                ? Math.max(NODE_HEIGHT, Math.ceil(dimensions.height))
                : undefined,
            }
          : undefined,
      };
    });
};

export const nextIndexFromNodes = (nodes: Record<string, MindNode>) =>
  Math.max(
    1,
    ...Object.keys(nodes)
      .map((id) => Number(id.replace("node-", "")))
      .filter(Number.isFinite),
  ) + 1;

export const createDefaultSheetViewState = (
  nodes: Record<string, MindNode>,
  layoutSpacing: LayoutSpacing = "standard",
  root = rootId,
): SheetViewState => ({
  layoutSpacing,
  nodes: applyTreeLayout(
    nodes,
    Object.fromEntries(
      Object.keys(nodes).map((id) => [
        id,
        { position: id === root ? { x: 120, y: 120 } : { x: 0, y: 0 } },
      ]),
    ),
    root,
    layoutSpacing,
  ),
});

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import type { DocumentRegistry } from "@jupyterlab/docregistry";
import {
  applyTreeLayout,
  createDefaultSheetViewState,
  createEmptyMindMapFile,
  getChildInsertPosition,
  getSiblingInsertPosition,
  nextIndexFromNodes,
  parseMindMapFile,
  removeNodeAndDescendants,
  rootId,
  serializeMindMapFile,
  toFlowEdges,
  toFlowNodes,
  type MindMapSheet,
  type MindNode,
  type SheetViewState,
} from "lumen-kernel";
import { MindMapNode, type MindMapNodeData } from "./components/MindMapNode";
import { getModelText, setModelText } from "./model";

import "@xyflow/react/dist/style.css";

const nodeTypes = {
  mindMapNode: MindMapNode,
} satisfies NodeTypes;

type LumenEditorProps = {
  context: DocumentRegistry.IContext<DocumentRegistry.IModel>;
};

function LumenEditorInner({ context }: LumenEditorProps) {
  const reactFlow = useReactFlow<Node<MindMapNodeData>>();
  const [activeSheetId, setActiveSheetId] = useState("sheet-1");
  const [sheets, setSheets] = useState<MindMapSheet[]>(() => {
    const empty = createEmptyMindMapFile();
    return empty.file.sheets;
  });
  const [mindNodes, setMindNodes] = useState<Record<string, MindNode>>(
    () => createEmptyMindMapFile().file.sheets[0].nodes,
  );
  const [sheetViewStates, setSheetViewStates] = useState<
    Record<string, SheetViewState>
  >(() => ({
    "sheet-1": createEmptyMindMapFile().viewState["sheet-1"],
  }));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(rootId);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(rootId);
  const [nextNodeIndex, setNextNodeIndex] = useState(() =>
    nextIndexFromNodes(createEmptyMindMapFile().file.sheets[0].nodes),
  );
  const isHydratingRef = useRef(true);
  const saveTimerRef = useRef<number | null>(null);

  const activeSheet = sheets.find((sheet) => sheet.id === activeSheetId) ?? sheets[0];
  const activeRootId = activeSheet?.root_id ?? rootId;
  const activeViewState =
    sheetViewStates[activeSheetId] ?? createDefaultSheetViewState(mindNodes);
  const activeNodeViewState = activeViewState.nodes;

  const persistDocument = useCallback(
    (
      nextSheets: MindMapSheet[],
      nextActiveSheetId: string,
      nextViewStates: Record<string, SheetViewState>,
      nextNodes: Record<string, MindNode>,
    ) => {
      const syncedSheets = nextSheets.map((sheet) =>
        sheet.id === nextActiveSheetId
          ? { ...sheet, nodes: nextNodes }
          : sheet,
      );
      const text = serializeMindMapFile(
        syncedSheets,
        nextActiveSheetId,
        nextViewStates,
      );
      setModelText(context.model, text);
    },
    [context.model],
  );

  const scheduleSave = useCallback(
    (
      nextSheets: MindMapSheet[],
      nextActiveSheetId: string,
      nextViewStates: Record<string, SheetViewState>,
      nextNodes: Record<string, MindNode>,
    ) => {
      if (isHydratingRef.current) {
        return;
      }

      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = window.setTimeout(() => {
        persistDocument(nextSheets, nextActiveSheetId, nextViewStates, nextNodes);
      }, 400);
    },
    [persistDocument],
  );

  useEffect(() => {
    const loadFromModel = () => {
      const source = getModelText(context.model).trim();

      try {
        if (!source) {
          const empty = createEmptyMindMapFile();
          const firstSheet = empty.file.sheets[0];
          setSheets(empty.file.sheets);
          setActiveSheetId(empty.activeSheetId);
          setMindNodes(firstSheet.nodes);
          setSheetViewStates(empty.viewState);
          setSelectedNodeId(firstSheet.root_id);
          setEditingNodeId(firstSheet.root_id);
          setNextNodeIndex(nextIndexFromNodes(firstSheet.nodes));
          return;
        }

        const parsed = parseMindMapFile(source);
        const active =
          parsed.sheets.find((sheet) => sheet.id === parsed.activeSheetId) ??
          parsed.sheets[0];
        setSheets(parsed.sheets);
        setActiveSheetId(parsed.activeSheetId);
        setMindNodes(active.nodes);
        setSheetViewStates(parsed.viewState);
        setSelectedNodeId(active.root_id);
        setEditingNodeId(active.root_id);
        setNextNodeIndex(nextIndexFromNodes(active.nodes));
      } catch (error) {
        console.error("Failed to parse Lumen file", error);
      }
    };

    isHydratingRef.current = true;
    loadFromModel();
    window.requestAnimationFrame(() => {
      isHydratingRef.current = false;
    });

    const changed = () => {
      isHydratingRef.current = true;
      loadFromModel();
      window.requestAnimationFrame(() => {
        isHydratingRef.current = false;
      });
    };

    context.model.contentChanged.connect(changed);
    return () => {
      context.model.contentChanged.disconnect(changed);
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [context.model.sharedModel]);

  const updateNodeContent = useCallback(
    (nodeId: string, content: MindNode["content"]) => {
      setMindNodes((current) => {
        const nextNodes = {
          ...current,
          [nodeId]: {
            ...current[nodeId],
            content,
          },
        };
        scheduleSave(sheets, activeSheetId, sheetViewStates, nextNodes);
        return nextNodes;
      });
    },
    [activeSheetId, scheduleSave, sheetViewStates, sheets],
  );

  const createNode = useCallback(
    (
      parentId: string | null,
      position: { x: number; y: number },
      insertAfterNodeId?: string,
    ) => {
      const id = `node-${nextNodeIndex}`;
      const node: MindNode = {
        id,
        content: { type: "doc", content: [{ type: "paragraph" }] },
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
        ...(parentId
          ? {
              [parentId]: {
                ...activeNodeViewState[parentId],
                collapsed: false,
              },
            }
          : {}),
      };
      const laidOutNodes = applyTreeLayout(
        nextNodes,
        nextViewNodes,
        activeRootId,
        activeViewState.layoutSpacing,
      );
      const nextViewStates = {
        ...sheetViewStates,
        [activeSheetId]: {
          ...activeViewState,
          nodes: laidOutNodes,
        },
      };

      setMindNodes(nextNodes);
      setSheetViewStates(nextViewStates);
      setNextNodeIndex((current) => current + 1);
      setSelectedNodeId(id);
      setEditingNodeId(id);
      scheduleSave(sheets, activeSheetId, nextViewStates, nextNodes);
    },
    [
      activeNodeViewState,
      activeRootId,
      activeSheetId,
      activeViewState,
      mindNodes,
      nextNodeIndex,
      scheduleSave,
      sheetViewStates,
      sheets,
    ],
  );

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
            isSelected: selectedNodeId === node.id,
            onEdit: () => {
              setEditingNodeId(node.id);
              setSelectedNodeId(node.id);
            },
            onFocus: () => setSelectedNodeId(node.id),
            onBlur: () =>
              setEditingNodeId((current) => (current === node.id ? null : current)),
            onAddChild: () =>
              createNode(
                node.id,
                getChildInsertPosition(
                  mindNodes,
                  activeNodeViewState,
                  node.id,
                  activeViewState.layoutSpacing,
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
                    activeViewState.layoutSpacing,
                  ),
                );
                return;
              }

              createNode(
                node.parent,
                getSiblingInsertPosition(
                  activeNodeViewState,
                  node.id,
                  activeViewState.layoutSpacing,
                ),
                node.id,
              );
            },
            onResizeStart: () => undefined,
            onToggleCollapse: () => {
              if (!node.children.length) {
                return;
              }

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
                activeViewState.layoutSpacing,
              );
              const nextViewStates = {
                ...sheetViewStates,
                [activeSheetId]: {
                  ...activeViewState,
                  nodes: laidOutNodes,
                },
              };

              setSheetViewStates(nextViewStates);
              setSelectedNodeId(node.id);
              setEditingNodeId(null);
              scheduleSave(sheets, activeSheetId, nextViewStates, mindNodes);
            },
            onContentChange: (content) => updateNodeContent(node.id, content),
          },
        ]),
      ),
    [
      activeNodeViewState,
      activeRootId,
      activeSheetId,
      activeViewState,
      createNode,
      editingNodeId,
      mindNodes,
      scheduleSave,
      selectedNodeId,
      sheetViewStates,
      sheets,
      updateNodeContent,
    ],
  );

  const flowNodes = useMemo(
    () =>
      toFlowNodes(
        mindNodes,
        activeNodeViewState,
        (node) => nodeDataById[node.id],
        activeRootId,
      ),
    [activeNodeViewState, activeRootId, mindNodes, nodeDataById],
  );
  const flowEdges = useMemo(
    () => toFlowEdges(mindNodes, activeRootId, activeNodeViewState),
    [activeNodeViewState, activeRootId, mindNodes],
  );

  useEffect(() => {
    const bounds = flowNodes.reduce<{
      maxX: number;
      maxY: number;
      minX: number;
      minY: number;
    } | null>((current, node) => {
      const width = activeNodeViewState[node.id]?.dimensions?.width ?? 280;
      const height = activeNodeViewState[node.id]?.dimensions?.height ?? 78;
      const next = {
        minX: node.position.x,
        minY: node.position.y,
        maxX: node.position.x + width,
        maxY: node.position.y + height,
      };

      if (!current) {
        return next;
      }

      return {
        minX: Math.min(current.minX, next.minX),
        minY: Math.min(current.minY, next.minY),
        maxX: Math.max(current.maxX, next.maxX),
        maxY: Math.max(current.maxY, next.maxY),
      };
    }, null);

    if (!bounds) {
      return;
    }

    reactFlow.setCenter(
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      { zoom: 1, duration: 0 },
    );
  }, [activeSheetId, activeNodeViewState, flowNodes, reactFlow]);

  const onPaneClick = useCallback(() => {
    setEditingNodeId(null);
  }, []);

  const onNodeClick = useCallback((_: unknown, node: Node<MindMapNodeData>) => {
    setSelectedNodeId(node.id);
    setEditingNodeId(null);
  }, []);

  const onNodeDoubleClick = useCallback((_: unknown, node: Node<MindMapNodeData>) => {
    setSelectedNodeId(node.id);
    setEditingNodeId(node.id);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedNodeId &&
        selectedNodeId !== activeRootId &&
        !editingNodeId
      ) {
        const nextNodes = removeNodeAndDescendants(
          mindNodes,
          selectedNodeId,
          activeRootId,
        );
        const nextViewNodes = Object.fromEntries(
          Object.entries(activeNodeViewState).filter(([id]) => nextNodes[id]),
        );
        const laidOutNodes = applyTreeLayout(
          nextNodes,
          nextViewNodes,
          activeRootId,
          activeViewState.layoutSpacing,
        );
        const nextViewStates = {
          ...sheetViewStates,
          [activeSheetId]: {
            ...activeViewState,
            nodes: laidOutNodes,
          },
        };
        const fallbackParent = mindNodes[selectedNodeId]?.parent ?? activeRootId;

        setMindNodes(nextNodes);
        setSheetViewStates(nextViewStates);
        setSelectedNodeId(fallbackParent);
        setEditingNodeId(null);
        scheduleSave(sheets, activeSheetId, nextViewStates, nextNodes);
      }
    },
    [
      activeNodeViewState,
      activeRootId,
      activeSheetId,
      activeViewState,
      editingNodeId,
      mindNodes,
      scheduleSave,
      selectedNodeId,
      sheetViewStates,
      sheets,
    ],
  );

  return (
    <div className="jp-LumenEditor" tabIndex={0} onKeyDown={onKeyDown}>
      <header className="jp-LumenEditor-header">
        <strong>{context.path.split("/").pop()}</strong>
        <span>{Object.keys(mindNodes).length} nodes</span>
      </header>
      <div className="jp-LumenEditor-canvas">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={1.8}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onPaneClick={onPaneClick}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls showFitView showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

export function LumenEditor(props: LumenEditorProps) {
  return (
    <ReactFlowProvider>
      <LumenEditorInner {...props} />
    </ReactFlowProvider>
  );
}

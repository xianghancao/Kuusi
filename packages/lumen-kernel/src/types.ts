export type JSONContent = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

export type MindNode = {
  id: string;
  content: JSONContent;
  children: string[];
  parent: string | null;
};

export type LayoutSpacing = "compact" | "standard" | "spacious";

export type NodeViewState = {
  position?: { x: number; y: number };
  dimensions?: { width: number; height: number };
  manualDimensions?: boolean;
  collapsed?: boolean;
};

export type SheetViewState = {
  layoutSpacing: LayoutSpacing;
  nodes: Record<string, NodeViewState>;
};

export type MindMapSheet = {
  id: string;
  title: string;
  root_id: string;
  nodes: Record<string, MindNode>;
};

export type MindMapFile = {
  version: "1.0" | "1.1";
  active_sheet_id?: string;
  sheets: MindMapSheet[];
  viewState?: Record<string, SheetViewState>;
  root_id?: string;
  nodes?: Record<string, MindNode>;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
};

export type FlowNode<TData extends Record<string, unknown>> = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: TData;
  className?: string;
  style?: {
    width?: number;
    height?: number;
  };
};

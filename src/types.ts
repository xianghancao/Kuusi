import type { JSONContent } from "@tiptap/react";

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

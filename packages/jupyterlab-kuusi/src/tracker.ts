import { WidgetTracker } from "@jupyterlab/apputils";
import type { MarkdownMindMapDocumentWidget } from "./markdownMindMapWidget";
import type { NotebookMindMapDocumentWidget } from "./notebookMindMapDocument";

export type KuusiMindMapDocumentWidget =
  | NotebookMindMapDocumentWidget
  | MarkdownMindMapDocumentWidget;

export class NotebookMindMapTracker extends WidgetTracker<KuusiMindMapDocumentWidget> {
  constructor() {
    super({
      namespace: "notebook-mindmap",
    });
  }
}

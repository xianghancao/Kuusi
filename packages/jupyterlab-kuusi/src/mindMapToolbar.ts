import {
  SessionContextDialogs,
  Toolbar,
  ToolbarButton,
  type IToolbarWidgetRegistry,
} from "@jupyterlab/apputils";
import {
  CellTypeSwitcher,
  ExecutionIndicator,
  ToolbarItems,
  type Notebook,
  type NotebookPanel,
} from "@jupyterlab/notebook";
import type { ITranslator } from "@jupyterlab/translation";
import {
  copyIcon,
  cutIcon,
  pasteIcon,
} from "@jupyterlab/ui-components";
import type { Widget } from "@lumino/widgets";
import {
  copyMindMapSubtree,
  cutMindMapSubtree,
  pasteMindMapClipboard,
} from "./mindMapKeyboard";
import type { NotebookMindMapDocumentWidget } from "./notebookMindMapWidget";

export interface MindMapNotebookPanelLike {
  content: Notebook;
  sessionContext: NotebookMindMapDocumentWidget["context"]["sessionContext"];
  context: NotebookMindMapDocumentWidget["context"];
  isDisposed: boolean;
}

export const toMindMapNotebookPanel = (
  widget: Widget,
): MindMapNotebookPanelLike => {
  const panel = widget as NotebookMindMapDocumentWidget;

  return {
    content: panel.content.notebook,
    sessionContext: panel.context.sessionContext,
    context: panel.context,
    isDisposed: panel.isDisposed,
  };
};

const asNotebookPanel = (
  panel: MindMapNotebookPanelLike,
): NotebookPanel => panel as unknown as NotebookPanel;

export const registerMindMapToolbarFactories = (
  toolbarRegistry: IToolbarWidgetRegistry,
  factoryName: string,
  translator: ITranslator,
): void => {
  const sessionDialogs = new SessionContextDialogs({ translator });
  const panelLike = (widget: Widget) => toMindMapNotebookPanel(widget);

  toolbarRegistry.addFactory(factoryName, "save", (widget) =>
    ToolbarItems.createSaveButton(
      widget as unknown as NotebookPanel,
      translator,
    ),
  );

  toolbarRegistry.addFactory(factoryName, "insert", (widget) =>
    ToolbarItems.createInsertButton(asNotebookPanel(panelLike(widget)), translator),
  );

  toolbarRegistry.addFactory(factoryName, "cut", (widget) => {
    const panel = panelLike(widget);

    return new ToolbarButton({
      icon: cutIcon,
      tooltip: "Cut the selected topic and its subtree",
      onClick: () => {
        const model = panel.content.model;

        if (!model) {
          return;
        }

        cutMindMapSubtree(panel.content, model);
      },
    });
  });

  toolbarRegistry.addFactory(factoryName, "copy", (widget) => {
    const panel = panelLike(widget);

    return new ToolbarButton({
      icon: copyIcon,
      tooltip: "Copy the selected topic and its subtree",
      onClick: () => {
        const model = panel.content.model;

        if (!model) {
          return;
        }

        copyMindMapSubtree(panel.content, model);
      },
    });
  });

  toolbarRegistry.addFactory(factoryName, "paste", (widget) => {
    const panel = panelLike(widget);

    return new ToolbarButton({
      icon: pasteIcon,
      tooltip: "Paste subtree or plain text as child topics",
      onClick: () => {
        const model = panel.content.model;

        if (!model) {
          return;
        }

        void pasteMindMapClipboard(panel.content, model);
      },
    });
  });

  toolbarRegistry.addFactory(factoryName, "run", (widget) =>
    ToolbarItems.createRunButton(
      asNotebookPanel(panelLike(widget)),
      sessionDialogs,
      translator,
    ),
  );

  toolbarRegistry.addFactory(factoryName, "interrupt", (widget) =>
    Toolbar.createInterruptButton(
      panelLike(widget).sessionContext,
      translator,
    ),
  );

  toolbarRegistry.addFactory(factoryName, "restart", (widget) =>
    Toolbar.createRestartButton(
      panelLike(widget).sessionContext,
      sessionDialogs,
      translator,
    ),
  );

  toolbarRegistry.addFactory(factoryName, "restart-and-run", (widget) =>
    ToolbarItems.createRestartRunAllButton(
      asNotebookPanel(panelLike(widget)),
      sessionDialogs,
      translator,
    ),
  );

  toolbarRegistry.addFactory(factoryName, "cellType", (widget) =>
    new CellTypeSwitcher(panelLike(widget).content, translator),
  );

  toolbarRegistry.addFactory(factoryName, "kernelName", (widget) =>
    Toolbar.createKernelNameItem(
      panelLike(widget).sessionContext,
      sessionDialogs,
      translator,
    ),
  );

  toolbarRegistry.addFactory(factoryName, "executionProgress", (widget) =>
    ExecutionIndicator.createExecutionIndicatorItem(
      asNotebookPanel(panelLike(widget)),
      translator,
    ),
  );
};

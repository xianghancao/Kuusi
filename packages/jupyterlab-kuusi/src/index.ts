import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import {
  createToolbarFactory,
  ICommandPalette,
  IToolbarWidgetRegistry,
} from "@jupyterlab/apputils";
import { IEditorServices } from "@jupyterlab/codeeditor";
import { PathExt } from "@jupyterlab/coreutils";
import { IDocumentManager } from "@jupyterlab/docmanager";
import {
  INotebookTracker,
  NotebookActions,
  NotebookPanel,
} from "@jupyterlab/notebook";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { ISettingRegistry } from "@jupyterlab/settingregistry";
import { ITranslator, nullTranslator } from "@jupyterlab/translation";
import {
  addIcon,
  copyIcon,
  cutIcon,
  pasteIcon,
  ToolbarButton,
} from "@jupyterlab/ui-components";
import {
  NotebookMindMapDocumentWidget,
  NotebookMindMapWidgetFactory,
} from "./notebookMindMapWidget";
import {
  copyMindMapSubtree,
  cutMindMapSubtree,
  pasteMindMapClipboard,
} from "./mindMapKeyboard";
import { registerMindMapToolbarFactories } from "./mindMapToolbar";
import {
  bindNotebookToMindMapSync,
  renderMarkdownCellInNotebookEditor,
  revealCellInNotebookEditor,
  syncNotebookPanelToMindMaps,
} from "./notebookViewSync";
import { NotebookMindMapTracker } from "./tracker";
import { MindMapSettingsManager } from "./mindMapSettings";

const PLUGIN_ID = "jupyterlab-kuusi:plugin";

namespace CommandIDs {
  export const openNotebookMindMap =
    "jupyterlab-kuusi:open-notebook-mindmap";
  export const addMindMap = "jupyterlab-kuusi:add-mindmap";
  export const insertCellBelow = "jupyterlab-kuusi:insert-cell-below";
  export const cutCell = "jupyterlab-kuusi:cut-cell";
  export const copyCell = "jupyterlab-kuusi:copy-cell";
  export const pasteCellBelow = "jupyterlab-kuusi:paste-cell-below";
}

type OpenNotebookMindMapArgs = {
  path?: string;
  toolbar?: boolean;
};

const resolveNotebookPath = (
  args: OpenNotebookMindMapArgs,
  notebookTracker: INotebookTracker,
): string | null => {
  if (args.path) {
    return args.path;
  }

  return notebookTracker.currentWidget?.context.path ?? null;
};

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: "Spatial notebook mind map using native Jupyter cell renderers.",
  autoStart: true,
  requires: [
    IRenderMimeRegistry,
    IDocumentManager,
    NotebookPanel.IContentFactory,
    IEditorServices,
    INotebookTracker,
    IToolbarWidgetRegistry,
    ISettingRegistry,
    ITranslator,
  ],
  optional: [ICommandPalette],
  activate: (
    app: JupyterFrontEnd,
    rendermime: IRenderMimeRegistry,
    docManager: IDocumentManager,
    contentFactory: NotebookPanel.IContentFactory,
    editorServices: IEditorServices,
    notebookTracker: INotebookTracker,
    toolbarRegistry: IToolbarWidgetRegistry,
    settingRegistry: ISettingRegistry,
    translator: ITranslator,
    palette: ICommandPalette | null,
  ) => {
    const mindMapTracker = new NotebookMindMapTracker();
    const factoryName = NotebookMindMapWidgetFactory.NAME;

    const getActiveNotebook = () =>
      mindMapTracker.currentWidget?.content.notebook ?? null;

    const registerNotebookCommand = (
      id: string,
      options: {
        label: string;
        caption: string;
        icon: typeof addIcon;
        execute: (notebook: NonNullable<ReturnType<typeof getActiveNotebook>>) => void;
      },
    ) => {
      app.commands.addCommand(id, {
        label: options.label,
        caption: options.caption,
        icon: options.icon,
        isEnabled: () => getActiveNotebook() !== null,
        execute: () => {
          const notebook = getActiveNotebook();

          if (!notebook) {
            return;
          }

          options.execute(notebook);
        },
      });
    };

    const trans = (translator ?? nullTranslator).load("jupyterlab");
    const mindMapSettings = new MindMapSettingsManager(settingRegistry);
    void mindMapSettings.ready();

    registerNotebookCommand(CommandIDs.insertCellBelow, {
      label: trans.__("Insert a cell below"),
      caption: trans.__("Insert a cell below"),
      icon: addIcon,
      execute: (notebook) => {
        NotebookActions.insertBelow(notebook);
      },
    });

    registerNotebookCommand(CommandIDs.cutCell, {
      label: trans.__("Cut Cell"),
      caption: trans.__("Cut the selected topic and its subtree"),
      icon: cutIcon,
      execute: (notebook) => {
        const model = notebook.model;

        if (!model) {
          return;
        }

        cutMindMapSubtree(notebook, model);
      },
    });

    registerNotebookCommand(CommandIDs.copyCell, {
      label: trans.__("Copy Cell"),
      caption: trans.__("Copy the selected topic and its subtree"),
      icon: copyIcon,
      execute: (notebook) => {
        const model = notebook.model;

        if (!model) {
          return;
        }

        copyMindMapSubtree(notebook, model);
      },
    });

    registerNotebookCommand(CommandIDs.pasteCellBelow, {
      label: trans.__("Paste Cell Below"),
      caption: trans.__(
        "Paste a topic subtree, or plain text as child topics",
      ),
      icon: pasteIcon,
      execute: (notebook) => {
        const model = notebook.model;

        if (!model) {
          return;
        }

        void pasteMindMapClipboard(notebook, model);
      },
    });

    app.commands.addCommand(CommandIDs.addMindMap, {
      label: trans.__("Add Mind Map"),
      caption: trans.__("Create a new notebook in this folder and open it as a mind map"),
      icon: addIcon,
      isEnabled: () => mindMapTracker.currentWidget !== null,
      execute: async () => {
        const panel = mindMapTracker.currentWidget;

        if (!panel) {
          return;
        }

        const directory = PathExt.dirname(panel.context.localPath);
        const model = await docManager.newUntitled({
          path: directory,
          type: "notebook",
        });

        return docManager.openOrReveal(model.path, factoryName);
      },
    });

    const toolbarFactory = createToolbarFactory(
      toolbarRegistry,
      settingRegistry,
      factoryName,
      PLUGIN_ID,
      translator,
    );

    const factory = new NotebookMindMapWidgetFactory(
      rendermime,
      contentFactory,
      editorServices.mimeTypeService,
      app.commands,
      mindMapSettings,
      translator ?? nullTranslator,
      toolbarFactory,
    );

    app.docRegistry.addWidgetFactory(factory);

    registerMindMapToolbarFactories(
      toolbarRegistry,
      factoryName,
      translator ?? nullTranslator,
    );

    factory.widgetCreated.connect((_, widget) => {
      void mindMapTracker.add(widget);

      widget.content.bindRevealCellInNotebook((cellIndex) => {
        void revealCellInNotebookEditor(
          widget.context.path,
          cellIndex,
          notebookTracker,
          docManager,
        );
      });

      widget.content.bindSyncMarkdownToNotebook((cellIndex) => {
        renderMarkdownCellInNotebookEditor(
          widget.context.path,
          cellIndex,
          notebookTracker,
        );
      });

      widget.content.bindSourceActiveCellIndex(() => {
        let activeIndex = -1;

        notebookTracker.forEach((panel) => {
          if (panel.context.path === widget.context.path) {
            activeIndex = panel.content.activeCellIndex;
          }
        });

        return activeIndex;
      });

      notebookTracker.forEach((panel) => {
        if (panel.context.path === widget.context.path) {
          widget.content.requestOpenCenter(panel.content.activeCellIndex);
        }
      });
    });

    notebookTracker.forEach((panel) => {
      bindNotebookToMindMapSync(panel, mindMapTracker);
    });

    notebookTracker.widgetAdded.connect((_, panel) => {
      bindNotebookToMindMapSync(panel, mindMapTracker);
    });

    notebookTracker.currentChanged.connect((_, panel) => {
      if (panel) {
        syncNotebookPanelToMindMaps(panel, mindMapTracker);
      }
    });

    const openMindMap = (path: string) =>
      docManager.openOrReveal(path, factoryName);

    app.commands.addCommand(CommandIDs.openNotebookMindMap, {
      label: trans.__("Kuusi"),
      caption: trans.__("Open this notebook in the Kuusi mind map view"),
      isEnabled: (args: OpenNotebookMindMapArgs) =>
        Boolean(resolveNotebookPath(args, notebookTracker)),
      execute: async (args: OpenNotebookMindMapArgs) => {
        const path = resolveNotebookPath(args, notebookTracker);

        if (!path) {
          return;
        }

        const widget = await openMindMap(path);

        if (widget instanceof NotebookMindMapDocumentWidget) {
          let activeIndex = -1;

          notebookTracker.forEach((panel) => {
            if (panel.context.path === path) {
              activeIndex = panel.content.activeCellIndex;
            }
          });

          if (activeIndex < 0) {
            activeIndex = widget.content.notebook.activeCellIndex;
          }

          if (activeIndex >= 0) {
            widget.content.requestOpenCenter(activeIndex);

            // Layout/viewport may not be ready on the first sync; nudge again.
            window.requestAnimationFrame(() => {
              if (!widget.isDisposed && activeIndex >= 0) {
                widget.content.requestOpenCenter(activeIndex);
              }
            });
          }
        }

        return widget;
      },
    });

    toolbarRegistry.addFactory(
      "Notebook",
      "open-mindmap",
      (panel: NotebookPanel) =>
        new ToolbarButton({
          className: "jp-KuusiNotebookOpenButton",
          label: trans.__("Kuusi"),
          tooltip: trans.__("Open this notebook in the Kuusi mind map view"),
          onClick: () => {
            void app.commands.execute(CommandIDs.openNotebookMindMap, {
              path: panel.context.path,
            });
          },
        }),
    );

    if (palette) {
      palette.addItem({
        command: CommandIDs.openNotebookMindMap,
        category: "Kuusi",
      });
    }

    console.info("jupyterlab-kuusi: refactor extension activated");
  },
};

export default plugin;

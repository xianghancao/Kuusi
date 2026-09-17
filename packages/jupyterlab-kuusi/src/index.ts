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
  notebookIcon,
  pasteIcon,
  ToolbarButton,
} from "@jupyterlab/ui-components";
import { mindMapIcon } from "./kuusiIcon";
import { createKuusiMindMapNotebook } from "./mindMapNotebook";
import { attachNotebookAutoReload } from "./notebookAutoReload";
import {
  getNotebookAutoReloadEnabled,
  registerNotebookAutoReloadListener,
} from "./notebookAutoReloadRegistry";
import { registerNotebookAutoReloadToolbarFactories } from "./notebookAutoReloadToolbar";
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
  activateNotebookView,
  bindMindMapFocusOwnership,
  bindNotebookToMindMapSync,
  claimKuusiFocus,
  ensureNotebookPanelOpen,
  renderMarkdownCellInNotebookEditor,
  revealCellInNotebookEditor,
  splitRightOfNotebookOptions,
  syncNotebookPanelToMindMaps,
} from "./notebookViewSync";
import { NotebookMindMapTracker } from "./tracker";
import { MindMapSettingsManager } from "./mindMapSettings";
import defaultOpenersPlugin from "./defaultOpeners/plugin";
import launcherPlugin from "./launcherPlugin";
import channelMonitorPlugin from "./channelMonitor/plugin";
import compressPlugin from "./compress/plugin";
import imagePlugin from "./imageView/plugin";
import livePdfPlugin from "./livePdf/plugin";
import voiceRecorderPlugin from "./voiceRecorder/plugin";
import markdownPreviewPlugin from "./markdownPreview/plugin";
import texCompilePlugin from "./texCompile/plugin";
import { gateFullReleasePlugin } from "./releaseTierGate";

const PLUGIN_ID = "jupyterlab-kuusi:plugin";

namespace CommandIDs {
  export const openNotebookMindMap =
    "jupyterlab-kuusi:open-notebook-mindmap";
  export const openNotebookView = "jupyterlab-kuusi:open-notebook-view";
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

type OpenNotebookViewArgs = {
  path?: string;
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

const resolveMindMapPath = (
  args: OpenNotebookViewArgs,
  mindMapTracker: NotebookMindMapTracker,
): string | null => {
  if (args.path) {
    return args.path;
  }

  return mindMapTracker.currentWidget?.context.path ?? null;
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
    _translator: ITranslator,
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

    // Force English for Kuusi commands/toolbars until a dedicated locale pack exists.
    const kuusiTranslator = nullTranslator;
    const trans = kuusiTranslator.load("jupyterlab");
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
        "Paste as child of the selected topic (subtree or plain text)",
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
        const path = await createKuusiMindMapNotebook(docManager, directory);

        return docManager.openOrReveal(path, factoryName);
      },
    });

    const toolbarFactory = createToolbarFactory(
      toolbarRegistry,
      settingRegistry,
      factoryName,
      PLUGIN_ID,
      kuusiTranslator,
    );

    const contents = app.serviceManager.contents;

    const factory = new NotebookMindMapWidgetFactory(
      rendermime,
      contentFactory,
      editorServices.mimeTypeService,
      app.commands,
      mindMapSettings,
      kuusiTranslator,
      contents,
      toolbarFactory,
    );

    app.docRegistry.addWidgetFactory(factory);

    const attachClassicNotebookAutoReload = (panel: NotebookPanel): void => {
      void panel.context.ready.then(() => {
        if (panel.isDisposed) {
          return;
        }

        const path = panel.context.path;
        const handle = attachNotebookAutoReload(panel.context, contents, {
          getEnabled: () => getNotebookAutoReloadEnabled(path),
          onLastModified: () => undefined,
        });
        const unregister = registerNotebookAutoReloadListener(path, handle);

        panel.disposed.connect(() => {
          unregister();
          handle.dispose();
        });
      });
    };

    notebookTracker.forEach((panel) => {
      attachClassicNotebookAutoReload(panel);
    });
    notebookTracker.widgetAdded.connect((_, panel) => {
      attachClassicNotebookAutoReload(panel);
    });

    registerNotebookAutoReloadToolbarFactories(toolbarRegistry);

    registerMindMapToolbarFactories(
      toolbarRegistry,
      factoryName,
      kuusiTranslator,
    );

    factory.widgetCreated.connect((_, widget) => {
      void mindMapTracker.add(widget);
      bindMindMapFocusOwnership(widget, notebookTracker);
      claimKuusiFocus(widget.context.path);

      widget.content.bindRevealCellInNotebook((cellIndex) => {
        void revealCellInNotebookEditor(
          widget.context.path,
          cellIndex,
          notebookTracker,
          docManager,
          mindMapTracker,
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
      bindNotebookToMindMapSync(panel, mindMapTracker, notebookTracker);
    });

    notebookTracker.widgetAdded.connect((_, panel) => {
      bindNotebookToMindMapSync(panel, mindMapTracker, notebookTracker);
    });

    notebookTracker.currentChanged.connect((_, panel) => {
      if (panel) {
        syncNotebookPanelToMindMaps(panel, mindMapTracker, notebookTracker);
      }
    });

    app.commands.addCommand(CommandIDs.openNotebookMindMap, {
      label: trans.__("Kuusi"),
      caption: trans.__(
        "Open this notebook beside Kuusi (left: notebook, right: mind map)",
      ),
      icon: mindMapIcon,
      isEnabled: (args: OpenNotebookMindMapArgs) =>
        Boolean(resolveNotebookPath(args, notebookTracker)),
      execute: async (args: OpenNotebookMindMapArgs) => {
        const path = resolveNotebookPath(args, notebookTracker);

        if (!path) {
          return;
        }

        const notebook = await ensureNotebookPanelOpen(
          path,
          notebookTracker,
          docManager,
        );
        const openOptions = splitRightOfNotebookOptions(notebook);
        const existing = docManager.findWidget(path, factoryName);
        const wasAttached = Boolean(existing?.isAttached);

        const widget = docManager.openOrReveal(
          path,
          factoryName,
          undefined,
          openOptions,
        );

        // openOrReveal only applies split options when attaching a new widget;
        // re-dock an already-open Kuusi to the right of the notebook.
        if (widget && notebook && !notebook.isDisposed && wasAttached) {
          app.shell.add(widget, "main", openOptions);
        }

        if (widget instanceof NotebookMindMapDocumentWidget) {
          bindMindMapFocusOwnership(widget, notebookTracker);
          claimKuusiFocus(path);
          widget.content.focusMapViewport();

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
            // requestOpenCenter already follows dock/layout settling. A single
            // request is important: delayed requests must not restart
            // auto-centering after the user has begun panning.
            widget.content.requestOpenCenter(activeIndex);
            widget.content.focusMapViewport();
          }
        }

        return widget;
      },
    });

    app.commands.addCommand(CommandIDs.openNotebookView, {
      label: trans.__("Notebook"),
      caption: trans.__(
        "Switch to the classic notebook view for this file",
      ),
      icon: notebookIcon,
      isEnabled: (args: OpenNotebookViewArgs) =>
        Boolean(resolveMindMapPath(args, mindMapTracker)),
      execute: async (args: OpenNotebookViewArgs) => {
        const path = resolveMindMapPath(args, mindMapTracker);

        if (!path) {
          return;
        }

        return activateNotebookView(
          path,
          notebookTracker,
          docManager,
          mindMapTracker,
          app,
        );
      },
    });

    toolbarRegistry.addFactory(
      "Notebook",
      "open-mindmap",
      (panel: NotebookPanel) =>
        new ToolbarButton({
          className: "jp-KuusiNotebookOpenButton",
          label: trans.__("Kuusi"),
          tooltip: trans.__(
            "Open beside Kuusi (notebook left, mind map right)",
          ),
          onClick: () => {
            void app.commands.execute(CommandIDs.openNotebookMindMap, {
              path: panel.context.path,
            });
          },
        }),
    );

    toolbarRegistry.addFactory(
      factoryName,
      "open-notebook",
      (widget: NotebookMindMapDocumentWidget) =>
        new ToolbarButton({
          className: "jp-KuusiNotebookOpenButton",
          label: trans.__("Notebook"),
          tooltip: trans.__(
            "Switch to the classic notebook view for this file",
          ),
          onClick: () => {
            void app.commands.execute(CommandIDs.openNotebookView, {
              path: widget.context.path,
            });
          },
        }),
    );

    if (palette) {
      palette.addItem({
        command: CommandIDs.openNotebookMindMap,
        category: "Kuusi",
      });
      palette.addItem({
        command: CommandIDs.openNotebookView,
        category: "Kuusi",
      });
    }

    console.info("jupyterlab-kuusi: refactor extension activated");
  },
};

export default [
  plugin,
  gateFullReleasePlugin(livePdfPlugin),
  gateFullReleasePlugin(imagePlugin),
  gateFullReleasePlugin(voiceRecorderPlugin),
  gateFullReleasePlugin(texCompilePlugin),
  gateFullReleasePlugin(markdownPreviewPlugin),
  gateFullReleasePlugin(channelMonitorPlugin),
  gateFullReleasePlugin(compressPlugin),
  defaultOpenersPlugin,
  launcherPlugin,
];

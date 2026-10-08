import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { createArticleTypographyModel } from "./articleMenus";
import { createBookTypographyModel } from "./bookMenus";
import { createMindMapTypographyModel } from "./mindMapMenus";
import { createSlidesTypographyModel } from "./markdownSlides/slidesMenus";
import { registerViewTypography } from "./viewTypographySync";
import {
  createToolbarFactory,
  IToolbarWidgetRegistry,
} from "@jupyterlab/apputils";
import { IEditorServices } from "@jupyterlab/codeeditor";
import { IEditorTracker } from "@jupyterlab/fileeditor";
import { PathExt } from "@jupyterlab/coreutils";
import { IDocumentManager } from "@jupyterlab/docmanager";
import {
  INotebookTracker,
  NotebookActions,
  NotebookPanel,
} from "@jupyterlab/notebook";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import { ISettingRegistry } from "@jupyterlab/settingregistry";
import { ITranslator } from "@jupyterlab/translation";
import {
  addIcon,
  copyIcon,
  cutIcon,
  notebookIcon,
  pasteIcon,
  ToolbarButton,
} from "@jupyterlab/ui-components";
import { registerMarkdownEditorMindMapToolbar } from "./markdownEditorToolbar";
import { configureKuusiTranslator, getKuusiBundle } from "./kuusiI18n";
import { createKuusiMindMapNotebook } from "./mindMapNotebook";
import {
  MarkdownMindMapDocumentWidget,
  MarkdownMindMapWidgetFactory,
} from "./markdownMindMapWidget";
import {
  MarkdownSlidesWidgetFactory,
  NotebookSlidesWidgetFactory,
} from "./markdownSlides/markdownSlidesWidget";
import { SlidesSettingsManager } from "./markdownSlides/slidesSettings";
import slidesSettingsPlugin from "./markdownSlides/slidesSettingsPlugin";
import {
  applyArticleToMarkdownDocument,
  ensureKuusiArticleChrome,
} from "./articleCapsule";
import { ArticleSettingsManager } from "./articleSettings";
import {
  applyBookToMarkdownDocument,
  ensureKuusiBookChrome,
} from "./bookCapsule";
import { BookSettingsManager } from "./bookSettings";
import bookSettingsPlugin from "./bookSettingsPlugin";
import type { MarkdownDocument } from "@jupyterlab/markdownviewer";
import { NotebookArticleWidgetFactory } from "./notebookArticleWidget";
import { NotebookBookWidgetFactory } from "./notebookBookWidget";
import { MarkdownBookWidgetFactory } from "./markdownBookWidget";
import {
  bindArticlePositionSync,
  bindMarkdownMindMapPositionSync,
  bindNotebookPositionSource,
  bindSlidesPositionSync,
  configureRenderPositionSync,
} from "./renderPositionSync";
import { attachNotebookAutoReload } from "./notebookAutoReload";
import {
  getNotebookAutoReloadEnabled,
  registerNotebookAutoReloadListener,
} from "./notebookAutoReloadRegistry";
import { registerNotebookAutoReloadToolbarFactories } from "./notebookAutoReloadToolbar";
import {
  NotebookMindMapDocumentWidget,
  NotebookMindMapWidgetFactory,
} from "./notebookMindMapDocument";
import {
  copyMindMapSubtree,
  cutMindMapSubtree,
  pasteMindMapClipboard,
} from "./mindMapKeyboard";
import {
  registerMarkdownMindMapToolbarFactories,
  registerMindMapToolbarFactories,
} from "./mindMapToolbar";
import {
  FACTORY_EDITOR,
  FACTORY_KUUSI_MARKDOWN_BOOK,
  FACTORY_KUUSI_MARKDOWN_MIND_MAP,
  FACTORY_KUUSI_MARKDOWN_SLIDES,
  FACTORY_KUUSI_NOTEBOOK,
  FACTORY_KUUSI_NOTEBOOK_ARTICLE,
  FACTORY_KUUSI_NOTEBOOK_BOOK,
  FACTORY_KUUSI_NOTEBOOK_SLIDES,
  FACTORY_MARKDOWN_PREVIEW,
} from "./defaultOpeners/constants";
import { registerKuusiRenderViewSwitcherToolbars } from "./kuusiRenderViewSwitcher";
import {
  ensureKuusiRenderToolbarChrome,
  registerKuusiRenderExportToolbars,
} from "./renderExportButton";
import {
  bindKuusiSplitWorkspaceOnOpen,
  registerKuusiSplitWorkspaceCommands,
} from "./kuusiSplitWorkspace";
import { registerKuusiEditorRenderToolbars } from "./editorRenderButton";
import {
  bindNotebookEditorFormatBars,
} from "./markdownEditorFormatBar";
import {
  activateNotebookView,
  bindMindMapFocusOwnership,
  bindNotebookToMindMapSync,
  claimKuusiFocus,
  renderMarkdownCellInNotebookEditor,
  revealCellInNotebookEditor,
  syncNotebookPanelToMindMaps,
} from "./notebookViewSync";
import { NotebookMindMapTracker } from "./tracker";
import { releaseClosedTabs } from "./releaseClosedTabs";
import { MindMapSettingsManager } from "./mindMapSettings";
import articleSettingsPlugin from "./articleSettingsPlugin";
import defaultOpenersPlugin from "./defaultOpeners/plugin";
import launcherPlugin from "./launcherPlugin";
import markdownPreviewPlugin from "./markdownPreview/plugin";

const PLUGIN_ID = "jupyterlab-kuusi:plugin";

namespace CommandIDs {
  export const openNotebookView = "jupyterlab-kuusi:open-notebook-view";
  export const openMarkdownEditor = "jupyterlab-kuusi:open-markdown-editor";
  export const addMindMap = "jupyterlab-kuusi:add-mindmap";
  export const insertCellBelow = "jupyterlab-kuusi:insert-cell-below";
  export const cutCell = "jupyterlab-kuusi:cut-cell";
  export const copyCell = "jupyterlab-kuusi:copy-cell";
  export const pasteCellBelow = "jupyterlab-kuusi:paste-cell-below";
}

type OpenNotebookViewArgs = {
  path?: string;
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
  optional: [IEditorTracker],
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
    editorTracker: IEditorTracker | null,
  ) => {
    releaseClosedTabs(app);

    const mindMapTracker = new NotebookMindMapTracker();
    const factoryName = NotebookMindMapWidgetFactory.NAME;
    const markdownMindMapFactoryName = MarkdownMindMapWidgetFactory.NAME;

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

    configureKuusiTranslator(_translator);
    const kuusiTranslator = _translator;
    const trans = getKuusiBundle();
    const mindMapSettings = new MindMapSettingsManager(settingRegistry);
    void mindMapSettings.ready();
    registerViewTypography(
      "mindmap",
      createMindMapTypographyModel(mindMapSettings),
    );

    registerKuusiSplitWorkspaceCommands(app, docManager);
    bindKuusiSplitWorkspaceOnOpen(
      app,
      docManager,
      notebookTracker,
      editorTracker,
    );
    registerKuusiEditorRenderToolbars(app, docManager, toolbarRegistry);
    const renderToolbarFactories = [
      FACTORY_KUUSI_NOTEBOOK,
      FACTORY_KUUSI_NOTEBOOK_ARTICLE,
      FACTORY_KUUSI_NOTEBOOK_BOOK,
      FACTORY_KUUSI_NOTEBOOK_SLIDES,
      FACTORY_KUUSI_MARKDOWN_MIND_MAP,
      FACTORY_KUUSI_MARKDOWN_BOOK,
      FACTORY_KUUSI_MARKDOWN_SLIDES,
      FACTORY_MARKDOWN_PREVIEW,
    ];
    registerKuusiRenderViewSwitcherToolbars(
      app,
      toolbarRegistry,
      trans,
      renderToolbarFactories,
    );
    registerKuusiRenderExportToolbars(app, toolbarRegistry, renderToolbarFactories);

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

    const articleToolbarFactory = createToolbarFactory(
      toolbarRegistry,
      settingRegistry,
      FACTORY_KUUSI_NOTEBOOK_ARTICLE,
      PLUGIN_ID,
      kuusiTranslator,
    );

    const notebookArticleFactory = new NotebookArticleWidgetFactory({
      rendermime,
      translator: kuusiTranslator,
      toolbarFactory: articleToolbarFactory,
    });

    app.docRegistry.addWidgetFactory(notebookArticleFactory);

    // Same capsule menus and appearance as the Markdown Article.
    const articleSettings = ArticleSettingsManager.shared(settingRegistry);
    registerViewTypography(
      "article",
      createArticleTypographyModel(articleSettings),
    );
    const articleWidgets = new Set<MarkdownDocument>();

    void articleSettings.ready().then(() => {
      articleWidgets.forEach((widget) => {
        ensureKuusiArticleChrome(widget, articleSettings);
      });
    });
    articleSettings.changed.connect(() => {
      articleWidgets.forEach((widget) => {
        applyArticleToMarkdownDocument(widget, articleSettings);
      });
    });

    notebookArticleFactory.widgetCreated.connect((_, widget) => {
      articleWidgets.add(widget);
      widget.disposed.connect(() => {
        articleWidgets.delete(widget);
      });
      ensureKuusiArticleChrome(widget, articleSettings);
      ensureKuusiRenderToolbarChrome(
        app,
        widget,
        FACTORY_KUUSI_NOTEBOOK_ARTICLE,
      );
      bindArticlePositionSync(widget, "notebook");
    });

    const bookToolbarFactory = createToolbarFactory(
      toolbarRegistry,
      settingRegistry,
      FACTORY_KUUSI_NOTEBOOK_BOOK,
      PLUGIN_ID,
      kuusiTranslator,
    );

    const notebookBookFactory = new NotebookBookWidgetFactory({
      rendermime,
      translator: kuusiTranslator,
      toolbarFactory: bookToolbarFactory,
    });
    app.docRegistry.addWidgetFactory(notebookBookFactory);

    const markdownBookToolbarFactory = createToolbarFactory(
      toolbarRegistry,
      settingRegistry,
      FACTORY_KUUSI_MARKDOWN_BOOK,
      PLUGIN_ID,
      kuusiTranslator,
    );

    const markdownBookFactory = new MarkdownBookWidgetFactory({
      rendermime,
      translator: kuusiTranslator,
      toolbarFactory: markdownBookToolbarFactory,
    });
    app.docRegistry.addWidgetFactory(markdownBookFactory);

    const bookSettings = new BookSettingsManager(settingRegistry);
    registerViewTypography("book", createBookTypographyModel(bookSettings));
    const bookWidgets = new Set<MarkdownDocument>();

    void bookSettings.ready().then(() => {
      bookWidgets.forEach((widget) => {
        ensureKuusiBookChrome(widget, bookSettings);
      });
    });
    bookSettings.changed.connect(() => {
      bookWidgets.forEach((widget) => {
        applyBookToMarkdownDocument(widget, bookSettings);
      });
    });

    const bindBookWidget = (
      widget: MarkdownDocument,
      factoryName: string,
      kind: "notebook" | "markdown",
    ): void => {
      bookWidgets.add(widget);
      widget.disposed.connect(() => {
        bookWidgets.delete(widget);
      });
      ensureKuusiBookChrome(widget, bookSettings);
      ensureKuusiRenderToolbarChrome(app, widget, factoryName);
      bindArticlePositionSync(widget, kind);
    };

    notebookBookFactory.widgetCreated.connect((_, widget) => {
      bindBookWidget(widget, FACTORY_KUUSI_NOTEBOOK_BOOK, "notebook");
    });
    markdownBookFactory.widgetCreated.connect((_, widget) => {
      bindBookWidget(widget, FACTORY_KUUSI_MARKDOWN_BOOK, "markdown");
    });

    const markdownToolbarFactory = createToolbarFactory(
      toolbarRegistry,
      settingRegistry,
      markdownMindMapFactoryName,
      PLUGIN_ID,
      kuusiTranslator,
    );

    const markdownMindMapFactory = new MarkdownMindMapWidgetFactory(
      rendermime,
      contentFactory,
      editorServices.mimeTypeService,
      app.commands,
      mindMapSettings,
      kuusiTranslator,
      contents,
      markdownToolbarFactory,
    );

    app.docRegistry.addWidgetFactory(markdownMindMapFactory);

    const slidesSettings = new SlidesSettingsManager(settingRegistry);
    void slidesSettings.ready();
    registerViewTypography(
      "slides",
      createSlidesTypographyModel(slidesSettings),
    );

    const markdownSlidesToolbarFactory = createToolbarFactory(
      toolbarRegistry,
      settingRegistry,
      FACTORY_KUUSI_MARKDOWN_SLIDES,
      PLUGIN_ID,
      kuusiTranslator,
    );


    const markdownSlidesFactory = new MarkdownSlidesWidgetFactory(
      {
        name: FACTORY_KUUSI_MARKDOWN_SLIDES,
        modelName: "text",
        fileTypes: ["markdown"],
        defaultFor: [],
        readOnly: true,
        label: "Kuusi Markdown Slides",
        toolbarFactory: markdownSlidesToolbarFactory,
      },
      rendermime,
      contents,
      slidesSettings,
    );


    const notebookSlidesFactory = new NotebookSlidesWidgetFactory(
      {
        name: FACTORY_KUUSI_NOTEBOOK_SLIDES,
        modelName: "notebook",
        fileTypes: ["notebook"],
        defaultFor: [],
        readOnly: true,
        label: "Kuusi Notebook Slides",
        toolbarFactory: createToolbarFactory(
          toolbarRegistry,
          settingRegistry,
          FACTORY_KUUSI_NOTEBOOK_SLIDES,
          PLUGIN_ID,
          kuusiTranslator,
        ) as typeof markdownSlidesToolbarFactory,
      },
      rendermime,
      contents,
      slidesSettings,
    );

    app.docRegistry.addWidgetFactory(notebookSlidesFactory);
    notebookSlidesFactory.widgetCreated.connect((_, widget) => {
      ensureKuusiRenderToolbarChrome(
        app,
        widget,
        FACTORY_KUUSI_NOTEBOOK_SLIDES,
      );
      bindSlidesPositionSync(widget, "notebook");
    });

    app.docRegistry.addWidgetFactory(markdownSlidesFactory);

    registerMarkdownMindMapToolbarFactories(
      toolbarRegistry,
      markdownMindMapFactoryName,
      kuusiTranslator,
    );

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
      bindNotebookEditorFormatBars(panel);
    });
    notebookTracker.widgetAdded.connect((_, panel) => {
      attachClassicNotebookAutoReload(panel);
      bindNotebookEditorFormatBars(panel);
    });

    registerNotebookAutoReloadToolbarFactories(toolbarRegistry);

    registerMindMapToolbarFactories(
      toolbarRegistry,
      factoryName,
      kuusiTranslator,
    );

    if (editorTracker) {
      registerMarkdownEditorMindMapToolbar(
        app,
        docManager,
        editorTracker,
        toolbarRegistry,
        trans,
      );
    }

    const bindNotebookMindMapWidget = (
      widget: NotebookMindMapDocumentWidget,
    ): void => {
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
    };

    factory.widgetCreated.connect((_, widget) => {
      bindNotebookMindMapWidget(widget);
      ensureKuusiRenderToolbarChrome(app, widget, factoryName);
    });

    markdownMindMapFactory.widgetCreated.connect((_, widget) => {
      void mindMapTracker.add(widget);
      bindMindMapFocusOwnership(widget, notebookTracker);
      claimKuusiFocus(widget.context.path);
      ensureKuusiRenderToolbarChrome(app, widget, markdownMindMapFactoryName);
      bindMarkdownMindMapPositionSync(widget);
    });

    markdownSlidesFactory.widgetCreated.connect((_, widget) => {
      ensureKuusiRenderToolbarChrome(app, widget, FACTORY_KUUSI_MARKDOWN_SLIDES);
      bindSlidesPositionSync(widget, "markdown");
    });


    configureRenderPositionSync({ editorTracker, notebookTracker });

    notebookTracker.forEach((panel) => {
      bindNotebookToMindMapSync(panel, mindMapTracker, notebookTracker);
      bindNotebookPositionSource(panel);
    });

    notebookTracker.widgetAdded.connect((_, panel) => {
      bindNotebookToMindMapSync(panel, mindMapTracker, notebookTracker);
      bindNotebookPositionSource(panel);
    });

    notebookTracker.currentChanged.connect((_, panel) => {
      if (panel) {
        syncNotebookPanelToMindMaps(panel, mindMapTracker, notebookTracker);
      }
    });


    app.commands.addCommand(CommandIDs.openMarkdownEditor, {
      label: trans.__("Markdown editor"),
      caption: trans.__("Open the plain-text Markdown editor for this file"),
      icon: notebookIcon,
      isEnabled: (args: OpenNotebookViewArgs) =>
        Boolean(resolveMindMapPath(args, mindMapTracker)),
      execute: (args: OpenNotebookViewArgs) => {
        const path = resolveMindMapPath(args, mindMapTracker);

        if (!path) {
          return;
        }

        return docManager.openOrReveal(path, FACTORY_EDITOR);
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
      markdownMindMapFactoryName,
      "open-notebook",
      (widget: MarkdownMindMapDocumentWidget) =>
        new ToolbarButton({
          className: "jp-KuusiNotebookOpenButton",
          label: trans.__("Editor"),
          tooltip: trans.__("Open the Markdown source editor"),
          onClick: () => {
            void app.commands.execute(CommandIDs.openMarkdownEditor, {
              path: widget.context.path,
            });
          },
        }),
    );


    console.info("jupyterlab-kuusi: refactor extension activated");
  },
};

export default [
  plugin,
  articleSettingsPlugin,
  bookSettingsPlugin,
  slidesSettingsPlugin,
  defaultOpenersPlugin,
  markdownPreviewPlugin,
  launcherPlugin,
];

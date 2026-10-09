import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
} from "@jupyterlab/docregistry";
import type { IEditorMimeTypeService } from "@jupyterlab/codeeditor";
import type { NotebookPanel } from "@jupyterlab/notebook";
import type { IObservableList } from "@jupyterlab/observables";
import { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import type { Contents } from "@jupyterlab/services";
import type { ITranslator } from "@jupyterlab/translation";
import { CommandRegistry } from "@lumino/commands";
import type { Message } from "@lumino/messaging";

import { MIND_MAP_ROOT_MARKDOWN } from "kuusi-kernel";

import { createMarkdownMindMapNotebookContext } from "./markdownMindMapContext";
import {
  createMarkdownMindMapNotebookModel,
  notebookModelMatchesMarkdown,
  readTextModelSource,
  syncNotebookModelToTextContext,
  syncTextContextToNotebookModel,
} from "./markdownMindMapModel";
import { refitAfterDockResize } from "./dockResizeRefit";
import { mindMapIcon } from "./kuusiIcon";
import { ensureNotebookAutoReloadOnPluginToolbar } from "./notebookAutoReloadPlacement";
import { NotebookMindMapWidget } from "./notebookMindMapWidget";
import type { MindMapSourceKind } from "./notebookMindMapTypes";
import type { MindMapSettingsManager } from "./mindMapSettings";
import { applyKuusiTabIcon } from "./kuusiTabIcon";

type TextModel = DocumentRegistry.ICodeModel;

export class MarkdownMindMapDocumentWidget extends DocumentWidget<
  NotebookMindMapWidget,
  TextModel
> {
  private _textPullStale = false;

  private _pullTextFromSource: (() => void) | null = null;

  constructor(
    options: DocumentWidget.IOptions<NotebookMindMapWidget, TextModel>,
  ) {
    super(options);
    this.addClass("jp-KuusiNotebookMindMapDocument");
    this.addClass("jp-KuusiMarkdownMindMapDocument");
    this.toolbar.addClass("jp-NotebookPanel-toolbar");

    applyKuusiTabIcon(this.title, mindMapIcon, "Kuusi Markdown Mind Map");
    options.content.bindDocumentWidget(this);
    refitAfterDockResize(this, options.content);

    this._bindModelSync();

    const syncAutoReloadPlacement = (): void => {
      ensureNotebookAutoReloadOnPluginToolbar(this);
    };

    const placementObserver = new MutationObserver(syncAutoReloadPlacement);
    placementObserver.observe(this.content.node, {
      childList: true,
      subtree: true,
    });
    this.disposed.connect(() => {
      placementObserver.disconnect();
    });
    requestAnimationFrame(() => {
      syncAutoReloadPlacement();
      window.setTimeout(syncAutoReloadPlacement, 0);
    });
  }

  protected onAfterShow(msg: Message): void {
    super.onAfterShow(msg);

    if (this._textPullStale && !this.isDisposed) {
      this._textPullStale = false;
      this._pullTextFromSource?.();
    }
  }

  private _bindModelSync(): void {
    const notebookModel = this.content.notebook.model;

    if (!notebookModel) {
      return;
    }

    let syncingFromText = false;
    let syncTimer: number | null = null;
    let textPullTimer: number | null = null;

    const pushNotebookToText = (): void => {
      // A stale map predates edits made in the source editor; writing it back
      // would overwrite those edits.
      if (
        syncingFromText ||
        this._textPullStale ||
        this.isDisposed ||
        !notebookModel
      ) {
        return;
      }

      syncNotebookModelToTextContext(notebookModel, this.context);
    };

    const schedulePush = (): void => {
      if (syncTimer !== null) {
        window.clearTimeout(syncTimer);
      }

      syncTimer = window.setTimeout(() => {
        syncTimer = null;
        pushNotebookToText();
      }, 120);
    };

    notebookModel.contentChanged.connect(schedulePush);
    notebookModel.cells.changed.connect(schedulePush);

    void this.context.ready.then(() => {
      if (this.isDisposed || !notebookModel) {
        return;
      }

      syncingFromText = true;

      try {
        syncTextContextToNotebookModel(this.context, notebookModel);
        this.content.applyTextDocumentSnapshot();
      } finally {
        syncingFromText = false;
      }
    });

    const pullTextIntoMindMap = (): void => {
      if (this.isDisposed || !notebookModel) {
        return;
      }

      // Echo of our own push (or a no-op change): reloading would only reset
      // selection and flicker the map.
      if (
        notebookModelMatchesMarkdown(
          notebookModel,
          readTextModelSource(this.context.model),
        )
      ) {
        return;
      }

      syncingFromText = true;

      try {
        syncTextContextToNotebookModel(this.context, notebookModel);
        this.content.applyTextDocumentSnapshot();
      } finally {
        syncingFromText = false;
      }
    };

    this._pullTextFromSource = pullTextIntoMindMap;

    const schedulePullFromText = (): void => {
      if (!this.isVisible) {
        this._textPullStale = true;
        return;
      }

      if (textPullTimer !== null) {
        window.clearTimeout(textPullTimer);
      }

      textPullTimer = window.setTimeout(() => {
        textPullTimer = null;
        pullTextIntoMindMap();
      }, 150);
    };

    const onSharedModelChanged = (): void => {
      if (this.isDisposed || !notebookModel) {
        return;
      }

      schedulePullFromText();
    };

    const onSaveState = (
      _sender: DocumentRegistry.IContext<TextModel>,
      args: DocumentRegistry.SaveState,
    ): void => {
      if (args === "started") {
        pushNotebookToText();
      }
    };

    const onFileChanged = (): void => {
      if (this.isDisposed || this.context.model.dirty || !notebookModel) {
        return;
      }

      if (!this.isVisible) {
        this._textPullStale = true;
        return;
      }

      pullTextIntoMindMap();
    };

    // Keep the map in sync while editing in the Markdown source editor (dirty OK).
    this.context.model.sharedModel.changed.connect(onSharedModelChanged);
    this.context.saveState.connect(onSaveState);
    this.context.fileChanged.connect(onFileChanged);

    this.disposed.connect(() => {
      if (textPullTimer !== null) {
        window.clearTimeout(textPullTimer);
        textPullTimer = null;
      }

      if (syncTimer !== null) {
        window.clearTimeout(syncTimer);
        syncTimer = null;
      }

      notebookModel.contentChanged.disconnect(schedulePush);
      notebookModel.cells.changed.disconnect(schedulePush);
      this.context.model.sharedModel.changed.disconnect(onSharedModelChanged);
      this.context.saveState.disconnect(onSaveState);
      this.context.fileChanged.disconnect(onFileChanged);

      if (!notebookModel.isDisposed) {
        notebookModel.dispose();
      }
    });
  }
}

export class MarkdownMindMapWidgetFactory extends ABCWidgetFactory<
  MarkdownMindMapDocumentWidget,
  TextModel
> {
  static readonly NAME = "Kuusi Markdown Mind Map";

  constructor(
    private _rendermime: IRenderMimeRegistry,
    private _contentFactory: NotebookPanel.IContentFactory,
    private _mimeTypeService: IEditorMimeTypeService,
    private _commands: CommandRegistry,
    private _settingsManager: MindMapSettingsManager,
    private _kuusiTranslator: ITranslator,
    private _contents: Contents.IManager,
    toolbarFactory?: (
      widget: MarkdownMindMapDocumentWidget,
    ) =>
      | DocumentRegistry.IToolbarItem[]
      | IObservableList<DocumentRegistry.IToolbarItem>,
  ) {
    super({
      name: MarkdownMindMapWidgetFactory.NAME,
      modelName: "text",
      fileTypes: ["markdown"],
      toolbarFactory,
      preferKernel: false,
      canStartKernel: false,
    });
  }

  protected createNewWidget(
    context: DocumentRegistry.IContext<TextModel>,
  ): MarkdownMindMapDocumentWidget {
    const notebookModel = createMarkdownMindMapNotebookModel();
    const notebookContext = createMarkdownMindMapNotebookContext(
      context,
      notebookModel,
    );

    const content = new NotebookMindMapWidget(
      notebookContext,
      this._rendermime,
      this._contentFactory,
      this._mimeTypeService,
      this._commands,
      this._settingsManager,
      this._kuusiTranslator,
      this._contents,
      "markdown" satisfies MindMapSourceKind,
    );

    return new MarkdownMindMapDocumentWidget({ content, context });
  }
}

/** Initial content for Launcher-created markdown mind maps. */
export const buildNewMarkdownMindMapContent = (): string => MIND_MAP_ROOT_MARKDOWN;

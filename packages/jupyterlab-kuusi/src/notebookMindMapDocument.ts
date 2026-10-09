import type { IEditorMimeTypeService } from "@jupyterlab/codeeditor";
import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
} from "@jupyterlab/docregistry";
import type { INotebookModel } from "@jupyterlab/notebook";
import { NotebookPanel } from "@jupyterlab/notebook";
import type { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import type { IObservableList } from "@jupyterlab/observables";
import type { Contents } from "@jupyterlab/services";
import type { ITranslator } from "@jupyterlab/translation";
import { CommandRegistry } from "@lumino/commands";

import { refitAfterDockResize } from "./dockResizeRefit";
import { mindMapIcon } from "./kuusiIcon";
import { applyKuusiTabIcon } from "./kuusiTabIcon";
import type { MindMapSettingsManager } from "./mindMapSettings";
import { ensureNotebookAutoReloadOnPluginToolbar } from "./notebookAutoReloadPlacement";
import { NotebookMindMapWidget } from "./notebookMindMapWidget";

export class NotebookMindMapDocumentWidget extends DocumentWidget<NotebookMindMapWidget> {
  constructor(options: DocumentWidget.IOptions<NotebookMindMapWidget>) {
    super(options);
    this.addClass("jp-KuusiNotebookMindMapDocument");
    this.toolbar.addClass("jp-NotebookPanel-toolbar");

    applyKuusiTabIcon(this.title, mindMapIcon, "Kuusi Mind Map");
    options.content.bindDocumentWidget(this);
    refitAfterDockResize(this, options.content);

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
}

export class NotebookMindMapWidgetFactory extends ABCWidgetFactory<
  NotebookMindMapDocumentWidget,
  INotebookModel
> {
  static readonly NAME = "Kuusi Mind Map";

  constructor(
    private _rendermime: IRenderMimeRegistry,
    private _contentFactory: NotebookPanel.IContentFactory,
    private _mimeTypeService: IEditorMimeTypeService,
    private _commands: CommandRegistry,
    private _settingsManager: MindMapSettingsManager,
    private _kuusiTranslator: ITranslator,
    private _contents: Contents.IManager,
    toolbarFactory?: (
      widget: NotebookMindMapDocumentWidget,
    ) =>
      | DocumentRegistry.IToolbarItem[]
      | IObservableList<DocumentRegistry.IToolbarItem>,
  ) {
    super({
      name: NotebookMindMapWidgetFactory.NAME,
      modelName: "notebook",
      fileTypes: ["notebook"],
      toolbarFactory,
      preferKernel: false,
      canStartKernel: true,
    });
  }

  protected createNewWidget(
    context: DocumentRegistry.IContext<INotebookModel>,
  ): NotebookMindMapDocumentWidget {
    const content = new NotebookMindMapWidget(
      context,
      this._rendermime,
      this._contentFactory,
      this._mimeTypeService,
      this._commands,
      this._settingsManager,
      this._kuusiTranslator,
      this._contents,
    );
    return new NotebookMindMapDocumentWidget({ content, context });
  }
}

import type { DocumentRegistry } from "@jupyterlab/docregistry";
import { ABCWidgetFactory } from "@jupyterlab/docregistry";
import { MarkdownDocument, MarkdownViewer } from "@jupyterlab/markdownviewer";
import type { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import type { ITranslator } from "@jupyterlab/translation";

import { FACTORY_KUUSI_NOTEBOOK_BOOK } from "./defaultOpeners/constants";
import { bookIcon } from "./kuusiIcon";
import { applyKuusiTabIcon } from "./kuusiTabIcon";
import {
  createNotebookMarkdownContext,
  type NotebookContext,
} from "./notebookMarkdownContext";

export class NotebookBookWidgetFactory extends ABCWidgetFactory<
  MarkdownDocument,
  DocumentRegistry.IModel
> {
  static readonly NAME = FACTORY_KUUSI_NOTEBOOK_BOOK;

  private readonly _rendermime: IRenderMimeRegistry;

  constructor(options: {
    rendermime: IRenderMimeRegistry;
    translator?: ITranslator;
    toolbarFactory?: DocumentRegistry.IWidgetFactoryOptions<MarkdownDocument>["toolbarFactory"];
  }) {
    super({
      name: NotebookBookWidgetFactory.NAME,
      label: "Kuusi Book",
      fileTypes: ["notebook"],
      modelName: "notebook",
      preferKernel: false,
      canStartKernel: false,
      shutdownOnClose: false,
      readOnly: true,
      translator: options.translator,
      toolbarFactory: options.toolbarFactory,
    });
    this._rendermime = options.rendermime;
  }

  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>,
  ): MarkdownDocument {
    const notebookContext = context as NotebookContext;
    const rendermime = this._rendermime.clone({
      resolver: context.urlResolver,
    });
    const renderer = rendermime.createRenderer("text/markdown");
    const content = new MarkdownViewer({
      context: createNotebookMarkdownContext(notebookContext),
      renderer,
    });
    const widget = new MarkdownDocument({ content, context });

    widget.addClass("jp-KuusiNotebookBook");
    applyKuusiTabIcon(widget.title, bookIcon, "Kuusi Book");

    return widget;
  }
}

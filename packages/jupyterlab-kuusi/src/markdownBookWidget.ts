import type { DocumentRegistry } from "@jupyterlab/docregistry";
import { ABCWidgetFactory } from "@jupyterlab/docregistry";
import { MarkdownDocument, MarkdownViewer } from "@jupyterlab/markdownviewer";
import type { IRenderMimeRegistry } from "@jupyterlab/rendermime";
import type { ITranslator } from "@jupyterlab/translation";

import { FACTORY_KUUSI_MARKDOWN_BOOK } from "./defaultOpeners/constants";
import { bookIcon } from "./kuusiIcon";
import { applyKuusiTabIcon } from "./kuusiTabIcon";

/**
 * Dedicated Markdown Book factory — cannot share Markdown Preview with Article
 * because the switcher needs a distinct factory per view.
 */
export class MarkdownBookWidgetFactory extends ABCWidgetFactory<
  MarkdownDocument,
  DocumentRegistry.ICodeModel
> {
  static readonly NAME = FACTORY_KUUSI_MARKDOWN_BOOK;

  private readonly _rendermime: IRenderMimeRegistry;

  constructor(options: {
    rendermime: IRenderMimeRegistry;
    translator?: ITranslator;
    toolbarFactory?: DocumentRegistry.IWidgetFactoryOptions<MarkdownDocument>["toolbarFactory"];
  }) {
    super({
      name: MarkdownBookWidgetFactory.NAME,
      label: "Kuusi Book",
      fileTypes: ["markdown"],
      defaultFor: [],
      modelName: "text",
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
    context: DocumentRegistry.IContext<DocumentRegistry.ICodeModel>,
  ): MarkdownDocument {
    const rendermime = this._rendermime.clone({
      resolver: context.urlResolver,
    });
    const renderer = rendermime.createRenderer("text/markdown");
    const content = new MarkdownViewer({
      context,
      renderer,
    });
    const widget = new MarkdownDocument({ content, context });

    widget.addClass("jp-KuusiMarkdownBook");
    applyKuusiTabIcon(widget.title, bookIcon, "Kuusi Book");

    return widget;
  }
}

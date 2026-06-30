import { ReactWidget } from "@jupyterlab/apputils";
import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
} from "@jupyterlab/docregistry";
import React from "react";
import { LumenEditor } from "./LumenEditor";

export class LumenEditorWidget extends ReactWidget {
  constructor(private _context: DocumentRegistry.IContext<DocumentRegistry.IModel>) {
    super();
    this.addClass("jp-LumenEditorWidget");
    this.title.label = this._context.path.split("/").pop() ?? "Lumen";
    this.title.closable = true;
  }

  render(): React.ReactElement {
    return <LumenEditor context={this._context} />;
  }
}

export class LumenDocumentWidget extends DocumentWidget<LumenEditorWidget> {
  constructor(options: DocumentWidget.IOptions<LumenEditorWidget>) {
    super(options);
    this.addClass("jp-LumenDocument");
  }
}

export class LumenWidgetFactory extends ABCWidgetFactory<
  LumenDocumentWidget,
  DocumentRegistry.IModel
> {
  static readonly NAME = "Lumen Editor";

  constructor() {
    super({
      name: LumenWidgetFactory.NAME,
      modelName: "text",
      fileTypes: ["lumen"],
      defaultFor: ["lumen"],
    });
  }

  protected createNewWidget(
    context: DocumentRegistry.IContext<DocumentRegistry.IModel>,
  ): LumenDocumentWidget {
    const content = new LumenEditorWidget(context);
    return new LumenDocumentWidget({ content, context });
  }
}

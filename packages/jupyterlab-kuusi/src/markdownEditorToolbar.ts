import type { JupyterFrontEnd } from "@jupyterlab/application";
import type { IToolbarWidgetRegistry } from "@jupyterlab/apputils";
import type { IDocumentManager } from "@jupyterlab/docmanager";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import type { FileEditor, IEditorTracker } from "@jupyterlab/fileeditor";
import type { TranslationBundle } from "@jupyterlab/translation";

import {
  bindFileEditorFormatBars,
  isMarkdownEditorPath,
} from "./markdownEditorFormatBar";

export { isMarkdownEditorPath };

/**
 * Bind editor chrome for Markdown file editors. Render views open via
 * Kuusi View + the Article / Mind Map / Slides switcher only.
 */
export const registerMarkdownEditorMindMapToolbar = (
  _app: JupyterFrontEnd,
  _docManager: IDocumentManager,
  editorTracker: IEditorTracker,
  _toolbarRegistry: IToolbarWidgetRegistry,
  _trans: TranslationBundle,
): void => {
  const bindEditorChrome = (widget: IDocumentWidget<FileEditor>): void => {
    bindFileEditorFormatBars(widget);
  };

  editorTracker.forEach(bindEditorChrome);
  editorTracker.widgetAdded.connect((_, widget) => {
    bindEditorChrome(widget);
  });
};

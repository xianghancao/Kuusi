import type { JupyterFrontEnd } from "@jupyterlab/application";
import type { IDocumentManager } from "@jupyterlab/docmanager";
import type { IDocumentWidget } from "@jupyterlab/docregistry";
import type { FileEditor } from "@jupyterlab/fileeditor";
import { MarkdownDocument } from "@jupyterlab/markdownviewer";
import type { Widget } from "@lumino/widgets";
import { EditorView } from "@codemirror/view";

import {
  FACTORY_KUUSI_MARKDOWN_BOOK,
  FACTORY_KUUSI_MARKDOWN_MIND_MAP,
  FACTORY_KUUSI_MARKDOWN_SLIDES,
  FACTORY_MARKDOWN_PREVIEW,
} from "./defaultOpeners/constants";
import { shouldUseKuusiForMarkdown } from "./defaultOpeners/defaultOpenersState";
import { isMarkdownEditorPath } from "./markdownEditorToolbar";
import { MarkdownSlidesDocumentWidget } from "./markdownSlides/markdownSlidesWidget";
import { revealSourcePositionInViews } from "./renderPositionSync";
import {
  scrollPreviewToEditorLine,
  type MdSyncContext,
} from "./markdownPreview/mdSync";

const CURSOR_SYNC_DEBOUNCE_MS = 60;

/** Only drive renders that are currently on screen (hidden tabs stay idle). */
const isActiveRenderWidget = (widget: Widget | null | undefined): boolean =>
  Boolean(widget && !widget.isDisposed && widget.isAttached && widget.isVisible);

const findSlidesWidget = (
  docManager: IDocumentManager,
  path: string,
): MarkdownSlidesDocumentWidget | null => {
  const current = docManager.findWidget(path, FACTORY_KUUSI_MARKDOWN_SLIDES);

  return current instanceof MarkdownSlidesDocumentWidget ? current : null;
};

const isAttachedRenderWidget = (widget: Widget | null | undefined): boolean =>
  Boolean(widget && !widget.isDisposed && widget.isAttached);

/**
 * True when Book, Slides, or Mind Map is already open for this path.
 * Editor auto-reload must not open Article over these views.
 */
export const hasNonArticleMarkdownRenderOpen = (
  docManager: IDocumentManager,
  path: string,
): boolean => {
  const slides = findSlidesWidget(docManager, path);

  if (isAttachedRenderWidget(slides)) {
    return true;
  }

  const book = docManager.findWidget(path, FACTORY_KUUSI_MARKDOWN_BOOK);

  if (isAttachedRenderWidget(book)) {
    return true;
  }

  const mindMap = docManager.findWidget(path, FACTORY_KUUSI_MARKDOWN_MIND_MAP);

  return isAttachedRenderWidget(mindMap);
};

export const syncMarkdownRendersToEditorLine = async (
  docManager: IDocumentManager,
  path: string,
  source: string,
  line: number,
  ctx: MdSyncContext,
): Promise<void> => {
  revealSourcePositionInViews(path, "markdown", source, line);

  const preview = docManager.findWidget(path, FACTORY_MARKDOWN_PREVIEW);

  if (
    preview instanceof MarkdownDocument &&
    isActiveRenderWidget(preview) &&
    !hasRenderedMarkdown(preview)
  ) {
    await scrollPreviewToEditorLine(preview.content, source, line, ctx);
  }
};

const hasRenderedMarkdown = (preview: MarkdownDocument): boolean =>
  preview.content.renderer.node.matches(
    ".jp-RenderedMarkdown, .jp-RenderedMySTMarkdown",
  ) ||
  preview.content.renderer.node.querySelector(
    ".jp-RenderedMarkdown, .jp-RenderedMySTMarkdown",
  ) !== null;

export const bindMarkdownEditorRenderSync = (
  _app: JupyterFrontEnd,
  docManager: IDocumentManager,
  widget: IDocumentWidget<FileEditor>,
  ctx: MdSyncContext,
): void => {
  if (!shouldUseKuusiForMarkdown()) {
    return;
  }

  let debounceTimer: number | null = null;
  let lastSyncedLine = -1;
  let cursorExtensionInstalled = false;

  const syncNow = (): void => {
    if (
      widget.isDisposed ||
      !isMarkdownEditorPath(widget.context.path) ||
      !shouldUseKuusiForMarkdown()
    ) {
      return;
    }

    const line = widget.content.editor.getCursorPosition().line;

    if (line === lastSyncedLine) {
      return;
    }

    lastSyncedLine = line;
    const path = widget.context.path;
    const source = widget.context.model.toString();

    void syncMarkdownRendersToEditorLine(docManager, path, source, line, ctx);
  };

  const scheduleSync = (): void => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      syncNow();
    }, CURSOR_SYNC_DEBOUNCE_MS);
  };

  const installCursorListener = (): void => {
    if (
      cursorExtensionInstalled ||
      widget.isDisposed ||
      !isMarkdownEditorPath(widget.context.path)
    ) {
      return;
    }

    cursorExtensionInstalled = true;

    widget.content.editor.injectExtension(
      EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) {
          scheduleSync();
        }
      }),
    );
  };

  const onPathChanged = (): void => {
    lastSyncedLine = -1;

    if (isMarkdownEditorPath(widget.context.path)) {
      installCursorListener();
      scheduleSync();
    }
  };

  widget.context.pathChanged.connect(onPathChanged);

  void widget.context.ready.then(() => {
    if (widget.isDisposed) {
      return;
    }

    installCursorListener();
    scheduleSync();
  });

  widget.disposed.connect(() => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
    }

    widget.context.pathChanged.disconnect(onPathChanged);
  });
};

import type { IDocumentWidget } from "@jupyterlab/docregistry";
import { MessageLoop } from "@lumino/messaging";
import { Widget } from "@lumino/widgets";

/** Force ReactiveToolbar to remeasure once after dock / visibility settle. */
export const relayoutDocumentToolbar = (widget: IDocumentWidget): void => {
  if (widget.isDisposed) {
    return;
  }

  const toolbar = widget.toolbar;
  if (!toolbar || toolbar.isDisposed) {
    return;
  }

  const width = toolbar.node.clientWidth;
  if (width > 0) {
    MessageLoop.sendMessage(
      toolbar,
      new Widget.ResizeMessage(width, toolbar.node.clientHeight),
    );
  }
};

const pendingRelayout = new WeakMap<IDocumentWidget, number>();

/**
 * One deferred toolbar remeasure. ReactiveToolbar throttles around 500ms —
 * schedule a single pass after that, not a 0/450/900 pin storm.
 */
export const scheduleDocumentToolbarRelayout = (
  widget: IDocumentWidget,
  onTick?: (widget: IDocumentWidget) => void,
): void => {
  const prior = pendingRelayout.get(widget);
  if (prior !== undefined) {
    window.clearTimeout(prior);
  }

  const run = (): void => {
    pendingRelayout.delete(widget);
    if (widget.isDisposed) {
      return;
    }
    onTick?.(widget);
    relayoutDocumentToolbar(widget);
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
  pendingRelayout.set(widget, window.setTimeout(run, 520));
};

import { MessageLoop } from "@lumino/messaging";
import { Widget } from "@lumino/widgets";

/**
 * JupyterLab freezes DOM-heavy widgets while a dock split handle is dragged
 * (inline width / max-width / max-height) and can leave those values behind
 * after release, so the content keeps the old width with blank bands beside it.
 * Clear them and re-fit once the drag has ended and JupyterLab has unfrozen.
 */
export const refitAfterDockResize = (
  widget: Widget,
  content: Widget,
  options: { pinWidth?: boolean } = {},
): void => {
  const timers = new Set<number>();

  const refit = (): void => {
    if (!widget.isDisposed && widget.isAttached) {
      // JupyterLab's frozen-size refresh can write a stale inline width back
      // after Lumino already cached the correct one, so Lumino never rewrites
      // it. Drop the frozen values; `.jp-KuusiNotebookMindMap` is width: 100%.
      const style = content.node.style;
      style.removeProperty("width");
      style.removeProperty("max-width");
      style.removeProperty("max-height");
      MessageLoop.sendMessage(widget, Widget.Msg.FitRequest);
      MessageLoop.sendMessage(widget, Widget.ResizeMessage.UnknownSize);
      if (options.pinWidth) {
        // The content is absolutely positioned (Lumino BoxLayout) with no CSS
        // width to fall back on, and Lumino will not rewrite a width it
        // already cached — so pin the width the pane really has now.
        const box = getComputedStyle(widget.node);
        const inner =
          widget.node.clientWidth -
          (parseFloat(box.paddingLeft) || 0) -
          (parseFloat(box.paddingRight) || 0);
        if (inner > 0) {
          style.width = `${inner}px`;
        }
      }
    }
  };

  const onRelease = (): void => {
    // JupyterLab's frozen-size refresh runs on a 300 ms timer plus nested
    // animation frames; refit after both have settled.
    for (const delay of [60, 400]) {
      const id = window.setTimeout(() => {
        timers.delete(id);
        refit();
      }, delay);
      timers.add(id);
    }
  };

  document.addEventListener("pointerup", onRelease, true);
  document.addEventListener("pointercancel", onRelease, true);

  widget.disposed.connect(() => {
    document.removeEventListener("pointerup", onRelease, true);
    document.removeEventListener("pointercancel", onRelease, true);
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
  });
};

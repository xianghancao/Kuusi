import type { ImageCropRect } from "./imageRaster";

export type ImageCropOverlayHandle = {
  node: HTMLElement;
  getRect: () => ImageCropRect | null;
  reset: () => void;
  dispose: () => void;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Drag a crop rectangle over the displayed image; maps to natural pixel coordinates.
 */
export const createImageCropOverlay = (
  img: HTMLImageElement,
  onChange: () => void,
): ImageCropOverlayHandle => {
  const root = document.createElement("div");
  root.className = "jp-KuusiImageCropOverlay";
  root.hidden = true;

  const shade = document.createElement("div");
  shade.className = "jp-KuusiImageCropOverlay-shade";

  const box = document.createElement("div");
  box.className = "jp-KuusiImageCropOverlay-box";

  root.append(shade, box);

  let rect: ImageCropRect | null = null;
  let dragStart: { x: number; y: number } | null = null;

  const mapClientToNatural = (clientX: number, clientY: number) => {
    const bounds = img.getBoundingClientRect();
    const nx =
      ((clientX - bounds.left) / Math.max(1, bounds.width)) * img.naturalWidth;
    const ny =
      ((clientY - bounds.top) / Math.max(1, bounds.height)) * img.naturalHeight;

    return {
      x: clamp(nx, 0, img.naturalWidth),
      y: clamp(ny, 0, img.naturalHeight),
    };
  };

  const syncBoxStyle = (): void => {
    if (!rect || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      box.hidden = true;
      return;
    }

    box.hidden = false;
    const bounds = img.getBoundingClientRect();
    const rootBounds = root.getBoundingClientRect();
    const scaleX = bounds.width / img.naturalWidth;
    const scaleY = bounds.height / img.naturalHeight;

    box.style.left = `${rect.x * scaleX + bounds.left - rootBounds.left}px`;
    box.style.top = `${rect.y * scaleY + bounds.top - rootBounds.top}px`;
    box.style.width = `${rect.width * scaleX}px`;
    box.style.height = `${rect.height * scaleY}px`;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (root.hidden || event.button !== 0) {
      return;
    }

    dragStart = mapClientToNatural(event.clientX, event.clientY);
    rect = {
      x: dragStart.x,
      y: dragStart.y,
      width: 0,
      height: 0,
    };
    root.setPointerCapture(event.pointerId);
    event.preventDefault();
    syncBoxStyle();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragStart || !rect) {
      return;
    }

    const point = mapClientToNatural(event.clientX, event.clientY);
    const x0 = Math.min(dragStart.x, point.x);
    const y0 = Math.min(dragStart.y, point.y);
    const x1 = Math.max(dragStart.x, point.x);
    const y1 = Math.max(dragStart.y, point.y);

    rect = {
      x: x0,
      y: y0,
      width: Math.max(1, x1 - x0),
      height: Math.max(1, y1 - y0),
    };
    syncBoxStyle();
    onChange();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!dragStart) {
      return;
    }

    dragStart = null;

    if (root.hasPointerCapture(event.pointerId)) {
      root.releasePointerCapture(event.pointerId);
    }

    onChange();
  };

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerUp);

  const resizeObserver = new ResizeObserver(() => {
    syncBoxStyle();
  });
  resizeObserver.observe(img);

  return {
    node: root,
    getRect: () => rect,
    reset: () => {
      rect = null;
      dragStart = null;
      box.hidden = true;
      onChange();
    },
    dispose: () => {
      resizeObserver.disconnect();
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerUp);
    },
  };
};

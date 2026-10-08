/**
 * Close portaled capsule menus on outside pointerdown.
 * Menus live under document.body, so host.contains() is not enough —
 * open menus and the capsule chrome itself must be excluded.
 */
export const bindCapsuleOutsideClose = (
  chrome: HTMLElement,
  close: () => void,
): (() => void) => {
  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    const el = target instanceof Element ? target : target.parentElement;

    if (chrome.contains(target) || (el && chrome.contains(el))) {
      return;
    }

    if (el?.closest(".jp-KuusiFormatDropdown-menu.is-open")) {
      return;
    }

    close();
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  return () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
  };
};

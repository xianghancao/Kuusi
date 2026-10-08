const FOCUSABLE = "button, input, select, textarea, [tabindex]";
const PANEL = ".jp-KuusiSecondaryMenu-panel, .jp-KuusiSecondaryMenu-nav";

/**
 * Rebuild a capsule menu in place without losing where the user was:
 * scroll offsets of the nav / panel and the focused control (by position).
 */
export const rebuildMenuPreservingState = (
  menu: HTMLElement,
  rebuild: () => void,
): void => {
  const scrolls = Array.from(menu.querySelectorAll<HTMLElement>(PANEL)).map(
    (el) => el.scrollTop,
  );
  const menuScroll = menu.scrollTop;
  const active = document.activeElement;
  const focusIndex =
    active instanceof HTMLElement && menu.contains(active)
      ? Array.from(menu.querySelectorAll<HTMLElement>(FOCUSABLE)).indexOf(active)
      : -1;

  rebuild();

  menu.scrollTop = menuScroll;
  menu.querySelectorAll<HTMLElement>(PANEL).forEach((el, index) => {
    el.scrollTop = scrolls[index] ?? 0;
  });

  if (focusIndex >= 0) {
    menu
      .querySelectorAll<HTMLElement>(FOCUSABLE)
      [focusIndex]?.focus({ preventScroll: true });
  }
};

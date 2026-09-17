export const mountToolbarPopover = (
  anchor: HTMLElement,
  panel: HTMLElement,
  placement: "above" | "below" = "above",
): void => {
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }

  const rect = anchor.getBoundingClientRect();
  panel.style.position = "fixed";
  panel.style.left = `${rect.left + rect.width / 2}px`;
  panel.style.zIndex = "10000";

  if (placement === "above") {
    panel.style.top = `${rect.top - 8}px`;
    panel.style.bottom = "auto";
    panel.style.transform = "translate(-50%, -100%)";
    return;
  }

  panel.style.top = `${rect.bottom + 8}px`;
  panel.style.bottom = "auto";
  panel.style.transform = "translate(-50%, 0)";
};

export const restoreToolbarPopover = (
  host: HTMLElement,
  panel: HTMLElement,
  before: HTMLElement,
): void => {
  host.insertBefore(panel, before);
  panel.style.position = "";
  panel.style.left = "";
  panel.style.top = "";
  panel.style.bottom = "";
  panel.style.transform = "";
  panel.style.zIndex = "";
};

export const isToolbarPopoverTarget = (
  host: HTMLElement,
  panel: HTMLElement,
  target: Node,
): boolean => host.contains(target) || panel.contains(target);

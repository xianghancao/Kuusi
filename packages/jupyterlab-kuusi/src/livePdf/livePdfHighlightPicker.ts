import { Widget } from "@lumino/widgets";
import {
  isToolbarPopoverTarget,
  mountToolbarPopover,
  restoreToolbarPopover,
} from "./livePdfToolbarPopover";
import {
  LIVE_PDF_HIGHLIGHT_COLORS,
  type LivePdfHighlightColor,
} from "./livePdfUserHighlight";
import type { LivePdfViewer } from "./livePdfViewer";

export const createHighlightColorPicker = (viewer: LivePdfViewer): Widget => {
  const wrap = new Widget();
  wrap.addClass("jp-KuusiLivePdf-highlightPicker");

  let selectedColor: LivePdfHighlightColor = LIVE_PDF_HIGHLIGHT_COLORS[0].id;

  const host = document.createElement("div");
  host.className = "jp-KuusiLivePdf-highlightPickerHost";

  const menu = document.createElement("div");
  menu.className = "jp-KuusiLivePdf-highlightPickerMenu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Highlight colors");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "jp-KuusiLivePdf-highlightPickerTrigger";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.title = "Highlight selection";

  const triggerSwatch = document.createElement("span");
  triggerSwatch.className = "jp-KuusiLivePdf-highlightPickerTriggerSwatch";
  triggerSwatch.setAttribute("aria-hidden", "true");

  const triggerLabel = document.createElement("span");
  triggerLabel.className = "jp-KuusiLivePdf-highlightPickerTriggerLabel";
  triggerLabel.textContent = "Highlight";

  trigger.append(triggerSwatch, triggerLabel);

  const syncTrigger = (): void => {
    triggerSwatch.className = `jp-KuusiLivePdf-highlightPickerTriggerSwatch jp-KuusiLivePdf-highlightSwatch--${selectedColor}`;

    const entry = LIVE_PDF_HIGHLIGHT_COLORS.find(
      (color) => color.id === selectedColor,
    );
    trigger.title = entry
      ? `Highlight selection: ${entry.label}`
      : "Highlight selection";
    trigger.setAttribute(
      "aria-label",
      entry ? `Highlight: ${entry.label}` : "Highlight selection",
    );
  };

  const closeMenu = (): void => {
    menu.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    restoreToolbarPopover(host, menu, trigger);
    document.removeEventListener("click", onDocumentClick, true);
    window.removeEventListener("resize", closeMenu);
    window.removeEventListener("scroll", closeMenu, true);
  };

  const openMenu = (): void => {
    mountToolbarPopover(trigger, menu, "below");
    menu.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.requestAnimationFrame(() => {
      document.addEventListener("click", onDocumentClick, true);
    });
  };

  const onDocumentClick = (event: MouseEvent): void => {
    if (!isToolbarPopoverTarget(host, menu, event.target as Node)) {
      closeMenu();
    }
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();

    if (menu.classList.contains("is-open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  for (const entry of LIVE_PDF_HIGHLIGHT_COLORS) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `jp-KuusiLivePdf-highlightPickerItem jp-KuusiLivePdf-highlightPickerItem--${entry.id}`;
    item.setAttribute("role", "menuitem");
    item.title = entry.label;
    item.setAttribute("aria-label", entry.label);

    const swatch = document.createElement("span");
    swatch.className = `jp-KuusiLivePdf-highlightPickerItemSwatch jp-KuusiLivePdf-highlightSwatch--${entry.id}`;
    swatch.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "jp-KuusiLivePdf-highlightPickerItemLabel";
    label.textContent = entry.label;

    item.append(swatch, label);
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedColor = entry.id;
      syncTrigger();
      viewer.applyHighlightToSelection(entry.id);
      closeMenu();
    });
    menu.appendChild(item);
  }

  syncTrigger();
  host.append(menu, trigger);
  wrap.node.appendChild(host);

  wrap.disposed.connect(() => {
    closeMenu();
    document.removeEventListener("click", onDocumentClick, true);
  });

  return wrap;
};

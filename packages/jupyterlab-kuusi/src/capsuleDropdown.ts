import {
  applyCapsuleTriggerLabel,
  type CapsuleTriggerLabel,
} from "./capsuleLabel";
import {
  closeKuusiDropdownMenus,
  openKuusiDropdownMenu,
} from "./formatToolbar";
import { rebuildMenuPreservingState } from "./menuRebuild";

/**
 * Same shell as Mind Map Page/Background/Font menus.
 * Keep menus non-`--fixed` in the DOM tree: glass capsules apply
 * `backdrop-filter`, so fixed descendants would resolve against the pill.
 * `openKuusiDropdownMenu` portals these to `document.body` with `--fixed`
 * when opened under a toolbar cluster.
 */
export const CAPSULE_MENU_SECONDARY =
  "jp-KuusiFormatDropdown-menu jp-KuusiFormatDropdown-menu-wide jp-KuusiSecondaryMenu-host";

export type CapsuleDropdownOptions = {
  toolbarClass: string;
  dropdownClass: string;
  triggerClass: string;
  ariaLabel: string;
  triggerLabel: CapsuleTriggerLabel | (() => CapsuleTriggerLabel);
  /** Refresh the trigger when settings change (e.g. after applying a theme). */
  bindTrigger?: (sync: () => void) => void;
  menuClassName: string;
  fillMenu: (menu: HTMLElement, rebuild: () => void) => void;
  /** Dot on the trigger while the menu's settings differ from their defaults. */
  isCustomized?: () => boolean;
  /** Subscribe to settings changes so the dot stays current; returns a disposer. */
  connectSync?: (listener: () => void) => { disconnect: () => void };
  /** Extra rows under the menu body (e.g. reset, apply to all views). */
  footer?: (menu: HTMLElement, rebuild: () => void) => void;
};

/** One capsule button with a dropdown menu rebuilt on every open. */
export const createCapsuleDropdown = (
  root: HTMLElement,
  options: CapsuleDropdownOptions,
): HTMLElement => {
  const toolbar = document.createElement("div");
  toolbar.className = `jp-KuusiCapsule-toolbar ${options.toolbarClass}`;

  const dropdown = document.createElement("div");
  dropdown.className = `jp-KuusiFormatDropdown ${options.dropdownClass}`;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = `jp-KuusiNotebookMindMap-format-btn ${options.triggerClass}`;
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-label", options.ariaLabel);
  trigger.title = options.ariaLabel;

  const resolveTriggerLabel = (): CapsuleTriggerLabel =>
    typeof options.triggerLabel === "function"
      ? options.triggerLabel()
      : options.triggerLabel;

  const syncTrigger = (): void => {
    applyCapsuleTriggerLabel(trigger, resolveTriggerLabel());
    trigger.classList.toggle(
      "is-customized",
      Boolean(options.isCustomized?.()),
    );
  };

  syncTrigger();

  if (options.connectSync) {
    let connection: { disconnect: () => void } | null = null;
    let wasConnected = false;

    connection = options.connectSync(() => {
      if (!toolbar.isConnected) {
        // Removed from the DOM after having been shown: stop listening.
        if (wasConnected) {
          connection?.disconnect();
        }
        return;
      }

      wasConnected = true;
      syncTrigger();
    });
  }
  options.bindTrigger?.(() => {
    if (!toolbar.isConnected) {
      return;
    }

    syncTrigger();
  });

  const menu = document.createElement("div");
  menu.className = options.menuClassName;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", options.ariaLabel);

  const buildMenu = (): void => {
    menu.replaceChildren();
    options.fillMenu(menu, rebuildMenu);
    options.footer?.(menu, rebuildMenu);
    syncTrigger();
  };
  // Menu callbacks call this after a choice; keep scroll and focus in place.
  const rebuildMenu = (): void => {
    rebuildMenuPreservingState(menu, buildMenu);
  };

  buildMenu();

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.contains("is-open");
    closeKuusiDropdownMenus(root);

    if (!isOpen) {
      buildMenu();
      openKuusiDropdownMenu(menu, root);
    }
  });

  dropdown.append(trigger, menu);
  toolbar.appendChild(dropdown);
  return toolbar;
};

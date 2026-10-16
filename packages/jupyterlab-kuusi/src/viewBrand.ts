import type { LabIcon } from "@jupyterlab/ui-components";

import { createCapsuleCollapseRow } from "./capsuleCollapseRow";
import { closeKuusiDropdownMenus, openKuusiDropdownMenu } from "./formatToolbar";
import type { KuusiTranslator } from "./kuusiI18n";

/**
 * Leftmost capsule mark — view logo matching Mind Map header brand styling.
 * With `menu`, the logo opens a small menu (Auto collapse capsule).
 */
export const createViewCapsuleLogo = (
  icon: LabIcon,
  label: string,
  menu?: { root: HTMLElement; t: KuusiTranslator },
): HTMLElement => {
  const brand = document.createElement("div");
  brand.className = menu
    ? "jp-KuusiFormatDropdown jp-KuusiCapsuleLogoDropdown jp-KuusiNotebookMindMap-header-brand"
    : "jp-KuusiNotebookMindMap-header-brand";

  const mark = document.createElement(menu ? "button" : "span");
  mark.className =
    "jp-KuusiNotebookMindMap-header-title jp-KuusiLogo jp-KuusiLogo--header jp-KuusiLogo--iconOnly";

  const iconHost = document.createElement("span");
  iconHost.className = "jp-KuusiLogo-mark";
  iconHost.setAttribute("aria-hidden", "true");
  icon.render(iconHost);
  mark.appendChild(iconHost);

  if (!menu) {
    brand.setAttribute("aria-label", label);
    brand.title = label;
    mark.setAttribute("aria-hidden", "true");
    brand.appendChild(mark);
    return brand;
  }

  const trigger = mark as HTMLButtonElement;
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-label", label);
  trigger.title = label;

  const dropdown = document.createElement("div");
  dropdown.className =
    "jp-KuusiFormatDropdown-menu jp-KuusiCapsuleLogoDropdown-menu";
  dropdown.setAttribute("role", "menu");
  dropdown.setAttribute("aria-label", label);
  const row = createCapsuleCollapseRow(menu.t);
  dropdown.appendChild(row.node);

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = dropdown.classList.contains("is-open");
    closeKuusiDropdownMenus(menu.root);

    if (!isOpen) {
      row.sync();
      openKuusiDropdownMenu(dropdown, menu.root);
    }
  });

  brand.append(trigger, dropdown);
  return brand;
};

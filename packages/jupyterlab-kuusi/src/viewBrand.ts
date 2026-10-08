import type { LabIcon } from "@jupyterlab/ui-components";

/**
 * Leftmost capsule mark — view logo matching Mind Map header brand styling.
 */
export const createViewCapsuleLogo = (
  icon: LabIcon,
  label: string,
): HTMLElement => {
  const brand = document.createElement("div");
  brand.className = "jp-KuusiNotebookMindMap-header-brand";
  brand.setAttribute("aria-label", label);
  brand.title = label;

  const mark = document.createElement("span");
  mark.className =
    "jp-KuusiNotebookMindMap-header-title jp-KuusiLogo jp-KuusiLogo--header jp-KuusiLogo--iconOnly";
  mark.setAttribute("aria-hidden", "true");

  const iconHost = document.createElement("span");
  iconHost.className = "jp-KuusiLogo-mark";
  iconHost.setAttribute("aria-hidden", "true");
  icon.render(iconHost);
  mark.appendChild(iconHost);
  brand.appendChild(mark);
  return brand;
};

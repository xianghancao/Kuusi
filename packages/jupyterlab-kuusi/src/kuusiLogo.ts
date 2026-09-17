import { kuusiBrandIcon } from "./kuusiIcon";

export const KUUSI_LOGO_TEXT = "Kuusi";

export const KUUSI_LOGO_CLASS = "jp-KuusiLogo";

export type KuusiLogoOptions = {
  /** When false, only the brand mark is shown (Mind Map header menu). */
  showLabel?: boolean;
};

export const applyKuusiLogo = (
  element: HTMLElement,
  variant: "header" | "toolbar" = "header",
  options: KuusiLogoOptions = {},
): void => {
  const showLabel = options.showLabel ?? true;
  element.classList.add(KUUSI_LOGO_CLASS, `${KUUSI_LOGO_CLASS}--${variant}`);
  element.classList.toggle(`${KUUSI_LOGO_CLASS}--iconOnly`, !showLabel);
  element.replaceChildren();

  const mark = document.createElement("span");
  mark.className = `${KUUSI_LOGO_CLASS}-mark`;
  mark.setAttribute("aria-hidden", "true");
  kuusiBrandIcon.render(mark);

  element.appendChild(mark);

  if (showLabel) {
    const label = document.createElement("span");
    label.className = `${KUUSI_LOGO_CLASS}-label`;
    label.textContent = KUUSI_LOGO_TEXT;
    element.appendChild(label);
  }
};

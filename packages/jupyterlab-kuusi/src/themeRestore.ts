import type { KuusiTranslator } from "./kuusiI18n";

export const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const presetMatches = <T extends object>(
  settings: T,
  preset: Partial<T>,
): boolean =>
  (Object.keys(preset) as Array<keyof T>).every((key) =>
    sameJson(settings[key], preset[key]),
  );

/** Footer action in Theme menus: re-apply the current preset. */
export const appendThemeRestoreButton = (
  menu: HTMLElement,
  options: {
    t: KuusiTranslator;
    disabled: boolean;
    onRestore: () => void;
  },
): void => {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "jp-KuusiFormatDropdown-item jp-KuusiThemeRestore";
  button.setAttribute("role", "menuitem");
  button.textContent = options.t.restoreThemeDefaults();
  button.title = options.t.restoreThemeDefaultsTitle();
  button.disabled = options.disabled;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onRestore();
  });
  menu.appendChild(button);
};

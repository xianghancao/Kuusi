import type { KuusiTranslator } from "./kuusiI18n";

/** JSON with object keys sorted, so equal values compare equal in any key order. */
const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );

export const sameJson = (left: unknown, right: unknown): boolean =>
  canonicalJson(left) === canonicalJson(right);

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

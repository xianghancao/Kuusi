import { sameJson } from "./themeRestore";

/** A full-width action row under a capsule menu (reset, apply to all views…). */
export const appendMenuFooterAction = (
  menu: HTMLElement,
  options: {
    label: string;
    title: string;
    disabled?: boolean;
    onClick: () => void;
  },
): void => {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "jp-KuusiFormatDropdown-item jp-KuusiThemeRestore jp-KuusiMenuFooterAction";
  button.setAttribute("role", "menuitem");
  button.textContent = options.label;
  button.title = options.title;
  button.disabled = Boolean(options.disabled);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onClick();
  });
  menu.appendChild(button);
};

/**
 * "Customized" bookkeeping for a menu that owns a fixed set of setting keys:
 * the baseline is the theme preset (or defaults) for those keys.
 */
export const createKeyedReset = <S extends object>(options: {
  keys: ReadonlyArray<keyof S>;
  getSettings: () => S;
  baseline: (settings: S) => S;
  update: (partial: Partial<S>) => Promise<void> | void;
}): { isCustomized: () => boolean; reset: () => void } => {
  const baselineValues = (): Partial<S> => {
    const settings = options.getSettings();
    const base = options.baseline(settings);
    const picked: Partial<S> = {};
    options.keys.forEach((key) => {
      picked[key] = base[key];
    });
    return picked;
  };

  return {
    isCustomized: () => {
      const settings = options.getSettings();
      const base = baselineValues();
      return options.keys.some(
        (key) => !sameJson(settings[key], base[key]),
      );
    },
    reset: () => {
      void options.update(baselineValues());
    },
  };
};

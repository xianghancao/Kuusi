import { createCapsuleDropdown } from "./capsuleDropdown";
import type { KuusiTranslator } from "./kuusiI18n";
import { appendThemeRestoreButton } from "./themeRestore";


/** Rest on a theme row this long before it previews on the canvas. */
const THEME_PREVIEW_DELAY_MS = 160;

export type ThemeCapsuleOption = {
  value: string;
  label: string;
  title: string;
};

/**
 * Hover a row to preview its theme, move away to drop the preview, click to
 * apply. The preview is an unsaved overlay on the settings manager.
 */
export const bindThemeRowPreview = (
  menu: HTMLElement,
  row: HTMLElement,
  value: string,
  preview: (value: string | null) => void,
): void => {
  let timer: number | null = null;

  const clear = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  row.addEventListener("mouseenter", () => {
    clear();
    timer = window.setTimeout(() => {
      timer = null;
      preview(value);
    }, THEME_PREVIEW_DELAY_MS);
  });
  row.addEventListener("mouseleave", () => {
    clear();
    timer = window.setTimeout(() => {
      timer = null;
      preview(null);
    }, THEME_PREVIEW_DELAY_MS / 2);
  });
  row.addEventListener("click", clear);

  // Esc / outside click closes the menu without a mouseleave on the row.
  if (!menu.dataset.kuusiPreviewWatch) {
    menu.dataset.kuusiPreviewWatch = "1";
    new MutationObserver(() => {
      if (!menu.classList.contains("is-open")) {
        preview(null);
      }
    }).observe(menu, { attributes: true, attributeFilter: ["class"] });
  }
};

export type ThemeCapsuleOptions = {
  root: HTMLElement;
  t: KuusiTranslator;
  toolbarClass: string;
  dropdownClass: string;
  triggerClass: string;
  ariaLabel: string;
  themes: () => ThemeCapsuleOption[];
  current: () => string;
  thumbnail: (value: string) => HTMLElement;
  apply: (value: string) => Promise<void>;
  preview: (value: string | null) => void;
  /** True when settings differ from the current theme's preset. */
  isCustomized: () => boolean;
  connect: (listener: () => void) => { disconnect: () => void };
  /** Extra controls between the theme list and the restore button. */
  appendExtra?: (menu: HTMLElement) => void;
};

/** Theme capsule shared by Article, Book, and Slides. */
export const createThemeCapsule = (
  options: ThemeCapsuleOptions,
): HTMLElement =>
  createCapsuleDropdown(options.root, {
    toolbarClass: options.toolbarClass,
    dropdownClass: options.dropdownClass,
    triggerClass: options.triggerClass,
    ariaLabel: options.ariaLabel,
    triggerLabel: options.t.theme(),
    menuClassName: "jp-KuusiFormatDropdown-menu jp-KuusiStyleDropdown-menu",
    isCustomized: options.isCustomized,
    connectSync: options.connect,
    fillMenu: (menu, rebuild) => {
      const list = document.createElement("div");
      list.className = "jp-KuusiStyleDropdown-list";
      const current = options.current();

      options.themes().forEach(({ value, label, title }) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className =
          "jp-KuusiFormatDropdown-item jp-KuusiStyleDropdown-item";
        item.setAttribute("role", "menuitem");
        item.setAttribute("aria-label", title);
        item.title = title;
        item.classList.toggle("is-active", current === value);

        const labelEl = document.createElement("span");
        labelEl.className = "jp-KuusiStyleDropdown-label";
        labelEl.textContent = label;
        item.append(labelEl, options.thumbnail(value));
        item.addEventListener("click", (event) => {
          event.stopPropagation();
          if (current !== value) {
            void options.apply(value);
          } else {
            // Clicking the active theme only drops the hover preview.
            options.preview(null);
          }
          rebuild();
        });
        bindThemeRowPreview(menu, item, value, options.preview);
        list.appendChild(item);
      });

      menu.appendChild(list);
      options.appendExtra?.(menu);
      appendThemeRestoreButton(menu, {
        t: options.t,
        disabled: !options.isCustomized(),
        onRestore: () => {
          void options.apply(current).then(() => rebuild());
        },
      });
    },
  });

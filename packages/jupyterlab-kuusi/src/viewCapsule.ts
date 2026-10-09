import { bindCapsuleOutsideClose } from "./capsuleOutsideClose";
import { closeKuusiDropdownMenus } from "./formatToolbar";
import type { KuusiTranslator } from "./kuusiI18n";
import { createPageToolbar, type PageToolbarItem } from "./pageToolbar";

export type ViewCapsuleHeaderOptions = {
  /** Element the `<header>` is appended to. */
  host: HTMLElement;
  /** Base class, e.g. `jp-KuusiArticle-header` (`-left` is derived). */
  headerClass: string;
  ariaLabel: string;
  items: PageToolbarItem[];
  t: KuusiTranslator;
  /** Root whose dropdown menus this header owns (closed on outside click). */
  menuRoot: HTMLElement;
};

export type ViewCapsuleHeader = {
  header: HTMLElement;
  /** Close menus, unbind outside-click handling, and remove the header. */
  dispose: () => void;
};

/**
 * Shared chrome for the Article / Book / Slides capsule header: header shell,
 * left page capsule, and outside-click dismissal. Per-view menus are passed as
 * `items`; everything lifecycle-related lives here once.
 */
export const mountViewCapsuleHeader = (
  options: ViewCapsuleHeaderOptions,
): ViewCapsuleHeader => {
  const header = document.createElement("header");
  header.className = options.headerClass;

  const headerLeft = document.createElement("div");
  headerLeft.className = `${options.headerClass}-left`;

  const pageToolbar = createPageToolbar(
    options.items,
    options.t,
    options.ariaLabel,
    { menuRoot: options.menuRoot },
  );
  headerLeft.appendChild(pageToolbar.node);
  header.appendChild(headerLeft);
  options.host.appendChild(header);

  const disposeOutsideClose = bindCapsuleOutsideClose(header, () =>
    closeKuusiDropdownMenus(options.menuRoot),
  );

  return {
    header,
    dispose: () => {
      closeKuusiDropdownMenus(options.menuRoot);
      disposeOutsideClose();
      header.remove();
    },
  };
};

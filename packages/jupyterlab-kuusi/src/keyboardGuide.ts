import type { KuusiTranslator } from "./kuusiI18n";
import { closeKuusiDropdownMenus, openKuusiDropdownMenu } from "./formatToolbar";
import { mindMapIcon } from "./kuusiIcon";

export type ShortcutGuideEntry = {
  keys: string;
  description: string;
};

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export const modKeyLabel = isMac ? "⌘" : "Ctrl";

export const MIND_MAP_SHORTCUTS: ShortcutGuideEntry[] = [
  { keys: "↑ ↓ ← →", description: "Move selection on the canvas" },
  { keys: "Enter", description: "Insert sibling (child when on root)" },
  { keys: "Shift+Enter", description: "Render node and insert sibling (child on root)" },
  {
    keys: `${modKeyLabel}+Enter`,
    description: "Render node and stay on current node",
  },
  { keys: "Tab", description: "Insert child node (also while editing)" },
  { keys: "Space", description: "Collapse / expand branch" },
  {
    keys: `${modKeyLabel}+Click`,
    description: "Multi-select nodes (drag moves them together)",
  },
  { keys: `${modKeyLabel}+C`, description: "Copy selected topic and its subtree" },
  { keys: `${modKeyLabel}+X`, description: "Cut selected topic and its subtree" },
  {
    keys: `${modKeyLabel}+V`,
    description:
      "Paste Markdown outline as child hierarchy, or Kuusi subtree / plain lines",
  },
  { keys: `${modKeyLabel}+Z`, description: "Undo" },
  {
    keys: isMac ? `${modKeyLabel}+Shift+Z` : `${modKeyLabel}+Y`,
    description: "Redo",
  },
  { keys: "Delete", description: "Delete selected topic and its subtree" },
  { keys: "F2", description: "Edit current node" },
  { keys: "Escape", description: "Exit edit mode" },
  { keys: `${modKeyLabel}+Home`, description: "Jump to root (H1)" },
];

export const FORMAT_SHORTCUTS: ShortcutGuideEntry[] = [
  { keys: `${modKeyLabel}+B`, description: "Bold (toggle)" },
  { keys: `${modKeyLabel}+I`, description: "Italic (toggle)" },
  { keys: `${modKeyLabel}+U`, description: "Underline (toggle)" },
  { keys: `${modKeyLabel}+Shift+X`, description: "Strikethrough (toggle)" },
  { keys: `${modKeyLabel}+E`, description: "Inline code (toggle)" },
  { keys: `${modKeyLabel}+K`, description: "Insert Markdown link" },
  { keys: `${modKeyLabel}+Shift+K`, description: "Insert HTML link" },
  { keys: `${modKeyLabel}+Shift+M`, description: "Highlight (toggle)" },
  { keys: `${modKeyLabel}+\\`, description: "Clear formatting in selection" },
];

export const FORMAT_GUIDE_NOTES: ShortcutGuideEntry[] = [
  {
    keys: "Heading",
    description:
      "H1–H3 outline chrome or Body; nesting persists to depth 20 with Body style",
  },
  {
    keys: "Aa",
    description: "Inline styles only affect node content, not structure",
  },
  {
    keys: "Code cell",
    description: "Format toolbar is disabled while editing code cells",
  },
];

const appendGuideSection = (
  menu: HTMLElement,
  title: string,
  entries: ShortcutGuideEntry[],
): void => {
  const sectionTitle = document.createElement("div");
  sectionTitle.className = "jp-KuusiGuideDropdown-title";
  sectionTitle.textContent = title;
  menu.appendChild(sectionTitle);

  entries.forEach(({ keys, description }) => {
    const row = document.createElement("div");
    row.className = "jp-KuusiGuideDropdown-row";
    row.setAttribute("role", "menuitem");

    const keyEl = document.createElement("kbd");
    keyEl.className = "jp-KuusiGuideDropdown-key";
    keyEl.textContent = keys;

    const descEl = document.createElement("span");
    descEl.className = "jp-KuusiGuideDropdown-desc";
    descEl.textContent = description;

    row.append(keyEl, descEl);
    menu.appendChild(row);
  });
};

export const appendKeyboardGuideContent = (
  menu: HTMLElement,
  t: KuusiTranslator,
): void => {
  appendGuideSection(menu, t.mindMapShortcuts(), MIND_MAP_SHORTCUTS);
  appendGuideSection(menu, t.formattingShortcuts(), FORMAT_SHORTCUTS);
  appendGuideSection(menu, t.formattingNotes(), FORMAT_GUIDE_NOTES);
};

/** Mind map page toolbar: mind map icon opens the shortcut guide directly. */
export const createMindMapShortcutMenu = (
  root: HTMLElement,
  t: KuusiTranslator,
): HTMLElement => {
  const dropdown = document.createElement("div");
  dropdown.className =
    "jp-KuusiFormatDropdown jp-KuusiGuideDropdown jp-KuusiNotebookMindMap-header-brand";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className =
    "jp-KuusiNotebookMindMap-header-title jp-KuusiLogo jp-KuusiLogo--header jp-KuusiLogo--iconOnly";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-label", t.keyboardShortcuts());
  trigger.title = t.keyboardShortcuts();

  const mark = document.createElement("span");
  mark.className = "jp-KuusiLogo-mark";
  mark.setAttribute("aria-hidden", "true");
  mindMapIcon.render(mark);
  trigger.appendChild(mark);

  const menu = document.createElement("div");
  menu.className =
    "jp-KuusiFormatDropdown-menu jp-KuusiFormatDropdown-menu-wide jp-KuusiGuideDropdown-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t.keyboardShortcuts());
  appendKeyboardGuideContent(menu, t);

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.contains("is-open");
    closeKuusiDropdownMenus(root);
    if (!isOpen) {
      openKuusiDropdownMenu(menu, root);
    }
  });

  dropdown.append(trigger, menu);
  return dropdown;
};

export const createGuideToolbar = (
  t: KuusiTranslator,
  onOpenChange?: (open: boolean) => void,
): HTMLElement => {
  const toolbar = document.createElement("div");
  toolbar.className = "jp-KuusiNotebookMindMap-guide-toolbar";

  const dropdown = document.createElement("div");
  dropdown.className = "jp-KuusiFormatDropdown jp-KuusiGuideDropdown";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className =
    "jp-KuusiNotebookMindMap-format-btn jp-KuusiGuideDropdown-trigger";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-label", t.keyboardShortcuts());
  trigger.title = t.keyboardShortcuts();
  trigger.textContent = t.guide();

  const menu = document.createElement("div");
  menu.className =
    "jp-KuusiFormatDropdown-menu jp-KuusiFormatDropdown-menu-wide jp-KuusiGuideDropdown-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t.keyboardShortcuts());

  appendKeyboardGuideContent(menu, t);

  const setOpen = (open: boolean) => {
    menu.classList.toggle("is-open", open);
    onOpenChange?.(open);
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!menu.classList.contains("is-open"));
  });

  dropdown.append(trigger, menu);
  toolbar.appendChild(dropdown);

  return toolbar;
};

export const closeGuideMenu = (root: HTMLElement): void => {
  root
    .querySelector(".jp-KuusiGuideDropdown-menu")
    ?.classList.remove("is-open");
};

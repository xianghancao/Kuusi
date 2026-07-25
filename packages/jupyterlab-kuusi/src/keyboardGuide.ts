import type { KuusiTranslator } from "./kuusiI18n";

export type ShortcutGuideEntry = {
  keys: string;
  description: string;
};

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export const modKeyLabel = isMac ? "⌘" : "Ctrl";

export const MIND_MAP_SHORTCUTS: ShortcutGuideEntry[] = [
  { keys: "↑ ↓", description: "Move between siblings" },
  { keys: "← →", description: "Move to parent / first child" },
  { keys: "Enter", description: "Insert sibling (child when on root)" },
  { keys: "Shift+Enter", description: "Render node and insert sibling (child on root)" },
  {
    keys: `${modKeyLabel}+Enter`,
    description: "Render node and stay on current node",
  },
  { keys: "Tab", description: "Insert child node" },
  { keys: "Space", description: "Collapse / expand branch" },
  { keys: `${modKeyLabel}+C`, description: "Copy selected topic and its subtree" },
  { keys: `${modKeyLabel}+X`, description: "Cut selected topic and its subtree" },
  {
    keys: `${modKeyLabel}+V`,
    description:
      "Paste subtree as sibling, or external text as child topics (one per line)",
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
    description: "Outline headings change the mind map tree (H1 = root)",
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

  document.addEventListener("click", () => {
    setOpen(false);
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

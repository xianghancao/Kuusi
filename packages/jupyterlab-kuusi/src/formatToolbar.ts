import type { IMarkdownCellModel } from "@jupyterlab/cells";
import type { CodeEditor } from "@jupyterlab/codeeditor";
import {
  applyOutlineHeading,
  buildHtmlImageSnippet,
  buildHtmlLinkSnippet,
  getMetadataOutlineHeadingLevel,
  MarkdownFormat,
} from "./markdownFormat";
import { getFormatState } from "./formatState";

type EditorGetter = () => CodeEditor.IEditor | null | undefined;

type FormatToolbarOptions = {
  getEditor: EditorGetter;
  getActiveMarkdownCell: () => IMarkdownCellModel | null;
  isEnabled: () => boolean;
  getDisabledReason?: () => string | null;
};

export type FormatToolbarHandle = {
  node: HTMLElement;
  syncEnabled: () => void;
  syncActiveStates: () => void;
};

type MenuItem = {
  label: string;
  previewLabel?: string;
  title?: string;
  action: (editor: CodeEditor.IEditor) => void;
  previewClass?: string;
  formatId?: string;
};

type StateTarget = {
  formatId: string;
  element: HTMLElement;
};

const COLOR_SWATCHES = [
  { label: "Red", color: "#d32f2f" },
  { label: "Orange", color: "#f57c00" },
  { label: "Green", color: "#388e3c" },
  { label: "Blue", color: "#1976d2" },
  { label: "Purple", color: "#7b1fa2" },
  { label: "Gray", color: "#616161" },
];

const runOnEditor = (
  getEditor: EditorGetter,
  action: (editor: CodeEditor.IEditor) => void,
  onComplete?: () => void,
): void => {
  const editor = getEditor();

  if (!editor) {
    return;
  }

  action(editor);
  onComplete?.();
};

const closeAllMenus = (root: HTMLElement): void => {
  root.querySelectorAll(".jp-KuusiFormatDropdown-menu").forEach((menu) => {
    menu.classList.remove("is-open");
  });
};

export const closeKuusiDropdownMenus = closeAllMenus;

export const appendDropdownSection = (
  menu: HTMLElement,
  label: string,
): void => {
  const section = document.createElement("div");
  section.className = "jp-KuusiFormatDropdown-section";
  section.textContent = label;
  menu.appendChild(section);
};

export const createDropdownOptionRow = (
  menu: HTMLElement,
  extraClassName = "",
): HTMLElement => {
  const row = document.createElement("div");
  row.className = extraClassName
    ? `jp-KuusiFormatDropdown-optionRow ${extraClassName}`
    : "jp-KuusiFormatDropdown-optionRow";
  menu.appendChild(row);
  return row;
};

export const appendDropdownSectionRow = (
  menu: HTMLElement,
  label: string,
  extraClassName = "",
): HTMLElement => {
  appendDropdownSection(menu, label);
  return createDropdownOptionRow(menu, extraClassName);
};

const setButtonEnabled = (button: HTMLButtonElement, enabled: boolean): void => {
  button.disabled = !enabled;
  button.setAttribute("aria-disabled", String(!enabled));
};

const createMenuItemButton = (
  getEditor: EditorGetter,
  item: MenuItem,
  root: HTMLElement,
  stateTargets: StateTarget[],
  onComplete: () => void,
): HTMLButtonElement => {
  const menuItem = document.createElement("button");
  menuItem.type = "button";
  menuItem.className = "jp-KuusiFormatDropdown-item";
  menuItem.setAttribute("role", "menuitem");
  menuItem.title = item.title ?? item.label;

  if (item.formatId) {
    menuItem.dataset.formatId = item.formatId;
    stateTargets.push({ formatId: item.formatId, element: menuItem });
  }

  if (item.previewLabel) {
    const kind = document.createElement("span");
    kind.className = "jp-KuusiFormatDropdown-itemKind";
    kind.textContent = item.label;
    menuItem.appendChild(kind);
  }

  const preview = document.createElement("span");
  preview.className = item.previewClass
    ? `jp-KuusiFormatDropdown-preview ${item.previewClass}`
    : "jp-KuusiFormatDropdown-preview";
  preview.textContent = item.previewLabel ?? item.label;
  menuItem.appendChild(preview);

  menuItem.addEventListener("click", (event) => {
    event.stopPropagation();
    runOnEditor(getEditor, item.action, onComplete);
  });

  return menuItem;
};

const applyActiveStates = (
  getEditor: EditorGetter,
  getActiveMarkdownCell: () => IMarkdownCellModel | null,
  stateTargets: StateTarget[],
): void => {
  const cell = getActiveMarkdownCell();
  const state = getFormatState(
    getEditor(),
    cell ? getMetadataOutlineHeadingLevel(cell) : null,
  );

  stateTargets.forEach(({ formatId, element }) => {
    let active = false;

    if (formatId === "bold") active = state.bold;
    else if (formatId === "italic") active = state.italic;
    else if (formatId === "underline") active = state.underline;
    else if (formatId === "strikethrough") active = state.strikethrough;
    else if (formatId === "inlineCode") active = state.inlineCode;
    else if (formatId === "highlight") active = state.highlight;
    else if (formatId === "blockQuote") active = state.blockQuote;
    else if (formatId.startsWith("heading")) {
      active = state.headingLevel === Number(formatId.replace("heading", ""));
    } else if (formatId === "list-bulleted") active = state.listType === "bulleted";
    else if (formatId === "list-dashed") active = state.listType === "dashed";
    else if (formatId === "list-numbered") active = state.listType === "numbered";
    else if (formatId === "list-checklist") active = state.listType === "checklist";
    else if (formatId.startsWith("color:")) {
      active = state.color === formatId.slice("color:".length);
    } else if (formatId === "color-default") {
      active = state.color === null;
    }

    element.classList.toggle("is-active", active);
  });
};

const createDropdown = (
  getEditor: EditorGetter,
  label: string,
  title: string,
  items: MenuItem[],
  root: HTMLElement,
  registerControl: (button: HTMLButtonElement) => void,
  stateTargets: StateTarget[],
  onComplete: () => void,
  menuClassName = "",
): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.className = "jp-KuusiFormatDropdown";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "jp-KuusiNotebookMindMap-format-btn";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.setAttribute("aria-haspopup", "menu");
  button.textContent = label;
  registerControl(button);

  const menu = document.createElement("div");
  menu.className = ["jp-KuusiFormatDropdown-menu", menuClassName]
    .filter(Boolean)
    .join(" ");
  menu.setAttribute("role", "menu");

  items.forEach((item) => {
    menu.appendChild(
      createMenuItemButton(getEditor, item, root, stateTargets, onComplete),
    );
  });

  button.addEventListener("click", (event) => {
    event.stopPropagation();

    if (button.disabled) {
      return;
    }

    const isOpen = menu.classList.contains("is-open");
    closeAllMenus(root);

    if (!isOpen) {
      menu.classList.add("is-open");
      onComplete();
    }
  });

  wrapper.appendChild(button);
  wrapper.appendChild(menu);

  return wrapper;
};

const createColorDropdown = (
  getEditor: EditorGetter,
  root: HTMLElement,
  registerControl: (button: HTMLButtonElement) => void,
  stateTargets: StateTarget[],
  onComplete: () => void,
): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.className = "jp-KuusiFormatDropdown";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "jp-KuusiNotebookMindMap-format-btn";
  button.title = "Text style";
  button.setAttribute("aria-label", "Text style");
  button.setAttribute("aria-haspopup", "menu");
  button.textContent = "Aa";
  registerControl(button);

  const menu = document.createElement("div");
  menu.className = "jp-KuusiFormatDropdown-menu jp-KuusiFormatDropdown-menu-wide";
  menu.setAttribute("role", "menu");

  const textItems: MenuItem[] = [
    {
      label: "Bold",
      formatId: "bold",
      action: MarkdownFormat.bold,
      previewClass: "jp-KuusiFormatDropdown-preview-bold",
    },
    {
      label: "Italic",
      formatId: "italic",
      action: MarkdownFormat.italic,
      previewClass: "jp-KuusiFormatDropdown-preview-italic",
    },
    {
      label: "Underline",
      formatId: "underline",
      action: MarkdownFormat.underline,
      previewClass: "jp-KuusiFormatDropdown-preview-underline",
    },
    {
      label: "Strikethrough",
      formatId: "strikethrough",
      action: MarkdownFormat.strikethrough,
      previewClass: "jp-KuusiFormatDropdown-preview-strikethrough",
    },
    {
      label: "Inline code",
      formatId: "inlineCode",
      action: MarkdownFormat.inlineCode,
      previewClass: "jp-KuusiFormatDropdown-preview-code",
    },
    {
      label: "Highlight",
      formatId: "highlight",
      action: MarkdownFormat.highlight,
      previewClass: "jp-KuusiFormatDropdown-preview-highlight",
    },
    {
      label: "Block Quote",
      formatId: "blockQuote",
      action: MarkdownFormat.blockQuote,
      previewClass: "jp-KuusiFormatDropdown-preview-blockquote",
    },
    {
      label: "Code block",
      action: MarkdownFormat.codeBlock,
      previewClass: "jp-KuusiFormatDropdown-preview-codeblock",
    },
    {
      label: "Clear formatting",
      title: "Remove inline formatting from selection",
      action: MarkdownFormat.clearFormatting,
      previewClass: "jp-KuusiFormatDropdown-preview-clear",
    },
  ];

  textItems.forEach((item) => {
    menu.appendChild(
      createMenuItemButton(getEditor, item, root, stateTargets, onComplete),
    );
  });

  const colorLabel = document.createElement("div");
  colorLabel.className = "jp-KuusiFormatDropdown-section";
  colorLabel.textContent = "Font color";
  menu.appendChild(colorLabel);

  const swatches = document.createElement("div");
  swatches.className =
    "jp-KuusiFormatDropdown-optionRow jp-KuusiFormatColorSwatches";

  const defaultSwatch = document.createElement("button");
  defaultSwatch.type = "button";
  defaultSwatch.className =
    "jp-KuusiFormatColorSwatch jp-KuusiFormatColorSwatch-default";
  defaultSwatch.dataset.formatId = "color-default";
  defaultSwatch.title = "Default";
  defaultSwatch.setAttribute("aria-label", "Default");
  stateTargets.push({
    formatId: "color-default",
    element: defaultSwatch,
  });
  defaultSwatch.addEventListener("click", (event) => {
    event.stopPropagation();
    runOnEditor(getEditor, MarkdownFormat.clearColor, onComplete);
  });
  swatches.appendChild(defaultSwatch);

  COLOR_SWATCHES.forEach(({ label, color }) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "jp-KuusiFormatColorSwatch";
    swatch.dataset.formatId = `color:${color}`;
    swatch.title = label;
    swatch.setAttribute("aria-label", label);
    swatch.style.backgroundColor = color;
    stateTargets.push({ formatId: `color:${color}`, element: swatch });
    swatch.addEventListener("click", (event) => {
      event.stopPropagation();
      runOnEditor(getEditor, (editor) => MarkdownFormat.color(editor, color), onComplete);
    });
    swatches.appendChild(swatch);
  });

  menu.appendChild(swatches);

  const customRow = document.createElement("div");
  customRow.className = "jp-KuusiFormatColorCustom";

  const customLabel = document.createElement("label");
  customLabel.className = "jp-KuusiFormatColorCustom-label";
  customLabel.textContent = "Custom";
  customLabel.setAttribute("for", "jp-KuusiFormatColorCustom-input");

  const customInput = document.createElement("input");
  customInput.type = "color";
  customInput.id = "jp-KuusiFormatColorCustom-input";
  customInput.className = "jp-KuusiFormatColorCustom-input";
  customInput.value = "#1976d2";
  customInput.title = "Choose a custom font color";
  customInput.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  customInput.addEventListener("input", (event) => {
    event.stopPropagation();
    const color = customInput.value;
    runOnEditor(getEditor, (editor) => MarkdownFormat.color(editor, color), onComplete);
  });

  customRow.append(customLabel, customInput);
  menu.appendChild(customRow);

  button.addEventListener("click", (event) => {
    event.stopPropagation();

    if (button.disabled) {
      return;
    }

    const isOpen = menu.classList.contains("is-open");
    closeAllMenus(root);

    if (!isOpen) {
      menu.classList.add("is-open");
      onComplete();
    }
  });

  wrapper.appendChild(button);
  wrapper.appendChild(menu);

  return wrapper;
};

const TABLE_GRID_MAX_ROWS = 8;
const TABLE_GRID_MAX_COLS = 8;

const createTableDropdown = (
  getEditor: EditorGetter,
  root: HTMLElement,
  registerControl: (button: HTMLButtonElement) => void,
): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.className = "jp-KuusiFormatDropdown";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "jp-KuusiNotebookMindMap-format-btn";
  button.title = "Insert table";
  button.setAttribute("aria-label", "Insert table");
  button.setAttribute("aria-haspopup", "menu");
  button.textContent = "Table";
  registerControl(button);

  const menu = document.createElement("div");
  menu.className =
    "jp-KuusiFormatDropdown-menu jp-KuusiFormatDropdown-menu-table";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Table size");

  const label = document.createElement("div");
  label.className = "jp-KuusiFormatTablePicker-label";
  label.textContent = "Insert table";

  const grid = document.createElement("div");
  grid.className = "jp-KuusiFormatTablePicker-grid";
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Choose table size");

  const updateHighlight = (rows: number, cols: number): void => {
    grid.querySelectorAll(".jp-KuusiFormatTablePicker-cell").forEach((cell) => {
      const element = cell as HTMLElement;
      const row = Number(element.dataset.row);
      const col = Number(element.dataset.col);
      element.classList.toggle(
        "is-highlighted",
        row <= rows && col <= cols,
      );
    });
  };

  const resetHighlight = (): void => {
    label.textContent = "Insert table";
    updateHighlight(0, 0);
  };

  for (let row = 1; row <= TABLE_GRID_MAX_ROWS; row += 1) {
    for (let col = 1; col <= TABLE_GRID_MAX_COLS; col += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "jp-KuusiFormatTablePicker-cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.title = `${row} × ${col} table`;
      cell.setAttribute("aria-label", `${row} by ${col} table`);

      cell.addEventListener("mouseenter", () => {
        label.textContent = `${row} × ${col}`;
        updateHighlight(row, col);
      });

      cell.addEventListener("click", (event) => {
        event.stopPropagation();
        runOnEditor(getEditor, (editor) => MarkdownFormat.table(editor, row, col));
      });

      grid.appendChild(cell);
    }
  }

  grid.addEventListener("mouseleave", resetHighlight);

  menu.appendChild(label);
  menu.appendChild(grid);

  button.addEventListener("click", (event) => {
    event.stopPropagation();

    if (button.disabled) {
      return;
    }

    const isOpen = menu.classList.contains("is-open");
    closeAllMenus(root);

    if (!isOpen) {
      menu.classList.add("is-open");
      resetHighlight();
    }
  });

  wrapper.appendChild(button);
  wrapper.appendChild(menu);

  return wrapper;
};

const headingItem = (
  getActiveMarkdownCell: () => IMarkdownCellModel | null,
  level: number,
): MenuItem => ({
  label: `Heading ${level} (outline)`,
  title: `Set outline heading level ${level}`,
  formatId: `heading${level}`,
  action: (editor) => {
    const cell = getActiveMarkdownCell();

    if (!cell) {
      return;
    }

    applyOutlineHeading(editor, cell, level);
  },
  previewClass: `jp-KuusiFormatDropdown-preview-heading${Math.min(level, 6)}`,
});

export const createFormatToolbar = ({
  getEditor,
  getActiveMarkdownCell,
  isEnabled,
  getDisabledReason,
}: FormatToolbarOptions): FormatToolbarHandle => {
  const toolbar = document.createElement("div");
  toolbar.className = "jp-KuusiNotebookMindMap-format-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Markdown formatting");

  const controls: HTMLButtonElement[] = [];
  const stateTargets: StateTarget[] = [];

  const registerControl = (button: HTMLButtonElement) => {
    controls.push(button);
  };

  const syncActiveStates = () => {
    applyActiveStates(getEditor, getActiveMarkdownCell, stateTargets);
  };

  const onFormatAction = () => {
    syncActiveStates();
  };

  const syncEnabled = () => {
    const enabled = isEnabled();
    const reason = getDisabledReason?.();

    controls.forEach((button) => {
      setButtonEnabled(button, enabled);
      button.title = enabled
        ? button.getAttribute("data-enabled-title") ?? button.title
        : reason ?? "Formatting is available in markdown edit mode";
    });

    if (!enabled) {
      closeAllMenus(toolbar);
    }
  };

  document.addEventListener("click", () => {
    closeAllMenus(toolbar);
  });

  toolbar.appendChild(
    createColorDropdown(getEditor, toolbar, registerControl, stateTargets, onFormatAction),
  );

  toolbar.appendChild(
    createDropdown(
      getEditor,
      "Heading",
      "Outline heading level (changes mind map structure)",
      [1, 2, 3, 4, 5, 6].map((level) =>
        headingItem(getActiveMarkdownCell, level),
      ),
      toolbar,
      registerControl,
      stateTargets,
      onFormatAction,
      "jp-KuusiFormatDropdown-menu-wide",
    ),
  );

  toolbar.appendChild(
    createDropdown(
      getEditor,
      "List",
      "List style",
      [
        {
          label: "Bulleted list",
          formatId: "list-bulleted",
          action: MarkdownFormat.bulletedList,
          previewClass: "jp-KuusiFormatDropdown-preview-bulleted",
        },
        {
          label: "Dashed list",
          formatId: "list-dashed",
          action: MarkdownFormat.dashedList,
          previewClass: "jp-KuusiFormatDropdown-preview-dashed",
        },
        {
          label: "Numbered list",
          formatId: "list-numbered",
          action: MarkdownFormat.numberedList,
          previewClass: "jp-KuusiFormatDropdown-preview-numbered",
        },
        {
          label: "Check list",
          formatId: "list-checklist",
          action: MarkdownFormat.checkList,
          previewClass: "jp-KuusiFormatDropdown-preview-checklist",
        },
      ],
      toolbar,
      registerControl,
      stateTargets,
      onFormatAction,
    ),
  );

  toolbar.appendChild(createTableDropdown(getEditor, toolbar, registerControl));
  toolbar.appendChild(
    createDropdown(
      getEditor,
      "Image",
      "Insert image",
      [
        {
          label: "Markdown",
          previewLabel: "![image](https://)",
          title: "Insert image using Markdown syntax",
          previewClass: "jp-KuusiFormatDropdown-preview-syntax",
          action: MarkdownFormat.imageMarkdown,
        },
        {
          label: "HTML",
          previewLabel: buildHtmlImageSnippet("image"),
          title: "Insert image using HTML syntax",
          previewClass: "jp-KuusiFormatDropdown-preview-syntax",
          action: MarkdownFormat.imageHtml,
        },
      ],
      toolbar,
      registerControl,
      stateTargets,
      onFormatAction,
      "jp-KuusiFormatDropdown-menu-wide",
    ),
  );
  toolbar.appendChild(
    createDropdown(
      getEditor,
      "Link",
      "Insert link",
      [
        {
          label: "Markdown",
          previewLabel: "[link](https://)",
          title: "Insert link using Markdown syntax",
          previewClass: "jp-KuusiFormatDropdown-preview-syntax",
          action: MarkdownFormat.linkMarkdown,
        },
        {
          label: "HTML",
          previewLabel: buildHtmlLinkSnippet("link"),
          title: "Insert link using HTML syntax",
          previewClass: "jp-KuusiFormatDropdown-preview-syntax",
          action: MarkdownFormat.linkHtml,
        },
      ],
      toolbar,
      registerControl,
      stateTargets,
      onFormatAction,
      "jp-KuusiFormatDropdown-menu-wide",
    ),
  );

  controls.forEach((button) => {
    button.setAttribute("data-enabled-title", button.title);
  });

  syncEnabled();
  syncActiveStates();

  return { node: toolbar, syncEnabled, syncActiveStates };
};

import type { IMarkdownCellModel } from "@jupyterlab/cells";
import type { CodeEditor } from "@jupyterlab/codeeditor";
import {
  applyOutlineBody,
  applyOutlineHeading,
  buildHtmlImageSnippet,
  buildHtmlLinkSnippet,
  getMetadataOutlineHeadingLevel,
  MarkdownFormat,
} from "./markdownFormat";
import { getFormatState } from "./formatState";
import { mountSecondaryMenu } from "./secondaryMenu";

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
  root.querySelectorAll(".jp-KuusiFormatDropdown-menu").forEach((node) => {
    node.classList.remove("is-open");

    if (node instanceof HTMLElement) {
      clearKuusiDropdownMenuPosition(node);
    }
  });
};

export const closeKuusiDropdownMenus = closeAllMenus;

const clearKuusiDropdownMenuPosition = (menu: HTMLElement): void => {
  menu.style.left = "";
  menu.style.right = "";
  menu.style.top = "";
  menu.style.bottom = "";
  menu.style.maxWidth = "";
  menu.style.width = "";
};

/**
 * Keep toolbar secondary menus inside the Kuusi panel. Narrow split views
 * otherwise clip `92vw`-wide menus that open past the widget edge.
 */
export const positionKuusiDropdownMenu = (
  menu: HTMLElement,
  root: HTMLElement,
): void => {
  if (!menu.classList.contains("is-open")) {
    return;
  }

  const trigger = menu.parentElement;

  if (!(trigger instanceof HTMLElement)) {
    return;
  }

  const panelRoot =
    root.closest(".jp-KuusiNotebookMindMap") ??
    root.closest(".jp-KuusiNotebookMindMapDocument") ??
    root;
  const rootRect = panelRoot.getBoundingClientRect();
  const pad = 8;
  const maxWidth = Math.max(160, Math.floor(rootRect.width - pad * 2));
  menu.style.maxWidth = `${maxWidth}px`;

  if (
    menu.classList.contains("jp-KuusiSecondaryMenu-host") ||
    menu.classList.contains("jp-KuusiProductDropdown-menu")
  ) {
    menu.style.width = `${Math.min(460, maxWidth)}px`;
  }

  const formatCluster = menu.closest(".jp-KuusiToolbarCluster--format");
  const isVerticalRail = Boolean(
    formatCluster?.classList.contains("is-vertical"),
  );

  // Reset to CSS defaults before measuring preferred placement.
  menu.style.left = "";
  menu.style.right = "";
  menu.style.top = "";
  menu.style.bottom = "";
  void menu.offsetWidth;

  const triggerRect = trigger.getBoundingClientRect();
  let menuRect = menu.getBoundingClientRect();

  if (isVerticalRail) {
    // Always open to the left of the vertical format rail; clamp inside the panel.
    let leftPx = -menuRect.width - 6;
    const minLeft = rootRect.left + pad - triggerRect.left;
    const maxLeft = rootRect.right - pad - menuRect.width - triggerRect.left;
    leftPx = Math.min(Math.max(leftPx, minLeft), maxLeft);

    menu.style.left = `${Math.round(leftPx)}px`;
    menu.style.right = "auto";
    menu.style.top = "0";
    menu.style.bottom = "auto";

    menuRect = menu.getBoundingClientRect();

    if (menuRect.bottom > rootRect.bottom - pad) {
      const topPx = Math.max(
        rootRect.top + pad - triggerRect.top,
        rootRect.bottom - pad - menuRect.height - triggerRect.top,
      );
      menu.style.top = `${Math.round(topPx)}px`;
    }

    return;
  }

  // Horizontal toolbars: start from CSS (left:0 or right:0), then clamp.
  let leftPx = menuRect.left - triggerRect.left;

  if (menuRect.right > rootRect.right - pad) {
    leftPx -= menuRect.right - (rootRect.right - pad);
  }

  if (triggerRect.left + leftPx < rootRect.left + pad) {
    leftPx = rootRect.left + pad - triggerRect.left;
  }

  menu.style.left = `${Math.round(leftPx)}px`;
  menu.style.right = "auto";

  menuRect = menu.getBoundingClientRect();
  const spaceBelow = rootRect.bottom - triggerRect.bottom - pad;
  const spaceAbove = triggerRect.top - rootRect.top - pad;

  if (menuRect.height > spaceBelow + 1 && spaceAbove > spaceBelow) {
    menu.style.top = "auto";
    menu.style.bottom = "calc(100% + 6px)";
  } else {
    menu.style.top = "calc(100% + 6px)";
    menu.style.bottom = "auto";
  }
};

/** Open a dropdown and fit it inside the Kuusi panel bounds. */
export const openKuusiDropdownMenu = (
  menu: HTMLElement,
  root: HTMLElement,
): void => {
  menu.classList.add("is-open");

  requestAnimationFrame(() => {
    positionKuusiDropdownMenu(menu, root);
    requestAnimationFrame(() => {
      if (menu.classList.contains("is-open")) {
        positionKuusiDropdownMenu(menu, root);
      }
    });
  });
};

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

const createFormatChipButton = (
  getEditor: EditorGetter,
  item: MenuItem,
  root: HTMLElement,
  stateTargets: StateTarget[],
  onComplete: () => void,
): HTMLButtonElement => {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "jp-KuusiFormatChip";
  chip.setAttribute("role", "menuitem");
  chip.title = item.title ?? item.label;
  chip.setAttribute("aria-label", item.label);

  if (item.formatId) {
    chip.dataset.formatId = item.formatId;
    stateTargets.push({ formatId: item.formatId, element: chip });
  }

  const preview = document.createElement("span");
  preview.className = item.previewClass
    ? `jp-KuusiFormatChip-preview ${item.previewClass}`
    : "jp-KuusiFormatChip-preview";
  preview.textContent = item.previewLabel ?? item.label;
  chip.appendChild(preview);

  chip.addEventListener("click", (event) => {
    event.stopPropagation();
    runOnEditor(getEditor, item.action, onComplete);
  });

  return chip;
};

const applyActiveStates = (
  getEditor: EditorGetter,
  getActiveMarkdownCell: () => IMarkdownCellModel | null,
  stateTargets: StateTarget[],
  headingTrigger?: HTMLButtonElement | null,
): void => {
  const cell = getActiveMarkdownCell();
  const state = getFormatState(
    getEditor(),
    cell ? getMetadataOutlineHeadingLevel(cell) : null,
  );

  const outlineLevel =
    state.headingLevel !== null &&
    state.headingLevel >= 1 &&
    state.headingLevel <= 3
      ? state.headingLevel
      : null;

  if (headingTrigger) {
    headingTrigger.textContent =
      outlineLevel === null ? "Body" : `H${outlineLevel}`;
  }

  stateTargets.forEach(({ formatId, element }) => {
    let active = false;

    if (formatId === "bold") active = state.bold;
    else if (formatId === "italic") active = state.italic;
    else if (formatId === "underline") active = state.underline;
    else if (formatId === "strikethrough") active = state.strikethrough;
    else if (formatId === "inlineCode") active = state.inlineCode;
    else if (formatId === "highlight") active = state.highlight;
    else if (formatId === "blockQuote") active = state.blockQuote;
    else if (formatId === "body") {
      active = outlineLevel === null;
    } else if (formatId.startsWith("heading")) {
      active = outlineLevel === Number(formatId.replace("heading", ""));
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
): { wrapper: HTMLElement; button: HTMLButtonElement } => {
  const wrapper = document.createElement("div");
  wrapper.className = "jp-KuusiFormatDropdown";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "jp-KuusiNotebookMindMap-format-btn";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.setAttribute("aria-haspopup", "menu");
  button.textContent = label;
  button.setAttribute("data-enabled-title", title);
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
      openKuusiDropdownMenu(menu, root);
      onComplete();
    }
  });

  wrapper.appendChild(button);
  wrapper.appendChild(menu);

  return { wrapper, button };
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
  menu.className =
    "jp-KuusiFormatDropdown-menu jp-KuusiFormatDropdown-menu-wide jp-KuusiFormatAa-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Text style");

  const textItems: MenuItem[] = [
    {
      label: "Bold",
      previewLabel: "B",
      formatId: "bold",
      action: MarkdownFormat.bold,
      previewClass: "jp-KuusiFormatDropdown-preview-bold",
    },
    {
      label: "Italic",
      previewLabel: "I",
      formatId: "italic",
      action: MarkdownFormat.italic,
      previewClass: "jp-KuusiFormatDropdown-preview-italic",
    },
    {
      label: "Underline",
      previewLabel: "U",
      formatId: "underline",
      action: MarkdownFormat.underline,
      previewClass: "jp-KuusiFormatDropdown-preview-underline",
    },
    {
      label: "Strikethrough",
      previewLabel: "S",
      formatId: "strikethrough",
      action: MarkdownFormat.strikethrough,
      previewClass: "jp-KuusiFormatDropdown-preview-strikethrough",
    },
    {
      label: "Inline code",
      previewLabel: "</>",
      formatId: "inlineCode",
      action: MarkdownFormat.inlineCode,
      previewClass: "jp-KuusiFormatDropdown-preview-code",
    },
    {
      label: "Highlight",
      previewLabel: "A",
      formatId: "highlight",
      action: MarkdownFormat.highlight,
      previewClass: "jp-KuusiFormatDropdown-preview-highlight",
    },
    {
      label: "Block Quote",
      previewLabel: "❝",
      formatId: "blockQuote",
      action: MarkdownFormat.blockQuote,
    },
    {
      label: "Code block",
      previewLabel: "{ }",
      action: MarkdownFormat.codeBlock,
      previewClass: "jp-KuusiFormatDropdown-preview-code",
    },
    {
      label: "Clear formatting",
      previewLabel: "⌫",
      title: "Remove inline formatting from selection",
      action: MarkdownFormat.clearFormatting,
      previewClass: "jp-KuusiFormatDropdown-preview-clear",
    },
  ];

  const textGrid = document.createElement("div");
  textGrid.className = "jp-KuusiFormatAa-grid";
  textGrid.setAttribute("role", "group");
  textGrid.setAttribute("aria-label", "Text style");
  textItems.forEach((item) => {
    textGrid.appendChild(
      createFormatChipButton(getEditor, item, root, stateTargets, onComplete),
    );
  });
  menu.appendChild(textGrid);

  appendDropdownSection(menu, "Font color");

  const swatches = document.createElement("div");
  swatches.className =
    "jp-KuusiFormatAa-colorRow jp-KuusiFormatDropdown-optionRow jp-KuusiFormatColorSwatches";

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
  customRow.className = "jp-KuusiFormatColorCustom jp-KuusiFormatAa-customColor";

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
      openKuusiDropdownMenu(menu, root);
      onComplete();
    }
  });

  wrapper.appendChild(button);
  wrapper.appendChild(menu);

  return wrapper;
};

const TABLE_GRID_MAX_ROWS = 8;
const TABLE_GRID_MAX_COLS = 8;

type MathTemplate = {
  label: string;
  title: string;
  latex: string;
  mode: "inline" | "display";
  select?: string;
  preview?: string;
};

type MathChip = {
  label: string;
  title: string;
  latex: string;
};

const MATH_WRAP_ITEMS: MenuItem[] = [
  {
    label: "Inline",
    previewLabel: "$…$",
    title: "Inline math ($…$)",
    previewClass: "jp-KuusiFormatDropdown-preview-syntax",
    action: MarkdownFormat.inlineMath,
  },
  {
    label: "Display",
    previewLabel: "$$…$$",
    title: "Display math ($$…$$)",
    previewClass: "jp-KuusiFormatDropdown-preview-syntax",
    action: MarkdownFormat.displayMath,
  },
];

const MATH_TEMPLATES: MathTemplate[] = [
  {
    label: "Fraction",
    title: "Fraction a/b",
    latex: "\\frac{a}{b}",
    mode: "inline",
    select: "a",
    preview: "a/b",
  },
  {
    label: "Square root",
    title: "Square root",
    latex: "\\sqrt{x}",
    mode: "inline",
    select: "x",
    preview: "√x",
  },
  {
    label: "Nth root",
    title: "Nth root",
    latex: "\\sqrt[n]{x}",
    mode: "inline",
    select: "n",
    preview: "ⁿ√x",
  },
  {
    label: "Sum",
    title: "Summation",
    latex: "\\sum_{i=1}^{n} x_i",
    mode: "display",
    select: "i=1",
    preview: "Σ",
  },
  {
    label: "Product",
    title: "Product",
    latex: "\\prod_{i=1}^{n} x_i",
    mode: "display",
    select: "i=1",
    preview: "Π",
  },
  {
    label: "Integral",
    title: "Definite integral",
    latex: "\\int_{a}^{b} f(x)\\,dx",
    mode: "display",
    select: "a",
    preview: "∫",
  },
  {
    label: "Double integral",
    title: "Double integral",
    latex: "\\iint_{D} f(x,y)\\,dA",
    mode: "display",
    select: "D",
    preview: "∬",
  },
  {
    label: "Limit",
    title: "Limit",
    latex: "\\lim_{x \\to \\infty} f(x)",
    mode: "display",
    select: "x \\to \\infty",
    preview: "lim",
  },
  {
    label: "Partial",
    title: "Partial derivative",
    latex: "\\frac{\\partial f}{\\partial x}",
    mode: "display",
    select: "f",
    preview: "∂f/∂x",
  },
  {
    label: "Binomial",
    title: "Binomial coefficient",
    latex: "\\binom{n}{k}",
    mode: "inline",
    select: "n",
    preview: "C(n,k)",
  },
  {
    label: "Matrix 2×2",
    title: "2×2 matrix",
    latex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
    mode: "display",
    select: "a",
    preview: "[ ]",
  },
  {
    label: "Cases",
    title: "Piecewise / cases",
    latex:
      "\\begin{cases} a & \\text{if } x \\ge 0 \\\\ b & \\text{if } x < 0 \\end{cases}",
    mode: "display",
    select: "a",
    preview: "{",
  },
  {
    label: "Absolute",
    title: "Absolute value",
    latex: "\\left| x \\right|",
    mode: "inline",
    select: "x",
    preview: "|x|",
  },
  {
    label: "Norm",
    title: "Vector norm",
    latex: "\\left\\| x \\right\\|",
    mode: "inline",
    select: "x",
    preview: "‖x‖",
  },
  {
    label: "Hat",
    title: "Hat accent",
    latex: "\\hat{x}",
    mode: "inline",
    select: "x",
    preview: "x̂",
  },
  {
    label: "Vector",
    title: "Vector arrow",
    latex: "\\vec{v}",
    mode: "inline",
    select: "v",
    preview: "v⃗",
  },
  {
    label: "Overline",
    title: "Overline / mean",
    latex: "\\bar{x}",
    mode: "inline",
    select: "x",
    preview: "x̄",
  },
  {
    label: "Aligned",
    title: "Aligned equations",
    latex: "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}",
    mode: "display",
    select: "a",
    preview: "=",
  },
];

const MATH_GREEK: MathChip[] = [
  { label: "α", title: "alpha", latex: "\\alpha" },
  { label: "β", title: "beta", latex: "\\beta" },
  { label: "γ", title: "gamma", latex: "\\gamma" },
  { label: "δ", title: "delta", latex: "\\delta" },
  { label: "ε", title: "epsilon", latex: "\\varepsilon" },
  { label: "ζ", title: "zeta", latex: "\\zeta" },
  { label: "η", title: "eta", latex: "\\eta" },
  { label: "θ", title: "theta", latex: "\\theta" },
  { label: "ι", title: "iota", latex: "\\iota" },
  { label: "κ", title: "kappa", latex: "\\kappa" },
  { label: "λ", title: "lambda", latex: "\\lambda" },
  { label: "μ", title: "mu", latex: "\\mu" },
  { label: "ν", title: "nu", latex: "\\nu" },
  { label: "ξ", title: "xi", latex: "\\xi" },
  { label: "π", title: "pi", latex: "\\pi" },
  { label: "ρ", title: "rho", latex: "\\rho" },
  { label: "σ", title: "sigma", latex: "\\sigma" },
  { label: "τ", title: "tau", latex: "\\tau" },
  { label: "υ", title: "upsilon", latex: "\\upsilon" },
  { label: "φ", title: "phi", latex: "\\varphi" },
  { label: "χ", title: "chi", latex: "\\chi" },
  { label: "ψ", title: "psi", latex: "\\psi" },
  { label: "ω", title: "omega", latex: "\\omega" },
  { label: "Γ", title: "Gamma", latex: "\\Gamma" },
  { label: "Δ", title: "Delta", latex: "\\Delta" },
  { label: "Θ", title: "Theta", latex: "\\Theta" },
  { label: "Λ", title: "Lambda", latex: "\\Lambda" },
  { label: "Ξ", title: "Xi", latex: "\\Xi" },
  { label: "Π", title: "Pi", latex: "\\Pi" },
  { label: "Σ", title: "Sigma", latex: "\\Sigma" },
  { label: "Φ", title: "Phi", latex: "\\Phi" },
  { label: "Ψ", title: "Psi", latex: "\\Psi" },
  { label: "Ω", title: "Omega", latex: "\\Omega" },
];

const MATH_SYMBOLS: MathChip[] = [
  { label: "±", title: "plus-minus", latex: "\\pm" },
  { label: "∓", title: "minus-plus", latex: "\\mp" },
  { label: "×", title: "times", latex: "\\times" },
  { label: "÷", title: "div", latex: "\\div" },
  { label: "·", title: "cdot", latex: "\\cdot" },
  { label: "≠", title: "not equal", latex: "\\neq" },
  { label: "≈", title: "approx", latex: "\\approx" },
  { label: "≡", title: "equiv", latex: "\\equiv" },
  { label: "≤", title: "leq", latex: "\\leq" },
  { label: "≥", title: "geq", latex: "\\geq" },
  { label: "≪", title: "ll", latex: "\\ll" },
  { label: "≫", title: "gg", latex: "\\gg" },
  { label: "∈", title: "in", latex: "\\in" },
  { label: "∉", title: "notin", latex: "\\notin" },
  { label: "⊂", title: "subset", latex: "\\subset" },
  { label: "⊃", title: "supset", latex: "\\supset" },
  { label: "∪", title: "cup", latex: "\\cup" },
  { label: "∩", title: "cap", latex: "\\cap" },
  { label: "∅", title: "emptyset", latex: "\\emptyset" },
  { label: "∞", title: "infty", latex: "\\infty" },
  { label: "∂", title: "partial", latex: "\\partial" },
  { label: "∇", title: "nabla", latex: "\\nabla" },
  { label: "∀", title: "forall", latex: "\\forall" },
  { label: "∃", title: "exists", latex: "\\exists" },
  { label: "→", title: "rightarrow", latex: "\\rightarrow" },
  { label: "←", title: "leftarrow", latex: "\\leftarrow" },
  { label: "⇒", title: "Rightarrow", latex: "\\Rightarrow" },
  { label: "⇔", title: "Leftrightarrow", latex: "\\Leftrightarrow" },
  { label: "…", title: "ldots", latex: "\\ldots" },
  { label: "⋯", title: "cdots", latex: "\\cdots" },
  { label: "⊥", title: "perp", latex: "\\perp" },
  { label: "∥", title: "parallel", latex: "\\parallel" },
  { label: "∠", title: "angle", latex: "\\angle" },
  { label: "°", title: "degree", latex: "^\\circ" },
  { label: "ℝ", title: "real numbers", latex: "\\mathbb{R}" },
  { label: "ℕ", title: "naturals", latex: "\\mathbb{N}" },
  { label: "ℤ", title: "integers", latex: "\\mathbb{Z}" },
  { label: "ℚ", title: "rationals", latex: "\\mathbb{Q}" },
  { label: "ℂ", title: "complex", latex: "\\mathbb{C}" },
];

const createMathChipGrid = (
  getEditor: EditorGetter,
  chips: MathChip[],
  root: HTMLElement,
  onComplete: () => void,
  /** When true, chips insert bare commands (for use inside existing $…$). */
  bare = true,
): HTMLElement => {
  const grid = document.createElement("div");
  grid.className = "jp-KuusiFormatMath-grid";

  chips.forEach((chip) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "jp-KuusiFormatChip jp-KuusiFormatMath-chip";
    button.setAttribute("role", "menuitem");
    button.title = `${chip.title} (${chip.latex})`;
    button.setAttribute("aria-label", chip.title);
    button.textContent = chip.label;

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      runOnEditor(
        getEditor,
        (editor) => {
          if (bare) {
            MarkdownFormat.insertText(editor, `${chip.latex} `);
            return;
          }

          MarkdownFormat.insertLatex(editor, chip.latex, "inline");
        },
        () => {
          closeAllMenus(root);
          onComplete();
        },
      );
    });

    grid.appendChild(button);
  });

  return grid;
};

const createMathTile = (
  getEditor: EditorGetter,
  options: {
    label: string;
    preview: string;
    title: string;
    action: (editor: CodeEditor.IEditor) => void;
    wide?: boolean;
  },
  root: HTMLElement,
  onComplete: () => void,
): HTMLButtonElement => {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = options.wide
    ? "jp-KuusiFormatMath-tile is-wide"
    : "jp-KuusiFormatMath-tile";
  tile.setAttribute("role", "menuitem");
  tile.title = options.title;
  tile.setAttribute("aria-label", options.title);

  const kind = document.createElement("span");
  kind.className = "jp-KuusiFormatMath-tileLabel";
  kind.textContent = options.label;

  const preview = document.createElement("span");
  preview.className = "jp-KuusiFormatMath-tilePreview";
  preview.textContent = options.preview;

  tile.append(kind, preview);

  tile.addEventListener("click", (event) => {
    event.stopPropagation();
    runOnEditor(getEditor, options.action, () => {
      closeAllMenus(root);
      onComplete();
    });
  });

  return tile;
};

type MathSection = "wrap" | "templates" | "greek" | "symbols";

let lastMathSection: MathSection = "wrap";

const createMathDropdown = (
  getEditor: EditorGetter,
  root: HTMLElement,
  registerControl: (button: HTMLButtonElement) => void,
  _stateTargets: StateTarget[],
  onComplete: () => void,
): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.className = "jp-KuusiFormatDropdown";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "jp-KuusiNotebookMindMap-format-btn";
  button.title = "Insert LaTeX math";
  button.setAttribute("aria-label", "Insert LaTeX math");
  button.setAttribute("aria-haspopup", "menu");
  button.textContent = "Math";
  registerControl(button);

  const menu = document.createElement("div");
  menu.className =
    "jp-KuusiFormatDropdown-menu jp-KuusiSecondaryMenu-host jp-KuusiFormatMath-menu";
  menu.setAttribute("role", "menu");

  mountSecondaryMenu(menu, {
    ariaLabel: "Insert LaTeX math",
    sections: [
      { id: "wrap", label: "Wrap" },
      { id: "templates", label: "Templates" },
      { id: "greek", label: "Greek" },
      { id: "symbols", label: "Symbols" },
    ],
    getActive: () => lastMathSection,
    setActive: (id) => {
      lastMathSection = id;
    },
    panelClassName: "jp-KuusiFormatMath-panel",
    fillSection: (id, panel) => {
      if (id === "wrap") {
        const row = document.createElement("div");
        row.className = "jp-KuusiFormatMath-tileRow";
        MATH_WRAP_ITEMS.forEach((item) => {
          row.appendChild(
            createMathTile(
              getEditor,
              {
                label: item.label,
                preview: item.previewLabel ?? item.label,
                title: item.title ?? item.label,
                action: item.action,
                wide: true,
              },
              root,
              onComplete,
            ),
          );
        });
        panel.appendChild(row);
        return;
      }

      if (id === "templates") {
        const row = document.createElement("div");
        row.className = "jp-KuusiFormatMath-tileRow";
        MATH_TEMPLATES.forEach((template) => {
          row.appendChild(
            createMathTile(
              getEditor,
              {
                label: template.label,
                preview: template.preview ?? template.latex,
                title: `${template.title} — ${template.latex}`,
                action: (editor) =>
                  MarkdownFormat.insertLatex(
                    editor,
                    template.latex,
                    template.mode,
                    template.select,
                  ),
              },
              root,
              onComplete,
            ),
          );
        });
        panel.appendChild(row);
        return;
      }

      if (id === "greek") {
        panel.appendChild(
          createMathChipGrid(getEditor, MATH_GREEK, root, onComplete, true),
        );
        return;
      }

      panel.appendChild(
        createMathChipGrid(getEditor, MATH_SYMBOLS, root, onComplete, true),
      );
    },
  });

  button.addEventListener("click", (event) => {
    event.stopPropagation();

    if (button.disabled) {
      return;
    }

    const isOpen = menu.classList.contains("is-open");
    closeAllMenus(root);

    if (!isOpen) {
      openKuusiDropdownMenu(menu, root);
      onComplete();
    }
  });

  wrapper.append(button, menu);
  return wrapper;
};

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
      openKuusiDropdownMenu(menu, root);
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

const bodyItem = (
  getActiveMarkdownCell: () => IMarkdownCellModel | null,
): MenuItem => ({
  label: "Body",
  title: "Body text — no outline heading (attaches under the nearest heading)",
  formatId: "body",
  action: (editor) => {
    const cell = getActiveMarkdownCell();

    if (!cell) {
      return;
    }

    applyOutlineBody(editor, cell);
  },
  previewClass: "jp-KuusiFormatDropdown-preview-body",
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
  let headingTrigger: HTMLButtonElement | null = null;

  const registerControl = (button: HTMLButtonElement) => {
    controls.push(button);
  };

  const syncActiveStates = () => {
    applyActiveStates(
      getEditor,
      getActiveMarkdownCell,
      stateTargets,
      headingTrigger,
    );
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

  toolbar.appendChild(
    createColorDropdown(getEditor, toolbar, registerControl, stateTargets, onFormatAction),
  );

  const headingDropdown = createDropdown(
    getEditor,
    "Body",
    "Outline heading (H1–H3) or Body — nesting to depth 20; deeper levels use Body style",
    [
      ...[1, 2, 3].map((level) =>
        headingItem(getActiveMarkdownCell, level),
      ),
      bodyItem(getActiveMarkdownCell),
    ],
    toolbar,
    registerControl,
    stateTargets,
    onFormatAction,
    "jp-KuusiFormatDropdown-menu-wide",
  );
  headingTrigger = headingDropdown.button;
  toolbar.appendChild(headingDropdown.wrapper);

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
    ).wrapper,
  );

  toolbar.appendChild(
    createMathDropdown(
      getEditor,
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
    ).wrapper,
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
    ).wrapper,
  );

  controls.forEach((button) => {
    button.setAttribute("data-enabled-title", button.title);
  });

  syncEnabled();
  syncActiveStates();

  return { node: toolbar, syncEnabled, syncActiveStates };
};

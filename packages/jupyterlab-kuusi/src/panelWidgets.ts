import {
  appendColorPickerSection,
  type ColorSwatch,
} from "./colorPicker";
import { bindThemeRowPreview } from "./themeCapsule";
import {
  appendDropdownSectionRow,
  createDropdownOptionRow,
} from "./formatToolbar";

export type ChoiceOption = {
  value: string;
  label: string;
  title?: string;
  preview?: HTMLElement | (() => HTMLElement);
};

export type ChoiceWidget = {
  kind: "choice";
  /** Optional in-panel section heading above the option row. */
  sectionLabel?: string;
  value: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
  /** Hover / keyboard focus preview; null drops it. Never saves. */
  onPreview?: (value: string | null) => void;
  itemClassName?: string;
  labelClassName?: string;
  rowClassName?: string;
};

export type SliderWidget = {
  kind: "slider";
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  valueSuffix?: string;
  formatValue?: (value: number) => string;
  /** Show an editable number field (honors inputStep, defaults to 0.1). */
  editable?: boolean;
  inputStep?: number;
  onChange: (value: number) => void;
};

export type ToggleWidget = {
  kind: "toggle";
  label: string;
  title?: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

export type ColorWidget = {
  kind: "color";
  sectionLabel: string;
  value: string;
  onChange: (color: string) => void;
  /** Hover preview of a swatch; null drops it. Never saves. */
  onPreview?: (color: string | null) => void;
  swatches: ColorSwatch[];
  customInputId?: string;
  customDefault?: string;
  includeDefaultSwatch?: boolean;
};

export type TextWidget = {
  kind: "text";
  label: string;
  value: string;
  placeholder?: string;
  title?: string;
  maxLength?: number;
  /** Fired (debounced) while typing; does not rebuild the menu. */
  onChange: (value: string) => void;
};

export type PanelWidget =
  | ChoiceWidget
  | SliderWidget
  | ToggleWidget
  | ColorWidget
  | TextWidget;

const TEXT_COMMIT_DELAY_MS = 300;

const DEFAULT_CHOICE_ITEM_CLASS =
  "jp-KuusiFormatDropdown-item jp-KuusiPanelWidget-choice";
const DEFAULT_CHOICE_LABEL_CLASS = "jp-KuusiPanelWidget-choiceLabel";

const resolvePreview = (
  preview: ChoiceOption["preview"],
): HTMLElement | undefined => {
  if (!preview) {
    return undefined;
  }

  return typeof preview === "function" ? preview() : preview;
};

const renderChoice = (panel: HTMLElement, widget: ChoiceWidget): void => {
  const row = widget.sectionLabel
    ? appendDropdownSectionRow(
        panel,
        widget.sectionLabel,
        widget.rowClassName ?? "",
      )
    : createDropdownOptionRow(panel, widget.rowClassName ?? "");

  const itemClassName = widget.itemClassName ?? DEFAULT_CHOICE_ITEM_CLASS;
  const labelClassName = widget.labelClassName ?? DEFAULT_CHOICE_LABEL_CLASS;

  widget.options.forEach((option) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = itemClassName;
    item.setAttribute("role", "menuitem");
    item.title = option.title ?? option.label;
    if (option.title) {
      item.setAttribute("aria-label", option.title);
    }
    item.classList.toggle("is-active", option.value === widget.value);

    const labelEl = document.createElement("span");
    labelEl.className = labelClassName;
    labelEl.textContent = option.label;
    item.appendChild(labelEl);

    const preview = resolvePreview(option.preview);
    if (preview) {
      item.appendChild(preview);
    }

    item.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      widget.onChange(option.value);
    });
    if (widget.onPreview) {
      const owner = panel.closest<HTMLElement>(".jp-KuusiFormatDropdown-menu");
      bindThemeRowPreview(
        owner ?? panel,
        item,
        option.value,
        widget.onPreview,
      );
    }
    row.appendChild(item);
  });
};

const renderSlider = (panel: HTMLElement, widget: SliderWidget): void => {
  const format =
    widget.formatValue ??
    ((value: number) => `${value}${widget.valueSuffix ?? ""}`);

  const section = document.createElement("div");
  section.className = "jp-KuusiPanelWidget-slider";

  const header = document.createElement("div");
  header.className = "jp-KuusiPanelWidget-sliderHeader";

  const labelEl = document.createElement("span");
  labelEl.className = "jp-KuusiPanelWidget-sliderLabel";
  labelEl.textContent = widget.label;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "jp-KuusiPanelWidget-sliderInput";
  slider.min = String(widget.min);
  slider.max = String(widget.max);
  slider.step = String(widget.step ?? 1);
  slider.value = String(widget.value);
  slider.setAttribute("aria-label", widget.label);
  slider.title = widget.label;

  let valueEl: HTMLElement;
  let syncValueDisplay: (value: number) => void;

  if (widget.editable) {
    const input = document.createElement("input");
    input.type = "number";
    input.className = "jp-KuusiPanelWidget-sliderValueInput";
    input.min = String(widget.min);
    input.max = String(widget.max);
    input.step = String(widget.inputStep ?? 0.1);
    input.value = format(widget.value).replace(/[^\d.-]/g, "") || String(widget.value);
    input.setAttribute("aria-label", widget.label);
    input.title = widget.label;

    const commitInput = (): void => {
      const parsed = Number.parseFloat(input.value);
      if (!Number.isFinite(parsed)) {
        input.value = String(widget.value);
        return;
      }
      const next = Math.min(widget.max, Math.max(widget.min, Math.round(parsed * 10) / 10));
      input.value = String(next);
      slider.value = String(next);
      widget.onChange(next);
    };

    input.addEventListener("change", commitInput);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitInput();
        input.blur();
      }
    });
    input.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    input.addEventListener("mousedown", (event) => {
      event.stopPropagation();
    });
    input.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    valueEl = input;
    syncValueDisplay = (value: number) => {
      input.value = String(value);
    };
  } else {
    const span = document.createElement("span");
    span.className = "jp-KuusiPanelWidget-sliderValue";
    span.textContent = format(widget.value);
    valueEl = span;
    syncValueDisplay = (value: number) => {
      span.textContent = format(value);
    };
  }

  slider.addEventListener("input", () => {
    const nextValue = Number(slider.value);
    syncValueDisplay(nextValue);
    widget.onChange(nextValue);
  });
  slider.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  slider.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });
  slider.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  header.append(labelEl, valueEl);
  section.append(header, slider);
  panel.appendChild(section);
};

const renderToggle = (panel: HTMLElement, widget: ToggleWidget): void => {
  const section = document.createElement("div");
  section.className = "jp-KuusiPanelWidget-toggle";

  const labelEl = document.createElement("span");
  labelEl.className = "jp-KuusiPanelWidget-toggleLabel";
  labelEl.textContent = widget.label;

  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.className = "jp-KuusiPanelWidget-switch";
  switchBtn.setAttribute("role", "switch");
  switchBtn.setAttribute("aria-checked", widget.value ? "true" : "false");
  switchBtn.setAttribute("aria-label", widget.label);
  switchBtn.title = widget.title ?? widget.label;
  switchBtn.classList.toggle("is-on", widget.value);

  const thumb = document.createElement("span");
  thumb.className = "jp-KuusiPanelWidget-switchThumb";
  thumb.setAttribute("aria-hidden", "true");
  switchBtn.appendChild(thumb);

  switchBtn.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  // Flip the switch right away. Several callers (Page → Header / Footer rule,
  // mirror, first page) do not rebuild the menu, so without this it never
  // moved and the click looked ignored.
  let current = widget.value;
  switchBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    current = !current;
    switchBtn.classList.toggle("is-on", current);
    switchBtn.setAttribute("aria-checked", current ? "true" : "false");
    widget.onChange(current);
  });

  section.append(labelEl, switchBtn);
  panel.appendChild(section);
};

const renderColor = (panel: HTMLElement, widget: ColorWidget): void => {
  appendColorPickerSection(
    panel,
    widget.sectionLabel,
    widget.value,
    widget.onChange,
    widget.swatches,
    {
      customInputId: widget.customInputId,
      customDefault: widget.customDefault,
      includeDefaultSwatch: widget.includeDefaultSwatch,
      onPreview: widget.onPreview,
      previewOwner: panel.closest<HTMLElement>(".jp-KuusiFormatDropdown-menu"),
    },
  );
};

const renderText = (panel: HTMLElement, widget: TextWidget): void => {
  const section = document.createElement("label");
  section.className = "jp-KuusiPanelWidget-text";

  const labelEl = document.createElement("span");
  labelEl.className = "jp-KuusiPanelWidget-textLabel";
  labelEl.textContent = widget.label;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "jp-KuusiPanelWidget-textInput";
  input.value = widget.value;
  input.placeholder = widget.placeholder ?? "";
  input.title = widget.title ?? widget.label;
  input.spellcheck = false;
  if (widget.maxLength !== undefined) {
    input.maxLength = widget.maxLength;
  }

  let timer = 0;
  let committed = widget.value;
  const commit = (): void => {
    window.clearTimeout(timer);
    if (input.value !== committed) {
      committed = input.value;
      widget.onChange(committed);
    }
  };

  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(commit, TEXT_COMMIT_DELAY_MS);
  });
  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);
  // Keep Lab shortcuts and menu keyboard handling away from typing.
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      commit();
    }
  });
  ["pointerdown", "mousedown", "click"].forEach((type) => {
    input.addEventListener(type, (event) => {
      event.stopPropagation();
    });
  });

  section.append(labelEl, input);
  panel.appendChild(section);
};

export const renderPanelWidget = (
  panel: HTMLElement,
  widget: PanelWidget,
): void => {
  switch (widget.kind) {
    case "choice":
      renderChoice(panel, widget);
      return;
    case "slider":
      renderSlider(panel, widget);
      return;
    case "toggle":
      renderToggle(panel, widget);
      return;
    case "color":
      renderColor(panel, widget);
      return;
    case "text":
      renderText(panel, widget);
      return;
  }
};

export const renderPanelWidgets = (
  panel: HTMLElement,
  widgets: PanelWidget[],
): void => {
  widgets.forEach((widget) => {
    renderPanelWidget(panel, widget);
  });
};

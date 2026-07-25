import {
  appendColorPickerSection,
  type ColorSwatch,
} from "./colorPicker";
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
  swatches: ColorSwatch[];
  customInputId?: string;
  customDefault?: string;
  includeDefaultSwatch?: boolean;
};

export type PanelWidget =
  | ChoiceWidget
  | SliderWidget
  | ToggleWidget
  | ColorWidget;

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

    item.addEventListener("click", (event) => {
      event.stopPropagation();
      widget.onChange(option.value);
    });
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

  const valueEl = document.createElement("span");
  valueEl.className = "jp-KuusiPanelWidget-sliderValue";
  valueEl.textContent = format(widget.value);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "jp-KuusiPanelWidget-sliderInput";
  slider.min = String(widget.min);
  slider.max = String(widget.max);
  slider.step = String(widget.step ?? 1);
  slider.value = String(widget.value);
  slider.setAttribute("aria-label", widget.label);
  slider.title = widget.label;

  slider.addEventListener("input", () => {
    const nextValue = Number(slider.value);
    valueEl.textContent = format(nextValue);
    widget.onChange(nextValue);
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

  switchBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    widget.onChange(!widget.value);
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
    },
  );
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

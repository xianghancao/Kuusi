import { FONT_OPTIONS, type MindMapFont } from "./fontToolbar";
import type { KuusiTranslator } from "./kuusiI18n";

export type CapsuleTriggerLabel = string | { name: string; value: string };

export const currentChoiceLabel = (
  options: Array<{ value: string; label: string }>,
  value: string,
): string => options.find((option) => option.value === value)?.label ?? value;

export const fontChoiceLabel = (
  font: MindMapFont,
  t: KuusiTranslator,
): string => {
  if (font === "notebook") {
    return t.defaultFont();
  }

  return FONT_OPTIONS.find((option) => option.value === font)?.label ?? font;
};

export const applyCapsuleTriggerLabel = (
  trigger: HTMLElement,
  label: CapsuleTriggerLabel,
): void => {
  if (typeof label === "string") {
    trigger.textContent = label;
    return;
  }

  trigger.replaceChildren();
  const name = document.createElement("span");
  name.className = "jp-KuusiCapsule-name";
  name.textContent = label.name;
  const value = document.createElement("span");
  value.className = "jp-KuusiCapsule-value";
  value.textContent = label.value;
  trigger.append(name, value);
};

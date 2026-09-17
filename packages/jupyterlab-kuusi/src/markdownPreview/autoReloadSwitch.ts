import { Widget } from "@lumino/widgets";

export type AutoReloadSwitchWidget = Widget & {
  setEnabled: (enabled: boolean) => void;
};

export const createAutoReloadSwitch = (
  enabled: boolean,
  className: string,
  title: string,
  onChange: (enabled: boolean) => void,
): AutoReloadSwitchWidget => {
  const wrap = new Widget();
  wrap.addClass(className);

  const label = document.createElement("span");
  label.className = `${className}Label`;
  label.textContent = "Auto reload";

  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.className = "jp-KuusiPanelWidget-switch";
  switchBtn.setAttribute("role", "switch");
  switchBtn.setAttribute("aria-label", "Auto reload");
  switchBtn.title = title;

  const thumb = document.createElement("span");
  thumb.className = "jp-KuusiPanelWidget-switchThumb";
  thumb.setAttribute("aria-hidden", "true");
  switchBtn.appendChild(thumb);

  const syncSwitch = (next: boolean): void => {
    switchBtn.classList.toggle("is-on", next);
    switchBtn.setAttribute("aria-checked", next ? "true" : "false");
  };

  syncSwitch(enabled);

  switchBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const next = !switchBtn.classList.contains("is-on");
    syncSwitch(next);
    onChange(next);
  });

  wrap.node.append(label, switchBtn);

  return Object.assign(wrap, { setEnabled: syncSwitch });
};

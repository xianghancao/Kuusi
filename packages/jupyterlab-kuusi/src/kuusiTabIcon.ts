import type { LabIcon } from "@jupyterlab/ui-components";
import type { Title, Widget } from "@lumino/widgets";

export const KUUSI_TAB_ICON_CLASS = "jp-KuusiTabIcon";

export const applyKuusiTabIcon = <T extends Widget>(
  title: Title<T>,
  icon: LabIcon,
  iconLabel = "Kuusi",
): void => {
  title.icon = icon;
  title.iconClass = KUUSI_TAB_ICON_CLASS;
  title.iconLabel = iconLabel;
};

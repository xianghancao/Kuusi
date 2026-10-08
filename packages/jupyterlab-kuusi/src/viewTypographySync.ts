import type { HeadingId, TypographyValues } from "./typographySettings";
import type { TypographyModel } from "./typographyMenus";

export type KuusiViewId = "article" | "book" | "slides" | "mindmap";

const models = new Map<KuusiViewId, TypographyModel>();

/** Make a view's typography reachable for "apply text style to all views". */
export const registerViewTypography = (
  view: KuusiViewId,
  model: TypographyModel,
): void => {
  models.set(view, model);
};

const HEADING_IDS: HeadingId[] = ["h1", "h2", "h3", "h4", "h5", "h6"];

/**
 * Copy the portable parts of a view's text style to every other registered
 * view: font family, colors, tracking, paragraph spacing / indent / align,
 * link style, and heading font / color / alignment. Sizes and line-height
 * stay per view, since each view's scale and ranges differ.
 * Returns how many views were updated.
 */
export const applyTypographyToOtherViews = (source: KuusiViewId): number => {
  const from = models.get(source);

  if (!from) {
    return 0;
  }

  const values = from.get();
  let updated = 0;

  models.forEach((model, view) => {
    if (view === source) {
      return;
    }

    const current = model.get();
    const headers = { ...current.headers };

    HEADING_IDS.forEach((id) => {
      headers[id] = {
        ...current.headers[id],
        font: values.headers[id].font,
        color: values.headers[id].color,
        align: values.headers[id].align,
      };
    });

    const patch: Partial<TypographyValues> = {
      font: values.font,
      color: values.color,
      strongColor: values.strongColor,
      letterSpacing: values.letterSpacing,
      paragraphSpacing: values.paragraphSpacing,
      paragraphIndent: values.paragraphIndent,
      paragraphAlign: values.paragraphAlign,
      linkStyle: values.linkStyle,
      headers,
    };

    model.update(patch);
    updated += 1;
  });

  return updated;
};

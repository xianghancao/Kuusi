import type { KuusiTranslator } from "./kuusiI18n";
import type { PageToolbarItem } from "./pageToolbar";
import {
  createElementsToolbar,
  createHeadingsToolbar,
  createParagraphToolbar,
  createTextToolbar,
  type TypographyModel,
} from "./typographyMenus";

export type TypographyCapsuleOptions = {
  /** First appearance order for Text. Default 30. */
  orderStart?: number;
  /** Gap between Text / Paragraph / Headings / Elements. Default 10. */
  orderStep?: number;
};

/**
 * Shared Text / Paragraph / Headings / Elements capsule slots for Article,
 * Slides, and Mind Map. Theme / Page / Brand stay view-specific.
 */
export const createTypographyCapsuleItems = (
  host: HTMLElement,
  model: TypographyModel,
  t: KuusiTranslator,
  options: TypographyCapsuleOptions = {},
): PageToolbarItem[] => {
  const orderStart = options.orderStart ?? 30;
  const orderStep = options.orderStep ?? 10;

  return [
    {
      id: "text",
      group: "appearance",
      order: orderStart,
      create: () => createTextToolbar(host, model, t),
    },
    {
      id: "paragraph",
      group: "appearance",
      order: orderStart + orderStep,
      create: () => createParagraphToolbar(host, model, t),
    },
    {
      id: "headings",
      group: "appearance",
      order: orderStart + orderStep * 2,
      create: () => createHeadingsToolbar(host, model, t),
    },
    {
      id: "elements",
      group: "appearance",
      order: orderStart + orderStep * 3,
      create: () => createElementsToolbar(host, model, t),
    },
  ];
};

import type { TypographyModel } from "./typographyMenus";
import {
  MIND_MAP_LINE_HEIGHT_RANGE,
  mindMapSettingsToTypography,
  type MindMapSettingsManager,
  type MindMapUserSettings,
} from "./mindMapSettings";
import { typographyPatch } from "./mindMapTypography";

/**
 * Shared menus → mind-map nodes:
 * - Text: Body cards (display font / color / tracking / leading)
 * - Headings H1–H3: tree frames (`data-kuusi-heading-level`); H4–H6: titles inside a card
 * - Paragraph / Code / Image: blocks inside a card
 * - Text → Edit / Link: source-edit font (mind map only)
 */
export const createMindMapTypographyModel = (
  manager: MindMapSettingsManager,
): TypographyModel => ({
  scope: "mindmap",
  view: "mindmap",
  get: () => mindMapSettingsToTypography(manager.settings),
  update: (partial) => {
    void manager.update(typographyPatch(manager.settings, partial));
  },
  lineHeightRange: MIND_MAP_LINE_HEIGHT_RANGE,
  editMode: {
    getFont: () => manager.settings.editFont,
    getFontSize: () => manager.settings.editFontSize,
    updateFont: (editFont) => {
      const settings = manager.settings;
      const patch: Partial<MindMapUserSettings> = {
        editFont,
        matchNotebookFont:
          editFont === "notebook" ? settings.matchNotebookFont : false,
      };

      if (settings.unifyEditDisplayFont) {
        patch.displayFont = editFont;
      }

      void manager.update(patch);
    },
    updateFontSize: (editFontSize) => {
      const patch: Partial<MindMapUserSettings> = { editFontSize };

      if (manager.settings.unifyEditDisplayFont) {
        patch.displayFontSize = editFontSize;
      }

      void manager.update(patch);
    },
    getUnify: () => manager.settings.unifyEditDisplayFont,
    setUnify: (unifyEditDisplayFont) => {
      const patch: Partial<MindMapUserSettings> = { unifyEditDisplayFont };

      if (unifyEditDisplayFont) {
        patch.displayFont = manager.settings.editFont;
        patch.displayFontSize = manager.settings.editFontSize;
      }

      void manager.update(patch);
    },
    getMatchNotebook: () => manager.settings.matchNotebookFont,
    setMatchNotebook: (matchNotebookFont) => {
      const patch: Partial<MindMapUserSettings> = { matchNotebookFont };

      if (matchNotebookFont) {
        patch.editFont = "notebook";
        patch.displayFont = "notebook";
      }

      void manager.update(patch);
    },
  },
});

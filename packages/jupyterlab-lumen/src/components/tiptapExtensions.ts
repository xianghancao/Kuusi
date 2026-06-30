import { Extension } from "@tiptap/core";

export const ListStyleAttributes = Extension.create({
  name: "listStyleAttributes",

  addGlobalAttributes() {
    return [
      {
        types: ["bulletList"],
        attributes: {
          listStyle: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-list-style"),
            renderHTML: (attributes) =>
              attributes.listStyle
                ? { "data-list-style": attributes.listStyle }
                : {},
          },
        },
      },
    ];
  },
});

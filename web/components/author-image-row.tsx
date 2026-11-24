import { Node, mergeAttributes } from "@tiptap/core";

/** A horizontal row of images in the rich text editor. */
export const AuthorImageRow = Node.create({
  name: "imageRow",
  group: "block",
  content: "image+",
  defining: true,

  addAttributes() {
    return {
      align: {
        default: "center",
        parseHTML: (element) => {
          const value = element.getAttribute("data-align");
          return value === "left" || value === "right" ? value : "center";
        },
        renderHTML: (attributes) => ({
          "data-align":
            attributes.align === "left" || attributes.align === "right"
              ? attributes.align
              : "center",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-image-row]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-image-row": "",
        class: "author-image-row",
      }),
      0,
    ];
  },
});

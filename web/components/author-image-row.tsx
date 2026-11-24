import { Node, mergeAttributes } from "@tiptap/core";

/** A horizontal row of up to three images in the rich text editor. */
export const AuthorImageRow = Node.create({
  name: "imageRow",
  group: "block",
  content: "image{1,3}",
  defining: true,

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

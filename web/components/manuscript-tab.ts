import { mergeAttributes, Node } from "@tiptap/core";

/**
 * Visible tab stop. Scrivener can contain literal tab characters, but Tiptap
 * does not render those reliably. This atom keeps the position editable while
 * giving it a visible width, and serializes back to a real RTF tab on export.
 */
export const ManuscriptTab = Node.create({
  name: "manuscriptTab",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'span[data-ms-tab="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        {
          "data-ms-tab": "true",
          class: "ms-tab",
          "aria-label": "탭",
        },
        HTMLAttributes,
      ),
    ];
  },
});

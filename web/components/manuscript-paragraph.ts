import Paragraph from "@tiptap/extension-paragraph";

function styleValue(
  attributes: Record<string, unknown>,
  name: string,
): string | null {
  const value = attributes[name];
  return typeof value === "string" && value ? value : null;
}

/**
 * Paragraph with optional RTF-derived indentation. Scrivener stores left,
 * right and first-line indents separately, so they are kept as paragraph
 * attributes instead of being flattened into margins.
 */
export const ManuscriptParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      indentLeft: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.style.paddingLeft || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          const value = styleValue(attributes, "indentLeft");
          return value ? { style: `padding-left: ${value}` } : {};
        },
      },
      indentRight: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.style.paddingRight || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          const value = styleValue(attributes, "indentRight");
          return value ? { style: `padding-right: ${value}` } : {};
        },
      },
      indentFirst: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.style.textIndent || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          const value = styleValue(attributes, "indentFirst");
          return value ? { style: `text-indent: ${value}` } : {};
        },
      },
    };
  },
});

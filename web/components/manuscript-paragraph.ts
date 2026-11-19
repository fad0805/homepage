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
  addKeyboardShortcuts() {
    const change = (delta: number) => () => {
      const current = Number.parseInt(
        this.editor.getAttributes(this.name).indentLeft ?? "0",
        10,
      );
      const next = Math.max(0, (Number.isFinite(current) ? current : 0) + delta);
      return this.editor
        .chain()
        .focus()
        .updateAttributes(this.name, {
          indentLeft: next ? `${next}px` : null,
        })
        .run();
    };

    return {
      "Mod-]": change(24),
      "Mod-[": change(-24),
    };
  },
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert legacy plain text into simple HTML, while leaving already-rich HTML
 * untouched. Used by content that used to be stored as plain text.
 */
export function toRichTextHtml(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (/<\/?[a-z][^>]*>/i.test(text)) return text;

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "<p></p>"))
    .join("");
}

/** True when the rich text has no visible text or image content. */
export function isRichTextEmpty(value: string | null | undefined): boolean {
  const html = value ?? "";
  const text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return !text && !/<img\b/i.test(html);
}

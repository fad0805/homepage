/** 10 lines of the author copy (0.95rem / 1.65 line-height). */
export const AUTHOR_IMAGE_MAX_HEIGHT_REM = 15.7;

export interface AuthorProfile {
  id?: number;
  title: string;
  subtitle?: string | null;
  profile: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Older profiles were stored as plain text. Convert them to simple HTML so
 * both the Tiptap editor and the public page can render them consistently.
 */
export function profileToHtml(profile: string): string {
  const value = (profile ?? "").trim();
  if (!value) return "";
  if (/<\/?[a-z][^>]*>/i.test(value)) return value;

  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "<p></p>"))
    .join("");
}



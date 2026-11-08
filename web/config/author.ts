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
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

import { toRichTextHtml } from "@/lib/rich-text";

/** 10 lines of the author copy (0.95rem / 1.65 line-height). */
export const AUTHOR_IMAGE_MAX_HEIGHT_REM = 15.7;

export interface AuthorProfile {
  id?: number;
  title: string;
  subtitle?: string | null;
  profile: string;
}

/**
 * Older profiles were stored as plain text. Convert them to simple HTML so
 * both the Tiptap editor and the public page can render them consistently.
 */
export const profileToHtml = toRichTextHtml;



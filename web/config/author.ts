import { toRichTextHtml } from "@/lib/rich-text";

/** 10 lines of the author copy (0.95rem / 1.65 line-height). */
export const AUTHOR_IMAGE_MAX_HEIGHT_REM = 15.7;

export interface AuthorProfile {
  id?: number;
  user_id?: number;
  owner?: string | null;
  nickname?: string | null;
  title: string;
  subtitle?: string | null;
  author_banner_url?: string | null;
  character_modal_banner_url?: string | null;
  profile: string;
}

export interface AuthorPageAppearance {
  layout_key: "editorial" | "side" | "collapsible" | "drawer";
  side_position: "left" | "right";
  default_theme?: "light" | "dark";
  color_theme?: "mint" | "sepia" | "blue" | "rose";
  color_background?: string | null;
  color_content?: string | null;
  color_accent?: string | null;
  color_background_dark?: string | null;
  color_content_dark?: string | null;
  color_accent_dark?: string | null;
}

export interface AuthorPageData {
  user_id: number;
  slug: string;
  display_order: number;
  nickname: string;
  profile: AuthorProfile | null;
  author_banner_url: string | null;
  character_modal_banner_url: string | null;
  links_banner_url: string | null;
  links_integrated_banner_url: string | null;
  links_integrated_banner_visible: boolean;
  links_integrated_banner_order: number;
  index_html: string;
  appearance: AuthorPageAppearance | null;
}

export interface AuthorDirectoryEntry {
  user_id: number;
  display_order: number;
  nickname: string;
  slug: string | null;
  color_theme: "mint" | "sepia" | "blue" | "rose";
  color_background: string | null;
  color_content: string | null;
  color_accent: string | null;
  author_banner_url: string | null;
  character_modal_banner_url: string | null;
  links_banner_url: string | null;
  profile: AuthorProfile | null;
}

/**
 * Older profiles were stored as plain text. Convert them to simple HTML so
 * both the Tiptap editor and the public page can render them consistently.
 */
export const profileToHtml = toRichTextHtml;

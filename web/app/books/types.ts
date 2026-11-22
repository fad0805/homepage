export const CHAPTER_PREVIEW_STORAGE_KEY = "homepage:chapter-preview";

export interface BookCategory {
  id: number;
  name: string;
  order: number;
  visible: boolean;
  protected: boolean;
  expanded_by_default: boolean;
}

export interface Book {
  id: number;
  title: string;
  description: string | null;
  tags: string[];
  category_id: number | null;
  category: BookCategory | null;
  order: number;
  visible: boolean;
  protected: boolean;
  chapter_count?: number;
  created_at: string | null;
  updated_at: string | null;
  locked?: boolean;
}

export interface ManageTocNode {
  id: number;
  parent_id: number | null;
  node_type: "folder" | "post";
  label: string | null;
  position: number;
  chapter_id: number | null;
  pinned: boolean;
  locked: boolean;
  children: ManageTocNode[];
}

export interface TocNode {
  id: number | null;
  node_type: "folder" | "post";
  label: string | null;
  position: number;
  unassigned?: boolean;
  chapter: {
    id: number;
    title: string;
    subtitle: string | null;
    locked: boolean;
    published_at: string | null;
    updated_at: string | null;
  } | null;
  children: TocNode[];
}

export interface Chapter {
  id: number;
  book_id: number;
  title: string;
  subtitle: string | null;
  body: string | null;
  tags: string[];
  order: number;
  visible: boolean;
  pinned: boolean;
  protected: boolean;
  locked?: boolean;
  view_count: number;
  created_at: string | null;
  published_at: string | null;
  book: { id: number; title: string } | null;
}

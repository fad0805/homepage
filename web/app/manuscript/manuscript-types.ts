export type MobilePanel = "nav" | "info" | null;

export interface ManuscriptNode {
  id: number;
  project_id: number;
  parent_id: number | null;
  node_type: "folder" | "chapter";
  title: string;
  subtitle: string | null;
  synopsis: string | null;
  status: string | null;
  notes: string | null;
  target_chars: number | null;
  position: number;
  char_count_with_spaces: number;
  char_count_plain: number;
  published_chapter_id: number | null;
  published_chapter_exists?: boolean;
  published_state:
    | "unpublished"
    | "published"
    | "needs_republish"
    | "chapter_edited"
    | "diverged"
    | "published_missing";
  body?: string | null;
  deleted_at?: string | null;
}

export interface TrashItem {
  id: number;
  project_id: number;
  parent_id: number | null;
  title: string;
  node_type: "folder" | "chapter";
  position: number;
  deleted_at: string | null;
  expires_at: string | null;
}

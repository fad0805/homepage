export interface BookCategory {
  id: number;
  name: string;
  order: number;
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
  view_count: number;
  created_at: string | null;
  published_at: string | null;
  book: { id: number; title: string } | null;
}

export interface IllustrationImageItem {
  id: number;
  url: string;
  order: number;
}

export interface IllustrationItem {
  id: number;
  title: string;
  tags: string[];
  taken_at: string | null;
  visible: boolean;
  protected: boolean;
  representative_image_id: number | null;
  representative_url: string | null;
  image_count: number;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface IllustrationDetailItem extends IllustrationItem {
  description: string | null;
  locked?: boolean;
  view_count?: number;
  images: IllustrationImageItem[];
}

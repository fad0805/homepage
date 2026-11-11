export interface IllustrationImageItem {
  id: number;
  url: string;
  original_name: string | null;
  order: number;
}

export interface IllustrationItem {
  id: number;
  title: string;
  description: string | null;
  tags: string[];
  taken_at: string | null;
  visible: boolean;
  protected: boolean;
  representative_image_id: number | null;
  representative_url: string | null;
  representative_original_name: string | null;
  image_count: number;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface IllustrationDetailItem extends IllustrationItem {
  locked?: boolean;
  images: IllustrationImageItem[];
}

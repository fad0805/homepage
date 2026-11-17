// Shared planner UI types and labels.

export type ScheduleType = "single" | "range";
export type TaskScheduleType = ScheduleType | "undated";
export type TaskStatus = "active" | "inactive" | "trashed";
export type PlannerTab = "active" | "colors" | "inactive" | "trashed";
export type SpecialDateKind = "yearly" | "dday";
export type SpecialModalTab = "form" | "list";

export interface PlannerTask {
  id: number;
  title: string;
  notes: string | null;
  color_id: number | null;
  color: string | null;
  schedule_type: TaskScheduleType;
  start_date: string | null;
  end_date: string | null;
  deadline_days: number | null;
  status: TaskStatus;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  inactive_at: string | null;
  trashed_at: string | null;
}

export interface PlannerTasksResponse {
  today: string;
  tasks: PlannerTask[];
}

export interface PlannerEventChange {
  field?: string;
  kind?: string;
  before?: unknown;
  after?: unknown;
}

export interface PlannerEvent {
  id: number;
  entity_type: string;
  entity_id: number | null;
  action: string;
  title: string | null;
  notes: string | null;
  changes: PlannerEventChange[] | null;
  occurred_at: string;
}

export interface PlannerEventsResponse {
  events: PlannerEvent[];
}

export interface PlannerSearchResults {
  tasks: PlannerTask[];
  events: PlannerEvent[];
}

export interface PlannerColor {
  id: number;
  color: string;
  name: string | null;
  position: number;
  created_at: string;
}

export interface PlannerColorGroup {
  key: string;
  color: string | null;
  name: string | null;
  tasks: PlannerTask[];
}

export interface PlannerColorsResponse {
  colors: PlannerColor[];
}

export interface PlannerSpecialDate {
  id: number;
  title: string;
  kind: SpecialDateKind;
  event_date: string | null;
  month: number | null;
  day: number | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlannerSpecialDatesResponse {
  special_dates: PlannerSpecialDate[];
}

export interface PlannerEventPreview {
  available: boolean;
  entity_type: string;
  title: string | null;
  summary: string | null;
  content_html: string | null;
  detail_url: string | null;
  fields: Record<string, string | null>;
}

export interface CalendarCell {
  date: string;
  inMonth: boolean;
  day: number;
}

export interface RangeSegment {
  task: PlannerTask;
  startIndex: number;
  endIndex: number;
  lane: number;
  isStart: boolean;
  isEnd: boolean;
  key: string;
}

export interface CalendarWeek {
  cells: CalendarCell[];
  segments: RangeSegment[];
  outside: boolean;
}

export interface TaskFormState {
  title: string;
  notes: string;
  colorId: number | null;
  scheduleType: ScheduleType;
  startDate: string;
  endDate: string;
  deadlineDays: number;
  pinned: boolean;
  undated: boolean;
}

export const DEFAULT_TASK_COLOR = "#b07a52";
export const UNASSIGNED_TASK_COLOR = "#8a8a8a";

export const ENTITY_LABELS: Record<string, string> = {
  book: "목차",
  chapter: "챕터",
  illustration: "삽화",
  character: "등장인물",
  character_location: "장소",
  link: "놀러가기",
  link_category: "링크 분류",
  book_category: "책장 분류",
  profile: "프로필",
  index: "인덱스",
  account: "계정",
  task: "일정",
};

export const ACTION_LABELS: Record<string, string> = {
  created: "생성",
  updated: "수정",
  deleted: "삭제",
  completed: "완료",
};

export const FIELD_LABELS: Record<string, string> = {
  title: "제목",
  subtitle: "부제",
  description: "설명",
  body: "본문",
  content_html: "내용",
  profile: "프로필 내용",
  tags: "태그",
  category: "분류",
  category_id: "분류",
  book_id: "책",
  visible: "공개",
  protected: "보호",
  pinned: "고정",
  taken_at: "촬영일",
  thumbnail: "썸네일",
  detail_image: "상세 이미지",
  banner_url: "배너",
  representative_url: "대표 이미지",
  representative_image_id: "대표 이미지",
  name: "이름",
  alt_name: "다른 이름",
  nickname: "닉네임",
  age: "나이",
  serif: "대사",
  comming_day: "등장일",
  location_id: "장소",
  layout: "배치",
  is_my_doll: "인형 여부",
  url: "URL",
  password: "비밀번호",
  slug: "URL 표시명",
  relationships: "관계",
  images: "이미지",
  head_doll: "머리 인형",
  body_doll: "몸 인형",
  published_at: "공개일",
  role: "권한",
  username: "아이디",
};

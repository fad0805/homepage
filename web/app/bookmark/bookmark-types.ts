import type {
  BookmarkPeriodType,
  BookmarkRoutine,
  BookmarkRoutineFrequency,
  BookmarkTrackingMode,
} from "@/lib/bookmark";

export type BookmarkView = "today" | BookmarkPeriodType | "stats";
export type StatsSection = "routines" | "journal";
export type MonthlyMode = "day" | "nth";
export type HistoryRoutine = Pick<
  BookmarkRoutine,
  "id" | "title" | "frequency"
>;
export type StatsRange = "week" | "month" | "quarter" | "year" | "3years";

export const PERIOD_TYPES: BookmarkPeriodType[] = [
  "day",
  "week",
  "month",
  "quarter",
  "year",
];
export const PERIOD_LABELS: Record<BookmarkPeriodType, string> = {
  year: "연",
  quarter: "분기",
  month: "월",
  week: "주",
  day: "일",
};
export const STATS_RANGES: StatsRange[] = [
  "week",
  "month",
  "quarter",
  "year",
  "3years",
];
export const STATS_RANGE_LABELS: Record<StatsRange, string> = {
  week: "이번 주",
  month: "이번 달",
  quarter: "이번 분기",
  year: "이번 해",
  "3years": "최근 3년",
};
export const STATS_COLORS = [
  "#4f8f5b",
  "#5b7fb3",
  "#b07a4a",
  "#9a5b8f",
  "#a89a45",
  "#4f9a9a",
  "#8264b0",
  "#b35b5b",
  "#6f8f4f",
  "#4f6b8f",
];
export const VIEWS: BookmarkView[] = ["today", ...PERIOD_TYPES, "stats"];
export const VIEW_LABELS: Record<BookmarkView, string> = {
  today: "오늘",
  ...PERIOD_LABELS,
  stats: "통계",
};
export const PERIOD_FREQUENCY: Record<
  BookmarkPeriodType,
  BookmarkRoutineFrequency
> = {
  year: "yearly",
  quarter: "quarterly",
  month: "monthly",
  week: "weekly",
  day: "daily",
};
export const FREQUENCY_LABELS: Record<BookmarkRoutineFrequency, string> = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  quarterly: "매분기",
  yearly: "매년",
};
export const ROUTINE_SECTION_LABELS: Record<BookmarkPeriodType, string> = {
  day: "매일",
  week: "매주",
  month: "매월",
  quarter: "매분기",
  year: "매년",
};
export const TARGET_LABELS: Record<BookmarkRoutineFrequency, string> = {
  daily: "매일",
  weekly: "주간 목표 횟수",
  monthly: "월간 목표 횟수",
  quarterly: "분기 목표 횟수",
  yearly: "연간 목표 횟수",
};
export const MODE_LABELS: Record<BookmarkTrackingMode, string> = {
  count: "횟수",
  date: "일자",
};

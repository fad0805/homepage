export type BookmarkPeriodType = "year" | "quarter" | "month" | "week" | "day";

export type BookmarkRoutineFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export interface BookmarkRoutine {
  id: number;
  title: string;
  notes: string | null;
  frequency: BookmarkRoutineFrequency;
  weekday: number | null;
  day_of_month: number | null;
  nth_week: number | null;
  month: number | null;
  active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  done: boolean;
  period_type: BookmarkPeriodType;
  period_start: string;
}

export interface BookmarkGoal {
  id: number;
  period_type: BookmarkPeriodType;
  period_start: string;
  title: string;
  notes: string | null;
  done: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface BookmarkReview {
  id: number;
  period_type: BookmarkPeriodType;
  period_start: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface BookmarkPeriod {
  period_type: BookmarkPeriodType;
  period_start: string;
  routines: BookmarkRoutine[];
  goals: BookmarkGoal[];
  review: BookmarkReview | null;
}

export const WEEKDAY_LABELS = [
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
  "일요일",
];

export function routineScheduleLabel(routine: {
  frequency: BookmarkRoutineFrequency;
  weekday: number | null;
  day_of_month: number | null;
  nth_week: number | null;
  month: number | null;
}) {
  if (routine.frequency === "daily") return "매일";
  if (routine.frequency === "weekly") {
    return routine.weekday === null
      ? "매주"
      : `매주 ${WEEKDAY_LABELS[routine.weekday]}`;
  }
  if (routine.frequency === "monthly") {
    if (routine.day_of_month !== null) {
      return `매월 ${routine.day_of_month}일`;
    }
    if (
      routine.nth_week !== null &&
      routine.weekday !== null
    ) {
      return `매월 ${routine.nth_week}번째 ${WEEKDAY_LABELS[routine.weekday]}`;
    }
    return "매월";
  }
  if (routine.frequency === "quarterly") return "매분기";
  if (routine.month !== null && routine.day_of_month !== null) {
    return `매년 ${routine.month}월 ${routine.day_of_month}일`;
  }
  return "매년";
}

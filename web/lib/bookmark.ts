export type BookmarkPeriodType = "year" | "quarter" | "month" | "week" | "day";

export type BookmarkRoutineFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export type BookmarkTrackingMode = "count" | "date";

export interface BookmarkRoutineOccurrence {
  date: string;
  done: boolean;
}

export interface BookmarkRoutineCategory {
  id: number;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface BookmarkRoutine {
  id: number;
  title: string;
  notes: string | null;
  frequency: BookmarkRoutineFrequency;
  category_id: number | null;
  category_name: string | null;
  start_date: string;
  end_date: string | null;
  tracking_mode: BookmarkTrackingMode;
  target_count: number;
  weekday: number | null;
  weekdays: number[] | null;
  day_of_month: number | null;
  nth_week: number | null;
  month: number | null;
  active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  period_type: BookmarkPeriodType;
  period_start: string;
  completed_count: number;
  occurrences: BookmarkRoutineOccurrence[];
}

export interface BookmarkRoutineHistoryDay {
  date: string;
  scheduled: boolean;
  done: boolean;
}

export interface BookmarkRoutineHistoryMonth {
  month_start: string;
  completed_count: number;
  expected_count: number;
}

export interface BookmarkRoutineHistory {
  daily: BookmarkRoutineHistoryDay[];
  monthly: BookmarkRoutineHistoryMonth[];
}

export interface BookmarkGoal {
  id: number;
  period_type: BookmarkPeriodType;
  period_start: string;
  content: string;
  wake_time: string | null;
  mood_tag_id: number | null;
  mood_tag_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookmarkMoodTag {
  id: number;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface BookmarkRating {
  id: number;
  period_type: BookmarkPeriodType;
  period_start: string;
  rating: number;
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
  goal: BookmarkGoal | null;
  rating: BookmarkRating | null;
  review: BookmarkReview | null;
}

export const WEEKDAY_SHORT = ["월", "화", "수", "목", "금", "토", "일"];

export function routineWeekdays(routine: {
  weekdays: number[] | null;
  weekday: number | null;
}) {
  if (routine.weekdays && routine.weekdays.length > 0) {
    return routine.weekdays;
  }
  return routine.weekday === null ? [] : [routine.weekday];
}

export function routineScheduleLabel(routine: {
  frequency: BookmarkRoutineFrequency;
  category_id: number | null;
  category_name: string | null;
  start_date: string;
  end_date: string | null;
  tracking_mode: BookmarkTrackingMode;
  target_count: number;
  weekday: number | null;
  weekdays: number[] | null;
  day_of_month: number | null;
  nth_week: number | null;
  month: number | null;
}) {
  if (routine.frequency === "daily") return "매일";
  if (routine.tracking_mode === "count") {
    if (routine.frequency === "weekly") {
      return `주 ${routine.target_count}회`;
    }
    if (routine.frequency === "monthly") {
      return `월 ${routine.target_count}회`;
    }
    if (routine.frequency === "quarterly") {
      return `분기 ${routine.target_count}회`;
    }
    return `연 ${routine.target_count}회`;
  }
  if (routine.frequency === "weekly") {
    const days = routineWeekdays(routine);
    return days.length > 0
      ? `매주 ${days.map((day) => WEEKDAY_SHORT[day]).join("·")}`
      : "매주";
  }
  if (routine.frequency === "monthly") {
    if (routine.day_of_month !== null) {
      return `매월 ${routine.day_of_month}일`;
    }
    if (routine.nth_week !== null && routine.weekday !== null) {
      return `매월 ${routine.nth_week}번째 ${WEEKDAY_SHORT[routine.weekday]}요일`;
    }
    return "매월";
  }
  if (routine.frequency === "quarterly") return "매분기";
  if (routine.month !== null && routine.day_of_month !== null) {
    return `매년 ${routine.month}월 ${routine.day_of_month}일`;
  }
  return "매년";
}

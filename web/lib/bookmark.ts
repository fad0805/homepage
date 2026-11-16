export type BookmarkPeriodType = "year" | "quarter" | "month" | "week" | "day";

export type BookmarkRoutineFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export interface BookmarkRoutineOccurrence {
  date: string;
  done: boolean;
}

export interface BookmarkRoutine {
  id: number;
  title: string;
  notes: string | null;
  frequency: BookmarkRoutineFrequency;
  target_count: number;
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

export function routineScheduleLabel(routine: {
  frequency: BookmarkRoutineFrequency;
  target_count: number;
}) {
  if (routine.frequency === "daily") return "매일";
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

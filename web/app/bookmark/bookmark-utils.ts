import {
  WEEKDAY_SHORT,
  type BookmarkPeriodType,
  type BookmarkRoutineFrequency,
} from "@/lib/bookmark";
import { todayDateInputValue } from "@/lib/datetime";

import type { BookmarkView, StatsRange } from "./bookmark-types";

export function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function quarterStartMonth(quarter: number) {
  return quarter > 0 ? (quarter - 1) * 3 + 1 : null;
}

export function quarterFromMonth(month: number | null) {
  return month ? Math.floor((month - 1) / 3) + 1 : 0;
}

export function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad2(
    date.getUTCMonth() + 1,
  )}-${pad2(date.getUTCDate())}`;
}

export function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function startOfPeriod(value: string, type: BookmarkPeriodType) {
  const date = parseDateKey(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  if (type === "year") {
    return dateKey(new Date(Date.UTC(year, 0, 1)));
  }
  if (type === "quarter") {
    return dateKey(new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1)));
  }
  if (type === "month") {
    return dateKey(new Date(Date.UTC(year, month, 1)));
  }
  if (type === "week") {
    const offset = (date.getUTCDay() + 6) % 7;
    return dateKey(new Date(Date.UTC(year, month, day - offset)));
  }
  return dateKey(date);
}

export function shiftPeriod(
  value: string,
  type: BookmarkPeriodType,
  delta: number,
) {
  const date = parseDateKey(value);
  if (type === "year") {
    return dateKey(
      new Date(Date.UTC(date.getUTCFullYear() + delta, 0, 1)),
    );
  }
  if (type === "quarter") {
    return dateKey(
      new Date(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth() + delta * 3,
          1,
        ),
      ),
    );
  }
  if (type === "month") {
    return dateKey(
      new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1),
      ),
    );
  }
  const days = type === "week" ? delta * 7 : delta;
  return dateKey(
    new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + days,
      ),
    ),
  );
}

export function occurrenceLabel(
  value: string,
  view: BookmarkView,
  frequency: BookmarkRoutineFrequency,
) {
  const date = parseDateKey(value);
  if (view === "week") {
    const weekday = (date.getUTCDay() + 6) % 7;
    return `${WEEKDAY_SHORT[weekday]} ${date.getUTCDate()}`;
  }
  if (view === "today") {
    if (frequency === "monthly") return "이번 달";
    if (frequency === "quarterly") return "이번 분기";
    if (frequency === "yearly") return "올해";
    return "오늘";
  }
  if (view === "day") return "완료";
  if (view === "month") return "이번 달";
  if (view === "quarter") return "이번 분기";
  return "올해";
}

export function historyDayTitle(
  value: string,
  scheduled: boolean,
  done: boolean,
) {
  const date = parseDateKey(value);
  const label = `${date.getUTCFullYear()}.${pad2(
    date.getUTCMonth() + 1,
  )}.${pad2(date.getUTCDate())}`;
  return `${label} · ${
    done ? "완료" : scheduled ? "미완료" : "예정 없음"
  }`;
}

export function statBucketLabel(
  value: string,
  aggregation: "week" | "month" | "quarter" | "year",
) {
  const date = parseDateKey(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  if (aggregation === "year") return `${year}년`;
  if (aggregation === "quarter") {
    return `${year}년 ${Math.floor((month - 1) / 3) + 1}분기`;
  }
  if (aggregation === "month") {
    return `${year}.${pad2(month)}`;
  }
  const end = parseDateKey(shiftPeriod(value, "day", 6));
  return `${month}/${date.getUTCDate()} ~ ${
    end.getUTCMonth() + 1
  }/${end.getUTCDate()}`;
}

export function statBucketEnd(
  value: string,
  aggregation: "week" | "month" | "quarter" | "year",
) {
  if (aggregation === "week") return shiftPeriod(value, "day", 6);
  if (aggregation === "month") {
    const date = parseDateKey(value);
    return dateKey(
      new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ),
    );
  }
  if (aggregation === "quarter") {
    return shiftPeriod(
      shiftPeriod(value, "month", 3),
      "day",
      -1,
    );
  }
  return `${parseDateKey(value).getUTCFullYear()}-12-31`;
}

export function statRangeBounds(range: StatsRange) {
  const today = todayDateInputValue();
  const date = parseDateKey(today);
  const year = date.getUTCFullYear();
  if (range === "week") {
    const start = startOfPeriod(today, "week");
    return { start, end: shiftPeriod(start, "day", 6) };
  }
  if (range === "month") {
    const start = startOfPeriod(today, "month");
    return {
      start,
      end: statBucketEnd(start, "month"),
    };
  }
  if (range === "quarter") {
    const start = startOfPeriod(today, "quarter");
    return {
      start,
      end: statBucketEnd(start, "quarter"),
    };
  }
  if (range === "year") {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  return {
    start: `${year - 2}-01-01`,
    end: `${year}-12-31`,
  };
}

export function historyMonthLabel(value: string) {
  const date = parseDateKey(value);
  return `${date.getUTCFullYear()}.${pad2(date.getUTCMonth() + 1)}`;
}

export function historyQuarterLabel(value: string) {
  const date = parseDateKey(value);
  return `${date.getUTCFullYear()}.Q${
    Math.floor(date.getUTCMonth() / 3) + 1
  }`;
}

export function periodLabel(value: string, type: BookmarkPeriodType) {
  const date = parseDateKey(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  if (type === "year") return `${year}년`;
  if (type === "quarter") {
    return `${year}년 ${Math.floor((month - 1) / 3) + 1}분기`;
  }
  if (type === "month") return `${year}년 ${month}월`;
  if (type === "day") {
    return `${year}년 ${month}월 ${day}일 (${
      ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()]
    })`;
  }

  const end = parseDateKey(shiftPeriod(value, "day", 6));
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth() + 1;
  const endDay = end.getUTCDate();
  return `${year}년 ${month}월 ${day}일 ~ ${
    endYear !== year ? `${endYear}년 ` : ""
  }${endMonth}월 ${endDay}일`;
}

const WEEK_ORDINALS = ["첫", "둘", "셋", "넷", "다섯"];

// A week belongs to the month containing its Thursday.
export function weekThursday(value: string) {
  return shiftPeriod(startOfPeriod(value, "week"), "day", 3);
}

export function weekOfMonth(value: string) {
  const thursday = parseDateKey(weekThursday(value));
  return Math.floor((thursday.getUTCDate() - 1) / 7) + 1;
}

export function weekOfMonthLabel(value: string) {
  const week = weekOfMonth(value);
  const ordinal = WEEK_ORDINALS[week - 1] ?? String(week);
  return `${ordinal}째주`;
}

export function weekPeriodLabel(value: string) {
  const thursday = parseDateKey(weekThursday(value));
  return `${thursday.getUTCFullYear()}년 ${
    thursday.getUTCMonth() + 1
  }월 ${weekOfMonthLabel(value)}`;
}

export function compactPeriodLabel(
  value: string,
  type: BookmarkPeriodType,
) {
  const date = parseDateKey(value);
  const today = todayDateInputValue();
  const currentYear = parseDateKey(today).getUTCFullYear();
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const prefix = year === currentYear ? "" : `${year}년 `;

  if (type === "day") {
    if (value === today) return "오늘";
    const weekday = WEEKDAY_SHORT[(date.getUTCDay() + 6) % 7];
    return `${prefix}${month}월 ${day}일 (${weekday})`;
  }
  if (type === "week") {
    const thursday = parseDateKey(weekThursday(value));
    const weekYear = thursday.getUTCFullYear();
    const weekMonth = thursday.getUTCMonth() + 1;
    const weekPrefix =
      weekYear === currentYear ? "" : `${weekYear}년 `;
    return `${weekPrefix}${weekMonth}월 ${weekOfMonthLabel(
      value,
    )}`;
  }
  if (type === "month") return `${prefix}${month}월`;
  if (type === "quarter") {
    return `${prefix}${Math.floor((month - 1) / 3) + 1}분기`;
  }
  return `${year}년`;
}

export function monthCalendarDays(monthStart: string) {
  const date = parseDateKey(monthStart);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(
      Date.UTC(year, month, 1 - offset + index),
    );
    return {
      key: dateKey(day),
      day: day.getUTCDate(),
      inMonth: day.getUTCMonth() === month,
    };
  });
}

export function monthLabel(value: string) {
  const date = parseDateKey(value);
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월`;
}

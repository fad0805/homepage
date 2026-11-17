import { useState, type Dispatch, type SetStateAction } from "react";

import type { BookmarkPeriodType } from "@/lib/bookmark";

import type { BookmarkView } from "./bookmark-types";
import { shiftPeriod, startOfPeriod } from "./bookmark-utils";

interface UseBookmarkCalendarOptions {
  view: BookmarkView;
  periodStart: string;
  setPeriodStart: Dispatch<SetStateAction<string>>;
}

export function useBookmarkCalendar({
  view,
  periodStart,
  setPeriodStart,
}: UseBookmarkCalendarOptions) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfPeriod(periodStart, "month"),
  );
  const [calendarHoverDate, setCalendarHoverDate] = useState<
    string | null
  >(null);

  const openCalendar = () => {
    setCalendarMonth(startOfPeriod(periodStart, "month"));
    setCalendarHoverDate(null);
    setCalendarOpen(true);
  };

  const closeCalendar = () => {
    setCalendarOpen(false);
  };

  const selectCalendarDate = (value: string) => {
    const nextType: BookmarkPeriodType =
      view === "today" || view === "stats" ? "day" : view;
    setPeriodStart(startOfPeriod(value, nextType));
    setCalendarOpen(false);
  };

  const calendarRange = (value: string) => {
    if (view === "week") {
      const start = startOfPeriod(value, "week");
      return {
        start,
        end: shiftPeriod(start, "day", 6),
      };
    }
    return { start: value, end: value };
  };

  return {
    calendarOpen,
    calendarMonth,
    setCalendarMonth,
    calendarHoverDate,
    setCalendarHoverDate,
    openCalendar,
    closeCalendar,
    selectCalendarDate,
    calendarRange,
  };
}

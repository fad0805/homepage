import { useState, type Dispatch, type SetStateAction } from "react";

import type { BookmarkPeriodType } from "@/lib/bookmark";

import { shiftPeriod, startOfPeriod } from "./bookmark-utils";

interface UseBookmarkCalendarOptions {
  periodType: BookmarkPeriodType;
  anchorDate: string;
  setAnchorDate: Dispatch<SetStateAction<string>>;
}

export function useBookmarkCalendar({
  periodType,
  anchorDate,
  setAnchorDate,
}: UseBookmarkCalendarOptions) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfPeriod(anchorDate, "month"),
  );
  const [calendarHoverDate, setCalendarHoverDate] = useState<
    string | null
  >(null);

  const openCalendar = () => {
    setCalendarMonth(startOfPeriod(anchorDate, "month"));
    setCalendarHoverDate(null);
    setCalendarOpen(true);
  };

  const closeCalendar = () => {
    setCalendarOpen(false);
  };

  const selectCalendarDate = (value: string) => {
    setAnchorDate(value);
    setCalendarOpen(false);
  };

  const calendarRange = (value: string) => {
    if (periodType === "week") {
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

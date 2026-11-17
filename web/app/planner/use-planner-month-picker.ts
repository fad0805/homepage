import { useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { pad2 } from "./planner-utils";

interface UsePlannerMonthPickerOptions {
  viewMonth: string;
  today: string;
  setViewMonth: Dispatch<SetStateAction<string>>;
  setSelectedDate: Dispatch<SetStateAction<string>>;
}

export function usePlannerMonthPicker({
  viewMonth,
  today,
  setViewMonth,
  setSelectedDate,
}: UsePlannerMonthPickerOptions) {
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerYear, setMonthPickerYear] = useState(
    Number(viewMonth.slice(0, 4)),
  );
  const [monthPickerMonth, setMonthPickerMonth] = useState(
    Number(viewMonth.slice(5, 7)),
  );

  const monthPickerYears = useMemo(() => {
    const years = Array.from(
      { length: 201 },
      (_, index) => 1900 + index,
    );
    if (!years.includes(monthPickerYear)) {
      years.push(monthPickerYear);
      years.sort((a, b) => a - b);
    }
    return years;
  }, [monthPickerYear]);

  const openMonthPicker = () => {
    setMonthPickerYear(Number(viewMonth.slice(0, 4)));
    setMonthPickerMonth(Number(viewMonth.slice(5, 7)));
    setMonthPickerOpen(true);
  };

  const closeMonthPicker = () => {
    setMonthPickerOpen(false);
  };

  const applyMonthPicker = () => {
    const monthKey = `${monthPickerYear}-${pad2(monthPickerMonth)}`;
    const lastDay = new Date(
      Date.UTC(monthPickerYear, monthPickerMonth, 0),
    ).getUTCDate();
    const preferredDay =
      monthKey === today.slice(0, 7)
        ? Number(today.slice(8, 10))
        : 1;
    setViewMonth(monthKey);
    setSelectedDate(
      `${monthKey}-${pad2(Math.min(preferredDay, lastDay))}`,
    );
    setMonthPickerOpen(false);
  };

  return {
    monthPickerOpen,
    setMonthPickerOpen,
    monthPickerYear,
    setMonthPickerYear,
    monthPickerMonth,
    setMonthPickerMonth,
    monthPickerYears,
    openMonthPicker,
    closeMonthPicker,
    applyMonthPicker,
  };
}

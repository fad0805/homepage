"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  WEEKDAY_SHORT,
  routineWeekdays,
  type BookmarkGoal,
  type BookmarkPeriod,
  type BookmarkPeriodType,
  type BookmarkRating,
  type BookmarkReview,
  type BookmarkRoutine,
  type BookmarkRoutineCategory,
  type BookmarkRoutineFrequency,
  type BookmarkRoutineHistory,
  type BookmarkMoodTag,
  type BookmarkTrackingMode,
  routineScheduleLabel,
} from "@/lib/bookmark";
import { apiFetch } from "@/lib/api";
import { todayDateInputValue } from "@/lib/datetime";

import { CloverRating } from "./clover-rating";

import "@/public/styles/bookmark.scss";

type BookmarkView = "today" | BookmarkPeriodType;
type MonthlyMode = "day" | "nth";

const PERIOD_TYPES: BookmarkPeriodType[] = [
  "day",
  "week",
  "month",
  "quarter",
  "year",
];
const PERIOD_LABELS: Record<BookmarkPeriodType, string> = {
  year: "연",
  quarter: "분기",
  month: "월",
  week: "주",
  day: "일",
};
const VIEWS: BookmarkView[] = ["today", ...PERIOD_TYPES];
const VIEW_LABELS: Record<BookmarkView, string> = {
  today: "오늘",
  ...PERIOD_LABELS,
};
const PERIOD_FREQUENCY: Record<
  BookmarkPeriodType,
  BookmarkRoutineFrequency
> = {
  year: "yearly",
  quarter: "quarterly",
  month: "monthly",
  week: "weekly",
  day: "daily",
};
const FREQUENCY_LABELS: Record<BookmarkRoutineFrequency, string> = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  quarterly: "매분기",
  yearly: "매년",
};
const ROUTINE_SECTION_LABELS: Record<BookmarkPeriodType, string> = {
  day: "매일",
  week: "매주",
  month: "매월",
  quarter: "매분기",
  year: "매년",
};
const TARGET_LABELS: Record<BookmarkRoutineFrequency, string> = {
  daily: "매일",
  weekly: "주간 목표 횟수",
  monthly: "월간 목표 횟수",
  quarterly: "분기 목표 횟수",
  yearly: "연간 목표 횟수",
};
const MODE_LABELS: Record<BookmarkTrackingMode, string> = {
  count: "횟수",
  date: "일자",
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad2(
    date.getUTCMonth() + 1,
  )}-${pad2(date.getUTCDate())}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function startOfPeriod(value: string, type: BookmarkPeriodType) {
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

function shiftPeriod(
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

function occurrenceLabel(
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

function historyDayTitle(
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

function historyMonthLabel(value: string) {
  const date = parseDateKey(value);
  return `${date.getUTCFullYear()}.${pad2(date.getUTCMonth() + 1)}`;
}

function periodLabel(value: string, type: BookmarkPeriodType) {
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

function monthCalendarDays(monthStart: string) {
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

function monthLabel(value: string) {
  const date = parseDateKey(value);
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월`;
}

export default function BookmarkClient({ username }: { username: string }) {
  const initialToday = todayDateInputValue();
  const [view, setView] = useState<BookmarkView>("today");
  const [periodStart, setPeriodStart] = useState(initialToday);
  const [data, setData] = useState<BookmarkPeriod | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [goalContent, setGoalContent] = useState("");
  const [goalWakeTime, setGoalWakeTime] = useState("");
  const [goalMoodTagId, setGoalMoodTagId] = useState<number | null>(
    null,
  );
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalSaved, setGoalSaved] = useState(false);
  const [dayMetaSaving, setDayMetaSaving] = useState(false);
  const [dayMetaSaved, setDayMetaSaved] = useState(false);
  const [moodTags, setMoodTags] = useState<BookmarkMoodTag[]>([]);
  const [moodTagModalOpen, setMoodTagModalOpen] = useState(false);
  const [newMoodTagName, setNewMoodTagName] = useState("");
  const [moodTagSaving, setMoodTagSaving] = useState(false);
  const [moodTagError, setMoodTagError] = useState<string | null>(
    null,
  );
  const [rating, setRating] = useState(0);
  const [ratingDraft, setRatingDraft] = useState(0);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [reviewContent, setReviewContent] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);

  const [routineModalOpen, setRoutineModalOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] =
    useState<BookmarkRoutine | null>(null);
  const [historyRoutine, setHistoryRoutine] =
    useState<BookmarkRoutine | null>(null);
  const [historyData, setHistoryData] =
    useState<BookmarkRoutineHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [itemTitle, setItemTitle] = useState("");
  const [itemNotes, setItemNotes] = useState("");
  const [itemSaving, setItemSaving] = useState(false);

  const [categories, setCategories] = useState<
    BookmarkRoutineCategory[]
  >([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfPeriod(initialToday, "month"),
  );
  const [calendarHoverDate, setCalendarHoverDate] = useState<
    string | null
  >(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(
    null,
  );
  const [routineCategoryId, setRoutineCategoryId] = useState<
    number | null
  >(null);
  const [routineMode, setRoutineMode] =
    useState<BookmarkTrackingMode>("count");
  const [routineTarget, setRoutineTarget] = useState("1");
  const [routineWeekday, setRoutineWeekday] = useState(0);
  const [routineWeekdaySelection, setRoutineWeekdaySelection] = useState<
    number[]
  >([0]);
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>("day");
  const [routineDayOfMonth, setRoutineDayOfMonth] = useState("1");
  const [routineNthWeek, setRoutineNthWeek] = useState(1);
  const [routineMonth, setRoutineMonth] = useState(1);

  const loadPeriod = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint =
        view === "today"
          ? `/api/bookmark/today?period_start=${periodStart}`
          : `/api/bookmark?period_type=${view}&period_start=${periodStart}`;
      const next = await apiFetch<BookmarkPeriod>(endpoint, {
        cache: "no-store",
      });
      setData(next);
      setGoalContent(next.goal?.content ?? "");
      setGoalWakeTime(next.goal?.wake_time?.slice(0, 5) ?? "");
      setGoalMoodTagId(next.goal?.mood_tag_id ?? null);
      setRating(next.rating?.rating ?? 0);
      setRatingDraft(next.rating?.rating ?? 0);
      setReviewContent(next.review?.content ?? "");
      setGoalSaved(false);
      setDayMetaSaved(false);
      setReviewSaved(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "책갈피를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [periodStart, view]);

  const loadCategories = useCallback(async () => {
    try {
      const next = await apiFetch<BookmarkRoutineCategory[]>(
        "/api/bookmark/categories",
        { cache: "no-store" },
      );
      setCategories(next);
    } catch {
      // The routine list can still render uncategorized entries.
    }
  }, []);

  useEffect(() => {
    void loadPeriod();
  }, [loadPeriod]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const loadMoodTags = useCallback(async () => {
    try {
      const next = await apiFetch<BookmarkMoodTag[]>(
        "/api/bookmark/mood-tags",
        { cache: "no-store" },
      );
      setMoodTags(next);
    } catch {
      // Mood can still be cleared if tags fail to load.
    }
  }, []);

  useEffect(() => {
    void loadMoodTags();
  }, [loadMoodTags]);

  const changeView = (next: BookmarkView) => {
    setView(next);
    if (next === "today") {
      setPeriodStart(todayDateInputValue());
    } else {
      setPeriodStart((previous) => startOfPeriod(previous, next));
    }
    setCalendarOpen(false);
    closeRoutineModal();
  };

  const openCalendar = () => {
    setCalendarMonth(startOfPeriod(periodStart, "month"));
    setCalendarHoverDate(null);
    setCalendarOpen(true);
  };

  const selectCalendarDate = (value: string) => {
    const nextType: BookmarkPeriodType =
      view === "today" ? "day" : view;
    setPeriodStart(startOfPeriod(value, nextType));
    setCalendarOpen(false);
  };

  const goToday = () => {
    const type = view === "today" ? "day" : view;
    setPeriodStart(startOfPeriod(todayDateInputValue(), type));
  };

  const movePeriod = (delta: number) => {
    if (view === "today") return;
    setPeriodStart((previous) => shiftPeriod(previous, view, delta));
  };

  const routines = data?.routines ?? [];
  const recordPeriodType: BookmarkPeriodType =
    view === "today" ? "day" : view;
  const unitView: BookmarkPeriodType =
    view === "today" ? "day" : view;
  const isTodaySelected = periodStart === todayDateInputValue();

  const openCreateRoutine = () => {
    setRoutineModalOpen(true);
    setEditingRoutine(null);
    setItemTitle("");
    setItemNotes("");
    setRoutineCategoryId(null);
    setRoutineMode("count");
    setRoutineTarget("1");
    setRoutineWeekday(0);
    setRoutineWeekdaySelection([0]);
    setMonthlyMode("day");
    setRoutineDayOfMonth("1");
    setRoutineNthWeek(1);
    setRoutineMonth(1);
    setError(null);
  };

  const openEditRoutine = (routine: BookmarkRoutine) => {
    setRoutineModalOpen(true);
    setEditingRoutine(routine);
    setItemTitle(routine.title);
    setItemNotes(routine.notes ?? "");
    setRoutineCategoryId(routine.category_id);
    setRoutineMode(routine.tracking_mode);
    setRoutineTarget(String(routine.target_count));
    setRoutineWeekday(routine.weekday ?? 0);
    setRoutineWeekdaySelection(
      routineWeekdays(routine).length > 0
        ? routineWeekdays(routine)
        : [0],
    );
    setMonthlyMode(routine.day_of_month !== null ? "day" : "nth");
    setRoutineDayOfMonth(
      routine.day_of_month !== null
        ? String(routine.day_of_month)
        : "1",
    );
    setRoutineNthWeek(routine.nth_week ?? 1);
    setRoutineMonth(routine.month ?? 1);
    setError(null);
  };

  const openHistory = async (routine: BookmarkRoutine) => {
    setHistoryRoutine(routine);
    setHistoryData(null);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const history = await apiFetch<BookmarkRoutineHistory>(
        `/api/bookmark/routines/${routine.id}/history`,
        { cache: "no-store" },
      );
      setHistoryData(history);
    } catch (reason) {
      setHistoryError(
        reason instanceof Error
          ? reason.message
          : "달성 기록을 불러오지 못했습니다.",
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistory = () => {
    setHistoryRoutine(null);
    setHistoryData(null);
    setHistoryError(null);
    setHistoryLoading(false);
  };

  const openCategoryModal = () => {
    setCategoryModalOpen(true);
    setNewCategoryName("");
    setCategoryError(null);
  };

  const closeCategoryModal = () => {
    setCategoryModalOpen(false);
    setNewCategoryName("");
    setCategoryError(null);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || categorySaving) return;
    setCategorySaving(true);
    setCategoryError(null);
    try {
      await apiFetch<BookmarkRoutineCategory>(
        "/api/bookmark/categories",
        {
          method: "POST",
          body: JSON.stringify({ name: newCategoryName }),
        },
      );
      setNewCategoryName("");
      await loadCategories();
    } catch (reason) {
      setCategoryError(
        reason instanceof Error
          ? reason.message
          : "카테고리를 추가하지 못했습니다.",
      );
    } finally {
      setCategorySaving(false);
    }
  };

  const handleDeleteCategory = async (
    category: BookmarkRoutineCategory,
  ) => {
    if (categorySaving) return;
    if (
      !window.confirm(
        `"${category.name}" 카테고리를 삭제할까요? 루틴은 미분류로 이동합니다.`,
      )
    ) {
      return;
    }
    setCategorySaving(true);
    setCategoryError(null);
    try {
      await apiFetch(`/api/bookmark/categories/${category.id}`, {
        method: "DELETE",
      });
      await loadCategories();
      await loadPeriod();
    } catch (reason) {
      setCategoryError(
        reason instanceof Error
          ? reason.message
          : "카테고리를 삭제하지 못했습니다.",
      );
    } finally {
      setCategorySaving(false);
    }
  };

  const closeRoutineModal = () => {
    setRoutineModalOpen(false);
    setEditingRoutine(null);
    setItemTitle("");
    setItemNotes("");
  };

  const modalFrequency =
    editingRoutine?.frequency ??
    (view === "today" ? "daily" : PERIOD_FREQUENCY[view]);

  const handleSaveRoutine = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!itemTitle.trim() || itemSaving) return;
    const mode: BookmarkTrackingMode =
      modalFrequency === "daily" ? "date" : routineMode;
    if (
      mode === "date" &&
      modalFrequency === "weekly" &&
      routineWeekdaySelection.length === 0
    ) {
      setError("매주 반복할 요일을 하나 이상 선택해주세요.");
      return;
    }
    const targetCount =
      mode === "count"
        ? Math.max(1, Number(routineTarget) || 1)
        : modalFrequency === "weekly"
          ? routineWeekdaySelection.length
          : 1;
    const schedule =
      mode === "date"
        ? modalFrequency === "weekly"
          ? {
              weekday: null,
              weekdays: routineWeekdaySelection,
              day_of_month: null,
              nth_week: null,
              month: null,
            }
          : modalFrequency === "monthly"
            ? monthlyMode === "day"
              ? {
                  weekday: null,
                  weekdays: null,
                  day_of_month: Number(routineDayOfMonth),
                  nth_week: null,
                  month: null,
                }
              : {
                  weekday: routineWeekday,
                  weekdays: null,
                  day_of_month: null,
                  nth_week: routineNthWeek,
                  month: null,
                }
            : modalFrequency === "yearly"
              ? {
                  weekday: null,
                  weekdays: null,
                  day_of_month: Number(routineDayOfMonth),
                  nth_week: null,
                  month: routineMonth,
                }
              : {
                  weekday: null,
                  weekdays: null,
                  day_of_month: null,
                  nth_week: null,
                  month: null,
                }
        : {
            weekday: null,
            weekdays: null,
            day_of_month: null,
            nth_week: null,
            month: null,
          };

    setItemSaving(true);
    setError(null);
    try {
      if (editingRoutine) {
        await apiFetch<BookmarkRoutine>(
          `/api/bookmark/routines/${editingRoutine.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              title: itemTitle,
              notes: itemNotes || null,
              category_id: routineCategoryId,
              tracking_mode: mode,
              target_count: targetCount,
              ...schedule,
            }),
          },
        );
      } else {
        await apiFetch<BookmarkRoutine>("/api/bookmark/routines", {
          method: "POST",
          body: JSON.stringify({
            frequency: modalFrequency,
            title: itemTitle,
            notes: itemNotes || null,
            category_id: routineCategoryId,
            tracking_mode: mode,
            target_count: targetCount,
            ...schedule,
          }),
        });
      }
      closeRoutineModal();
      await loadPeriod();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "루틴을 저장하지 못했습니다.",
      );
    } finally {
      setItemSaving(false);
    }
  };

  const toggleRoutineWeekday = (weekday: number) => {
    setRoutineWeekdaySelection((previous) =>
      previous.includes(weekday)
        ? previous.filter((value) => value !== weekday)
        : [...previous, weekday].sort((a, b) => a - b),
    );
  };

  const handleStopRoutine = async () => {
    if (!editingRoutine || itemSaving) return;
    if (
      !window.confirm(
        `"${editingRoutine.title}" 루틴을 중단할까요? 기존 기록은 유지됩니다.`,
      )
    ) {
      return;
    }
    setItemSaving(true);
    setError(null);
    try {
      await apiFetch<BookmarkRoutine>(
        `/api/bookmark/routines/${editingRoutine.id}/stop`,
        { method: "POST" },
      );
      closeRoutineModal();
      await loadPeriod();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "루틴을 중단하지 못했습니다.",
      );
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteRoutine = async () => {
    if (!editingRoutine) return;
    if (
      !window.confirm(
        `"${editingRoutine.title}" 루틴과 모든 기록을 완전히 삭제할까요?`,
      )
    ) {
      return;
    }
    setItemSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/bookmark/routines/${editingRoutine.id}`, {
        method: "DELETE",
      });
      closeRoutineModal();
      await loadPeriod();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "루틴을 삭제하지 못했습니다.",
      );
    } finally {
      setItemSaving(false);
    }
  };

  const setRoutineCount = async (
    routine: BookmarkRoutine,
    nextCount: number,
  ) => {
    const count = Math.max(
      0,
      Math.min(routine.target_count, nextCount),
    );
    if (count === routine.completed_count) return;
    setError(null);
    setData((previous) =>
      previous
        ? {
            ...previous,
            routines: previous.routines.map((current) =>
              current.id === routine.id
                ? {
                    ...current,
                    completed_count: count,
                    occurrences: current.occurrences.map(
                      (occurrence, index) =>
                        index === 0
                          ? { ...occurrence, done: count > 0 }
                          : occurrence,
                    ),
                  }
                : current,
            ),
          }
        : previous,
    );
    try {
      await apiFetch<BookmarkRoutine>(
        `/api/bookmark/routines/${routine.id}/check`,
        {
          method: "PUT",
          body: JSON.stringify({
            period_type: routine.period_type,
            period_start: routine.period_start,
            count,
          }),
        },
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "루틴 달성 횟수를 변경하지 못했습니다.",
      );
      await loadPeriod();
    }
  };

  const toggleOccurrence = async (
    routine: BookmarkRoutine,
    occurrenceDate: string,
    done: boolean,
  ) => {
    const nextDone = !done;
    const nextCompleted = Math.max(
      0,
      Math.min(
        routine.target_count,
        routine.completed_count + (nextDone ? 1 : -1),
      ),
    );
    const periodType =
      routine.frequency === "daily" || routine.frequency === "weekly"
        ? "day"
        : routine.period_type;
    const periodStart =
      routine.frequency === "daily" || routine.frequency === "weekly"
        ? occurrenceDate
        : routine.period_start;
    setError(null);
    setData((previous) =>
      previous
        ? {
            ...previous,
            routines: previous.routines.map((current) =>
              current.id === routine.id
                ? {
                    ...current,
                    completed_count: nextCompleted,
                    occurrences: current.occurrences.map((occurrence) =>
                      occurrence.date === occurrenceDate
                        ? { ...occurrence, done: nextDone }
                        : occurrence,
                    ),
                  }
                : current,
            ),
          }
        : previous,
    );
    try {
      await apiFetch<BookmarkRoutine>(
        `/api/bookmark/routines/${routine.id}/check`,
        {
          method: "PUT",
          body: JSON.stringify({
            period_type: periodType,
            period_start: periodStart,
            count: nextDone ? 1 : 0,
          }),
        },
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "루틴 체크 상태를 변경하지 못했습니다.",
      );
      await loadPeriod();
    }
  };

  const openMoodTagModal = () => {
    setMoodTagModalOpen(true);
    setNewMoodTagName("");
    setMoodTagError(null);
  };

  const closeMoodTagModal = () => {
    setMoodTagModalOpen(false);
    setNewMoodTagName("");
    setMoodTagError(null);
  };

  const handleAddMoodTag = async () => {
    if (!newMoodTagName.trim() || moodTagSaving) return;
    setMoodTagSaving(true);
    setMoodTagError(null);
    try {
      await apiFetch<BookmarkMoodTag>("/api/bookmark/mood-tags", {
        method: "POST",
        body: JSON.stringify({ name: newMoodTagName }),
      });
      setNewMoodTagName("");
      await loadMoodTags();
    } catch (reason) {
      setMoodTagError(
        reason instanceof Error
          ? reason.message
          : "기분 태그를 추가하지 못했습니다.",
      );
    } finally {
      setMoodTagSaving(false);
    }
  };

  const handleDeleteMoodTag = async (tag: BookmarkMoodTag) => {
    if (moodTagSaving) return;
    if (!window.confirm(`"${tag.name}" 기분 태그를 삭제할까요?`)) {
      return;
    }
    setMoodTagSaving(true);
    setMoodTagError(null);
    try {
      await apiFetch(`/api/bookmark/mood-tags/${tag.id}`, {
        method: "DELETE",
      });
      await loadMoodTags();
      await loadPeriod();
    } catch (reason) {
      setMoodTagError(
        reason instanceof Error
          ? reason.message
          : "기분 태그를 삭제하지 못했습니다.",
      );
    } finally {
      setMoodTagSaving(false);
    }
  };

  const handleSaveGoal = async () => {
    if (goalSaving) return;
    setGoalSaving(true);
    setError(null);
    setGoalSaved(false);
    try {
      const saved = await apiFetch<BookmarkGoal>("/api/bookmark/goals", {
        method: "PUT",
        body: JSON.stringify({
          period_type: recordPeriodType,
          period_start: periodStart,
          content: goalContent,
        }),
      });
      setData((previous) =>
        previous ? { ...previous, goal: saved } : previous,
      );
      setGoalContent(saved.content);
      setGoalSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "목표를 저장하지 못했습니다.",
      );
    } finally {
      setGoalSaving(false);
    }
  };

  const handleRatingChange = (nextRating: number) => {
    if (ratingSaving) return;
    setRatingDraft(nextRating);
  };

  const handleSaveDayMeta = async () => {
    if (dayMetaSaving) return;
    setDayMetaSaving(true);
    setError(null);
    setDayMetaSaved(false);
    try {
      const saved = await apiFetch<BookmarkGoal>(
        "/api/bookmark/day-meta",
        {
          method: "PUT",
          body: JSON.stringify({
            period_start: periodStart,
            wake_time: goalWakeTime || null,
            mood_tag_id: goalMoodTagId,
          }),
        },
      );
      setGoalWakeTime(saved.wake_time?.slice(0, 5) ?? "");
      setGoalMoodTagId(saved.mood_tag_id ?? null);
      setData((previous) =>
        previous ? { ...previous, goal: saved } : previous,
      );
      setDayMetaSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "기상·기분 기록을 저장하지 못했습니다.",
      );
    } finally {
      setDayMetaSaving(false);
    }
  };

  const handleSaveRating = async () => {
    if (ratingSaving || ratingDraft === rating) return;
    setRatingSaving(true);
    setError(null);
    try {
      const saved = await apiFetch<BookmarkRating | null>(
        "/api/bookmark/rating",
        {
          method: "PUT",
          body: JSON.stringify({
            period_type: recordPeriodType,
            period_start: periodStart,
            rating: ratingDraft,
          }),
        },
      );
      const nextRating = saved?.rating ?? 0;
      setRating(nextRating);
      setRatingDraft(nextRating);
      setData((previous) =>
        previous ? { ...previous, rating: saved } : previous,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "별점을 저장하지 못했습니다.",
      );
    } finally {
      setRatingSaving(false);
    }
  };

  const handleSaveReview = async () => {
    if (reviewSaving) return;
    setReviewSaving(true);
    setError(null);
    setReviewSaved(false);
    try {
      const saved = await apiFetch<BookmarkReview>(
        "/api/bookmark/review",
        {
          method: "PUT",
          body: JSON.stringify({
            period_type: recordPeriodType,
            period_start: periodStart,
            content: reviewContent,
          }),
        },
      );
      setData((previous) =>
        previous ? { ...previous, review: saved } : previous,
      );
      setReviewContent(saved.content);
      setReviewSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "회고를 저장하지 못했습니다.",
      );
    } finally {
      setReviewSaving(false);
    }
  };

  const isRoutineDone = (routine: BookmarkRoutine) => {
    const isDaily = routine.frequency === "daily";
    const isCount =
      routine.tracking_mode === "count" && !isDaily;
    if (isCount || routine.frequency === "weekly") {
      return routine.completed_count >= routine.target_count;
    }
    return (
      routine.occurrences.length > 0 &&
      routine.occurrences.every((occurrence) => occurrence.done)
    );
  };

  const renderRoutines = () => {
    if (routines.length === 0) {
      return (
        <p className="bookmark-empty-row">
          {view === "today"
            ? "오늘 수행할 루틴이 없습니다. 일·주·월·분기·연 탭에서 루틴을 추가할 수 있습니다."
            : "이 기간에 등록된 루틴이 없습니다."}
        </p>
      );
    }

    const categoryById = new Map(
      categories.map((category) => [category.id, category]),
    );
    type RoutineGroup = {
      key: string;
      name: string;
      routines: BookmarkRoutine[];
      done: boolean;
    };
    const buildCategoryGroups = (
      key: string,
      name: string,
      items: BookmarkRoutine[],
    ): RoutineGroup[] => {
      if (items.length === 0) return [];
      const pending = items.filter(
        (routine) => !isRoutineDone(routine),
      );
      const done = items.filter(isRoutineDone);
      const groups: RoutineGroup[] = [];
      if (pending.length > 0) {
        groups.push({
          key: `${key}-pending`,
          name,
          routines: pending,
          done: false,
        });
      }
      if (done.length > 0) {
        groups.push({
          key: `${key}-done`,
          name,
          routines: done,
          done: true,
        });
      }
      return groups;
    };

    const categoryGroups = categories.flatMap((category) =>
      buildCategoryGroups(
        `category-${category.id}`,
        category.name,
        routines.filter(
          (routine) => routine.category_id === category.id,
        ),
      ),
    );
    const uncategorized = routines.filter(
      (routine) =>
        routine.category_id === null ||
        !categoryById.has(routine.category_id),
    );
    const allGroups = [
      ...categoryGroups,
      ...buildCategoryGroups(
        "uncategorized",
        "미분류",
        uncategorized,
      ),
    ];
    const groups = [
      ...allGroups.filter((group) => !group.done),
      ...allGroups.filter((group) => group.done),
    ];

    const renderRoutineItem = (routine: BookmarkRoutine) => {
      const isDaily = routine.frequency === "daily";
      const isCount =
        routine.tracking_mode === "count" && !isDaily;
      const isStopped = Boolean(routine.end_date);
      const allDone = isRoutineDone(routine);
      return (
        <li
          className={`bookmark-item${allDone ? " is-done" : ""}`}
          key={routine.id}
        >
          <div className="bookmark-item-main">
            <div className="bookmark-routine-heading">
              <span className="bookmark-routine-title">
                {routine.title}
              </span>
              {isStopped ? (
                <span className="bookmark-routine-status">중단됨</span>
              ) : null}
              <p className="bookmark-item-schedule">
                {routineScheduleLabel(routine)}
              </p>
            </div>

            {isCount ? (
              <div className="bookmark-routine-counter">
                {!isStopped ? (
                  <button
                    type="button"
                    className="bookmark-count-button"
                    aria-label="1회 줄이기"
                    disabled={routine.completed_count <= 0}
                    onClick={() =>
                      void setRoutineCount(
                        routine,
                        routine.completed_count - 1,
                      )
                    }
                  >
                    −
                  </button>
                ) : null}
                <span className="bookmark-routine-progress">
                  <strong>{routine.completed_count}</strong>
                  <span>/ {routine.target_count}회</span>
                </span>
                {!isStopped ? (
                  <button
                    type="button"
                    className="bookmark-count-button"
                    aria-label="1회 추가"
                    disabled={
                      routine.completed_count >= routine.target_count
                    }
                    onClick={() =>
                      void setRoutineCount(
                        routine,
                        routine.completed_count + 1,
                      )
                    }
                  >
                    +
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <div className="bookmark-occurrence-list">
                  {routine.occurrences.map((occurrence) => (
                    <label
                      className={`bookmark-occurrence${
                        occurrence.done ? " is-done" : ""
                      }`}
                      key={occurrence.date}
                    >
                      <input
                        type="checkbox"
                        checked={occurrence.done}
                        onChange={() =>
                          void toggleOccurrence(
                            routine,
                            occurrence.date,
                            occurrence.done,
                          )
                        }
                      />
                      <span>
                        {occurrenceLabel(
                          occurrence.date,
                          view,
                          routine.frequency,
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                {routine.frequency === "weekly" &&
                routine.target_count > 1 ? (
                  <p className="bookmark-routine-week-progress">
                    이번 주 {routine.completed_count}/
                    {routine.target_count}회
                  </p>
                ) : null}
              </>
            )}

            {routine.notes ? (
              <p className="bookmark-item-notes">{routine.notes}</p>
            ) : null}
          </div>
          <div className="bookmark-item-actions">
            <button
              type="button"
              className="bookmark-text-button"
              onClick={() => void openHistory(routine)}
            >
              기록
            </button>
            <button
              type="button"
              className="bookmark-text-button"
              onClick={() => openEditRoutine(routine)}
            >
              수정
            </button>
          </div>
        </li>
      );
    };

    return (
      <div className="bookmark-routine-groups">
        {groups
          .filter((group) => group.routines.length > 0)
          .map((group) => (
            <section
              className={`bookmark-routine-group${
                group.done ? " is-done-group" : ""
              }`}
              key={group.key}
            >
              <header className="bookmark-routine-group-header">
                <h3>
                  {group.name}
                  {group.done ? (
                    <span
                      className="bookmark-routine-group-check"
                      aria-label="완료"
                    >
                      ✓
                    </span>
                  ) : null}
                </h3>
                <span>{group.routines.length}</span>
              </header>
              <ul className="bookmark-item-list">
                {group.routines.map(renderRoutineItem)}
              </ul>
            </section>
          ))}
      </div>
    );
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

  const renderPeriodControls = () => {
    const date = parseDateKey(periodStart);
    const selectedYear = date.getUTCFullYear();
    const selectedMonth = date.getUTCMonth() + 1;
    const selectedQuarter = Math.floor((selectedMonth - 1) / 3) + 1;
    const currentYear = parseDateKey(todayDateInputValue()).getUTCFullYear();
    const firstYear = Math.min(currentYear, selectedYear) - 10;
    const lastYear = Math.max(currentYear, selectedYear) + 10;
    const years = Array.from(
      { length: lastYear - firstYear + 1 },
      (_, index) => firstYear + index,
    );
    const setYear = (year: number) => {
      if (view === "year") {
        setPeriodStart(`${year}-01-01`);
      } else if (view === "month") {
        setPeriodStart(`${year}-${pad2(selectedMonth)}-01`);
      } else if (view === "quarter") {
        const month = (selectedQuarter - 1) * 3 + 1;
        setPeriodStart(`${year}-${pad2(month)}-01`);
      }
    };

    if (view === "year") {
      return (
        <select
          className="bookmark-period-select"
          value={selectedYear}
          onChange={(event) => setYear(Number(event.target.value))}
        >
          {years.map((year) => (
            <option value={year} key={year}>
              {year}년
            </option>
          ))}
        </select>
      );
    }
    if (view === "month") {
      return (
        <>
          <select
            className="bookmark-period-select"
            value={selectedYear}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {years.map((year) => (
              <option value={year} key={year}>
                {year}년
              </option>
            ))}
          </select>
          <select
            className="bookmark-period-select"
            value={selectedMonth}
            onChange={(event) =>
              setPeriodStart(
                `${selectedYear}-${pad2(Number(event.target.value))}-01`,
              )
            }
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option value={index + 1} key={index + 1}>
                {index + 1}월
              </option>
            ))}
          </select>
        </>
      );
    }
    if (view === "quarter") {
      return (
        <>
          <select
            className="bookmark-period-select"
            value={selectedYear}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {years.map((year) => (
              <option value={year} key={year}>
                {year}년
              </option>
            ))}
          </select>
          <select
            className="bookmark-period-select"
            value={selectedQuarter}
            onChange={(event) => {
              const month = (Number(event.target.value) - 1) * 3 + 1;
              setPeriodStart(`${selectedYear}-${pad2(month)}-01`);
            }}
          >
            {[1, 2, 3, 4].map((quarter) => (
              <option value={quarter} key={quarter}>
                {quarter}분기
              </option>
            ))}
          </select>
        </>
      );
    }
    if (view === "week") {
      return (
        <button
          type="button"
          className="bookmark-period-label"
          title="달력에서 주간 선택"
          onClick={openCalendar}
        >
          {periodLabel(periodStart, "week")}
        </button>
      );
    }
    return (
      <button
        type="button"
        className="bookmark-period-label"
        title="달력에서 날짜 선택"
        onClick={openCalendar}
      >
        {periodLabel(periodStart, "day")}
      </button>
    );
  };

  return (
    <div id="bookmark-page">
      <main>
        <header className="bookmark-header">
          <div>
            <p className="bookmark-eyebrow">{username}의 비공개 기록</p>
            <h1>책갈피</h1>
            <p className="bookmark-description">
              오늘 수행할 루틴을 먼저 모아 보여주고, 연·분기·월·주·일
              단위의 현황도 함께 확인할 수 있습니다. 목표와 별점,
              회고는 선택한 기간에 남깁니다.
            </p>
          </div>
        </header>

        <div className="bookmark-period-bar">
          <div className="bookmark-period-tabs" role="tablist">
            {VIEWS.map((type) => (
              <button
                type="button"
                role="tab"
                key={type}
                aria-selected={view === type}
                className={view === type ? "is-active" : ""}
                onClick={() => changeView(type)}
              >
                {VIEW_LABELS[type]}
              </button>
            ))}
          </div>
          {view === "today" ? (
            <button
              type="button"
              className="bookmark-today-date"
              title="달력에서 날짜 선택"
              onClick={openCalendar}
            >
              {periodLabel(periodStart, "day")}
            </button>
          ) : (
            <div className="bookmark-period-nav">
              <button
                type="button"
                className="bookmark-icon-button"
                aria-label="이전 기간"
                onClick={() => movePeriod(-1)}
              >
                ‹
              </button>
              {renderPeriodControls()}
              <button
                type="button"
                className="bookmark-icon-button"
                aria-label="다음 기간"
                onClick={() => movePeriod(1)}
              >
                ›
              </button>
              <button
                type="button"
                className="bookmark-text-button"
                onClick={goToday}
              >
                오늘
              </button>
            </div>
          )}
        </div>

        {error ? <p className="bookmark-error">{error}</p> : null}

        {loading ? (
          <p className="bookmark-status">불러오는 중...</p>
        ) : (
          <div className="bookmark-layout">
            <div className="bookmark-main-column">
              <section className="bookmark-panel">
                <header className="bookmark-panel-header">
                  <div>
                    <p className="bookmark-panel-eyebrow">
                      {view === "today"
                        ? isTodaySelected
                          ? "오늘 수행 가능"
                          : "선택일 기준"
                        : ROUTINE_SECTION_LABELS[unitView]}
                    </p>
                    <h2>
                      {view === "today"
                        ? isTodaySelected
                          ? "오늘의 루틴"
                          : "선택일의 루틴"
                        : "할일 / 루틴"}
                    </h2>
                  </div>
                  <div className="bookmark-panel-actions">
                    <button
                      type="button"
                      className="bookmark-text-button"
                      onClick={openCategoryModal}
                    >
                      카테고리
                    </button>
                    {view !== "today" ? (
                      <button
                        type="button"
                        className="bookmark-primary"
                        onClick={openCreateRoutine}
                      >
                        추가
                      </button>
                    ) : null}
                  </div>
                </header>
                {renderRoutines()}
              </section>
            </div>

            <div className="bookmark-record-column">
              <section className="bookmark-panel bookmark-record-panel">
                <header className="bookmark-panel-header">
                  <div>
                    <p className="bookmark-panel-eyebrow">GOAL</p>
                    <h2>목표</h2>
                  </div>
                  {goalSaved ? (
                    <span className="bookmark-saved">저장됨</span>
                  ) : null}
                </header>
                <textarea
                  className="bookmark-record-textarea"
                  value={goalContent}
                  maxLength={20000}
                  placeholder="이 기간에 이루고 싶은 목표나 바람을 적어보세요."
                  onChange={(event) => {
                    setGoalContent(event.target.value);
                    setGoalSaved(false);
                  }}
                />
                <button
                  type="button"
                  className="bookmark-primary bookmark-record-save"
                  disabled={goalSaving}
                  onClick={() => void handleSaveGoal()}
                >
                  {goalSaving ? "저장 중..." : "목표 저장"}
                </button>
              </section>

              {recordPeriodType === "day" ? (
                <section className="bookmark-panel bookmark-day-meta-panel">
                  <header className="bookmark-panel-header">
                    <div>
                      <p className="bookmark-panel-eyebrow">MORNING</p>
                      <h2>기상 / 기분</h2>
                    </div>
                    {dayMetaSaved ? (
                      <span className="bookmark-saved">저장됨</span>
                    ) : null}
                  </header>
                  <div className="bookmark-day-meta-fields">
                    <label>
                      <span>기상</span>
                      <input
                        type="time"
                        value={goalWakeTime}
                        onChange={(event) => {
                          setGoalWakeTime(event.target.value);
                          setDayMetaSaved(false);
                        }}
                      />
                    </label>
                    <label>
                      <span>기분</span>
                      <select
                        value={goalMoodTagId ?? ""}
                        onChange={(event) => {
                          setGoalMoodTagId(
                            event.target.value
                              ? Number(event.target.value)
                              : null,
                          );
                          setDayMetaSaved(false);
                        }}
                      >
                        <option value="">선택 안 함</option>
                        {moodTags.map((tag) => (
                          <option value={tag.id} key={tag.id}>
                            {tag.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="bookmark-text-button"
                      onClick={openMoodTagModal}
                    >
                      태그 관리
                    </button>
                  </div>
                  <button
                    type="button"
                    className="bookmark-primary bookmark-record-save"
                    disabled={dayMetaSaving}
                    onClick={() => void handleSaveDayMeta()}
                  >
                    {dayMetaSaving ? "저장 중..." : "저장"}
                  </button>
                </section>
              ) : null}

              <section className="bookmark-panel bookmark-record-panel bookmark-review-panel">
                <header className="bookmark-panel-header bookmark-review-header">
                  <div>
                    <p className="bookmark-panel-eyebrow">REVIEW</p>
                    <h2>회고</h2>
                  </div>
                  <div className="bookmark-review-side">
                    <div className="bookmark-review-rating">
                      <CloverRating
                        value={ratingDraft}
                        onChange={handleRatingChange}
                        disabled={ratingSaving}
                      />
                      <button
                        type="button"
                        className="bookmark-primary bookmark-rating-save"
                        disabled={
                          ratingSaving || ratingDraft === rating
                        }
                        onClick={() => void handleSaveRating()}
                      >
                        {ratingSaving ? "저장 중..." : "저장"}
                      </button>
                    </div>
                    {reviewSaved ? (
                      <span className="bookmark-saved">저장됨</span>
                    ) : null}
                  </div>
                </header>
                <textarea
                  className="bookmark-record-textarea"
                  value={reviewContent}
                  maxLength={20000}
                  placeholder="이 기간을 돌아보세요."
                  onChange={(event) => {
                    setReviewContent(event.target.value);
                    setReviewSaved(false);
                  }}
                />
                <button
                  type="button"
                  className="bookmark-primary bookmark-record-save"
                  disabled={reviewSaving}
                  onClick={() => void handleSaveReview()}
                >
                  {reviewSaving ? "저장 중..." : "회고 저장"}
                </button>
              </section>
            </div>
          </div>
        )}
      </main>

      {calendarOpen ? (
        <div
          className="bookmark-modal-overlay"
          role="presentation"
          onClick={() => setCalendarOpen(false)}
        >
          <div
            className="bookmark-modal bookmark-calendar-modal"
            role="dialog"
            aria-modal="true"
            aria-label="날짜 선택"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="bookmark-modal-header">
              <div>
                <p className="bookmark-panel-eyebrow">DATE</p>
                <h2>날짜 선택</h2>
              </div>
              <button
                type="button"
                className="bookmark-text-button"
                onClick={() => setCalendarOpen(false)}
              >
                닫기
              </button>
            </header>
            <div className="bookmark-calendar-header">
              <button
                type="button"
                className="bookmark-icon-button"
                aria-label="이전 달"
                onClick={() =>
                  setCalendarMonth((previous) =>
                    shiftPeriod(previous, "month", -1),
                  )
                }
              >
                ‹
              </button>
              <strong>{monthLabel(calendarMonth)}</strong>
              <button
                type="button"
                className="bookmark-icon-button"
                aria-label="다음 달"
                onClick={() =>
                  setCalendarMonth((previous) =>
                    shiftPeriod(previous, "month", 1),
                  )
                }
              >
                ›
              </button>
            </div>
            <div className="bookmark-calendar-weekdays">
              {WEEKDAY_SHORT.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div
              className="bookmark-calendar-grid"
              onMouseLeave={() => setCalendarHoverDate(null)}
            >
              {monthCalendarDays(calendarMonth).map((day) => {
                const selectedRange = calendarRange(periodStart);
                const hoverRange = calendarHoverDate
                  ? calendarRange(calendarHoverDate)
                  : null;
                const inSelected =
                  day.key >= selectedRange.start &&
                  day.key <= selectedRange.end;
                const inHover = hoverRange
                  ? day.key >= hoverRange.start &&
                    day.key <= hoverRange.end
                  : false;
                return (
                  <button
                    type="button"
                    className={`bookmark-calendar-day${
                      day.inMonth ? "" : " is-outside"
                    }${inSelected ? " is-period" : ""}${
                      inHover ? " is-hovered" : ""
                    }${day.key === periodStart ? " is-selected" : ""}${
                      day.key === todayDateInputValue()
                        ? " is-today"
                        : ""
                    }`}
                    key={day.key}
                    onMouseEnter={() =>
                      setCalendarHoverDate(day.key)
                    }
                    onFocus={() => setCalendarHoverDate(day.key)}
                    onClick={() => selectCalendarDate(day.key)}
                  >
                    {day.day}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {routineModalOpen ? (
        <div
          className="bookmark-modal-overlay"
          role="presentation"
          onClick={closeRoutineModal}
        >
          <div
            className="bookmark-modal"
            role="dialog"
            aria-modal="true"
            aria-label="루틴 관리"
            onClick={(event) => event.stopPropagation()}
          >
            <form
              className="bookmark-item-form"
              onSubmit={handleSaveRoutine}
            >
              <header className="bookmark-modal-header">
                <h2>{FREQUENCY_LABELS[modalFrequency]} 루틴</h2>
                <button
                  type="button"
                  className="bookmark-text-button"
                  onClick={closeRoutineModal}
                >
                  닫기
                </button>
              </header>
              {error ? (
                <p className="bookmark-error">{error}</p>
              ) : null}
              <label>
                <span>제목</span>
                <input
                  type="text"
                  value={itemTitle}
                  maxLength={255}
                  required
                  placeholder="반복할 루틴"
                  onChange={(event) =>
                    setItemTitle(event.target.value)
                  }
                />
              </label>
              <label>
                <span>메모</span>
                <textarea
                  rows={4}
                  value={itemNotes}
                  maxLength={4000}
                  placeholder="선택 사항"
                  onChange={(event) =>
                    setItemNotes(event.target.value)
                  }
                />
              </label>
              <label>
                <span>카테고리</span>
                <select
                  value={routineCategoryId ?? ""}
                  onChange={(event) =>
                    setRoutineCategoryId(
                      event.target.value
                        ? Number(event.target.value)
                        : null,
                    )
                  }
                >
                  <option value="">미분류</option>
                  {categories.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              {editingRoutine ? (
                <p className="bookmark-form-hint">
                  시작일: {periodLabel(editingRoutine.start_date, "day")}
                  {editingRoutine.end_date ? " · 중단됨" : ""}
                </p>
              ) : null}

              <div className="bookmark-schedule">
                <span className="bookmark-field-label">기록 방식</span>
                {modalFrequency === "daily" ? (
                  <p className="bookmark-form-hint">
                    매일 1회 체크하는 루틴입니다.
                  </p>
                ) : (
                  <>
                    <div className="bookmark-mode-toggle">
                      {(["count", "date"] as BookmarkTrackingMode[]).map(
                        (mode) => (
                          <button
                            type="button"
                            key={mode}
                            className={
                              routineMode === mode ? "is-active" : ""
                            }
                            onClick={() => setRoutineMode(mode)}
                          >
                            {MODE_LABELS[mode]}
                          </button>
                        ),
                      )}
                    </div>

                    {routineMode === "count" ? (
                      <>
                        <label>
                          <span>{TARGET_LABELS[modalFrequency]}</span>
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            value={routineTarget}
                            onChange={(event) =>
                              setRoutineTarget(event.target.value)
                            }
                          />
                        </label>
                        <p className="bookmark-form-hint">
                          {modalFrequency === "weekly"
                            ? "이번 주에 몇 회 수행할지 정합니다."
                            : modalFrequency === "monthly"
                              ? "이번 달에 몇 회 수행할지 정합니다."
                              : modalFrequency === "quarterly"
                                ? "이번 분기에 몇 회 수행할지 정합니다."
                                : "올해 몇 회 수행할지 정합니다."}
                        </p>
                      </>
                    ) : (
                      <>
                        {modalFrequency === "weekly" ? (
                          <div className="bookmark-weekday-field">
                            <span>요일</span>
                            <div className="bookmark-weekday-picker">
                              {WEEKDAY_SHORT.map((label, index) => {
                                const selected =
                                  routineWeekdaySelection.includes(index);
                                return (
                                  <label
                                    className={
                                      selected ? "is-selected" : ""
                                    }
                                    key={label}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={() =>
                                        toggleRoutineWeekday(index)
                                      }
                                    />
                                    <span>{label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {modalFrequency === "monthly" ? (
                          <>
                            <label>
                              <span>방식</span>
                              <select
                                value={monthlyMode}
                                onChange={(event) =>
                                  setMonthlyMode(
                                    event.target.value as MonthlyMode,
                                  )
                                }
                              >
                                <option value="day">날짜</option>
                                <option value="nth">
                                  몇 번째 요일
                                </option>
                              </select>
                            </label>
                            {monthlyMode === "day" ? (
                              <label>
                                <span>일</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={31}
                                  value={routineDayOfMonth}
                                  onChange={(event) =>
                                    setRoutineDayOfMonth(
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                            ) : (
                              <div className="bookmark-schedule-row">
                                <label>
                                  <span>번째</span>
                                  <select
                                    value={routineNthWeek}
                                    onChange={(event) =>
                                      setRoutineNthWeek(
                                        Number(event.target.value),
                                      )
                                    }
                                  >
                                    {[1, 2, 3, 4, 5].map((value) => (
                                      <option value={value} key={value}>
                                        {value}번째
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span>요일</span>
                                  <select
                                    value={routineWeekday}
                                    onChange={(event) =>
                                      setRoutineWeekday(
                                        Number(event.target.value),
                                      )
                                    }
                                  >
                                    {WEEKDAY_SHORT.map(
                                      (label, index) => (
                                        <option
                                          value={index}
                                          key={label}
                                        >
                                          {label}요일
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </label>
                              </div>
                            )}
                          </>
                        ) : null}

                        {modalFrequency === "yearly" ? (
                          <div className="bookmark-schedule-row">
                            <label>
                              <span>월</span>
                              <select
                                value={routineMonth}
                                onChange={(event) =>
                                  setRoutineMonth(
                                    Number(event.target.value),
                                  )
                                }
                              >
                                {Array.from(
                                  { length: 12 },
                                  (_, index) => (
                                    <option
                                      value={index + 1}
                                      key={index + 1}
                                    >
                                      {index + 1}월
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            <label>
                              <span>일</span>
                              <input
                                type="number"
                                min={1}
                                max={31}
                                value={routineDayOfMonth}
                                onChange={(event) =>
                                  setRoutineDayOfMonth(
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                          </div>
                        ) : null}

                        {modalFrequency === "quarterly" ? (
                          <p className="bookmark-form-hint">
                            분기마다 1회 체크하는 루틴입니다.
                          </p>
                        ) : null}
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="bookmark-modal-actions">
                {editingRoutine && !editingRoutine.end_date ? (
                  <button
                    type="button"
                    className="bookmark-text-button"
                    disabled={itemSaving}
                    onClick={() => void handleStopRoutine()}
                  >
                    중단
                  </button>
                ) : null}
                {editingRoutine ? (
                  <button
                    type="button"
                    className="bookmark-text-button is-danger"
                    disabled={itemSaving}
                    onClick={() => void handleDeleteRoutine()}
                  >
                    완전 삭제
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="bookmark-primary"
                  disabled={itemSaving || !itemTitle.trim()}
                >
                  {itemSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {moodTagModalOpen ? (
        <div
          className="bookmark-modal-overlay"
          role="presentation"
          onClick={closeMoodTagModal}
        >
          <div
            className="bookmark-modal bookmark-category-modal"
            role="dialog"
            aria-modal="true"
            aria-label="기분 태그 관리"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="bookmark-modal-header">
              <div>
                <p className="bookmark-panel-eyebrow">MOOD</p>
                <h2>기분 태그</h2>
              </div>
              <button
                type="button"
                className="bookmark-text-button"
                onClick={closeMoodTagModal}
              >
                닫기
              </button>
            </header>

            {moodTagError ? (
              <p className="bookmark-error">{moodTagError}</p>
            ) : null}

            <form
              className="bookmark-category-add"
              onSubmit={(event) => {
                event.preventDefault();
                void handleAddMoodTag();
              }}
            >
              <input
                type="text"
                value={newMoodTagName}
                maxLength={40}
                placeholder="새 기분 태그"
                onChange={(event) =>
                  setNewMoodTagName(event.target.value)
                }
              />
              <button
                type="submit"
                className="bookmark-primary"
                disabled={moodTagSaving || !newMoodTagName.trim()}
              >
                추가
              </button>
            </form>

            {moodTags.length === 0 ? (
              <p className="bookmark-empty-row">
                아직 기분 태그가 없습니다.
              </p>
            ) : (
              <ul className="bookmark-category-list">
                {moodTags.map((tag) => (
                  <li key={tag.id}>
                    <span>{tag.name}</span>
                    <button
                      type="button"
                      className="bookmark-text-button is-danger"
                      disabled={moodTagSaving}
                      onClick={() => void handleDeleteMoodTag(tag)}
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="bookmark-form-hint">
              삭제한 태그를 선택한 날짜 기록은 기분 없음으로 바뀝니다.
            </p>
          </div>
        </div>
      ) : null}

      {categoryModalOpen ? (
        <div
          className="bookmark-modal-overlay"
          role="presentation"
          onClick={closeCategoryModal}
        >
          <div
            className="bookmark-modal bookmark-category-modal"
            role="dialog"
            aria-modal="true"
            aria-label="루틴 카테고리 관리"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="bookmark-modal-header">
              <div>
                <p className="bookmark-panel-eyebrow">CATEGORY</p>
                <h2>루틴 카테고리</h2>
              </div>
              <button
                type="button"
                className="bookmark-text-button"
                onClick={closeCategoryModal}
              >
                닫기
              </button>
            </header>

            {categoryError ? (
              <p className="bookmark-error">{categoryError}</p>
            ) : null}

            <form
              className="bookmark-category-add"
              onSubmit={(event) => {
                event.preventDefault();
                void handleAddCategory();
              }}
            >
              <input
                type="text"
                value={newCategoryName}
                maxLength={80}
                placeholder="새 카테고리 이름"
                onChange={(event) =>
                  setNewCategoryName(event.target.value)
                }
              />
              <button
                type="submit"
                className="bookmark-primary"
                disabled={categorySaving || !newCategoryName.trim()}
              >
                추가
              </button>
            </form>

            {categories.length === 0 ? (
              <p className="bookmark-empty-row">
                아직 카테고리가 없습니다.
              </p>
            ) : (
              <ul className="bookmark-category-list">
                {categories.map((category) => (
                  <li key={category.id}>
                    <span>{category.name}</span>
                    <button
                      type="button"
                      className="bookmark-text-button is-danger"
                      disabled={categorySaving}
                      onClick={() =>
                        void handleDeleteCategory(category)
                      }
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="bookmark-form-hint">
              카테고리를 삭제하면 해당 루틴은 미분류로 이동합니다.
            </p>
          </div>
        </div>
      ) : null}

      {historyRoutine ? (
        <div
          className="bookmark-modal-overlay"
          role="presentation"
          onClick={closeHistory}
        >
          <div
            className="bookmark-modal bookmark-history-modal"
            role="dialog"
            aria-modal="true"
            aria-label="루틴 달성 기록"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="bookmark-modal-header">
              <div>
                <p className="bookmark-panel-eyebrow">
                  {FREQUENCY_LABELS[historyRoutine.frequency]}
                </p>
                <h2>{historyRoutine.title} 달성 기록</h2>
              </div>
              <button
                type="button"
                className="bookmark-text-button"
                onClick={closeHistory}
              >
                닫기
              </button>
            </header>

            {historyLoading ? (
              <p className="bookmark-status">불러오는 중...</p>
            ) : null}
            {historyError ? (
              <p className="bookmark-error">{historyError}</p>
            ) : null}

            {historyData ? (
              <>
                {historyData.daily.length > 0 ? (
                  <section className="bookmark-history-section">
                    <div className="bookmark-history-heading">
                      <h3>최근 3개월 · 일간</h3>
                      <span>상세 기록 보관 범위</span>
                    </div>
                    <div className="bookmark-history-heatmap">
                      <div className="bookmark-history-weekdays">
                        {WEEKDAY_SHORT.map((day) => (
                          <span key={day}>{day}</span>
                        ))}
                      </div>
                      <div className="bookmark-history-days">
                        {Array.from(
                          {
                            length:
                              (parseDateKey(
                                historyData.daily[0]?.date ?? "",
                              ).getUTCDay() +
                                6) %
                              7,
                          },
                          (_, index) => (
                            <span
                              className="bookmark-history-day is-blank"
                              key={`blank-${index}`}
                            />
                          ),
                        )}
                        {historyData.daily.map((day) => (
                          <span
                            className={`bookmark-history-day ${
                              day.scheduled
                                ? day.done
                                  ? "is-done"
                                  : "is-missed"
                                : "is-off"
                            }`}
                            key={day.date}
                            title={historyDayTitle(
                              day.date,
                              day.scheduled,
                              day.done,
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="bookmark-history-legend">
                      <span>
                        <i className="is-done" />
                        완료
                      </span>
                      <span>
                        <i className="is-missed" />
                        미완료
                      </span>
                      <span>
                        <i className="is-off" />
                        예정 없음
                      </span>
                    </div>
                  </section>
                ) : (
                  <p className="bookmark-history-note">
                    일간 상세 그래프는 매일 또는 일자형 주간 루틴에서 제공됩니다.
                  </p>
                )}

                <section className="bookmark-history-section">
                  <div className="bookmark-history-heading">
                    <h3>월간 달성률</h3>
                    <span>3개월 이후는 월 단위 집계로 보관</span>
                  </div>
                  {historyData.monthly.length === 0 ? (
                    <p className="bookmark-empty-row">
                      아직 월간 집계가 없습니다.
                    </p>
                  ) : (
                    <ul className="bookmark-history-months">
                      {historyData.monthly
                        .slice()
                        .reverse()
                        .map((month) => {
                          const rate =
                            month.expected_count > 0
                              ? Math.round(
                                  (month.completed_count /
                                    month.expected_count) *
                                    100,
                                )
                              : 0;
                          return (
                            <li key={month.month_start}>
                              <span className="bookmark-history-month-label">
                                {historyMonthLabel(month.month_start)}
                              </span>
                              <div className="bookmark-history-bar">
                                <span
                                  style={{
                                    width: `${Math.min(100, rate)}%`,
                                  }}
                                />
                              </div>
                              <span className="bookmark-history-rate">
                                {month.completed_count}/
                                {month.expected_count}
                              </span>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

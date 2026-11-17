"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import {
  WEEKDAY_SHORT,
  formatTime24h,
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
  type BookmarkStatistics,
  type BookmarkRoutineStat,
  type BookmarkMoodTag,
  type BookmarkTrackingMode,
  routineScheduleLabel,
} from "@/lib/bookmark";
import { apiFetch } from "@/lib/api";
import { todayDateInputValue } from "@/lib/datetime";

import { BookmarkCalendarModal } from "./bookmark-calendar-modal";
import { BookmarkCategoryModal } from "./bookmark-category-modal";
import { BookmarkHistoryModal } from "./bookmark-history-modal";
import { BookmarkMoodTagModal } from "./bookmark-mood-tag-modal";
import { CloverRating } from "./clover-rating";
import {
  SortableCategoryItem,
  SortableMoodTagItem,
  SortableRoutineItem,
} from "./bookmark-sortable-items";
import {
  FREQUENCY_LABELS,
  MODE_LABELS,
  PERIOD_FREQUENCY,
  PERIOD_LABELS,
  PERIOD_TYPES,
  ROUTINE_SECTION_LABELS,
  STATS_COLORS,
  STATS_RANGES,
  STATS_RANGE_LABELS,
  TARGET_LABELS,
  VIEWS,
  VIEW_LABELS,
  type BookmarkView,
  type HistoryRoutine,
  type MonthlyMode,
  type StatsRange,
} from "./bookmark-types";
import {
  dateKey,
  historyDayTitle,
  historyMonthLabel,
  historyQuarterLabel,
  monthCalendarDays,
  monthLabel,
  occurrenceLabel,
  pad2,
  parseDateKey,
  periodLabel,
  quarterFromMonth,
  quarterStartMonth,
  shiftPeriod,
  startOfPeriod,
  statBucketEnd,
  statBucketLabel,
  statRangeBounds,
} from "./bookmark-utils";

import "@/public/styles/bookmark.scss";

export default function BookmarkClient({ username }: { username: string }) {
  const initialToday = todayDateInputValue();
  const [view, setView] = useState<BookmarkView>("today");
  const collapseStorageKey = `bookmark-category-collapse:${username}:${view}`;
  const [periodStart, setPeriodStart] = useState(initialToday);
  const [data, setData] = useState<BookmarkPeriod | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statistics, setStatistics] =
    useState<BookmarkStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsRange, setStatsRange] = useState<StatsRange>("month");

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
  const [editingMoodTag, setEditingMoodTag] =
    useState<BookmarkMoodTag | null>(null);
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

  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const [routineModalOpen, setRoutineModalOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] =
    useState<BookmarkRoutine | null>(null);
  const [historyRoutine, setHistoryRoutine] =
    useState<HistoryRoutine | null>(null);
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
  const [editingCategory, setEditingCategory] =
    useState<BookmarkRoutineCategory | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(
    null,
  );
  const [routineOrderSaving, setRoutineOrderSaving] = useState(false);
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
  const [routineQuarter, setRoutineQuarter] = useState(0);

  useEffect(() => {
    let next: Record<string, boolean> = {};
    try {
      const raw = window.localStorage.getItem(collapseStorageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          next = parsed as Record<string, boolean>;
        }
      }
    } catch {
      // Ignore malformed or unavailable local storage.
    }
    setCollapsedSections(next);
  }, [collapseStorageKey]);

  const setSectionCollapsed = (key: string, collapsed: boolean) => {
    setCollapsedSections((previous) => {
      const next = { ...previous, [key]: collapsed };
      try {
        window.localStorage.setItem(
          collapseStorageKey,
          JSON.stringify(next),
        );
      } catch {
        // The in-memory state still works for this session.
      }
      return next;
    });
  };

  const loadPeriod = useCallback(async () => {
    if (view === "stats") {
      setLoading(false);
      return;
    }
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
      setGoalWakeTime(formatTime24h(next.goal?.wake_time));
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

  const loadStatistics = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const next = await apiFetch<BookmarkStatistics>(
        "/api/bookmark/statistics",
        { cache: "no-store" },
      );
      setStatistics(next);
    } catch (reason) {
      setStatsError(
        reason instanceof Error
          ? reason.message
          : "통계를 불러오지 못했습니다.",
      );
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "stats") {
      void loadStatistics();
    }
  }, [loadStatistics, view]);

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
    } else if (next !== "stats") {
      setPeriodStart(
        startOfPeriod(todayDateInputValue(), next),
      );
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
      view === "today" || view === "stats" ? "day" : view;
    setPeriodStart(startOfPeriod(value, nextType));
    setCalendarOpen(false);
  };

  const routines = data?.routines ?? [];
  const recordPeriodType: BookmarkPeriodType =
    view === "today" || view === "stats" ? "day" : view;
  const unitView: BookmarkPeriodType =
    view === "today" || view === "stats" ? "day" : view;
  const isTodaySelected = periodStart === todayDateInputValue();

  const persistRoutineOrder = async (next: BookmarkRoutine[]) => {
    if (routineOrderSaving) return;
    setRoutineOrderSaving(true);
    setError(null);
    setData((previous) =>
      previous ? { ...previous, routines: next } : previous,
    );
    try {
      await apiFetch<{ success: boolean }>("/api/bookmark/routines/order", {
        method: "PUT",
        body: JSON.stringify({
          ids: next.map((routine) => routine.id),
        }),
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "루틴 순서를 변경하지 못했습니다.",
      );
      await loadPeriod();
    } finally {
      setRoutineOrderSaving(false);
    }
  };

  const handleRoutineDragEnd = (
    groupRoutines: BookmarkRoutine[],
    event: DragEndEvent,
  ) => {
    const { active, over } = event;
    if (!over || active.id === over.id || routineOrderSaving) return;
    const activeRoutine = groupRoutines.find(
      (routine) => routine.id === active.id,
    );
    const overRoutine = groupRoutines.find(
      (routine) => routine.id === over.id,
    );
    if (
      !activeRoutine ||
      !overRoutine ||
      activeRoutine.frequency !== overRoutine.frequency
    ) {
      return;
    }
    const oldIndex = groupRoutines.findIndex(
      (routine) => routine.id === active.id,
    );
    const newIndex = groupRoutines.findIndex(
      (routine) => routine.id === over.id,
    );
    if (oldIndex < 0 || newIndex < 0) return;
    const oldGlobalIndex = routines.findIndex(
      (routine) => routine.id === active.id,
    );
    const newGlobalIndex = routines.findIndex(
      (routine) => routine.id === over.id,
    );
    if (oldGlobalIndex < 0 || newGlobalIndex < 0) return;
    void persistRoutineOrder(
      arrayMove(routines, oldGlobalIndex, newGlobalIndex),
    );
  };

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
    setRoutineQuarter(0);
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
    setRoutineQuarter(
      routine.frequency === "quarterly"
        ? quarterFromMonth(routine.month)
        : 0,
    );
    setError(null);
  };

  const openHistory = async (routine: HistoryRoutine) => {
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
    setEditingCategory(null);
    setCategoryError(null);
  };

  const closeCategoryModal = () => {
    setCategoryModalOpen(false);
    setNewCategoryName("");
    setEditingCategory(null);
    setCategoryError(null);
  };

  const startEditCategory = (category: BookmarkRoutineCategory) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setCategoryError(null);
  };

  const cancelEditCategory = () => {
    setEditingCategory(null);
    setNewCategoryName("");
    setCategoryError(null);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || categorySaving) return;
    setCategorySaving(true);
    setCategoryError(null);
    try {
      if (editingCategory) {
        await apiFetch<BookmarkRoutineCategory>(
          `/api/bookmark/categories/${editingCategory.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ name: newCategoryName }),
          },
        );
        setEditingCategory(null);
      } else {
        await apiFetch<BookmarkRoutineCategory>(
          "/api/bookmark/categories",
          {
            method: "POST",
            body: JSON.stringify({ name: newCategoryName }),
          },
        );
      }
      setNewCategoryName("");
      await loadCategories();
      await loadPeriod();
    } catch (reason) {
      setCategoryError(
        reason instanceof Error
          ? reason.message
          : editingCategory
            ? "카테고리를 수정하지 못했습니다."
            : "카테고리를 추가하지 못했습니다.",
      );
    } finally {
      setCategorySaving(false);
    }
  };

  const persistCategoryOrder = async (
    next: BookmarkRoutineCategory[],
  ) => {
    if (categorySaving) return;
    setCategories(next);
    setCategorySaving(true);
    setCategoryError(null);
    try {
      const saved = await apiFetch<BookmarkRoutineCategory[]>(
        "/api/bookmark/categories/order",
        {
          method: "PUT",
          body: JSON.stringify({
            ids: next.map((category) => category.id),
          }),
        },
      );
      setCategories(saved);
    } catch (reason) {
      setCategoryError(
        reason instanceof Error
          ? reason.message
          : "카테고리 순서를 변경하지 못했습니다.",
      );
      await loadCategories();
    } finally {
      setCategorySaving(false);
    }
  };

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || categorySaving) return;
    const oldIndex = categories.findIndex(
      (category) => category.id === active.id,
    );
    const newIndex = categories.findIndex(
      (category) => category.id === over.id,
    );
    if (oldIndex < 0 || newIndex < 0) return;
    void persistCategoryOrder(
      arrayMove(categories, oldIndex, newIndex),
    );
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
      if (editingCategory?.id === category.id) {
        setEditingCategory(null);
        setNewCategoryName("");
      }
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
    editingRoutine?.frequency ?? PERIOD_FREQUENCY[unitView];

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
                  month: quarterStartMonth(routineQuarter),
                }
        : {
            weekday: null,
            weekdays: null,
            day_of_month: null,
            nth_week: null,
            month:
              modalFrequency === "quarterly"
                ? quarterStartMonth(routineQuarter)
                : null,
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
    setEditingMoodTag(null);
    setMoodTagError(null);
  };

  const startEditMoodTag = (tag: BookmarkMoodTag) => {
    setEditingMoodTag(tag);
    setNewMoodTagName(tag.name);
    setMoodTagError(null);
  };

  const cancelEditMoodTag = () => {
    setEditingMoodTag(null);
    setNewMoodTagName("");
    setMoodTagError(null);
  };

  const closeMoodTagModal = () => {
    setMoodTagModalOpen(false);
    setNewMoodTagName("");
    setEditingMoodTag(null);
    setMoodTagError(null);
  };

  const handleAddMoodTag = async () => {
    if (!newMoodTagName.trim() || moodTagSaving) return;
    setMoodTagSaving(true);
    setMoodTagError(null);
    try {
      if (editingMoodTag) {
        await apiFetch<BookmarkMoodTag>(
          `/api/bookmark/mood-tags/${editingMoodTag.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ name: newMoodTagName }),
          },
        );
        setEditingMoodTag(null);
      } else {
        await apiFetch<BookmarkMoodTag>("/api/bookmark/mood-tags", {
          method: "POST",
          body: JSON.stringify({ name: newMoodTagName }),
        });
      }
      setNewMoodTagName("");
      await loadMoodTags();
    } catch (reason) {
      setMoodTagError(
        reason instanceof Error
          ? reason.message
          : editingMoodTag
            ? "기분 태그를 수정하지 못했습니다."
            : "기분 태그를 추가하지 못했습니다.",
      );
    } finally {
      setMoodTagSaving(false);
    }
  };

  const persistMoodTagOrder = async (next: BookmarkMoodTag[]) => {
    if (moodTagSaving) return;
    setMoodTags(next);
    setMoodTagSaving(true);
    setMoodTagError(null);
    try {
      const saved = await apiFetch<BookmarkMoodTag[]>(
        "/api/bookmark/mood-tags/order",
        {
          method: "PUT",
          body: JSON.stringify({
            ids: next.map((tag) => tag.id),
          }),
        },
      );
      setMoodTags(saved);
    } catch (reason) {
      setMoodTagError(
        reason instanceof Error
          ? reason.message
          : "기분 태그 순서를 변경하지 못했습니다.",
      );
      await loadMoodTags();
    } finally {
      setMoodTagSaving(false);
    }
  };

  const handleMoodDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || moodTagSaving) return;
    const oldIndex = moodTags.findIndex(
      (tag) => tag.id === active.id,
    );
    const newIndex = moodTags.findIndex(
      (tag) => tag.id === over.id,
    );
    if (oldIndex < 0 || newIndex < 0) return;
    void persistMoodTagOrder(arrayMove(moodTags, oldIndex, newIndex));
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
      if (editingMoodTag?.id === tag.id) {
        setEditingMoodTag(null);
        setNewMoodTagName("");
      }
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
      setGoalWakeTime(formatTime24h(saved.wake_time));
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
    type RoutineSection = {
      key: string;
      name: string;
      categoryId: number | null;
      pending: BookmarkRoutine[];
      done: BookmarkRoutine[];
    };
    const buildCategorySection = (
      key: string,
      name: string,
      categoryId: number | null,
      items: BookmarkRoutine[],
    ): RoutineSection | null => {
      const pending = items.filter(
        (routine) => !isRoutineDone(routine),
      );
      const done = items.filter(isRoutineDone);
      if (pending.length === 0 && done.length === 0) return null;
      return {
        key,
        name,
        categoryId,
        pending,
        done,
      };
    };

    const sections: RoutineSection[] = categories
      .map((category) =>
        buildCategorySection(
          `category-${category.id}`,
          category.name,
          category.id,
          routines.filter(
            (routine) => routine.category_id === category.id,
          ),
        ),
      )
      .filter((section): section is RoutineSection =>
        Boolean(section),
      );
    const uncategorized = routines.filter(
      (routine) =>
        routine.category_id === null ||
        !categoryById.has(routine.category_id),
    );
    const uncategorizedSection = buildCategorySection(
      "uncategorized",
      "미분류",
      null,
      uncategorized,
    );
    if (uncategorizedSection) {
      sections.push(uncategorizedSection);
    }

    const isSectionCollapsed = (section: RoutineSection) =>
      Boolean(collapsedSections[section.key]);
    const toggleSection = (section: RoutineSection) => {
      setSectionCollapsed(section.key, !isSectionCollapsed(section));
    };

    const renderRoutineItem = (routine: BookmarkRoutine) => {
      const isDaily = routine.frequency === "daily";
      const isCount =
        routine.tracking_mode === "count" && !isDaily;
      const isStopped = Boolean(routine.end_date);
      const allDone = isRoutineDone(routine);
      return (
        <SortableRoutineItem
          key={routine.id}
          id={routine.id}
          title={routine.title}
          disabled={routineOrderSaving}
          className={`bookmark-item is-clickable${
            allDone ? " is-done" : ""
          }`}
          onClick={() => openEditRoutine(routine)}
          onKeyDown={(event) => {
            if (
              event.target === event.currentTarget &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              openEditRoutine(routine);
            }
          }}
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
              {routine.next_date ? (
                <span className="bookmark-routine-next">
                  예정 {periodLabel(routine.next_date, "day")}
                </span>
              ) : null}
            </div>

            {isCount ? (
              <div className="bookmark-routine-counter">
                {!isStopped ? (
                  <button
                    type="button"
                    className="bookmark-count-button"
                    aria-label="1회 줄이기"
                    disabled={routine.completed_count <= 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      void setRoutineCount(
                        routine,
                        routine.completed_count - 1,
                      );
                    }}
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
                    onClick={(event) => {
                      event.stopPropagation();
                      void setRoutineCount(
                        routine,
                        routine.completed_count + 1,
                      );
                    }}
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
                      onClick={(event) => event.stopPropagation()}
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
        </SortableRoutineItem>
      );
    };

    const renderRoutineList = (
      key: string,
      items: BookmarkRoutine[],
    ) => (
      <DndContext
        key={key}
        sensors={dndSensors}
        collisionDetection={closestCenter}
        onDragEnd={(event) => handleRoutineDragEnd(items, event)}
      >
        <SortableContext
          items={items.map((routine) => routine.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="bookmark-item-list">
            {items.map(renderRoutineItem)}
          </ul>
        </SortableContext>
      </DndContext>
    );

    return (
      <div className="bookmark-routine-groups">
        {sections.map((section) => {
          const collapsed = isSectionCollapsed(section);
          const total = section.pending.length + section.done.length;
          const panelId = `bookmark-routine-section-${section.key}`;

          return (
            <section
              className={`bookmark-category-group${
                collapsed ? " is-collapsed" : ""
              }`}
              key={section.key}
            >
              <header className="bookmark-category-group-header">
                <h3>
                  <button
                    type="button"
                    className="bookmark-category-group-toggle"
                    aria-expanded={!collapsed}
                    aria-controls={panelId}
                    onClick={() => toggleSection(section)}
                  >
                    <span
                      className="bookmark-category-group-arrow"
                      aria-hidden="true"
                    >
                      {collapsed ? "▸" : "▾"}
                    </span>
                    <span>{section.name}</span>
                  </button>
                </h3>
                <span>{total}</span>
              </header>

              <div id={panelId} hidden={collapsed}>
                {section.pending.length > 0
                  ? renderRoutineList(
                      `${section.key}-pending`,
                      section.pending,
                    )
                  : null}
                {section.done.length > 0 ? (
                  <div className="bookmark-routine-group is-done-group">
                    <header className="bookmark-routine-group-header">
                      <h3>
                        완료
                        <span
                          className="bookmark-routine-group-check"
                          aria-label="완료"
                        >
                          ✓
                        </span>
                      </h3>
                      <span>{section.done.length}</span>
                    </header>
                    {renderRoutineList(
                      `${section.key}-done`,
                      section.done,
                    )}
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
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

  const renderStatistics = () => {
    if (statsLoading) {
      return <p className="bookmark-status">통계를 불러오는 중...</p>;
    }
    if (statsError) {
      return <p className="bookmark-error">{statsError}</p>;
    }
    const statsRoutines = statistics?.routines ?? [];
    const categories = statistics?.categories ?? [];
    const categoryIndex = new Map(
      categories.map((category, index) => [category.id, index]),
    );
    const orderedRoutines = [...statsRoutines].sort((a, b) => {
      const aIndex = a.category_id
        ? (categoryIndex.get(a.category_id) ?? 999)
        : 999;
      const bIndex = b.category_id
        ? (categoryIndex.get(b.category_id) ?? 999)
        : 999;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.title.localeCompare(b.title);
    });
    const range = statRangeBounds(statsRange);
    const aggregationLabels = {
      week: "주간 집계",
      month: "월간 집계",
      quarter: "분기 집계",
      year: "연간 집계",
    } as const;
    const width = 760;
    const height = 250;
    const left = 42;
    const right = 14;
    const top = 14;
    const bottom = 30;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const rangeStart = parseDateKey(range.start).getTime();
    const rangeEnd = parseDateKey(range.end).getTime();
    const rangeSpan = Math.max(1, rangeEnd - rangeStart);
    const xForTime = (time: number) =>
      left + ((time - rangeStart) / rangeSpan) * plotWidth;
    const yForRate = (rate: number) =>
      top + (1 - Math.max(0, Math.min(100, rate)) / 100) * plotHeight;

    const series = orderedRoutines.map((routine, index) => {
      const points = routine.buckets
        .flatMap((bucket) => {
          const bucketStart = parseDateKey(
            bucket.period_start,
          ).getTime();
          const bucketEnd = parseDateKey(
            statBucketEnd(bucket.period_start, routine.aggregation),
          ).getTime();
          if (
            bucket.expected_count <= 0 ||
            bucketStart > rangeEnd ||
            bucketEnd < rangeStart
          ) {
            return [];
          }
          const middle =
            (Math.max(bucketStart, rangeStart) +
              Math.min(bucketEnd, rangeEnd)) /
            2;
          const rate =
            (bucket.completed_count / bucket.expected_count) * 100;
          return [
            {
              x: xForTime(middle),
              y: yForRate(rate),
              bucket,
            },
          ];
        })
        .sort((a, b) => a.x - b.x);
      return {
        routine,
        color: STATS_COLORS[index % STATS_COLORS.length],
        points,
      };
    });
    const hasData = series.some((item) => item.points.length > 0);
    const ticks = Array.from({ length: 5 }, (_, index) => {
      const time = rangeStart + (rangeSpan * index) / 4;
      const date = new Date(time);
      const label =
        statsRange === "year" || statsRange === "3years"
          ? `${date.getUTCFullYear()}.${pad2(date.getUTCMonth() + 1)}`
          : `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
      return { x: xForTime(time), label };
    });

    return (
      <section className="bookmark-panel bookmark-stats-panel">
        <header className="bookmark-panel-header bookmark-stats-header">
          <div>
            <p className="bookmark-panel-eyebrow">ROUTINE STATS</p>
            <h2>루틴 통계</h2>
          </div>
          <div className="bookmark-stats-ranges" role="tablist">
            {STATS_RANGES.map((item) => (
              <button
                type="button"
                role="tab"
                key={item}
                aria-selected={statsRange === item}
                className={statsRange === item ? "is-active" : ""}
                onClick={() => setStatsRange(item)}
              >
                {STATS_RANGE_LABELS[item]}
              </button>
            ))}
          </div>
        </header>
        <p className="bookmark-stats-hint">
          루틴을 누르면 상세 기록을 볼 수 있습니다.
        </p>
        {orderedRoutines.length === 0 ? (
          <p className="bookmark-empty-row">
            아직 통계로 볼 루틴이 없습니다.
          </p>
        ) : (
          <>
            <div className="bookmark-stats-chart-wrap">
              <svg
                className="bookmark-stats-line-chart"
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label={`${STATS_RANGE_LABELS[statsRange]} 루틴 달성률`}
              >
                {[0, 25, 50, 75, 100].map((value) => {
                  const y = yForRate(value);
                  return (
                    <g key={value}>
                      <line
                        className="bookmark-stats-grid-line"
                        x1={left}
                        x2={width - right}
                        y1={y}
                        y2={y}
                      />
                      <text
                        className="bookmark-stats-axis-label"
                        x={left - 8}
                        y={y + 3}
                        textAnchor="end"
                      >
                        {value}%
                      </text>
                    </g>
                  );
                })}
                {ticks.map((tick) => (
                  <text
                    className="bookmark-stats-axis-label"
                    key={tick.x}
                    x={tick.x}
                    y={height - 8}
                    textAnchor="middle"
                  >
                    {tick.label}
                  </text>
                ))}
                {series.map((item) => {
                  if (item.points.length === 0) return null;
                  const path = item.points
                    .map(
                      (point, index) =>
                        `${index === 0 ? "M" : "L"}${point.x} ${
                          point.y
                        }`,
                    )
                    .join(" ");
                  return (
                    <g key={item.routine.id}>
                      <path
                        className="bookmark-stats-line"
                        d={path}
                        fill="none"
                        stroke={item.color}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      >
                        <title>{item.routine.title}</title>
                      </path>
                      <path
                        d={path}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={12}
                        pointerEvents="stroke"
                        style={{ cursor: "pointer" }}
                        onClick={() =>
                          void openHistory(item.routine)
                        }
                      />
                      {item.points.map((point) => (
                        <circle
                          className="bookmark-stats-point"
                          key={`${item.routine.id}-${point.bucket.period_start}`}
                          cx={point.x}
                          cy={point.y}
                          r={2.6}
                          fill={item.color}
                          onClick={() =>
                            void openHistory(item.routine)
                          }
                        >
                          <title>
                            {item.routine.title} ·{" "}
                            {statBucketLabel(
                              point.bucket.period_start,
                              item.routine.aggregation,
                            )}{" "}
                            · {point.bucket.completed_count}/
                            {point.bucket.expected_count}
                          </title>
                        </circle>
                      ))}
                    </g>
                  );
                })}
              </svg>
              {!hasData ? (
                <p className="bookmark-empty-row">
                  이 기간에는 기록이 없습니다.
                </p>
              ) : null}
            </div>
            <div className="bookmark-stats-legend">
              {series.map((item) => (
                <button
                  type="button"
                  className={`bookmark-stats-legend-item${
                    item.points.length === 0 ? " is-empty" : ""
                  }`}
                  key={item.routine.id}
                  onClick={() => void openHistory(item.routine)}
                >
                  <i style={{ background: item.color }} />
                  <span>
                    {item.routine.title}
                    {item.routine.end_date ? (
                      <span className="bookmark-routine-status">
                        중단됨
                      </span>
                    ) : null}
                  </span>
                  <small>
                    {item.routine.category_name ?? "미분류"} ·{" "}
                    {aggregationLabels[item.routine.aggregation]} ·{" "}
                    {item.routine.retention_label}
                  </small>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    );
  };

  const isMonthlyHistory = historyRoutine?.frequency === "monthly";
  const historyBuckets = (() => {
    const rows = historyData?.monthly ?? [];
    if (!isMonthlyHistory) {
      return rows.map((row) => ({
        period_start: row.month_start,
        completed_count: row.completed_count,
        expected_count: row.expected_count,
      }));
    }
    const grouped = new Map<
      string,
      {
        period_start: string;
        completed_count: number;
        expected_count: number;
      }
    >();
    for (const row of rows) {
      const quarterStart = startOfPeriod(row.month_start, "quarter");
      const current = grouped.get(quarterStart);
      if (current) {
        current.completed_count += row.completed_count;
        current.expected_count += row.expected_count;
      } else {
        grouped.set(quarterStart, {
          period_start: quarterStart,
          completed_count: row.completed_count,
          expected_count: row.expected_count,
        });
      }
    }
    return [...grouped.values()].sort((a, b) =>
      a.period_start.localeCompare(b.period_start),
    );
  })();

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
          ) : view === "stats" ? (
            <span className="bookmark-today-date">루틴 통계</span>
          ) : (
            <span className="bookmark-today-date">
              {periodLabel(periodStart, unitView)}
            </span>
          )}
        </div>

        {error ? <p className="bookmark-error">{error}</p> : null}

        {loading ? (
          <p className="bookmark-status">불러오는 중...</p>
        ) : view === "stats" ? (
          renderStatistics()
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
                  </div>
                  <div className="bookmark-day-meta-actions">
                    <button
                      type="button"
                      className="bookmark-text-button"
                      onClick={openMoodTagModal}
                    >
                      태그 관리
                    </button>
                    <button
                      type="button"
                      className="bookmark-primary bookmark-day-meta-save"
                      disabled={dayMetaSaving}
                      onClick={() => void handleSaveDayMeta()}
                    >
                      {dayMetaSaving ? "저장 중..." : "저장"}
                    </button>
                  </div>
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
        <BookmarkCalendarModal
          month={calendarMonth}
          hoverDate={calendarHoverDate}
          periodStart={periodStart}
          onMonthChange={setCalendarMonth}
          onHoverDateChange={setCalendarHoverDate}
          onSelectDate={selectCalendarDate}
          onClose={() => setCalendarOpen(false)}
          calendarRange={calendarRange}
        />
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
                        {modalFrequency === "quarterly" ? (
                          <div className="bookmark-schedule-row">
                            <label>
                              <span>분기</span>
                              <select
                                value={routineQuarter}
                                onChange={(event) =>
                                  setRoutineQuarter(
                                    Number(event.target.value),
                                  )
                                }
                              >
                                <option value={0}>매분기</option>
                                {[1, 2, 3, 4].map((quarter) => (
                                  <option
                                    value={quarter}
                                    key={quarter}
                                  >
                                    {quarter}분기
                                  </option>
                                ))}
                              </select>
                            </label>
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
                          </div>
                        ) : (
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
                        )}
                        <p className="bookmark-form-hint">
                          {modalFrequency === "weekly"
                            ? "이번 주에 몇 회 수행할지 정합니다."
                            : modalFrequency === "monthly"
                              ? "이번 달에 몇 회 수행할지 정합니다."
                              : modalFrequency === "quarterly"
                                ? routineQuarter > 0
                                  ? `${routineQuarter}분기에 몇 회 수행할지 정합니다.`
                                  : "매분기 몇 회 수행할지 정합니다."
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
                          <>
                            <label>
                              <span>분기</span>
                              <select
                                value={routineQuarter}
                                onChange={(event) =>
                                  setRoutineQuarter(
                                    Number(event.target.value),
                                  )
                                }
                              >
                                <option value={0}>매분기</option>
                                {[1, 2, 3, 4].map((quarter) => (
                                  <option
                                    value={quarter}
                                    key={quarter}
                                  >
                                    {quarter}분기
                                  </option>
                                ))}
                              </select>
                            </label>
                            <p className="bookmark-form-hint">
                              {routineQuarter > 0
                                ? `${routineQuarter}분기에 1회 체크하는 루틴입니다.`
                                : "매분기 1회 체크하는 루틴입니다."}
                            </p>
                          </>
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
        <BookmarkMoodTagModal
          error={moodTagError}
          editingTag={editingMoodTag}
          name={newMoodTagName}
          saving={moodTagSaving}
          tags={moodTags}
          sensors={dndSensors}
          onNameChange={setNewMoodTagName}
          onClose={closeMoodTagModal}
          onSubmitTag={() => void handleAddMoodTag()}
          onCancelEdit={cancelEditMoodTag}
          onDragEnd={handleMoodDragEnd}
          onEdit={startEditMoodTag}
          onDelete={(tag) => void handleDeleteMoodTag(tag)}
        />
      ) : null}
      {categoryModalOpen ? (
        <BookmarkCategoryModal
          error={categoryError}
          editingCategory={editingCategory}
          name={newCategoryName}
          saving={categorySaving}
          categories={categories}
          sensors={dndSensors}
          onNameChange={setNewCategoryName}
          onClose={closeCategoryModal}
          onSubmitCategory={() => void handleAddCategory()}
          onCancelEdit={cancelEditCategory}
          onDragEnd={handleCategoryDragEnd}
          onEdit={startEditCategory}
          onDelete={(category) => void handleDeleteCategory(category)}
        />
      ) : null}

      {historyRoutine ? (
        <BookmarkHistoryModal
          routine={historyRoutine}
          data={historyData}
          loading={historyLoading}
          error={historyError}
          buckets={historyBuckets}
          isMonthlyHistory={isMonthlyHistory}
          onClose={closeHistory}
        />
      ) : null}
    </div>
  );
}

import {
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { apiFetch } from "@/lib/api";
import {
  routineWeekdays,
  type BookmarkPeriod,
  type BookmarkPeriodType,
  type BookmarkRoutine,
  type BookmarkTrackingMode,
} from "@/lib/bookmark";

import type { MonthlyMode } from "./bookmark-types";
import { PERIOD_FREQUENCY } from "./bookmark-types";
import {
  quarterFromMonth,
  quarterStartMonth,
} from "./bookmark-utils";

interface UseBookmarkRoutinesOptions {
  routines: BookmarkRoutine[];
  unitView: BookmarkPeriodType;
  setData: Dispatch<SetStateAction<BookmarkPeriod | null>>;
  loadPeriod: () => Promise<void>;
  onError: (message: string | null) => void;
}

export function useBookmarkRoutines({
  routines,
  unitView,
  setData,
  loadPeriod,
  onError,
}: UseBookmarkRoutinesOptions) {
  const [routineModalOpen, setRoutineModalOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] =
    useState<BookmarkRoutine | null>(null);
  const [itemTitle, setItemTitle] = useState("");
  const [itemNotes, setItemNotes] = useState("");
  const [itemSaving, setItemSaving] = useState(false);
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
  const [routineWindowStart, setRoutineWindowStart] = useState(1);
  const [routineWindowEnd, setRoutineWindowEnd] = useState(31);

  const persistRoutineOrder = async (next: BookmarkRoutine[]) => {
    if (routineOrderSaving) return;
    setRoutineOrderSaving(true);
    onError(null);
    setData((previous) =>
      previous ? { ...previous, routines: next } : previous,
    );
    try {
      await apiFetch<{ success: boolean }>(
        "/api/bookmark/routines/order",
        {
          method: "PUT",
          body: JSON.stringify({
            ids: next.map((routine) => routine.id),
          }),
        },
      );
    } catch (reason) {
      onError(
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
    const frequency = PERIOD_FREQUENCY[unitView];
    setRoutineWindowStart(frequency === "weekly" ? 0 : 1);
    setRoutineWindowEnd(
      frequency === "weekly" ? 6 : frequency === "yearly" ? 12 : 31,
    );
    onError(null);
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
    setRoutineWindowStart(
      routine.window_start ??
        (routine.frequency === "weekly" ? 0 : 1),
    );
    setRoutineWindowEnd(
      routine.window_end ??
        (routine.frequency === "weekly"
          ? 6
          : routine.frequency === "yearly"
            ? 12
            : 31),
    );
    onError(null);
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
      onError("매주 반복할 요일을 하나 이상 선택해주세요.");
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
            window_start:
              modalFrequency === "weekly" ||
              modalFrequency === "monthly" ||
              modalFrequency === "yearly"
                ? routineWindowStart
                : null,
            window_end:
              modalFrequency === "weekly" ||
              modalFrequency === "monthly" ||
              modalFrequency === "yearly"
                ? routineWindowEnd
                : null,
          };

    setItemSaving(true);
    onError(null);
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
      onError(
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
    onError(null);
    try {
      await apiFetch<BookmarkRoutine>(
        `/api/bookmark/routines/${editingRoutine.id}/stop`,
        { method: "POST" },
      );
      closeRoutineModal();
      await loadPeriod();
    } catch (reason) {
      onError(
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
    onError(null);
    try {
      await apiFetch(`/api/bookmark/routines/${editingRoutine.id}`, {
        method: "DELETE",
      });
      closeRoutineModal();
      await loadPeriod();
    } catch (reason) {
      onError(
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
    onError(null);
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
      onError(
        reason instanceof Error
          ? reason.message
          : "루틴 달성 횟수를 변경하지 못했습니다.",
      );
      await loadPeriod();
    }
  };

  const toggleRoutineNote = async (
    routine: BookmarkRoutine,
    noteIndex: number,
  ) => {
    const lines = (routine.notes ?? "").split("\n");
    const line = lines[noteIndex];
    if (line === undefined) return;
    const match = line.match(
      /^(\s*(?:[-*]\s+)?\[)([ xX]?)(\]\s*)(.*)$/,
    );
    if (!match) return;
    const checked = match[2].toLowerCase() === "x";
    lines[noteIndex] = `${match[1]}${checked ? " " : "x"}${
      match[3]
    }${match[4]}`;
    const notes = lines.join("\n");

    onError(null);
    setData((previous) =>
      previous
        ? {
            ...previous,
            routines: previous.routines.map((current) =>
              current.id === routine.id
                ? { ...current, notes }
                : current,
            ),
          }
        : previous,
    );
    try {
      await apiFetch<BookmarkRoutine>(
        `/api/bookmark/routines/${routine.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ notes }),
        },
      );
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "루틴 메모를 변경하지 못했습니다.",
      );
      await loadPeriod();
    }
  };

  const setRoutineDone = async (
    routine: BookmarkRoutine,
    done: boolean,
  ) => {
    const isDaily = routine.frequency === "daily";
    const isCount = routine.tracking_mode === "count" && !isDaily;
    if (isCount) {
      onError(null);
      setData((previous) =>
        previous
          ? {
              ...previous,
              routines: previous.routines.map((current) =>
                current.id === routine.id
                  ? { ...current, manual_done: done }
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
              count: routine.completed_count,
              manual_done: done,
            }),
          },
        );
      } catch (reason) {
        onError(
          reason instanceof Error
            ? reason.message
            : "루틴 체크 상태를 변경하지 못했습니다.",
        );
        await loadPeriod();
      }
      return;
    }

    const targets = routine.occurrences.filter(
      (occurrence) => occurrence.done !== done,
    );
    if (targets.length === 0) return;

    const nextCompleted = Math.max(
      0,
      Math.min(
        routine.target_count,
        routine.completed_count + (done ? targets.length : -targets.length),
      ),
    );
    onError(null);
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
                      targets.some(
                        (target) => target.date === occurrence.date,
                      )
                        ? { ...occurrence, done }
                        : occurrence,
                    ),
                  }
                : current,
            ),
          }
        : previous,
    );

    try {
      for (const occurrence of targets) {
        const periodType =
          routine.frequency === "daily" ||
          routine.frequency === "weekly"
            ? "day"
            : routine.period_type;
        const periodStart =
          routine.frequency === "daily" ||
          routine.frequency === "weekly"
            ? occurrence.date
            : routine.period_start;
        await apiFetch<BookmarkRoutine>(
          `/api/bookmark/routines/${routine.id}/check`,
          {
            method: "PUT",
            body: JSON.stringify({
              period_type: periodType,
              period_start: periodStart,
              count: done ? 1 : 0,
            }),
          },
        );
      }
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "루틴 체크 상태를 변경하지 못했습니다.",
      );
      await loadPeriod();
    }
  };

  return {
    routineModalOpen,
    editingRoutine,
    itemTitle,
    setItemTitle,
    itemNotes,
    setItemNotes,
    itemSaving,
    routineOrderSaving,
    routineCategoryId,
    setRoutineCategoryId,
    routineMode,
    setRoutineMode,
    routineTarget,
    setRoutineTarget,
    routineWeekday,
    setRoutineWeekday,
    routineWeekdaySelection,
    monthlyMode,
    setMonthlyMode,
    routineDayOfMonth,
    setRoutineDayOfMonth,
    routineNthWeek,
    setRoutineNthWeek,
    routineMonth,
    setRoutineMonth,
    routineQuarter,
    setRoutineQuarter,
    routineWindowStart,
    setRoutineWindowStart,
    routineWindowEnd,
    setRoutineWindowEnd,
    modalFrequency,
    openCreateRoutine,
    openEditRoutine,
    closeRoutineModal,
    handleSaveRoutine,
    toggleRoutineWeekday,
    handleStopRoutine,
    handleDeleteRoutine,
    handleRoutineDragEnd,
    setRoutineCount,
    setRoutineDone,
    toggleRoutineNote,
  };
}

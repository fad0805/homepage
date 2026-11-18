import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { apiFetch } from "@/lib/api";
import type { BookmarkPeriod } from "@/lib/bookmark";

import type {
  PlannerColor,
  PlannerColorsResponse,
  PlannerEvent,
  PlannerEventsResponse,
  PlannerTask,
  PlannerTasksResponse,
  TaskFormState,
} from "./planner-types";
import {
  emptyForm,
  monthBounds,
  monthCells,
  sortTasks,
} from "./planner-utils";

interface UsePlannerDataOptions {
  initialDate: string;
  viewMonth: string;
  selectedDate: string;
  setViewMonth: Dispatch<SetStateAction<string>>;
  setSelectedDate: Dispatch<SetStateAction<string>>;
  setSearchFrom: Dispatch<SetStateAction<string>>;
  setSearchTo: Dispatch<SetStateAction<string>>;
  setForm: Dispatch<SetStateAction<TaskFormState>>;
  onError: (message: string | null) => void;
}

export function usePlannerData({
  initialDate,
  viewMonth,
  selectedDate,
  setViewMonth,
  setSelectedDate,
  setSearchFrom,
  setSearchTo,
  setForm,
  onError,
}: UsePlannerDataOptions) {
  const [today, setToday] = useState(initialDate);
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [savedColors, setSavedColors] = useState<PlannerColor[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [dayBookmark, setDayBookmark] =
    useState<BookmarkPeriod | null>(null);
  const initializedToday = useRef(false);
  const tasksRequestRef = useRef(0);
  const eventsRequestRef = useRef(0);

  const loadTasks = useCallback(
    async (monthKey: string) => {
      const requestId = ++tasksRequestRef.current;
      const visibleCells = monthCells(monthKey);
      const start = visibleCells[0].date;
      const end = visibleCells[visibleCells.length - 1].date;
      try {
        const data = await apiFetch<PlannerTasksResponse>(
          `/api/planner/tasks?start=${start}&end=${end}`,
          { cache: "no-store" },
        );
        if (requestId !== tasksRequestRef.current) return;
        setToday(data.today);
        setTasks(sortTasks(data.tasks));
        if (!initializedToday.current) {
          initializedToday.current = true;
          const bounds = monthBounds(data.today.slice(0, 7));
          setSelectedDate(data.today);
          setViewMonth(data.today.slice(0, 7));
          setSearchFrom(bounds.start);
          setSearchTo(bounds.end);
          setForm((previous) =>
            previous.title || previous.notes
              ? previous
              : emptyForm(data.today),
          );
        }
        onError(null);
      } catch (reason) {
        if (requestId !== tasksRequestRef.current) return;
        onError(
          reason instanceof Error
            ? reason.message
            : "일정을 불러오지 못했습니다.",
        );
      } finally {
        if (requestId === tasksRequestRef.current) {
          setLoading(false);
        }
      }
    },
    [
      onError,
      setForm,
      setSearchFrom,
      setSearchTo,
      setSelectedDate,
      setViewMonth,
    ],
  );

  const loadColors = useCallback(async () => {
    try {
      const data = await apiFetch<PlannerColorsResponse>(
        "/api/planner/colors",
        { cache: "no-store" },
      );
      setSavedColors(data.colors);
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "저장된 색상을 불러오지 못했습니다.",
      );
    }
  }, [onError]);

  const loadEvents = useCallback(
    async (monthKey: string) => {
      const requestId = ++eventsRequestRef.current;
      const visibleCells = monthCells(monthKey);
      const start = visibleCells[0].date;
      const end = visibleCells[visibleCells.length - 1].date;
      setEventsLoading(true);
      try {
        const data = await apiFetch<PlannerEventsResponse>(
          `/api/planner/events?start=${start}&end=${end}`,
          { cache: "no-store" },
        );
        if (requestId !== eventsRequestRef.current) return;
        setEvents(data.events);
      } catch (reason) {
        if (requestId !== eventsRequestRef.current) return;
        onError(
          reason instanceof Error
            ? reason.message
            : "이력을 불러오지 못했습니다.",
        );
      } finally {
        if (requestId === eventsRequestRef.current) {
          setEventsLoading(false);
        }
      }
    },
    [onError],
  );

  const loadDayBookmark = useCallback(async (date: string) => {
    try {
      const data = await apiFetch<BookmarkPeriod>(
        `/api/bookmark?period_type=day&period_start=${date}`,
        { cache: "no-store" },
      );
      setDayBookmark(data);
    } catch {
      setDayBookmark(null);
    }
  }, []);

  useEffect(() => {
    void loadTasks(viewMonth);
  }, [loadTasks, viewMonth]);

  useEffect(() => {
    void loadColors();
  }, [loadColors]);

  useEffect(() => {
    void loadEvents(viewMonth);
  }, [loadEvents, viewMonth]);

  useEffect(() => {
    void loadDayBookmark(selectedDate);
  }, [loadDayBookmark, selectedDate]);

  const refreshData = useCallback(async () => {
    await Promise.all([
      loadTasks(viewMonth),
      loadEvents(viewMonth),
      loadColors(),
    ]);
  }, [loadColors, loadEvents, loadTasks, viewMonth]);

  return {
    today,
    setToday,
    tasks,
    setTasks,
    events,
    setEvents,
    savedColors,
    setSavedColors,
    loading,
    eventsLoading,
    dayBookmark,
    loadTasks,
    loadColors,
    loadEvents,
    refreshData,
  };
}

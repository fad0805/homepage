"use client";

import Link from "next/link";
import {
  DragEvent as ReactDragEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { CloverIcon } from "@/app/bookmark/clover-rating";
import { apiFetch } from "@/lib/api";
import {
  formatTime24h,
  type BookmarkPeriod,
} from "@/lib/bookmark";
import {
  dateInputValue,
  formatDateTime,
  todayDateInputValue,
} from "@/lib/datetime";

import "@/public/styles/planner.scss";

import { PlannerCalendar } from "./planner-calendar";
import { PlannerDayDetail } from "./planner-day-detail";
import { PlannerHistoryList } from "./planner-history-list";
import { PlannerTaskCard } from "./planner-task-card";
import { PlannerChipManager } from "./planner-chip-manager";
import { PlannerColorPanel } from "./planner-color-panel";
import { PlannerDatePanel } from "./planner-date-panel";
import { PlannerEventPreviewModal } from "./planner-event-preview-modal";
import { PlannerInactivePanel } from "./planner-inactive-panel";
import { PlannerMonthPicker } from "./planner-month-picker";
import { PlannerSearchPanel } from "./planner-search-panel";
import { PlannerSpecialModal } from "./planner-special-modal";
import { PlannerTaskDetailModal } from "./planner-task-detail-modal";
import { PlannerTaskModal } from "./planner-task-modal";
import { MagnifierIcon } from "./planner-icons";
import {
  NOTE_CHECK_LINE_RE,
  PlannerNoteContent,
} from "./planner-note-content";
import {
  ACTION_LABELS,
  DEFAULT_TASK_COLOR,
  ENTITY_LABELS,
  FIELD_LABELS,
  UNASSIGNED_TASK_COLOR,
  type CalendarCell,
  type CalendarWeek,
  type PlannerColor,
  type PlannerColorsResponse,
  type PlannerEvent,
  type PlannerEventChange,
  type PlannerEventPreview,
  type PlannerEventsResponse,
  type PlannerSearchResults,
  type PlannerSpecialDate,
  type PlannerSpecialDatesResponse,
  type PlannerTab,
  type PlannerTask,
  type PlannerTasksResponse,
  type RangeSegment,
  type ScheduleType,
  type SpecialDateKind,
  type SpecialModalTab,
  type TaskFormState,
  type TaskScheduleType,
  type TaskStatus,
} from "./planner-types";
import {
  addDays,
  buildCalendarWeeks,
  changeValue,
  colorGroupLabel,
  emptyForm,
  eventDate,
  fieldLabel,
  formatDateOnly,
  formatDayLabel,
  monthBounds,
  monthCells,
  orderedRange,
  pad2,
  shiftMonth,
  sortColorGroupTasks,
  sortTasks,
  specialDateAppearsOn,
  specialDdayLabel,
  taskAppearsOn,
  taskColor,
} from "./planner-utils";

export default function PlannerClient({ username }: { username: string }) {
  const initialToday = todayDateInputValue();
  const initialSearchBounds = monthBounds(initialToday.slice(0, 7));
  const [today, setToday] = useState(initialToday);
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [savedColors, setSavedColors] = useState<PlannerColor[]>([]);
  const [specialDates, setSpecialDates] = useState<PlannerSpecialDate[]>([]);
  const [specialTab, setSpecialTab] = useState<SpecialModalTab>("form");
  const [specialSearch, setSpecialSearch] = useState("");
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerYear, setMonthPickerYear] = useState(
    Number(initialToday.slice(0, 4)),
  );
  const [monthPickerMonth, setMonthPickerMonth] = useState(
    Number(initialToday.slice(5, 7)),
  );
  const [specialModalOpen, setSpecialModalOpen] = useState(false);
  const [editingSpecialId, setEditingSpecialId] = useState<number | null>(
    null,
  );
  const [specialKind, setSpecialKind] =
    useState<SpecialDateKind>("yearly");
  const [specialTitle, setSpecialTitle] = useState("");
  const [specialEventDate, setSpecialEventDate] = useState(initialToday);
  const [specialMonth, setSpecialMonth] = useState(1);
  const [specialDay, setSpecialDay] = useState(1);
  const [specialPinned, setSpecialPinned] = useState(false);
  const [specialSaving, setSpecialSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(initialToday);
  const [dragRange, setDragRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const dragStartRef = useRef<string | null>(null);
  const dragCurrentRef = useRef<string | null>(null);
  const [viewMonth, setViewMonth] = useState(initialToday.slice(0, 7));
  const [activeTab, setActiveTab] = useState<PlannerTab>("active");
  const [searchFrom, setSearchFrom] = useState(initialSearchBounds.start);
  const [searchTo, setSearchTo] = useState(initialSearchBounds.end);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] =
    useState<PlannerSearchResults | null>(null);
  const [form, setForm] = useState<TaskFormState>(() => emptyForm(initialToday));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [noteSavingId, setNoteSavingId] = useState<number | null>(null);
  const [colorSaving, setColorSaving] = useState(false);
  const [colorOrderSaving, setColorOrderSaving] = useState(false);
  const [newChipColor, setNewChipColor] = useState(DEFAULT_TASK_COLOR);
  const [showChipCreator, setShowChipCreator] = useState(false);
  const [chipManagerOpen, setChipManagerOpen] = useState(false);
  const [draggingColorId, setDraggingColorId] = useState<
    number | null
  >(null);
  const draggingColorIdRef = useRef<number | null>(null);
  const [dragOverColorId, setDragOverColorId] = useState<
    number | null
  >(null);
  const [newChipName, setNewChipName] = useState("");
  const [editingColorId, setEditingColorId] = useState<
    number | null
  >(null);
  const [editChipColor, setEditChipColor] =
    useState(DEFAULT_TASK_COLOR);
  const [editChipName, setEditChipName] = useState("");
  const [chipSaving, setChipSaving] = useState(false);
  const [deletingColorId, setDeletingColorId] = useState<
    number | null
  >(null);
  const [selectedColorGroups, setSelectedColorGroups] = useState<
    string[]
  >([]);
  const [inactiveFilterOpen, setInactiveFilterOpen] = useState(false);
  const [inactiveColorFilter, setInactiveColorFilter] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [recordCompleted, setRecordCompleted] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<PlannerEvent | null>(null);
  const [selectedTask, setSelectedTask] = useState<PlannerTask | null>(null);
  const [dayBookmark, setDayBookmark] =
    useState<BookmarkPeriod | null>(null);
  const [preview, setPreview] = useState<PlannerEventPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const initializedToday = useRef(false);
  const eventsRequestRef = useRef(0);

  const loadTasks = useCallback(async () => {
    try {
      const data = await apiFetch<PlannerTasksResponse>("/api/planner/tasks", {
        cache: "no-store",
      });
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
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "일정을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadColors = useCallback(async () => {
    try {
      const data = await apiFetch<PlannerColorsResponse>(
        "/api/planner/colors",
        { cache: "no-store" },
      );
      setSavedColors(data.colors);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "저장된 색상을 불러오지 못했습니다.",
      );
    }
  }, []);

  const loadSpecialDates = useCallback(async () => {
    try {
      const data = await apiFetch<PlannerSpecialDatesResponse>(
        "/api/bookmark/special-dates",
        { cache: "no-store" },
      );
      setSpecialDates(data.special_dates);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "기념일을 불러오지 못했습니다.",
      );
    }
  }, []);

  const loadEvents = useCallback(async (monthKey: string) => {
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
      setError(
        reason instanceof Error
          ? reason.message
          : "이력을 불러오지 못했습니다.",
      );
    } finally {
      if (requestId === eventsRequestRef.current) {
        setEventsLoading(false);
      }
    }
  }, []);

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
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadColors();
  }, [loadColors]);

  useEffect(() => {
    void loadSpecialDates();
  }, [loadSpecialDates]);

  useEffect(() => {
    void loadEvents(viewMonth);
  }, [loadEvents, viewMonth]);

  useEffect(() => {
    void loadDayBookmark(selectedDate);
  }, [loadDayBookmark, selectedDate]);

  useEffect(() => {
    if (activeTab === "colors") return;
    setSelectedColorGroups([]);
    setShowChipCreator(false);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "inactive") {
      setInactiveFilterOpen(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (
      !selectedEvent &&
      !selectedTask &&
      !taskModalOpen &&
      !chipManagerOpen &&
      !monthPickerOpen &&
      !specialModalOpen
    ) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedEvent) {
        setSelectedEvent(null);
        setPreview(null);
        return;
      }
      if (selectedTask) {
        setSelectedTask(null);
        setError(null);
        return;
      }
      if (taskModalOpen) {
        setTaskModalOpen(false);
        setEditingId(null);
        setForm(emptyForm(today));
        setError(null);
        return;
      }
      if (chipManagerOpen) {
        setChipManagerOpen(false);
        setEditingColorId(null);
        setEditChipName("");
        draggingColorIdRef.current = null;
        setDraggingColorId(null);
        setDragOverColorId(null);
        setError(null);
        return;
      }
      if (monthPickerOpen) {
        setMonthPickerOpen(false);
        return;
      }
      if (specialModalOpen) {
        setSpecialModalOpen(false);
        setSpecialTab("form");
        setSpecialSearch("");
        setEditingSpecialId(null);
        setSpecialTitle("");
        setSpecialKind("yearly");
        setError(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedEvent,
    selectedTask,
    taskModalOpen,
    chipManagerOpen,
    monthPickerOpen,
    specialModalOpen,
    today,
  ]);

  const cells = useMemo(() => monthCells(viewMonth), [viewMonth]);
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
  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status === "active"),
    [tasks],
  );
  const colorViewTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status === "active" || task.status === "inactive",
      ),
    [tasks],
  );
  const calendarTasks = useMemo(() => {
    if (
      activeTab !== "colors" ||
      selectedColorGroups.length === 0
    ) {
      return activeTasks;
    }
    const selected = new Set(selectedColorGroups);
    return activeTasks.filter((task) =>
      selected.has(
        task.color_id ? `chip:${task.color_id}` : "unassigned",
      ),
    );
  }, [activeTab, activeTasks, selectedColorGroups]);
  const weeks = useMemo(
    () => buildCalendarWeeks(cells, calendarTasks),
    [cells, calendarTasks],
  );
  const inactiveTasks = useMemo(
    () => tasks.filter((task) => task.status === "inactive"),
    [tasks],
  );
  const trashedTasks = useMemo(
    () => tasks.filter((task) => task.status === "trashed"),
    [tasks],
  );
  const inactiveColorGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        color: string;
        name: string | null;
        tasks: PlannerTask[];
      }
    >();
    for (const task of inactiveTasks) {
      const key = task.color_id
        ? `chip:${task.color_id}`
        : "unassigned";
      const saved = savedColors.find(
        (color) => color.id === task.color_id,
      );
      const group = groups.get(key);
      if (group) {
        group.tasks.push(task);
      } else {
        groups.set(key, {
          key,
          color:
            task.color || saved?.color || UNASSIGNED_TASK_COLOR,
          name: saved?.name || null,
          tasks: [task],
        });
      }
    }
    const savedOrder = new Map(
      savedColors.map((color, index) => [color.id, index]),
    );
    return Array.from(groups.values()).sort((a, b) => {
      const aUnassigned = a.key === "unassigned";
      const bUnassigned = b.key === "unassigned";
      if (aUnassigned !== bUnassigned) {
        return aUnassigned ? 1 : -1;
      }
      const aChip = a.key.startsWith("chip:")
        ? Number(a.key.slice(5))
        : null;
      const bChip = b.key.startsWith("chip:")
        ? Number(b.key.slice(5))
        : null;
      const aIndex =
        aChip === null
          ? Number.MAX_SAFE_INTEGER
          : (savedOrder.get(aChip) ?? Number.MAX_SAFE_INTEGER);
      const bIndex =
        bChip === null
          ? Number.MAX_SAFE_INTEGER
          : (savedOrder.get(bChip) ?? Number.MAX_SAFE_INTEGER);
      return (
        aIndex - bIndex ||
        a.color.localeCompare(b.color) ||
        a.key.localeCompare(b.key)
      );
    });
  }, [inactiveTasks, savedColors]);
  const selectedInactiveGroup =
    inactiveColorGroups.find(
      (group) => group.key === inactiveColorFilter,
    ) ?? null;
  const visibleInactiveTasks = selectedInactiveGroup
    ? selectedInactiveGroup.tasks
    : inactiveTasks;

  useEffect(() => {
    if (!inactiveColorFilter) return;
    if (
      !inactiveColorGroups.some(
        (group) => group.key === inactiveColorFilter,
      )
    ) {
      setInactiveColorFilter(null);
    }
  }, [inactiveColorGroups, inactiveColorFilter]);
  const selectedTasks = useMemo(
    () =>
      sortTasks(
        activeTasks.filter((task) =>
          taskAppearsOn(task, selectedDate, today),
        ),
      ),
    [activeTasks, selectedDate, today],
  );
  const selectedEvents = useMemo(
    () =>
      events
        .filter((event) => eventDate(event) === selectedDate)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    [events, selectedDate],
  );
  const selectedSpecialDates = useMemo(
    () =>
      specialDates.filter((item) =>
        specialDateAppearsOn(item, selectedDate),
      ),
    [specialDates, selectedDate],
  );
  const ddaySpecialDates = useMemo(
    () => specialDates.filter((item) => item.kind === "dday"),
    [specialDates],
  );
  const editingSpecial =
    editingSpecialId === null
      ? null
      : specialDates.find((item) => item.id === editingSpecialId) ??
        null;
  const filteredSpecialDates = useMemo(() => {
    const query = specialSearch.trim().toLowerCase();
    if (!query) return ddaySpecialDates;
    return ddaySpecialDates.filter((item) =>
      item.title.toLowerCase().includes(query),
    );
  }, [ddaySpecialDates, specialSearch]);
  const upcomingDdays = useMemo(() => {
    const candidates = ddaySpecialDates.filter(
      (item) =>
        item.event_date !== null &&
        !specialDateAppearsOn(item, selectedDate),
    );
    const upcoming = candidates
      .filter((item) => (item.event_date ?? "") >= today)
      .sort((a, b) =>
        (a.event_date ?? "").localeCompare(b.event_date ?? ""),
      )
      .slice(0, 3);
    const pinnedPast = candidates
      .filter(
        (item) =>
          (item.event_date ?? "") < today && item.pinned,
      )
      .sort((a, b) =>
        (b.event_date ?? "").localeCompare(a.event_date ?? ""),
      )
      .slice(0, 3);
    return [...upcoming, ...pinnedPast];
  }, [ddaySpecialDates, selectedDate, today]);
  const eventDates = useMemo(
    () => new Set(events.map(eventDate)),
    [events],
  );
  const colorGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        color: string | null;
        name: string | null;
        tasks: PlannerTask[];
      }
    >();
    for (const task of activeTasks) {
      const key = task.color_id
        ? `chip:${task.color_id}`
        : "unassigned";
      const saved = savedColors.find(
        (color) => color.id === task.color_id,
      );
      const color = task.color || saved?.color || UNASSIGNED_TASK_COLOR;
      const group = groups.get(key) ?? {
        color,
        name: saved?.name || null,
        tasks: [],
      };
      if (!group.name && saved?.name) {
        group.name = saved.name;
      }
      group.tasks.push(task);
      groups.set(key, group);
    }
    for (const saved of savedColors) {
      const key = `chip:${saved.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          color: saved.color,
          name: saved.name,
          tasks: [],
        });
      }
    }
    const savedOrder = new Map(
      savedColors.map((color, index) => [color.id, index]),
    );
    return Array.from(groups.entries())
      .map(([key, group]) => ({
        key,
        color: group.color,
        name: group.name,
        tasks: sortColorGroupTasks(group.tasks),
      }))
      .sort((a, b) => {
        const aUnassigned = a.key === "unassigned";
        const bUnassigned = b.key === "unassigned";
        if (aUnassigned !== bUnassigned) {
          return aUnassigned ? 1 : -1;
        }
        const aChip = a.key.startsWith("chip:")
          ? Number(a.key.slice(5))
          : null;
        const bChip = b.key.startsWith("chip:")
          ? Number(b.key.slice(5))
          : null;
        const aIndex =
          aChip === null
            ? Number.MAX_SAFE_INTEGER
            : (savedOrder.get(aChip) ?? Number.MAX_SAFE_INTEGER);
        const bIndex =
          bChip === null
            ? Number.MAX_SAFE_INTEGER
            : (savedOrder.get(bChip) ?? Number.MAX_SAFE_INTEGER);
        return (
          aIndex - bIndex ||
          (a.color || "").localeCompare(b.color || "") ||
          a.key.localeCompare(b.key)
        );
      });
  }, [activeTasks, savedColors]);

  useEffect(() => {
    const available = new Set(colorGroups.map((group) => group.key));
    setSelectedColorGroups((previous) => {
      const next = previous.filter((key) => available.has(key));
      return next.length === previous.length ? previous : next;
    });
  }, [colorGroups]);
  const selectedColorGroup =
    colorGroups.find(
      (group) => group.key === selectedColorGroups[0],
    ) ?? null;
  const selectedFormColor =
    savedColors.find((color) => color.id === form.colorId) ?? null;
  const selectedTaskColor = selectedTask
    ? (savedColors.find(
        (color) => color.id === selectedTask.color_id,
      ) ?? null)
    : null;
  const defaultSearchBounds = monthBounds(viewMonth);
  const hasSearchFilter =
    searchOpen ||
    searchQuery.trim() !== "" ||
    searchFrom !== defaultSearchBounds.start ||
    searchTo !== defaultSearchBounds.end;
  const dragBounds = dragRange
    ? orderedRange(dragRange.start, dragRange.end)
    : null;

  const resetForm = () => {
    setEditingId(null);
    setRecordCompleted(false);
    setForm(emptyForm(today));
    setShowChipCreator(false);
  };

  const closeTaskModal = () => {
    setTaskModalOpen(false);
    resetForm();
    setError(null);
  };

  const startRestoringCompletedTask = (event: PlannerEvent) => {
    setEditingId(null);
    setRecordCompleted(false);
    setForm({
      ...emptyForm(today),
      title: event.title || "완료한 일정",
      notes: event.notes || "",
    });
    setShowChipCreator(false);
    setError(null);
    setTaskModalOpen(true);
    setSelectedEvent(null);
    setPreview(null);
    setActiveTab("active");
    setSelectedDate(today);
    setViewMonth(today.slice(0, 7));
  };

  const selectTab = (tab: PlannerTab) => {
    setSearchOpen(false);
    setSearchResults(null);
    setSearching(false);
    setActiveTab(tab);
  };

  const closeSearchResults = () => {
    setSearchOpen(false);
    setSearchResults(null);
    setSearching(false);
  };

  const resetSearch = () => {
    const bounds = monthBounds(viewMonth);
    setSearchFrom(bounds.start);
    setSearchTo(bounds.end);
    setSearchQuery("");
    setSearchOpen(false);
    setSearchResults(null);
    setSearching(false);
    setError(null);
  };

  const handleSearch = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (searching) return;
    if (!searchFrom || !searchTo) {
      setError("검색할 날짜 범위를 입력해주세요.");
      return;
    }
    if (searchFrom > searchTo) {
      setError("검색 종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }
    const fromTime = Date.parse(`${searchFrom}T00:00:00Z`);
    const toTime = Date.parse(`${searchTo}T00:00:00Z`);
    if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
      setError("검색 날짜를 확인해주세요.");
      return;
    }
    if (Math.round((toTime - fromTime) / 86_400_000) > 366) {
      setError("한 번에 1년 범위까지만 검색할 수 있습니다.");
      return;
    }

    const trimmedQuery = searchQuery.trim();
    const queryString = trimmedQuery
      ? `&q=${encodeURIComponent(trimmedQuery)}`
      : "";
    setSearchOpen(true);
    setSearchResults(null);
    setSearching(true);
    setError(null);
    try {
      const data = await apiFetch<PlannerSearchResults>(
        `/api/planner/search?start=${searchFrom}&end=${searchTo}${queryString}`,
        { cache: "no-store" },
      );
      setSearchResults(data);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "검색하지 못했습니다.",
      );
      setSearchOpen(false);
    } finally {
      setSearching(false);
    }
  };

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

  const resetSpecialForm = () => {
    setEditingSpecialId(null);
    setSpecialKind("yearly");
    setSpecialTitle("");
    setSpecialEventDate(todayDateInputValue());
    setSpecialMonth(1);
    setSpecialDay(1);
    setSpecialPinned(false);
  };

  const openSpecialManager = () => {
    resetSpecialForm();
    setSpecialTab("form");
    setSpecialSearch("");
    setSpecialModalOpen(true);
  };

  const closeSpecialManager = () => {
    if (specialSaving) return;
    setSpecialModalOpen(false);
    setSpecialTab("form");
    setSpecialSearch("");
    resetSpecialForm();
  };

  const startEditingSpecial = (item: PlannerSpecialDate) => {
    setEditingSpecialId(item.id);
    setSpecialKind(item.kind);
    setSpecialTitle(item.title);
    setSpecialEventDate(
      item.event_date ?? todayDateInputValue(),
    );
    setSpecialMonth(item.month ?? 1);
    setSpecialDay(item.day ?? 1);
    setSpecialPinned(item.pinned);
    setError(null);
  };

  const openSpecialEditor = (item: PlannerSpecialDate) => {
    startEditingSpecial(item);
    setSpecialTab("form");
    setSpecialModalOpen(true);
  };

  const openSpecialList = () => {
    setSpecialSearch("");
    setSpecialTab("list");
    setSpecialModalOpen(true);
  };

  const handleSpecialEventDateChange = (value: string) => {
    setSpecialEventDate(value);
    if (
      editingSpecialId === null &&
      value &&
      value < today
    ) {
      setSpecialPinned(true);
    }
  };

  const handleSubmitSpecial = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!specialTitle.trim() || specialSaving) return;
    setSpecialSaving(true);
    setError(null);
    const payload = {
      title: specialTitle,
      kind: specialKind,
      event_date:
        specialKind === "dday" ? specialEventDate : null,
      month: specialKind === "yearly" ? specialMonth : null,
      day: specialKind === "yearly" ? specialDay : null,
      pinned: specialKind === "dday" ? specialPinned : false,
    };
    try {
      if (editingSpecialId !== null) {
        await apiFetch<PlannerSpecialDate>(
          `/api/bookmark/special-dates/${editingSpecialId}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );
      } else {
        await apiFetch<PlannerSpecialDate>(
          "/api/bookmark/special-dates",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );
      }
      await loadSpecialDates();
      resetSpecialForm();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "기념일을 저장하지 못했습니다.",
      );
    } finally {
      setSpecialSaving(false);
    }
  };

  const handleDeleteSpecial = async (item: PlannerSpecialDate) => {
    if (specialSaving) return;
    if (
      !window.confirm(
        `"${item.title}" 기념일을 삭제할까요? 과거 달력에서도 사라집니다.`,
      )
    ) {
      return;
    }
    setSpecialSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/bookmark/special-dates/${item.id}`, {
        method: "DELETE",
      });
      if (editingSpecialId === item.id) {
        resetSpecialForm();
      }
      await loadSpecialDates();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "기념일을 삭제하지 못했습니다.",
      );
    } finally {
      setSpecialSaving(false);
    }
  };

  const handleToggleSpecialPin = async (item: PlannerSpecialDate) => {
    if (specialSaving) return;
    setSpecialSaving(true);
    setError(null);
    try {
      await apiFetch<PlannerSpecialDate>(
        `/api/bookmark/special-dates/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ pinned: !item.pinned }),
        },
      );
      await loadSpecialDates();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "디데이 고정 상태를 바꾸지 못했습니다.",
      );
    } finally {
      setSpecialSaving(false);
    }
  };

  const refresh = async () => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchResults(null);
    }
    await Promise.all([
      loadTasks(),
      loadEvents(viewMonth),
      loadColors(),
      loadSpecialDates(),
    ]);
  };

  const changeMonth = (delta: number) => {
    const next = shiftMonth(viewMonth, delta);
    setViewMonth(next);
    setSelectedDate(`${next}-01`);
  };

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setSearchOpen(false);
    setSearchResults(null);
    setSearching(false);
    const monthKey = date.slice(0, 7);
    if (monthKey !== viewMonth) {
      setViewMonth(monthKey);
    }
  };

  const openCompletedSingle = (date: string) => {
    setRecordCompleted(true);
    setEditingId(null);
    setForm({
      ...emptyForm(date),
      scheduleType: "single",
      startDate: date,
      endDate: date,
    });
    setShowChipCreator(false);
    setError(null);
    setTaskModalOpen(true);
    selectDate(date);
  };

  const openNewTask = () => {
    if (selectedDate && selectedDate < today) {
      openCompletedSingle(selectedDate);
      return;
    }
    const startDate =
      selectedDate && selectedDate >= today ? selectedDate : today;
    setEditingId(null);
    setRecordCompleted(false);
    setForm(emptyForm(startDate));
    setShowChipCreator(false);
    setError(null);
    setTaskModalOpen(true);
  };

  const openRangeForm = (
    startDate: string,
    endDate: string,
    completed: boolean,
  ) => {
    setRecordCompleted(completed);
    setEditingId(null);
    setForm({
      ...emptyForm(startDate),
      scheduleType: "range",
      startDate,
      endDate,
    });
    setShowChipCreator(false);
    setError(null);
    setTaskModalOpen(true);
    selectDate(completed ? endDate : startDate);
  };

  const openNewRangeTask = (first: string, second: string) => {
    const [from, to] = orderedRange(first, second);
    if (to < today) {
      openRangeForm(from, to, true);
      return;
    }
    openRangeForm(from < today ? today : from, to, false);
  };

  const selectDateRef = useRef(selectDate);
  selectDateRef.current = selectDate;
  const openNewRangeTaskRef = useRef(openNewRangeTask);
  openNewRangeTaskRef.current = openNewRangeTask;

  useEffect(() => {
    const dateAtPoint = (x: number, y: number): string | null => {
      for (const element of document.elementsFromPoint(x, y)) {
        const cell = (element as HTMLElement).closest<HTMLElement>(
          "[data-calendar-date]",
        );
        const date = cell?.dataset.calendarDate;
        if (date) return date;
      }

      // Range bars sit below the day cells. Use the nearest cell so a drag
      // does not stall when the pointer crosses one.
      let nearestDate: string | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const cell of Array.from(
        document.querySelectorAll<HTMLElement>("[data-calendar-date]"),
      )) {
        const rect = cell.getBoundingClientRect();
        const dx =
          x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
        const dy =
          y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestDate = cell.dataset.calendarDate || null;
        }
      }
      return nearestDate && nearestDistance <= 96 * 96 ? nearestDate : null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (dragStartRef.current === null) return;
      const date = dateAtPoint(event.clientX, event.clientY);
      if (!date || date === dragCurrentRef.current) return;
      dragCurrentRef.current = date;
      setDragRange({ start: dragStartRef.current, end: date });
    };

    const cancelDrag = () => {
      dragStartRef.current = null;
      dragCurrentRef.current = null;
      setDragRange(null);
    };

    const finishDrag = (event: PointerEvent) => {
      const start = dragStartRef.current;
      if (start === null) return;
      const date = dateAtPoint(event.clientX, event.clientY);
      const current = date || dragCurrentRef.current || start;
      cancelDrag();
      const [from, to] = orderedRange(start, current);
      if (from === to) {
        selectDateRef.current(from);
        return;
      }
      openNewRangeTaskRef.current(from, to);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", cancelDrag);
    window.addEventListener("blur", cancelDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", cancelDrag);
      window.removeEventListener("blur", cancelDrag);
    };
  }, []);

  const startCalendarDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    date: string,
  ) => {
    if (event.button !== 0) return;
    dragStartRef.current = date;
    dragCurrentRef.current = date;
    setDragRange({ start: date, end: date });
  };

  const startEditing = (task: PlannerTask) => {
    const isUndated = task.schedule_type === "undated";
    const scheduleType: ScheduleType =
      task.schedule_type === "undated"
        ? "single"
        : task.schedule_type;
    setSelectedTask(null);
    setEditingId(task.id);
    setRecordCompleted(false);
    setForm({
      title: task.title,
      notes: task.notes || "",
      colorId: task.color_id,
      scheduleType,
      startDate: task.start_date || today,
      endDate: task.end_date || addDays(today, 7),
      deadlineDays: task.deadline_days || 7,
      pinned: task.pinned,
      undated: isUndated,
    });
    setError(null);
    setShowChipCreator(false);
    setTaskModalOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim() || busyKey !== null) return;

    const completionDate =
      form.scheduleType === "range" ? form.endDate : form.startDate;
    if (!editingId && recordCompleted) {
      if (
        form.scheduleType === "range" &&
        (!form.startDate || !form.endDate)
      ) {
        setError("시작일과 완료일을 입력해주세요.");
        return;
      }
      if (!completionDate) {
        setError("완료일을 입력해주세요.");
        return;
      }
      if (completionDate >= today) {
        setError("완료 기록은 과거 날짜로만 저장할 수 있습니다.");
        return;
      }
      if (
        form.scheduleType === "range" &&
        form.endDate < form.startDate
      ) {
        setError("종료일은 시작일보다 빠를 수 없습니다.");
        return;
      }
    }

    const key = editingId ? `update-${editingId}` : "create";
    setBusyKey(key);
    setError(null);
    try {
      if (!editingId && recordCompleted) {
        await apiFetch("/api/planner/completed", {
          method: "POST",
          body: JSON.stringify({
            title: form.title,
            notes: form.notes || null,
            completed_on: completionDate,
          }),
        });
        const completedOn = completionDate;
        closeTaskModal();
        selectDate(completedOn);
        await Promise.all([
          loadTasks(),
          loadEvents(completedOn.slice(0, 7)),
        ]);
        return;
      }

      const payload = {
        title: form.title,
        notes: form.notes || null,
        color_id: form.colorId,
        schedule_type: form.undated
          ? "undated"
          : form.scheduleType,
        start_date: form.undated
          ? null
          : form.startDate || null,
        end_date: form.undated
          ? null
          : form.scheduleType === "range"
            ? form.endDate
            : null,
        deadline_days: form.undated
          ? null
          : form.scheduleType === "single"
            ? form.deadlineDays
            : null,
        pinned: form.pinned,
      };
      if (editingId) {
        await apiFetch<PlannerTask>(`/api/planner/tasks/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch<PlannerTask>("/api/planner/tasks", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      closeTaskModal();
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : recordCompleted
            ? "완료 일정을 기록하지 못했습니다."
            : editingId
              ? "일정을 수정하지 못했습니다."
              : "일정을 추가하지 못했습니다.",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handleComplete = async (task: PlannerTask) => {
    if (
      busyKey !== null ||
      !window.confirm(
        `"${task.title}" 일정을 완료할까요?\n완료한 일정은 목록에서 사라지고 완료 이력만 남습니다.`,
      )
    ) {
      return;
    }
    const key = `complete-${task.id}`;
    setBusyKey(key);
    setError(null);
    try {
      await apiFetch(`/api/planner/tasks/${task.id}/complete`, {
        method: "POST",
      });
      setSelectedTask((previous) =>
        previous?.id === task.id ? null : previous,
      );
      if (editingId === task.id) resetForm();
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "일정을 완료하지 못했습니다.",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeactivate = async (task: PlannerTask) => {
    if (
      busyKey !== null ||
      !window.confirm(
        `"${task.title}" 일정을 비활성화할까요?\n비활성 탭에서 다시 복구할 수 있습니다.`,
      )
    ) {
      return;
    }
    const key = `deactivate-${task.id}`;
    setBusyKey(key);
    setError(null);
    try {
      await apiFetch<PlannerTask>(
        `/api/planner/tasks/${task.id}/deactivate`,
        { method: "POST" },
      );
      setSelectedTask((previous) =>
        previous?.id === task.id ? null : previous,
      );
      if (editingId === task.id) closeTaskModal();
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "일정을 비활성화하지 못했습니다.",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handleTrash = async (task: PlannerTask) => {
    if (
      busyKey !== null ||
      !window.confirm(
        `"${task.title}" 일정을 휴지통으로 옮길까요?\n30일 뒤 영구 삭제됩니다.`,
      )
    ) {
      return;
    }
    const key = `trash-${task.id}`;
    setBusyKey(key);
    setError(null);
    try {
      await apiFetch(`/api/planner/tasks/${task.id}`, { method: "DELETE" });
      setSelectedTask((previous) =>
        previous?.id === task.id ? null : previous,
      );
      if (editingId === task.id) resetForm();
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "일정을 휴지통으로 옮기지 못했습니다.",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handleRestore = async (task: PlannerTask) => {
    if (busyKey !== null) return;
    const key = `restore-${task.id}`;
    setBusyKey(key);
    setError(null);
    try {
      const restored = await apiFetch<PlannerTask>(
        `/api/planner/tasks/${task.id}/restore`,
        { method: "POST" },
      );
      setSelectedTask((previous) =>
        previous?.id === task.id ? null : previous,
      );
      await refresh();
      if (restored.status === "active") {
        setActiveTab("active");
        setSelectedDate(today);
        setViewMonth(today.slice(0, 7));
      } else {
        setActiveTab("inactive");
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "일정을 복구하지 못했습니다.",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handlePermanentDelete = async (task: PlannerTask) => {
    if (
      busyKey !== null ||
      !window.confirm(
        `"${task.title}" 일정을 영구 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }
    const key = `permanent-${task.id}`;
    setBusyKey(key);
    setError(null);
    try {
      await apiFetch(`/api/planner/tasks/${task.id}/permanent`, {
        method: "DELETE",
      });
      setSelectedTask((previous) =>
        previous?.id === task.id ? null : previous,
      );
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "일정을 영구 삭제하지 못했습니다.",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handlePin = async (task: PlannerTask) => {
    if (busyKey !== null) return;
    const key = `pin-${task.id}`;
    setBusyKey(key);
    setError(null);
    try {
      const updated = await apiFetch<PlannerTask>(
        `/api/planner/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ pinned: !task.pinned }),
        },
      );
      setSelectedTask((previous) =>
        previous?.id === task.id ? updated : previous,
      );
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "고정 상태를 변경하지 못했습니다.",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const applyTaskNotes = (taskId: number, notes: string) => {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === taskId ? { ...task, notes } : task,
      ),
    );
    setSelectedTask((previous) =>
      previous?.id === taskId ? { ...previous, notes } : previous,
    );
    setSearchResults((previous) =>
      previous
        ? {
            ...previous,
            tasks: previous.tasks.map((task) =>
              task.id === taskId ? { ...task, notes } : task,
            ),
          }
        : previous,
    );
  };

  const handleToggleTaskNote = async (
    task: PlannerTask,
    lineIndex: number,
  ) => {
    if (
      noteSavingId !== null ||
      task.status === "trashed" ||
      !task.notes
    ) {
      return;
    }
    const lines = task.notes.split(/\r?\n/);
    const line = lines[lineIndex];
    if (line === undefined) return;
    const match = line.match(NOTE_CHECK_LINE_RE);
    if (!match) return;

    const checked = (match[2] || "").toLowerCase() === "x";
    lines[lineIndex] = `${match[1]}${checked ? " " : "x"}${match[3]}${match[4]}`;
    const notes = lines.join("\n");
    const previous = task.notes;
    setNoteSavingId(task.id);
    setError(null);
    applyTaskNotes(task.id, notes);
    try {
      await apiFetch<PlannerTask>(`/api/planner/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes }),
      });
    } catch (reason) {
      applyTaskNotes(task.id, previous);
      setError(
        reason instanceof Error
          ? reason.message
          : "메모를 저장하지 못했습니다.",
      );
    } finally {
      setNoteSavingId(null);
    }
  };

  const handleCreateColor = async (selectForForm: boolean) => {
    if (colorSaving) return;
    setColorSaving(true);
    setError(null);
    try {
      const saved = await apiFetch<PlannerColor>("/api/planner/colors", {
        method: "POST",
        body: JSON.stringify({
          color: newChipColor,
          name: newChipName.trim() || null,
        }),
      });
      setSavedColors((previous) =>
        previous.some((color) => color.id === saved.id)
          ? previous.map((color) =>
              color.id === saved.id ? saved : color,
            )
          : [...previous, saved],
      );
      if (selectForForm) {
        setForm((previous) => ({
          ...previous,
          colorId: saved.id,
        }));
      }
      setNewChipName("");
      setShowChipCreator(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "색상 칩을 만들지 못했습니다.",
      );
    } finally {
      setColorSaving(false);
    }
  };

  const startEditingColor = (saved: PlannerColor) => {
    setEditingColorId(saved.id);
    setEditChipColor(saved.color);
    setEditChipName(saved.name || "");
    setShowChipCreator(false);
    setError(null);
  };

  const persistColorOrder = async (
    next: PlannerColor[],
    previous: PlannerColor[],
  ) => {
    if (colorOrderSaving) return;
    setSavedColors(next);
    setColorOrderSaving(true);
    setError(null);
    try {
      const data = await apiFetch<PlannerColorsResponse>(
        "/api/planner/colors/order",
        {
          method: "PUT",
          body: JSON.stringify({
            ids: next.map((color) => color.id),
          }),
        },
      );
      setSavedColors(data.colors);
    } catch (reason) {
      setSavedColors(previous);
      setError(
        reason instanceof Error
          ? reason.message
          : "색상 칩 순서를 변경하지 못했습니다.",
      );
    } finally {
      setColorOrderSaving(false);
    }
  };

  const moveColorBy = (saved: PlannerColor, delta: number) => {
    if (colorOrderSaving) return;
    const currentIndex = savedColors.findIndex(
      (color) => color.id === saved.id,
    );
    const nextIndex = currentIndex + delta;
    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= savedColors.length
    ) {
      return;
    }
    const next = [...savedColors];
    [next[currentIndex], next[nextIndex]] = [
      next[nextIndex],
      next[currentIndex],
    ];
    void persistColorOrder(next, savedColors);
  };

  const moveColorForDrop = (
    items: PlannerColor[],
    sourceId: number,
    targetId: number,
    after: boolean,
  ) => {
    const sourceIndex = items.findIndex(
      (color) => color.id === sourceId,
    );
    if (sourceIndex < 0) return items;
    const next = [...items];
    const [moved] = next.splice(sourceIndex, 1);
    const targetIndex = next.findIndex(
      (color) => color.id === targetId,
    );
    if (targetIndex < 0) return items;
    next.splice(after ? targetIndex + 1 : targetIndex, 0, moved);
    return next;
  };

  const handleChipDrop = (
    event: ReactDragEvent<HTMLLIElement>,
    target: PlannerColor,
  ) => {
    event.preventDefault();
    const sourceId =
      draggingColorIdRef.current ??
      draggingColorId ??
      Number(event.dataTransfer.getData("text/plain"));
    draggingColorIdRef.current = null;
    setDraggingColorId(null);
    setDragOverColorId(null);
    if (
      !Number.isFinite(sourceId) ||
      sourceId === target.id ||
      colorOrderSaving
    ) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    const next = moveColorForDrop(
      savedColors,
      sourceId,
      target.id,
      after,
    );
    if (next === savedColors) return;
    void persistColorOrder(next, savedColors);
  };

  const selectColorGroup = (key: string) => {
    setSelectedColorGroups((previous) =>
      previous.includes(key) ? [] : [key],
    );
  };

  const openChipManager = () => {
    setError(null);
    setShowChipCreator(false);
    setChipManagerOpen(true);
  };

  const closeChipManager = () => {
    setChipManagerOpen(false);
    setEditingColorId(null);
    setEditChipName("");
    draggingColorIdRef.current = null;
    setDraggingColorId(null);
    setDragOverColorId(null);
    setError(null);
  };

  const cancelEditingColor = () => {
    setEditingColorId(null);
    setEditChipName("");
  };

  const handleEditColor = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (editingColorId === null || chipSaving) return;
    setChipSaving(true);
    setError(null);
    try {
      const saved = await apiFetch<PlannerColor>(
        `/api/planner/colors/${editingColorId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            color: editChipColor,
            name: editChipName.trim() || null,
          }),
        },
      );
      setSavedColors((previous) =>
        previous.map((color) =>
          color.id === saved.id ? saved : color,
        ),
      );
      setEditingColorId(null);
      setEditChipName("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "색상 칩을 수정하지 못했습니다.",
      );
    } finally {
      setChipSaving(false);
    }
  };

  const handleDeleteColor = async (saved: PlannerColor) => {
    if (deletingColorId !== null) return;
    const chipTasks = tasks.filter(
      (task) => task.color_id === saved.id,
    );
    const activeInactiveCount = chipTasks.filter(
      (task) =>
        task.status === "active" || task.status === "inactive",
    ).length;
    const trashedCount = chipTasks.filter(
      (task) => task.status === "trashed",
    ).length;
    const message = [
      `"${saved.name || saved.color}" 색상 칩을 삭제할까요?`,
    ];
    if (activeInactiveCount > 0) {
      message.push(
        `활성/비활성 일정 ${activeInactiveCount}개가 전부 미지정으로 바뀝니다.`,
      );
    }
    if (trashedCount > 0) {
      message.push(
        `휴지통 일정 ${trashedCount}개는 함께 영구 삭제됩니다.`,
      );
    }
    if (!window.confirm(message.join("\n"))) return;

    setDeletingColorId(saved.id);
    setError(null);
    try {
      await apiFetch(`/api/planner/colors/${saved.id}`, {
        method: "DELETE",
      });
      setSavedColors((previous) =>
        previous.filter((color) => color.id !== saved.id),
      );
      setSelectedColorGroups((previous) =>
        previous.filter((key) => key !== `chip:${saved.id}`),
      );
      if (editingColorId === saved.id) {
        setEditingColorId(null);
        setEditChipName("");
      }
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "색상 칩을 삭제하지 못했습니다.",
      );
    } finally {
      setDeletingColorId(null);
    }
  };

  const openEvent = async (event: PlannerEvent) => {
    setSelectedEvent(event);
    setPreview(null);
    setPreviewLoading(true);
    try {
      const data = await apiFetch<PlannerEventPreview>(
        `/api/planner/events/${event.id}/preview`,
        { cache: "no-store" },
      );
      setPreview(data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeEvent = () => {
    setSelectedEvent(null);
    setPreview(null);
    setPreviewLoading(false);
  };

  const openTaskDetail = (task: PlannerTask) => {
    setError(null);
    setSelectedTask(task);
  };

  const closeTaskDetail = () => {
    setSelectedTask(null);
    setError(null);
  };

  const renderTaskCard = (task: PlannerTask) => (
    <PlannerTaskCard
      task={task}
      noteSavingId={noteSavingId}
      onOpen={openTaskDetail}
      onToggleNote={(index) => void handleToggleTaskNote(task, index)}
    />
  );

  const renderHistoryItems = (items: PlannerEvent[]) => (
    <PlannerHistoryList events={items} onOpen={openEvent} />
  );

  const renderChipCreator = (
    selectForForm: boolean,
    showCancel = true,
  ) => (
    <div className="planner-color-creator">
      <input
        type="color"
        value={newChipColor}
        aria-label="새 색상 칩 색상"
        onChange={(event) => setNewChipColor(event.target.value)}
      />
      <span className="planner-color-value">
        {newChipColor.toUpperCase()}
      </span>
      <input
        type="text"
        className="planner-color-name-input"
        value={newChipName}
        maxLength={80}
        placeholder="칩 이름 (선택)"
        aria-label="새 색상 칩 이름"
        onChange={(event) => setNewChipName(event.target.value)}
      />
      <button
        type="button"
        className="planner-text-button"
        disabled={colorSaving}
        onClick={() => void handleCreateColor(selectForForm)}
      >
        {colorSaving ? "추가 중" : "칩 추가"}
      </button>
      {showCancel ? (
        <button
          type="button"
          className="planner-text-button"
          onClick={() => setShowChipCreator(false)}
        >
          취소
        </button>
      ) : null}
    </div>
  );

  return (
    <div id="planner-page">
      <main>
        <header className="planner-header">
          <div>
            <p className="planner-eyebrow">{username}의 개인 달력</p>
            <h1>부록</h1>
          </div>
          <div className="planner-tabs" role="tablist" aria-label="일정 보기">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "active"}
              className={activeTab === "active" ? "is-active" : ""}
              onClick={() => selectTab("active")}
            >
              진행 중
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "colors"}
              className={activeTab === "colors" ? "is-active" : ""}
              onClick={() => selectTab("colors")}
            >
              색상별
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "inactive"}
              className={activeTab === "inactive" ? "is-active" : ""}
              onClick={() => selectTab("inactive")}
            >
              비활성 {inactiveTasks.length}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "trashed"}
              className={activeTab === "trashed" ? "is-active" : ""}
              onClick={() => selectTab("trashed")}
            >
              휴지통 {trashedTasks.length}
            </button>
          </div>
        </header>

        {error ? <p className="planner-error">{error}</p> : null}

        <form className="planner-filter" onSubmit={handleSearch}>
          <div className="planner-filter__range">
            <label>
              <span>시작일</span>
              <input
                type="date"
                value={searchFrom}
                required
                onChange={(event) =>
                  setSearchFrom(event.target.value)
                }
              />
            </label>
            <span className="planner-filter__dash">~</span>
            <label>
              <span>종료일</span>
              <input
                type="date"
                value={searchTo}
                required
                onChange={(event) =>
                  setSearchTo(event.target.value)
                }
              />
            </label>
          </div>
          <label className="planner-filter__query">
            <span>검색어</span>
            <input
              type="search"
              value={searchQuery}
              placeholder="일정·이력 검색"
              aria-label="일정과 이력 검색"
              onChange={(event) =>
                setSearchQuery(event.target.value)
              }
            />
          </label>
          <button
            type="submit"
            className="planner-filter__submit"
            disabled={loading || searching}
          >
            <MagnifierIcon />
            {searching ? "검색 중" : "검색"}
          </button>
          {hasSearchFilter ? (
            <button
              type="button"
              className="planner-filter__reset"
              onClick={resetSearch}
            >
              초기화
            </button>
          ) : null}
        </form>

        {loading ? (
          <p className="planner-status">불러오는 중...</p>
        ) : (
          <div className="planner-layout">
            <PlannerCalendar
              viewMonth={viewMonth}
              monthPickerOpen={monthPickerOpen}
              weeks={weeks}
              calendarTasks={calendarTasks}
              colorViewTasks={colorViewTasks}
              specialDates={specialDates}
              today={today}
              selectedDate={selectedDate}
              dragBounds={dragBounds}
              eventDates={eventDates}
              onChangeMonth={changeMonth}
              onOpenMonthPicker={openMonthPicker}
              onOpenSpecialManager={openSpecialManager}
              onStartDrag={startCalendarDrag}
              onSelectDate={selectDate}
            />

            <aside className="planner-side">
              {searchOpen ? (
                <PlannerSearchPanel
                  searchFrom={searchFrom}
                  searchTo={searchTo}
                  searchQuery={searchQuery}
                  searching={searching}
                  searchResults={searchResults}
                  onClose={closeSearchResults}
                  renderTaskCard={renderTaskCard}
                  renderHistoryItems={renderHistoryItems}
                />
              ) : activeTab === "active" ? (
                <PlannerDatePanel
                  selectedDate={selectedDate}
                  today={today}
                  taskCount={selectedTasks.length}
                  specialCount={selectedSpecialDates.length}
                  eventCount={selectedEvents.length}
                  onSelectToday={() => selectDate(today)}
                  onOpenNewTask={openNewTask}
                >
                  <PlannerDayDetail
                    upcomingDdays={upcomingDdays}
                    selectedDate={selectedDate}
                    specialDates={selectedSpecialDates}
                    dayBookmark={dayBookmark}
                    eventsLoading={eventsLoading}
                    tasks={selectedTasks}
                    events={selectedEvents}
                    renderTaskCard={renderTaskCard}
                    onOpenSpecialList={openSpecialList}
                    onOpenSpecialEditor={openSpecialEditor}
                    onOpenEvent={openEvent}
                  />
                </PlannerDatePanel>
              ) : activeTab === "colors" ? (
                <PlannerColorPanel
                  activeCount={activeTasks.length}
                  chipCount={savedColors.length}
                  colorGroups={colorGroups}
                  selectedKeys={selectedColorGroups}
                  selectedGroup={selectedColorGroup}
                  onSelectGroup={selectColorGroup}
                  onClearSelection={() => setSelectedColorGroups([])}
                  onOpenChipManager={openChipManager}
                  renderTaskCard={renderTaskCard}
                />
              ) : (
                <PlannerInactivePanel
                  activeTab={activeTab}
                  inactiveTasks={inactiveTasks}
                  trashedTasks={trashedTasks}
                  visibleInactiveTasks={visibleInactiveTasks}
                  inactiveColorGroups={inactiveColorGroups}
                  selectedInactiveGroup={selectedInactiveGroup}
                  inactiveFilterOpen={inactiveFilterOpen}
                  inactiveColorFilter={inactiveColorFilter}
                  onToggleFilter={() =>
                    setInactiveFilterOpen((previous) => !previous)
                  }
                  onColorFilterChange={setInactiveColorFilter}
                  renderTaskCard={renderTaskCard}
                />
              )}
            </aside>
          </div>
        )}
      </main>

      {taskModalOpen ? (
        <PlannerTaskModal
          editingId={editingId}
          recordCompleted={recordCompleted}
          form={form}
          setForm={setForm}
          error={error}
          busyKey={busyKey}
          today={today}
          savedColors={savedColors}
          selectedFormColor={selectedFormColor}
          showChipCreator={showChipCreator}
          setShowChipCreator={setShowChipCreator}
          renderChipCreator={renderChipCreator}
          onClose={closeTaskModal}
          onSubmit={handleSubmit}
        />
      ) : null}

      {selectedTask ? (
        <PlannerTaskDetailModal
          task={selectedTask}
          selectedColor={selectedTaskColor}
          error={error}
          noteSavingId={noteSavingId}
          busyKey={busyKey}
          onClose={closeTaskDetail}
          onToggleNote={(index) =>
            void handleToggleTaskNote(selectedTask, index)
          }
          onRestore={(task) => void handleRestore(task)}
          onPermanentDelete={(task) =>
            void handlePermanentDelete(task)
          }
          onPin={(task) => void handlePin(task)}
          onEdit={startEditing}
          onTrash={(task) => void handleTrash(task)}
          onDeactivate={(task) => void handleDeactivate(task)}
          onComplete={(task) => void handleComplete(task)}
        />
      ) : null}

      {chipManagerOpen ? (
        <PlannerChipManager
          error={error}
          savedColors={savedColors}
          draggingColorId={draggingColorId}
          dragOverColorId={dragOverColorId}
          colorOrderSaving={colorOrderSaving}
          deletingColorId={deletingColorId}
          editingColorId={editingColorId}
          editChipColor={editChipColor}
          editChipName={editChipName}
          chipSaving={chipSaving}
          draggingColorIdRef={draggingColorIdRef}
          setDraggingColorId={setDraggingColorId}
          setDragOverColorId={setDragOverColorId}
          renderChipCreator={renderChipCreator}
          onClose={closeChipManager}
          onDropChip={handleChipDrop}
          onMoveColor={moveColorBy}
          onStartEdit={startEditingColor}
          onDelete={(saved) => void handleDeleteColor(saved)}
          onEditSubmit={handleEditColor}
          onEditColorChange={setEditChipColor}
          onEditNameChange={setEditChipName}
          onCancelEdit={cancelEditingColor}
        />
      ) : null}

      {selectedEvent ? (
        <PlannerEventPreviewModal
          event={selectedEvent}
          preview={preview}
          previewLoading={previewLoading}
          onClose={closeEvent}
          onRestoreCompleted={(event) =>
            void startRestoringCompletedTask(event)
          }
        />
      ) : null}
      {monthPickerOpen ? (
        <PlannerMonthPicker
          year={monthPickerYear}
          month={monthPickerMonth}
          years={monthPickerYears}
          onYearChange={setMonthPickerYear}
          onMonthChange={setMonthPickerMonth}
          onClose={closeMonthPicker}
          onApply={applyMonthPicker}
        />
      ) : null}
      {specialModalOpen ? (
        <PlannerSpecialModal
          tab={specialTab}
          ddayCount={ddaySpecialDates.length}
          filtered={filteredSpecialDates}
          kind={specialKind}
          title={specialTitle}
          month={specialMonth}
          day={specialDay}
          eventDate={specialEventDate}
          pinned={specialPinned}
          editingSpecial={editingSpecial}
          editingId={editingSpecialId}
          saving={specialSaving}
          search={specialSearch}
          onClose={closeSpecialManager}
          onTabChange={setSpecialTab}
          onKindChange={setSpecialKind}
          onTitleChange={setSpecialTitle}
          onMonthChange={setSpecialMonth}
          onDayChange={setSpecialDay}
          onEventDateChange={handleSpecialEventDateChange}
          onPinnedChange={setSpecialPinned}
          onSearchChange={setSpecialSearch}
          onSubmit={handleSubmitSpecial}
          onDelete={(item) => void handleDeleteSpecial(item)}
          onReset={resetSpecialForm}
          onStartEdit={(item) => {
            startEditingSpecial(item);
            setSpecialTab("form");
          }}
          onTogglePin={(item) => void handleToggleSpecialPin(item)}
        />
      ) : null}
    </div>
  );
}

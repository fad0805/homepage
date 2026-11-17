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
import { PlannerEventPreviewModal } from "./planner-event-preview-modal";
import { PlannerMonthPicker } from "./planner-month-picker";
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
    <li
      className="planner-task-item planner-task-card"
      key={task.id}
      role="button"
      tabIndex={0}
      onClick={() => openTaskDetail(task)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openTaskDetail(task);
        }
      }}
    >
      <div className="planner-task-main">
        <div className="planner-task-title-row">
          <span
            className="planner-task-color"
            style={{ backgroundColor: taskColor(task) }}
            aria-hidden="true"
          />
          <strong>{task.title}</strong>
        </div>
        <p className="planner-task-meta planner-task-deadline">
          {task.end_date
            ? `마감 ${formatDateOnly(task.end_date)}`
            : "등록일 미지정"}
        </p>
        {task.notes ? (
          <PlannerNoteContent
            notes={task.notes}
            disabled={
              task.status === "trashed" || noteSavingId !== null
            }
            onToggle={(index) =>
              void handleToggleTaskNote(task, index)
            }
          />
        ) : null}
      </div>
    </li>
  );

  const renderDayTasks = (dateTasks: PlannerTask[]) =>
    dateTasks.length === 0 ? (
      <p className="planner-empty">
        이 날짜에 표시할 진행 중 일정이 없습니다.
      </p>
    ) : (
      <ul className="planner-task-list">
        {dateTasks.map(renderTaskCard)}
      </ul>
    );

  const renderHistoryItems = (items: PlannerEvent[]) => (
    <ul className="planner-history-list">
      {items.map((event) => (
        <li key={event.id}>
          <button
            type="button"
            className="planner-history-item"
            onClick={() => openEvent(event)}
          >
            <span className="planner-history-kind">
              {ENTITY_LABELS[event.entity_type] || event.entity_type}
            </span>
            <span className="planner-history-title">
              {event.title || "제목 없음"}
            </span>
            <span className="planner-history-action">
              {ACTION_LABELS[event.action] || event.action}
            </span>
            <span className="planner-history-time">
              {formatDateTime(event.occurred_at)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  const renderHistory = (dateEvents: PlannerEvent[]) => (
    <div className="planner-history-section">
      <h3>변경 이력</h3>
      {eventsLoading ? (
        <p className="planner-status">이력을 불러오는 중...</p>
      ) : dateEvents.length === 0 ? (
        <p className="planner-empty">
          이 날짜의 변경 이력이 없습니다.
        </p>
      ) : (
        renderHistoryItems(dateEvents)
      )}
    </div>
  );

  const renderDayBookmark = () => {
    const goal = dayBookmark?.goal;
    const rating = dayBookmark?.rating?.rating ?? 0;
    const review = dayBookmark?.review;
    if (
      !goal?.content &&
      !goal?.wake_time &&
      !goal?.mood_tag_name &&
      rating <= 0 &&
      !review?.content
    ) {
      return null;
    }
    return (
      <div className="planner-bookmark-section">
        {goal?.content || goal?.wake_time || goal?.mood_tag_name ? (
          <div className="planner-bookmark-block">
            <div className="planner-bookmark-label-row">
              <span className="planner-bookmark-label">목표</span>
              {goal?.wake_time || goal?.mood_tag_name ? (
                <span className="planner-bookmark-meta">
                  {goal?.wake_time
                    ? formatTime24h(goal.wake_time)
                    : null}
                  {goal?.wake_time && goal?.mood_tag_name
                    ? " · "
                    : null}
                  {goal?.mood_tag_name ?? null}
                </span>
              ) : null}
            </div>
            {goal?.content ? (
              <p className="planner-bookmark-text">{goal.content}</p>
            ) : null}
          </div>
        ) : null}
        {review?.content || rating > 0 ? (
          <div className="planner-bookmark-block">
            <div className="planner-bookmark-label-row">
              <span className="planner-bookmark-label">회고</span>
              {rating > 0 ? (
                <span
                  className="planner-bookmark-rating"
                  aria-label={`${rating}점`}
                >
                  {[1, 2, 3, 4, 5].map((score) => (
                    <span className="planner-clover" key={score}>
                      <CloverIcon filled={score <= rating} />
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
            {review?.content ? (
              <p className="planner-bookmark-text">{review.content}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const renderUpcomingDdays = (items: PlannerSpecialDate[]) => {
    if (items.length === 0) return null;
    return (
      <div className="planner-dday-section">
        <div className="planner-dday-heading">
          <span>디데이</span>
          <button
            type="button"
            className="planner-text-button"
            onClick={openSpecialList}
          >
            전체
          </button>
        </div>
        <ul className="planner-dday-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="planner-dday-item"
                title={`${item.title} 수정`}
                aria-label={`${item.title} 수정`}
                onClick={() => openSpecialEditor(item)}
              >
                <span className="planner-dday-badge">
                  {specialDdayLabel(item.event_date ?? "")}
                </span>
                <strong className="planner-dday-title">
                  {item.title}
                </strong>
                <span className="planner-dday-date">
                  {formatDateOnly(item.event_date)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderDaySpecialDates = (items: PlannerSpecialDate[]) => {
    if (items.length === 0) return null;
    return (
      <div className="planner-special-day-section">
        <div className="planner-special-day-heading">
          <span>기념일</span>
          <span>{items.length}</span>
        </div>
        <ul className="planner-special-day-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`planner-special-day-item is-${item.kind}`}
                title={`${item.title} 수정`}
                aria-label={`${item.title} 수정`}
                onClick={() => openSpecialEditor(item)}
              >
                <span
                  className="planner-special-day-mark"
                  aria-hidden="true"
                >
                  {item.kind === "dday" ? "D" : "✦"}
                </span>
                <strong className="planner-special-day-title">
                  {item.title}
                </strong>
                <span className="planner-special-day-meta">
                  {item.kind === "dday"
                    ? specialDdayLabel(item.event_date ?? selectedDate)
                    : "매년"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderDayDetail = (
    dateTasks: PlannerTask[],
    dateEvents: PlannerEvent[],
    dateSpecialDates: PlannerSpecialDate[],
  ) => (
    <>
      {renderUpcomingDdays(upcomingDdays)}
      {renderDaySpecialDates(dateSpecialDates)}
      {renderDayBookmark()}
      {renderDayTasks(dateTasks)}
      {renderHistory(dateEvents)}
    </>
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
                <section className="planner-day-panel planner-search-panel">
                  <div className="planner-day-panel-header">
                    <div>
                      <p className="planner-eyebrow">통합 검색</p>
                      <h2>검색 결과</h2>
                      <p>
                        {formatDateOnly(searchFrom)} ~{" "}
                        {formatDateOnly(searchTo)}
                        {searchQuery.trim()
                          ? ` · "${searchQuery.trim()}"`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="planner-text-button"
                      onClick={closeSearchResults}
                    >
                      닫기
                    </button>
                  </div>
                  {searching ? (
                    <p className="planner-status">검색 중...</p>
                  ) : searchResults ? (
                    <>
                      <div className="planner-search-section">
                        <h3>일정 {searchResults.tasks.length}</h3>
                        {searchResults.tasks.length === 0 ? (
                          <p className="planner-empty">
                            검색된 일정이 없습니다.
                          </p>
                        ) : (
                          <ul className="planner-task-list">
                            {searchResults.tasks.map(renderTaskCard)}
                          </ul>
                        )}
                      </div>
                      <div className="planner-search-section">
                        <h3>이력 {searchResults.events.length}</h3>
                        {searchResults.events.length === 0 ? (
                          <p className="planner-empty">
                            검색된 이력이 없습니다.
                          </p>
                        ) : (
                          renderHistoryItems(searchResults.events)
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="planner-empty">
                      검색 결과가 없습니다.
                    </p>
                  )}
                </section>
              ) : activeTab === "active" ? (
                <section className="planner-day-panel planner-date-panel">
                  <div className="planner-day-panel-header">
                    <div>
                      <p className="planner-eyebrow">
                        {selectedDate === today ? "오늘" : "선택한 날짜"}
                      </p>
                      <h2>{formatDayLabel(selectedDate)}</h2>
                      <p>
                        일정 {selectedTasks.length}개 · 기념일{" "}
                        {selectedSpecialDates.length}개 · 이력{" "}
                        {selectedEvents.length}개
                      </p>
                    </div>
                    <div className="planner-day-panel-actions">
                      {selectedDate !== today ? (
                        <button
                          type="button"
                          className="planner-text-button"
                          onClick={() => selectDate(today)}
                        >
                          오늘로
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="planner-primary"
                        onClick={openNewTask}
                      >
                        {selectedDate && selectedDate < today
                          ? "완료 기록"
                          : "새 일정"}
                      </button>
                    </div>
                  </div>
                  {renderDayDetail(
                    selectedTasks,
                    selectedEvents,
                    selectedSpecialDates,
                  )}
                </section>
              ) : activeTab === "colors" ? (
                <section className="planner-day-panel planner-color-panel">
                  <div className="planner-day-panel-header">
                    <div>
                      <p className="planner-eyebrow">색상별</p>
                      <h2>색상 칩</h2>
                      <p>
                        활성 일정 {activeTasks.length}개 · 칩{" "}
                        {savedColors.length}개
                      </p>
                    </div>
                    <div className="planner-day-panel-actions">
                      <button
                        type="button"
                        className="planner-primary"
                        onClick={openChipManager}
                      >
                        칩 관리
                      </button>
                    </div>
                  </div>

                  {colorGroups.length === 0 ? (
                    <p className="planner-empty">
                      색상 칩에 지정된 활성 일정이 없습니다.
                    </p>
                  ) : (
                    <>
                      <div className="planner-color-swatch-grid">
                        {colorGroups.map((group) => {
                          const selected =
                            selectedColorGroups.includes(group.key);
                          const label = colorGroupLabel(group);
                          return (
                            <button
                              type="button"
                              key={group.key}
                              className={[
                                "planner-color-swatch-button",
                                selected ? "is-selected" : "",
                                group.key === "unassigned"
                                  ? "is-unassigned"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              style={{
                                backgroundColor:
                                  group.color ||
                                  UNASSIGNED_TASK_COLOR,
                              }}
                              aria-label={label}
                              aria-pressed={selected}
                              title={label}
                              onClick={() =>
                                selectColorGroup(group.key)
                              }
                            />
                          );
                        })}
                      </div>
                      {selectedColorGroup ? (
                        <div className="planner-color-task-panel">
                          <div className="planner-color-task-header">
                            <div className="planner-color-task-title">
                              <span
                                className="planner-color-group-swatch"
                                style={{
                                  backgroundColor:
                                    selectedColorGroup.color ||
                                    UNASSIGNED_TASK_COLOR,
                                }}
                              />
                              <strong>
                                {colorGroupLabel(selectedColorGroup)}
                              </strong>
                              <span className="planner-color-task-count">
                                활성 {selectedColorGroup.tasks.length}개
                              </span>
                            </div>
                            <button
                              type="button"
                              className="planner-text-button"
                              onClick={() => setSelectedColorGroups([])}
                            >
                              선택 해제
                            </button>
                          </div>
                          {selectedColorGroup.tasks.length === 0 ? (
                            <p className="planner-empty">
                              이 칩에 등록된 활성 일정이 없습니다.
                            </p>
                          ) : (
                            <ul className="planner-task-list">
                              {selectedColorGroup.tasks.map(
                                renderTaskCard,
                              )}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <p className="planner-empty">
                          색상 칩을 선택하면 해당 일정이 표시됩니다.
                        </p>
                      )}
                    </>
                  )}
                </section>
              ) : (
                <section className="planner-day-panel">
                  <div className="planner-day-panel-header">
                    <div>
                      <h2>
                        {activeTab === "inactive" ? "비활성 일정" : "휴지통"}
                      </h2>
                      <p>
                        {activeTab === "inactive"
                          ? "마감일이 지난 일정과 등록일 미지정 일정입니다. 등록일 미지정 일정은 수정해서 날짜를 지정할 수 있습니다."
                          : "휴지통에 있는 일정은 30일 뒤 영구 삭제됩니다."}
                      </p>
                    </div>
                  </div>
                  {activeTab === "inactive" ? (
                    <>
                      {inactiveTasks.length > 0 ? (
                        <div className="planner-inactive-filter">
                          <button
                            type="button"
                            className="planner-inactive-filter-toggle"
                            aria-expanded={inactiveFilterOpen}
                            onClick={() =>
                              setInactiveFilterOpen(
                                (previous) => !previous,
                              )
                            }
                          >
                            <span>칩별 보기</span>
                            <span className="planner-inactive-filter-value">
                              {selectedInactiveGroup
                                ? colorGroupLabel(
                                    selectedInactiveGroup,
                                  )
                                : "전체"}
                            </span>
                            <span
                              className="planner-inactive-filter-caret"
                              aria-hidden="true"
                            >
                              {inactiveFilterOpen ? "⌃" : "⌄"}
                            </span>
                          </button>
                          {inactiveFilterOpen ? (
                            <div className="planner-inactive-filter-panel">
                              <button
                                type="button"
                                className={`planner-inactive-filter-all${
                                  inactiveColorFilter === null
                                    ? " is-active"
                                    : ""
                                }`}
                                aria-pressed={
                                  inactiveColorFilter === null
                                }
                                onClick={() =>
                                  setInactiveColorFilter(null)
                                }
                              >
                                전체
                              </button>
                              {inactiveColorGroups.map((group) => {
                                const selected =
                                  inactiveColorFilter === group.key;
                                const label = colorGroupLabel(group);
                                return (
                                  <button
                                    type="button"
                                    key={group.key}
                                    className={[
                                      "planner-color-swatch-button",
                                      "is-small",
                                      selected ? "is-selected" : "",
                                      group.key === "unassigned"
                                        ? "is-unassigned"
                                        : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                    style={{
                                      backgroundColor:
                                        group.color ||
                                        UNASSIGNED_TASK_COLOR,
                                    }}
                                    aria-label={label}
                                    aria-pressed={selected}
                                    title={label}
                                    onClick={() =>
                                      setInactiveColorFilter(
                                        (previous) =>
                                          previous === group.key
                                            ? null
                                            : group.key,
                                      )
                                    }
                                  />
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {inactiveTasks.length === 0 ? (
                        <p className="planner-empty">
                          비활성 일정이 없습니다.
                        </p>
                      ) : visibleInactiveTasks.length === 0 ? (
                        <p className="planner-empty">
                          선택한 칩에 비활성 일정이 없습니다.
                        </p>
                      ) : (
                        <ul className="planner-task-list">
                          {visibleInactiveTasks.map(renderTaskCard)}
                        </ul>
                      )}
                    </>
                  ) : trashedTasks.length === 0 ? (
                    <p className="planner-empty">휴지통이 비어 있습니다.</p>
                  ) : (
                    <ul className="planner-task-list">
                      {trashedTasks.map(renderTaskCard)}
                    </ul>
                  )}
                </section>
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
        <div
          className="planner-modal-overlay is-task"
          role="presentation"
          onClick={closeChipManager}
        >
          <div
            className="planner-modal planner-chip-modal"
            role="dialog"
            aria-modal="true"
            aria-label="칩 관리"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="planner-modal-header">
              <div>
                <p className="planner-modal-eyebrow">색상별</p>
                <h2>칩 관리</h2>
                <p className="planner-chip-hint">
                  드래그해서 순서를 바꾸고, 칩을 추가·수정·삭제할
                  수 있습니다.
                </p>
              </div>
              <button
                type="button"
                className="planner-text-button"
                onClick={closeChipManager}
              >
                닫기
              </button>
            </div>
            {error ? <p className="planner-error">{error}</p> : null}
            <div className="planner-chip-add">
              <h3>칩 추가</h3>
              {renderChipCreator(false, false)}
            </div>
            <div className="planner-chip-manager">
              <h3>칩 순서</h3>
              {savedColors.length === 0 ? (
                <p className="planner-empty">
                  등록된 색상 칩이 없습니다.
                </p>
              ) : (
                <ul className="planner-chip-manager-list">
                  {savedColors.map((saved) => (
                    <li
                      key={saved.id}
                      data-chip-id={saved.id}
                      className={[
                        "planner-chip-manager-item",
                        draggingColorId === saved.id
                          ? "is-dragging"
                          : "",
                        dragOverColorId === saved.id
                          ? "is-drag-over"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onDragOver={(event) => {
                        const sourceId =
                          draggingColorIdRef.current ??
                          draggingColorId;
                        if (
                          sourceId === null ||
                          sourceId === saved.id ||
                          colorOrderSaving
                        ) {
                          return;
                        }
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverColorId(saved.id);
                      }}
                      onDragLeave={(event) => {
                        if (
                          event.relatedTarget instanceof Node &&
                          event.currentTarget.contains(
                            event.relatedTarget,
                          )
                        ) {
                          return;
                        }
                        setDragOverColorId((previous) =>
                          previous === saved.id ? null : previous,
                        );
                      }}
                      onDrop={(event) =>
                        handleChipDrop(event, saved)
                      }
                    >
                      <div className="planner-chip-manager-row">
                        <span
                          className="planner-chip-drag-handle"
                          role="button"
                          tabIndex={0}
                          draggable={!colorOrderSaving}
                          aria-label={`${
                            saved.name || saved.color
                          } 순서 변경`}
                          aria-keyshortcuts="ArrowUp ArrowDown"
                          title="드래그해서 순서 변경 (↑↓ 키도 가능)"
                          onDragStart={(event) => {
                            if (colorOrderSaving) {
                              event.preventDefault();
                              return;
                            }
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              "text/plain",
                              String(saved.id),
                            );
                            draggingColorIdRef.current = saved.id;
                            setDraggingColorId(saved.id);
                            setDragOverColorId(null);
                          }}
                          onDragEnd={() => {
                            draggingColorIdRef.current = null;
                            setDraggingColorId(null);
                            setDragOverColorId(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              moveColorBy(saved, -1);
                            } else if (
                              event.key === "ArrowDown"
                            ) {
                              event.preventDefault();
                              moveColorBy(saved, 1);
                            }
                          }}
                        >
                          ⠿
                        </span>
                        <span
                          className="planner-chip-swatch"
                          style={{ backgroundColor: saved.color }}
                          aria-hidden="true"
                        />
                        <span className="planner-chip-name">
                          {saved.name || saved.color.toUpperCase()}
                        </span>
                        <span className="planner-chip-value">
                          {saved.color.toUpperCase()}
                        </span>
                        <div className="planner-chip-actions">
                          <button
                            type="button"
                            className="planner-text-button"
                            onClick={() => startEditingColor(saved)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="planner-text-button is-danger"
                            disabled={deletingColorId !== null}
                            onClick={() =>
                              void handleDeleteColor(saved)
                            }
                          >
                            {deletingColorId === saved.id
                              ? "삭제 중"
                              : "삭제"}
                          </button>
                        </div>
                      </div>
                      {editingColorId === saved.id ? (
                        <form
                          className="planner-color-creator planner-color-edit"
                          onSubmit={handleEditColor}
                        >
                          <input
                            type="color"
                            value={editChipColor}
                            aria-label="색상 칩 색상"
                            onChange={(event) =>
                              setEditChipColor(event.target.value)
                            }
                          />
                          <span className="planner-color-value">
                            {editChipColor.toUpperCase()}
                          </span>
                          <input
                            type="text"
                            className="planner-color-name-input"
                            value={editChipName}
                            maxLength={80}
                            placeholder="칩 이름 (선택)"
                            aria-label="색상 칩 이름"
                            onChange={(event) =>
                              setEditChipName(event.target.value)
                            }
                          />
                          <button
                            type="submit"
                            className="planner-text-button"
                            disabled={chipSaving}
                          >
                            {chipSaving ? "저장 중" : "저장"}
                          </button>
                          <button
                            type="button"
                            className="planner-text-button"
                            onClick={cancelEditingColor}
                          >
                            취소
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
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
        <div
          className="planner-modal-overlay is-task"
          role="presentation"
          onClick={closeSpecialManager}
        >
          <div
            className="planner-modal planner-task-modal planner-special-modal"
            role="dialog"
            aria-modal="true"
            aria-label="기념일 관리"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="planner-special-modal-top">
              <button
                type="button"
                className="planner-text-button"
                onClick={closeSpecialManager}
              >
                닫기
              </button>
            </div>

            <div className="planner-special-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={specialTab === "form"}
                className={specialTab === "form" ? "is-active" : ""}
                onClick={() => setSpecialTab("form")}
              >
                등록
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={specialTab === "list"}
                className={specialTab === "list" ? "is-active" : ""}
                onClick={() => setSpecialTab("list")}
              >
                디데이 목록 {ddaySpecialDates.length}
              </button>
            </div>

            {specialTab === "form" ? (
              <form
                className="planner-form is-modal"
                onSubmit={handleSubmitSpecial}
              >
              <div className="planner-segmented" role="group">
                <button
                  type="button"
                  className={specialKind === "yearly" ? "is-active" : ""}
                  onClick={() => setSpecialKind("yearly")}
                >
                  기념일
                </button>
                <button
                  type="button"
                  className={specialKind === "dday" ? "is-active" : ""}
                  onClick={() => setSpecialKind("dday")}
                >
                  디데이
                </button>
              </div>
              <label>
                <span>이름</span>
                <input
                  type="text"
                  value={specialTitle}
                  maxLength={255}
                  required
                  placeholder={
                    specialKind === "yearly"
                      ? "생일, 기념일"
                      : "디데이 이름"
                  }
                  onChange={(event) =>
                    setSpecialTitle(event.target.value)
                  }
                />
              </label>
              {specialKind === "yearly" ? (
                <div className="planner-date-row">
                  <label>
                    <span>월</span>
                    <select
                      value={specialMonth}
                      onChange={(event) =>
                        setSpecialMonth(Number(event.target.value))
                      }
                    >
                      {Array.from({ length: 12 }, (_, index) => (
                        <option value={index + 1} key={index + 1}>
                          {index + 1}월
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>일</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={specialDay}
                      onChange={(event) =>
                        setSpecialDay(Number(event.target.value))
                      }
                    />
                  </label>
                </div>
              ) : (
                <label>
                  <span>날짜</span>
                  <input
                    type="date"
                    value={specialEventDate}
                    required
                    onChange={(event) =>
                      handleSpecialEventDateChange(event.target.value)
                    }
                  />
                </label>
              )}
              {specialKind === "dday" ? (
                <label className="planner-checkbox planner-special-pin">
                  <input
                    type="checkbox"
                    checked={specialPinned}
                    onChange={(event) =>
                      setSpecialPinned(event.target.checked)
                    }
                  />
                  <span>
                    날짜가 지나도 D+ 카운트로 계속 표시
                  </span>
                </label>
              ) : null}
              <div className="planner-form-actions">
                {editingSpecial !== null ? (
                  <button
                    type="button"
                    className="planner-text-button is-danger planner-special-delete"
                    disabled={specialSaving}
                    onClick={() => void handleDeleteSpecial(editingSpecial)}
                  >
                    삭제
                  </button>
                ) : null}
                {editingSpecialId !== null ? (
                  <button
                    type="button"
                    className="planner-text-button"
                    onClick={resetSpecialForm}
                  >
                    새로 등록
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="planner-primary"
                  disabled={specialSaving || !specialTitle.trim()}
                >
                  {specialSaving
                    ? "저장 중..."
                    : editingSpecialId !== null
                      ? "수정 저장"
                      : "등록"}
                </button>
              </div>
              </form>
            ) : (
              <div className="planner-special-manager">
                <input
                  type="search"
                  className="planner-special-search"
                  value={specialSearch}
                  placeholder="이름으로 디데이 검색"
                  aria-label="디데이 검색"
                  onChange={(event) =>
                    setSpecialSearch(event.target.value)
                  }
                />
                <div className="planner-special-list">
                  {filteredSpecialDates.length === 0 ? (
                    <p className="planner-empty">
                      {ddaySpecialDates.length === 0
                        ? "아직 등록된 디데이가 없습니다."
                        : "검색 결과가 없습니다."}
                    </p>
                  ) : (
                    filteredSpecialDates.map((item) => (
                      <div className="planner-special-item" key={item.id}>
                        <button
                          type="button"
                          className="planner-special-main"
                          onClick={() => {
                            startEditingSpecial(item);
                            setSpecialTab("form");
                          }}
                        >
                          <strong>{item.title}</strong>
                          <span>
                            {item.kind === "yearly"
                              ? `매년 ${item.month}월 ${item.day}일`
                              : `${item.event_date} · ${specialDdayLabel(
                                  item.event_date ?? "",
                                )}`}
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`planner-text-button planner-special-pin-toggle${
                            item.pinned ? " is-active" : ""
                          }`}
                          aria-pressed={item.pinned}
                          disabled={specialSaving}
                          onClick={() => void handleToggleSpecialPin(item)}
                        >
                          {item.pinned ? "고정 해제" : "고정"}
                        </button>
                        <button
                          type="button"
                          className="planner-text-button is-danger"
                          disabled={specialSaving}
                          onClick={() => void handleDeleteSpecial(item)}
                        >
                          삭제
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

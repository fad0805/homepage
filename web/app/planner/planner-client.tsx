"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiFetch } from "@/lib/api";
import {
  dateInputValue,
  formatDateTime,
  todayDateInputValue,
} from "@/lib/datetime";

import "@/public/styles/planner.scss";

type ScheduleType = "single" | "range";
type TaskStatus = "active" | "inactive" | "trashed";
type PlannerTab = "active" | "inactive" | "trashed";

interface PlannerTask {
  id: number;
  title: string;
  notes: string | null;
  schedule_type: ScheduleType;
  start_date: string;
  end_date: string;
  deadline_days: number | null;
  status: TaskStatus;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  inactive_at: string | null;
  trashed_at: string | null;
}

interface PlannerTasksResponse {
  today: string;
  tasks: PlannerTask[];
}

interface PlannerEventChange {
  field?: string;
  kind?: string;
  before?: unknown;
  after?: unknown;
}

interface PlannerEvent {
  id: number;
  entity_type: string;
  entity_id: number | null;
  action: string;
  title: string | null;
  changes: PlannerEventChange[] | null;
  occurred_at: string;
}

interface PlannerEventsResponse {
  events: PlannerEvent[];
}

interface PlannerEventPreview {
  available: boolean;
  entity_type: string;
  title: string | null;
  summary: string | null;
  content_html: string | null;
  fields: Record<string, string | null>;
}

interface TaskFormState {
  title: string;
  notes: string;
  scheduleType: ScheduleType;
  startDate: string;
  endDate: string;
  deadlineDays: number;
  pinned: boolean;
}

const ENTITY_LABELS: Record<string, string> = {
  book: "목차",
  chapter: "챕터",
  illustration: "삽화",
  character: "등장인물",
  character_location: "장소",
  link: "놀러가기",
  link_category: "링크 분류",
  book_category: "책장 분류",
  profile: "프로필",
  index: "인덱스",
  account: "계정",
  task: "일정",
};

const ACTION_LABELS: Record<string, string> = {
  created: "생성",
  updated: "수정",
  deleted: "삭제",
  completed: "완료",
};

const FIELD_LABELS: Record<string, string> = {
  title: "제목",
  subtitle: "부제",
  description: "설명",
  body: "본문",
  content_html: "내용",
  profile: "프로필 내용",
  tags: "태그",
  category: "분류",
  category_id: "분류",
  book_id: "책",
  visible: "공개",
  protected: "보호",
  pinned: "고정",
  taken_at: "촬영일",
  thumbnail: "썸네일",
  detail_image: "상세 이미지",
  banner_url: "배너",
  representative_url: "대표 이미지",
  representative_image_id: "대표 이미지",
  name: "이름",
  alt_name: "다른 이름",
  nickname: "닉네임",
  age: "나이",
  serif: "대사",
  comming_day: "등장일",
  location_id: "장소",
  layout: "배치",
  is_my_doll: "인형 여부",
  url: "URL",
  password: "비밀번호",
  slug: "URL 표시명",
  relationships: "관계",
  images: "이미지",
  head_doll: "머리 인형",
  body_doll: "몸 인형",
  published_at: "공개일",
  role: "권한",
  username: "아이디",
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate(),
  )}`;
}

function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

function monthBounds(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${pad2(lastDay)}`,
  };
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("ko-KR", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
  });
}

function monthCells(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = first.getUTCDay();
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, 1 - offset + index));
    return {
      date: `${date.getUTCFullYear()}-${pad2(
        date.getUTCMonth() + 1,
      )}-${pad2(date.getUTCDate())}`,
      inMonth: date.getUTCMonth() === month - 1,
      day: date.getUTCDate(),
    };
  });
}

function formatDateOnly(value: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

function formatDayLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("ko-KR", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function eventDate(event: PlannerEvent) {
  return dateInputValue(event.occurred_at);
}

function taskAppearsOn(task: PlannerTask, date: string, today: string) {
  if (task.status !== "active") return false;
  if (task.schedule_type === "single") {
    return date === today && task.start_date <= today && today <= task.end_date;
  }
  return task.start_date <= date && date <= task.end_date;
}

function sortTasks(tasks: PlannerTask[]) {
  return [...tasks].sort((a, b) => {
    if (a.end_date !== b.end_date) return a.end_date.localeCompare(b.end_date);
    return a.id - b.id;
  });
}

function changeValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "(없음)";
  if (Array.isArray(value)) return value.join(", ") || "(없음)";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fieldLabel(field?: string) {
  if (!field) return "내용";
  return FIELD_LABELS[field] || field;
}

function emptyForm(today: string): TaskFormState {
  return {
    title: "",
    notes: "",
    scheduleType: "single",
    startDate: today,
    endDate: addDays(today, 7),
    deadlineDays: 7,
    pinned: false,
  };
}

export default function PlannerClient({ username }: { username: string }) {
  const initialToday = todayDateInputValue();
  const [today, setToday] = useState(initialToday);
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState(initialToday);
  const [viewMonth, setViewMonth] = useState(initialToday.slice(0, 7));
  const [activeTab, setActiveTab] = useState<PlannerTab>("active");
  const [form, setForm] = useState<TaskFormState>(() => emptyForm(initialToday));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PlannerEvent | null>(null);
  const [preview, setPreview] = useState<PlannerEventPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const initializedToday = useRef(false);

  const loadTasks = useCallback(async () => {
    try {
      const data = await apiFetch<PlannerTasksResponse>("/api/planner/tasks", {
        cache: "no-store",
      });
      setToday(data.today);
      setTasks(sortTasks(data.tasks));
      if (!initializedToday.current) {
        initializedToday.current = true;
        setSelectedDate(data.today);
        setViewMonth(data.today.slice(0, 7));
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

  const loadEvents = useCallback(async (monthKey: string) => {
    const bounds = monthBounds(monthKey);
    setEventsLoading(true);
    try {
      const data = await apiFetch<PlannerEventsResponse>(
        `/api/planner/events?start=${bounds.start}&end=${bounds.end}`,
        { cache: "no-store" },
      );
      setEvents(data.events);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "이력을 불러오지 못했습니다.",
      );
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadEvents(viewMonth);
  }, [loadEvents, viewMonth]);

  useEffect(() => {
    if (!selectedEvent) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEvent(null);
        setPreview(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEvent]);

  const cells = useMemo(() => monthCells(viewMonth), [viewMonth]);
  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status === "active"),
    [tasks],
  );
  const inactiveTasks = useMemo(
    () => tasks.filter((task) => task.status === "inactive"),
    [tasks],
  );
  const trashedTasks = useMemo(
    () => tasks.filter((task) => task.status === "trashed"),
    [tasks],
  );
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

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm(today));
  };

  const refresh = async () => {
    await Promise.all([loadTasks(), loadEvents(viewMonth)]);
  };

  const changeMonth = (delta: number) => {
    const next = shiftMonth(viewMonth, delta);
    setViewMonth(next);
    setSelectedDate(`${next}-01`);
  };

  const selectDate = (date: string) => {
    setSelectedDate(date);
    const monthKey = date.slice(0, 7);
    if (monthKey !== viewMonth) {
      setViewMonth(monthKey);
    }
  };

  const startEditing = (task: PlannerTask) => {
    setEditingId(task.id);
    setForm({
      title: task.title,
      notes: task.notes || "",
      scheduleType: task.schedule_type,
      startDate: task.start_date,
      endDate: task.end_date,
      deadlineDays: task.deadline_days || 7,
      pinned: task.pinned,
    });
    setActiveTab("active");
    setError(null);
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 0);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim() || busyKey !== null) return;

    const key = editingId ? `update-${editingId}` : "create";
    setBusyKey(key);
    setError(null);
    try {
      const payload = {
        title: form.title,
        notes: form.notes || null,
        schedule_type: form.scheduleType,
        start_date: form.startDate || null,
        end_date: form.scheduleType === "range" ? form.endDate : null,
        deadline_days:
          form.scheduleType === "single" ? form.deadlineDays : null,
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
      resetForm();
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
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
      await apiFetch<PlannerTask>(`/api/planner/tasks/${task.id}/restore`, {
        method: "POST",
      });
      await refresh();
      setActiveTab("active");
      setSelectedDate(today);
      setViewMonth(today.slice(0, 7));
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
      await apiFetch<PlannerTask>(`/api/planner/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ pinned: !task.pinned }),
      });
      await loadTasks();
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

  const renderTaskMeta = (task: PlannerTask) => (
    <p className="planner-task-meta">
      {task.schedule_type === "single" ? (
        <>
          단일 · 마감 {formatDateOnly(task.end_date)}
          {task.deadline_days ? ` · ${task.deadline_days}일` : ""}
        </>
      ) : (
        <>
          범위 · {formatDateOnly(task.start_date)} ~{" "}
          {formatDateOnly(task.end_date)}
        </>
      )}
      {task.pinned ? " · 고정" : ""}
    </p>
  );

  const renderActiveTask = (task: PlannerTask) => (
    <li className="planner-task-item" key={task.id}>
      <div className="planner-task-main">
        <div className="planner-task-title-row">
          <strong>{task.title}</strong>
          {task.pinned ? (
            <span className="planner-pin-badge">고정</span>
          ) : null}
        </div>
        {renderTaskMeta(task)}
        {task.notes ? (
          <p className="planner-task-notes">{task.notes}</p>
        ) : null}
      </div>
      <div className="planner-task-actions">
        <button
          type="button"
          className={`planner-text-button${task.pinned ? " is-active" : ""}`}
          aria-pressed={task.pinned}
          disabled={busyKey !== null}
          onClick={() => handlePin(task)}
        >
          {busyKey === `pin-${task.id}`
            ? "변경 중"
            : task.pinned
              ? "고정 해제"
              : "고정"}
        </button>
        <button
          type="button"
          className="planner-text-button"
          disabled={busyKey !== null}
          onClick={() => startEditing(task)}
        >
          수정
        </button>
        <button
          type="button"
          className="planner-text-button is-accent"
          disabled={busyKey !== null}
          onClick={() => handleComplete(task)}
        >
          {busyKey === `complete-${task.id}` ? "완료 중" : "완료"}
        </button>
        <button
          type="button"
          className="planner-text-button is-danger"
          disabled={busyKey !== null}
          onClick={() => handleTrash(task)}
        >
          {busyKey === `trash-${task.id}` ? "이동 중" : "삭제"}
        </button>
      </div>
    </li>
  );

  const renderStoredTask = (task: PlannerTask, trashed: boolean) => (
    <li className="planner-task-item" key={task.id}>
      <div className="planner-task-main">
        <div className="planner-task-title-row">
          <strong>{task.title}</strong>
          {task.pinned ? (
            <span className="planner-pin-badge">고정</span>
          ) : null}
        </div>
        {renderTaskMeta(task)}
        <p className="planner-task-meta">
          {trashed
            ? `휴지통 이동 ${formatDateTime(task.trashed_at)} · 30일 뒤 영구 삭제`
            : task.pinned
              ? `비활성 ${formatDateTime(task.inactive_at)} · 고정됨 (자동 휴지통 이동 방지)`
              : `비활성 ${formatDateTime(task.inactive_at)} · 마감 30일 뒤 휴지통`}
        </p>
        {task.notes ? (
          <p className="planner-task-notes">{task.notes}</p>
        ) : null}
      </div>
      <div className="planner-task-actions">
        <button
          type="button"
          className="planner-text-button is-accent"
          disabled={busyKey !== null}
          onClick={() => handleRestore(task)}
        >
          {busyKey === `restore-${task.id}` ? "복구 중" : "복구"}
        </button>
        {!trashed ? (
          <button
            type="button"
            className={`planner-text-button${task.pinned ? " is-active" : ""}`}
            aria-pressed={task.pinned}
            disabled={busyKey !== null}
            onClick={() => handlePin(task)}
          >
            {busyKey === `pin-${task.id}`
              ? "변경 중"
              : task.pinned
                ? "고정 해제"
                : "고정"}
          </button>
        ) : null}
        {trashed ? (
          <button
            type="button"
            className="planner-text-button is-danger"
            disabled={busyKey !== null}
            onClick={() => handlePermanentDelete(task)}
          >
            {busyKey === `permanent-${task.id}` ? "삭제 중" : "영구 삭제"}
          </button>
        ) : (
          <button
            type="button"
            className="planner-text-button is-danger"
            disabled={busyKey !== null}
            onClick={() => handleTrash(task)}
          >
            {busyKey === `trash-${task.id}` ? "이동 중" : "휴지통"}
          </button>
        )}
      </div>
    </li>
  );

  return (
    <div id="planner-page">
      <main>
        <header className="planner-header">
          <div>
            <p className="planner-eyebrow">{username}의 개인 달력</p>
            <h1>일정</h1>
          </div>
          <div className="planner-tabs" role="tablist" aria-label="일정 보기">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "active"}
              className={activeTab === "active" ? "is-active" : ""}
              onClick={() => setActiveTab("active")}
            >
              진행 중
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "inactive"}
              className={activeTab === "inactive" ? "is-active" : ""}
              onClick={() => setActiveTab("inactive")}
            >
              비활성 {inactiveTasks.length}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "trashed"}
              className={activeTab === "trashed" ? "is-active" : ""}
              onClick={() => setActiveTab("trashed")}
            >
              휴지통 {trashedTasks.length}
            </button>
          </div>
        </header>

        {error ? <p className="planner-error">{error}</p> : null}

        {loading ? (
          <p className="planner-status">불러오는 중...</p>
        ) : (
          <div className="planner-layout">
            <section className="planner-calendar-card" aria-label="월간 달력">
              <div className="planner-calendar-header">
                <button
                  type="button"
                  className="planner-icon-button"
                  aria-label="이전 달"
                  onClick={() => changeMonth(-1)}
                >
                  ‹
                </button>
                <h2>{monthLabel(viewMonth)}</h2>
                <button
                  type="button"
                  className="planner-icon-button"
                  aria-label="다음 달"
                  onClick={() => changeMonth(1)}
                >
                  ›
                </button>
              </div>
              <div className="planner-weekdays" aria-hidden="true">
                {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="planner-calendar-grid">
                {cells.map((cell) => {
                  const dayTasks = activeTasks.filter((task) =>
                    taskAppearsOn(task, cell.date, today),
                  );
                  const dayEvents = events.filter(
                    (event) => eventDate(event) === cell.date,
                  );
                  const total = dayTasks.length + dayEvents.length;
                  return (
                    <button
                      type="button"
                      key={cell.date}
                      className={[
                        "planner-calendar-day",
                        cell.inMonth ? "" : "is-outside",
                        cell.date === today ? "is-today" : "",
                        cell.date === selectedDate ? "is-selected" : "",
                        total > 0 ? "has-items" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => selectDate(cell.date)}
                      aria-label={`${formatDayLabel(cell.date)}${total > 0 ? `, 항목 ${total}개` : ""}`}
                    >
                      <span className="planner-day-number">{cell.day}</span>
                      {total > 0 ? (
                        <span className="planner-day-marks">
                          {dayTasks.length > 0 ? (
                            <span className="planner-day-mark is-task">
                              {dayTasks.length}
                            </span>
                          ) : null}
                          {dayEvents.length > 0 ? (
                            <span className="planner-day-mark is-history">
                              {dayEvents.length}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="planner-side">
              {activeTab === "active" ? (
                <>
                  <form
                    ref={formRef}
                    className="planner-form"
                    onSubmit={handleSubmit}
                  >
                    <div className="planner-form-heading">
                      <h2>{editingId ? "일정 수정" : "새 일정"}</h2>
                      {editingId ? (
                        <button
                          type="button"
                          className="planner-text-button"
                          onClick={resetForm}
                        >
                          취소
                        </button>
                      ) : null}
                    </div>
                    <label>
                      <span>제목</span>
                      <input
                        type="text"
                        value={form.title}
                        maxLength={255}
                        placeholder="무엇을 해야 하나요?"
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            title: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>메모</span>
                      <textarea
                        rows={3}
                        value={form.notes}
                        maxLength={4000}
                        placeholder="선택 사항"
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <div className="planner-segmented" role="group" aria-label="일정 방식">
                      <button
                        type="button"
                        className={
                          form.scheduleType === "single" ? "is-active" : ""
                        }
                        aria-pressed={form.scheduleType === "single"}
                        onClick={() =>
                          setForm((previous) => ({
                            ...previous,
                            scheduleType: "single",
                          }))
                        }
                      >
                        단일 날짜
                      </button>
                      <button
                        type="button"
                        className={
                          form.scheduleType === "range" ? "is-active" : ""
                        }
                        aria-pressed={form.scheduleType === "range"}
                        onClick={() =>
                          setForm((previous) => ({
                            ...previous,
                            scheduleType: "range",
                          }))
                        }
                      >
                        범위
                      </button>
                    </div>
                    <div className="planner-form-row">
                      <label>
                        <span>시작일</span>
                        <input
                          type="date"
                          value={form.startDate}
                          onChange={(event) =>
                            setForm((previous) => ({
                              ...previous,
                              startDate: event.target.value,
                            }))
                          }
                        />
                      </label>
                      {form.scheduleType === "single" ? (
                        <label>
                          <span>마감 기간(일)</span>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={form.deadlineDays}
                            onChange={(event) =>
                              setForm((previous) => ({
                                ...previous,
                                deadlineDays: Number(event.target.value) || 1,
                              }))
                            }
                          />
                        </label>
                      ) : (
                        <label>
                          <span>종료일</span>
                          <input
                            type="date"
                            value={form.endDate}
                            min={form.startDate}
                            onChange={(event) =>
                              setForm((previous) => ({
                                ...previous,
                                endDate: event.target.value,
                              }))
                            }
                          />
                        </label>
                      )}
                    </div>
                    {form.scheduleType === "single" ? (
                      <p className="planner-form-hint">
                        오늘 정오 이전 등록은 오늘부터, 정오 이후 등록은
                        내일부터 마감 기간이 시작됩니다. 오후에 등록해도
                        오늘 달력에는 바로 표시됩니다.
                      </p>
                    ) : (
                      <p className="planner-form-hint">
                        범위 일정은 시작일부터 종료일까지 매일 표시됩니다.
                      </p>
                    )}
                    <label className="planner-checkbox">
                      <input
                        type="checkbox"
                        checked={form.pinned}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            pinned: event.target.checked,
                          }))
                        }
                      />
                      <span>고정 (비활성화되어도 자동 휴지통 이동 방지)</span>
                    </label>
                    <button
                      type="submit"
                      className="planner-primary"
                      disabled={
                        busyKey !== null || !form.title.trim()
                      }
                    >
                      {busyKey === "create"
                        ? "추가 중..."
                        : busyKey === `update-${editingId}`
                          ? "저장 중..."
                          : editingId
                            ? "저장"
                            : "추가"}
                    </button>
                  </form>

                  <section className="planner-day-panel">
                    <div className="planner-day-panel-header">
                      <div>
                        <h2>{formatDayLabel(selectedDate)}</h2>
                        <p>
                          일정 {selectedTasks.length}개 · 이력{" "}
                          {selectedEvents.length}개
                        </p>
                      </div>
                      {selectedDate !== today ? (
                        <button
                          type="button"
                          className="planner-text-button"
                          onClick={() => selectDate(today)}
                        >
                          오늘로
                        </button>
                      ) : null}
                    </div>

                    {selectedTasks.length === 0 ? (
                      <p className="planner-empty">
                        이 날짜에 표시할 진행 중 일정이 없습니다.
                      </p>
                    ) : (
                      <ul className="planner-task-list">
                        {selectedTasks.map(renderActiveTask)}
                      </ul>
                    )}

                    <div className="planner-history-section">
                      <h3>변경 이력</h3>
                      {eventsLoading ? (
                        <p className="planner-status">이력을 불러오는 중...</p>
                      ) : selectedEvents.length === 0 ? (
                        <p className="planner-empty">
                          이 날짜의 변경 이력이 없습니다.
                        </p>
                      ) : (
                        <ul className="planner-history-list">
                          {selectedEvents.map((event) => (
                            <li key={event.id}>
                              <button
                                type="button"
                                className="planner-history-item"
                                onClick={() => openEvent(event)}
                              >
                                <span className="planner-history-kind">
                                  {ENTITY_LABELS[event.entity_type] ||
                                    event.entity_type}
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
                      )}
                    </div>
                  </section>
                </>
              ) : (
                <section className="planner-day-panel">
                  <div className="planner-day-panel-header">
                    <div>
                      <h2>
                        {activeTab === "inactive" ? "비활성 일정" : "휴지통"}
                      </h2>
                      <p>
                        {activeTab === "inactive"
                          ? "마감일이 지난 일정입니다. 복구하면 오늘부터 다시 시작합니다."
                          : "휴지통에 있는 일정은 30일 뒤 영구 삭제됩니다."}
                      </p>
                    </div>
                  </div>
                  {activeTab === "inactive" ? (
                    inactiveTasks.length === 0 ? (
                      <p className="planner-empty">비활성 일정이 없습니다.</p>
                    ) : (
                      <ul className="planner-task-list">
                        {inactiveTasks.map((task) =>
                          renderStoredTask(task, false),
                        )}
                      </ul>
                    )
                  ) : trashedTasks.length === 0 ? (
                    <p className="planner-empty">휴지통이 비어 있습니다.</p>
                  ) : (
                    <ul className="planner-task-list">
                      {trashedTasks.map((task) =>
                        renderStoredTask(task, true),
                      )}
                    </ul>
                  )}
                </section>
              )}
            </aside>
          </div>
        )}
      </main>

      {selectedEvent ? (
        <div
          className="planner-modal-overlay"
          role="presentation"
          onClick={closeEvent}
        >
          <div
            className="planner-modal"
            role="dialog"
            aria-modal="true"
            aria-label="변경 이력 상세"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="planner-modal-header">
              <div>
                <p className="planner-modal-eyebrow">
                  {ENTITY_LABELS[selectedEvent.entity_type] ||
                    selectedEvent.entity_type}
                  {" · "}
                  {ACTION_LABELS[selectedEvent.action] ||
                    selectedEvent.action}
                </p>
                <h2>{selectedEvent.title || "제목 없음"}</h2>
                <p className="planner-modal-time">
                  {formatDateTime(selectedEvent.occurred_at)}
                </p>
              </div>
              <button
                type="button"
                className="planner-icon-button"
                aria-label="닫기"
                onClick={closeEvent}
              >
                ×
              </button>
            </div>

            {selectedEvent.changes && selectedEvent.changes.length > 0 ? (
              <div className="planner-change-list">
                {selectedEvent.changes.map((change, index) => (
                  <div className="planner-change" key={`${change.field}-${index}`}>
                    <strong>{fieldLabel(change.field)}</strong>
                    {change.kind === "text" ||
                    change.kind === "value" ? (
                      <>
                        <p className="planner-change-before">
                          {changeValue(change.before)}
                        </p>
                        <p className="planner-change-after">
                          {changeValue(change.after)}
                        </p>
                      </>
                    ) : change.kind === "image_changed" ? (
                      <p>이미지가 변경되었습니다.</p>
                    ) : change.kind === "link_changed" ? (
                      <p>링크가 변경되었습니다.</p>
                    ) : change.kind === "password_changed" ? (
                      <p>비밀번호가 변경되었습니다.</p>
                    ) : (
                      <p>내용이 변경되었습니다.</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="planner-empty">
                {selectedEvent.action === "created"
                  ? "새로 생성된 항목입니다."
                  : selectedEvent.action === "deleted"
                    ? "삭제된 항목입니다. 스냅샷은 보관하지 않습니다."
                    : selectedEvent.action === "completed"
                      ? "완료된 일정입니다. 완료 이력만 보관합니다."
                      : "저장된 상세 변경 내용이 없습니다."}
              </p>
            )}

            <div className="planner-preview">
              <h3>현재 내용</h3>
              {previewLoading ? (
                <p className="planner-status">불러오는 중...</p>
              ) : preview?.available ? (
                <>
                  {preview.summary ? (
                    <p className="planner-preview-summary">
                      {preview.summary}
                    </p>
                  ) : null}
                  {Object.keys(preview.fields || {}).length > 0 ? (
                    <dl className="planner-preview-fields">
                      {Object.entries(preview.fields).map(([key, value]) =>
                        value ? (
                          <div key={key}>
                            <dt>{fieldLabel(key)}</dt>
                            <dd>{value}</dd>
                          </div>
                        ) : null,
                      )}
                    </dl>
                  ) : null}
                  {preview.content_html ? (
                    <div
                      className="planner-preview-content"
                      dangerouslySetInnerHTML={{
                        __html: preview.content_html,
                      }}
                    />
                  ) : null}
                  {!preview.summary &&
                  !preview.content_html &&
                  Object.keys(preview.fields || {}).length === 0 ? (
                    <p className="planner-empty">
                      표시할 현재 내용이 없습니다.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="planner-empty">
                  삭제되었거나 완료된 항목이라 현재 내용을 볼 수 없습니다.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

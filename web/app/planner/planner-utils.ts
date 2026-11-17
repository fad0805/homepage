import { dateInputValue, todayDateInputValue } from "@/lib/datetime";

import type {
  CalendarCell,
  CalendarWeek,
  PlannerDateMarker,
  PlannerEvent,
  PlannerSpecialDate,
  PlannerTask,
  RangeSegment,
  TaskFormState,
} from "./planner-types";
import {
  FIELD_LABELS,
  UNASSIGNED_TASK_COLOR,
} from "./planner-types";

export function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate(),
  )}`;
}

export function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

export function monthBounds(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${pad2(lastDay)}`,
  };
}

export function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("ko-KR", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
  });
}

export function monthCells(monthKey: string): CalendarCell[] {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
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

export function buildCalendarWeeks(
  cells: CalendarCell[],
  tasks: PlannerTask[],
): CalendarWeek[] {
  const rangeTasks = tasks.filter(
    (task) => task.status === "active" && task.schedule_type === "range",
  );
  const weeks: CalendarWeek[] = [];

  for (let offset = 0; offset < cells.length; offset += 7) {
    const weekCells = cells.slice(offset, offset + 7);
    const weekStart = weekCells[0].date;
    const weekEnd = weekCells[weekCells.length - 1].date;
    const segments: RangeSegment[] = [];

    for (const task of rangeTasks) {
      if (!task.start_date || !task.end_date) {
        continue;
      }
      if (task.end_date < weekStart || task.start_date > weekEnd) {
        continue;
      }

      const segmentStart =
        task.start_date > weekStart ? task.start_date : weekStart;
      const segmentEnd = task.end_date < weekEnd ? task.end_date : weekEnd;
      const startIndex = weekCells.findIndex(
        (cell) => cell.date === segmentStart,
      );
      const endIndex = weekCells.findIndex(
        (cell) => cell.date === segmentEnd,
      );
      if (startIndex < 0 || endIndex < startIndex) {
        continue;
      }

      segments.push({
        task,
        startIndex,
        endIndex,
        lane: 0,
        isStart: task.start_date >= weekStart,
        isEnd: task.end_date <= weekEnd,
        key: `${task.id}-${offset}`,
      });
    }

    segments.sort(
      (a, b) =>
        a.startIndex - b.startIndex ||
        a.endIndex - b.endIndex ||
        a.task.id - b.task.id,
    );

    const laneEnds: number[] = [];
    for (const segment of segments) {
      let lane = laneEnds.findIndex(
        (end) => end < segment.startIndex,
      );
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(segment.endIndex);
      } else {
        laneEnds[lane] = segment.endIndex;
      }
      segment.lane = lane;
    }

    weeks.push({
      cells: weekCells,
      segments,
      outside: weekCells.every((cell) => !cell.inMonth),
    });
  }

  return weeks;
}

export function formatDateOnly(value: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

export function specialDdayLabel(value: string) {
  const today = todayDateInputValue();
  const target = dateInputValue(value);
  const diff = Math.round(
    (Date.parse(`${target}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
      86400000,
  );
  if (diff === 0) return "D-Day";
  return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
}

export function specialDateAppearsOn(item: PlannerSpecialDate, date: string) {
  if (item.kind === "yearly") {
    return (
      item.month === Number(date.slice(5, 7)) &&
      item.day === Number(date.slice(8, 10))
    );
  }
  return item.event_date === date;
}

export function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) -
      Date.parse(`${from}T00:00:00Z`)) /
      86400000,
  );
}

export function dateMarkerAppearsOn(
  marker: PlannerDateMarker,
  date: string,
) {
  if (marker.interval_days && marker.interval_days > 0) {
    if (date < marker.marker_date) return false;
    return daysBetween(marker.marker_date, date) % marker.interval_days === 0;
  }
  return marker.marker_date === date;
}

export function formatDayLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("ko-KR", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export function eventDate(event: PlannerEvent) {
  return dateInputValue(event.occurred_at);
}

export function taskAppearsOn(task: PlannerTask, date: string, today: string) {
  if (
    task.status !== "active" ||
    task.schedule_type === "undated" ||
    !task.start_date ||
    !task.end_date
  ) {
    return false;
  }
  if (task.schedule_type === "single") {
    if (task.start_date > today) {
      return date === task.start_date;
    }
    return date === today && task.start_date <= today && today <= task.end_date;
  }
  return task.start_date <= date && date <= task.end_date;
}

export function taskColor(task: PlannerTask) {
  return task.color || UNASSIGNED_TASK_COLOR;
}

export function sortTasks(tasks: PlannerTask[]) {
  return [...tasks].sort((a, b) => {
    const aEnd = a.end_date || "9999-12-31";
    const bEnd = b.end_date || "9999-12-31";
    if (aEnd !== bEnd) return aEnd.localeCompare(bEnd);
    return a.id - b.id;
  });
}

export function sortColorGroupTasks(tasks: PlannerTask[]) {
  return [...tasks].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "active" ? -1 : 1;
    }
    const aEnd = a.end_date || "9999-12-31";
    const bEnd = b.end_date || "9999-12-31";
    if (aEnd !== bEnd) {
      return aEnd.localeCompare(bEnd);
    }
    return a.id - b.id;
  });
}

export function changeValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "(없음)";
  if (Array.isArray(value)) return value.join(", ") || "(없음)";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function fieldLabel(field?: string) {
  if (!field) return "내용";
  return FIELD_LABELS[field] || field;
}

export function emptyForm(today: string): TaskFormState {
  return {
    title: "",
    notes: "",
    colorId: null,
    scheduleType: "single",
    startDate: today,
    endDate: addDays(today, 7),
    deadlineDays: 7,
    pinned: false,
    undated: false,
  };
}

export function orderedRange(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

export function colorGroupLabel(group: {
  key: string;
  name: string | null;
  color: string | null;
}) {
  return group.key === "unassigned"
    ? "미지정"
    : group.name || (group.color || "").toUpperCase();
}

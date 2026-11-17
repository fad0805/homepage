import type { PointerEvent as ReactPointerEvent } from "react";

import type {
  CalendarWeek,
  PlannerSpecialDate,
  PlannerTask,
} from "./planner-types";
import {
  formatDayLabel,
  monthLabel,
  specialDateAppearsOn,
  taskAppearsOn,
  taskColor,
} from "./planner-utils";

interface PlannerCalendarProps {
  viewMonth: string;
  monthPickerOpen: boolean;
  weeks: CalendarWeek[];
  calendarTasks: PlannerTask[];
  specialDates: PlannerSpecialDate[];
  today: string;
  selectedDate: string;
  dragBounds: [string, string] | null;
  historyCounts: Map<string, number>;
  historyColors: Map<string, string[]>;
  onChangeMonth: (delta: number) => void;
  onOpenMonthPicker: () => void;
  onOpenSpecialManager: () => void;
  onStartDrag: (
    event: ReactPointerEvent<HTMLButtonElement>,
    date: string,
  ) => void;
  onSelectDate: (date: string) => void;
}

export function PlannerCalendar({
  viewMonth,
  monthPickerOpen,
  weeks,
  calendarTasks,
  specialDates,
  today,
  selectedDate,
  dragBounds,
  historyCounts,
  historyColors,
  onChangeMonth,
  onOpenMonthPicker,
  onOpenSpecialManager,
  onStartDrag,
  onSelectDate,
}: PlannerCalendarProps) {
  return (
    <section className="planner-calendar-card" aria-label="월간 달력">
      <div className="planner-calendar-header">
        <button
          type="button"
          className="planner-icon-button planner-calendar-prev"
          aria-label="이전 달"
          onClick={() => onChangeMonth(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          className="planner-calendar-month"
          aria-haspopup="dialog"
          aria-expanded={monthPickerOpen}
          aria-label={`${monthLabel(viewMonth)} 년월 선택`}
          onClick={onOpenMonthPicker}
        >
          {monthLabel(viewMonth)}
        </button>
        <button
          type="button"
          className="planner-icon-button planner-calendar-next"
          aria-label="다음 달"
          onClick={() => onChangeMonth(1)}
        >
          ›
        </button>
        <button
          type="button"
          className="planner-text-button planner-special-open"
          onClick={onOpenSpecialManager}
        >
          기념일
        </button>
      </div>
      <p className="planner-calendar-hint">
        날짜를 드래그하면 범위 일정을 만들 수 있습니다.
      </p>
      <div className="planner-weekdays" aria-hidden="true">
        {["월", "화", "수", "목", "금", "토", "일"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="planner-calendar-grid">
        {weeks.map((week) => (
          <div className="planner-week" key={week.cells[0].date}>
            <div className="planner-week-days">
              {week.cells.map((cell) => {
                const dayTasks = calendarTasks.filter((task) =>
                  taskAppearsOn(task, cell.date, today),
                );
                const daySingleTasks = dayTasks.filter(
                  (task) => task.schedule_type === "single",
                );
                const dayHistoryColors =
                  historyColors.get(cell.date) ?? [];
                const dayTaskCount = dayTasks.length;
                const daySpecialDates = specialDates.filter(
                  (item) =>
                    specialDateAppearsOn(item, cell.date),
                );
                const historyCount =
                  historyCounts.get(cell.date) ?? 0;
                const historyLevel =
                  historyCount >= 7
                    ? 4
                    : historyCount >= 4
                      ? 3
                      : historyCount >= 2
                        ? 2
                        : historyCount > 0
                          ? 1
                          : 0;
                const inDragRange =
                  dragBounds !== null &&
                  dragBounds[0] <= cell.date &&
                  cell.date <= dragBounds[1];
                const isDragEdge =
                  dragBounds !== null &&
                  (cell.date === dragBounds[0] ||
                    cell.date === dragBounds[1]);
                return (
                  <button
                    type="button"
                    key={cell.date}
                    data-calendar-date={cell.date}
                    className={[
                      "planner-calendar-day",
                      cell.inMonth ? "" : "is-outside",
                      cell.date === today ? "is-today" : "",
                      cell.date === selectedDate ? "is-selected" : "",
                      historyLevel > 0
                        ? `history-level-${historyLevel}`
                        : "",
                      dayTaskCount > 0 ||
                      daySpecialDates.length > 0
                        ? "has-items"
                        : "",
                      inDragRange ? "is-drag-range" : "",
                      isDragEdge ? "is-drag-edge" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onPointerDown={(event) =>
                      onStartDrag(event, cell.date)
                    }
                    onClick={(event) => {
                      if (event.detail === 0) {
                        onSelectDate(cell.date);
                      }
                    }}
                    aria-label={`${formatDayLabel(cell.date)}${
                      dayTaskCount > 0
                        ? `, 일정 ${dayTaskCount}개`
                        : ""
                    }${
                      daySpecialDates.length > 0
                        ? `, 기념일 ${daySpecialDates.length}개`
                        : ""
                    }${
                      historyCount > 0
                        ? `, 변경 이력 ${historyCount}개`
                        : ""
                    }${
                      dayHistoryColors.length > 0
                        ? `, 완료 태스크 흔적 ${dayHistoryColors.length}개`
                        : ""
                    }`}
                  >
                    <span className="planner-day-number">
                      {cell.day}
                    </span>
                    {daySpecialDates.length > 0 ? (
                      <span className="planner-day-specials">
                        {daySpecialDates
                          .slice(0, 2)
                          .map((item) => (
                            <span
                              className={`planner-day-special is-${item.kind}`}
                              key={item.id}
                              title={item.title}
                            >
                              <span className="planner-day-special-mark">
                                {item.kind === "dday" ? "D" : "✦"}
                              </span>
                              <span>{item.title}</span>
                            </span>
                          ))}
                        {daySpecialDates.length > 2 ? (
                          <span className="planner-day-special-more">
                            +{daySpecialDates.length - 2}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    {daySingleTasks.length > 0 ||
                    dayHistoryColors.length > 0 ? (
                      <span className="planner-day-marks">
                        {daySingleTasks.length > 0 ? (
                          <span className="planner-day-task-colors">
                            {daySingleTasks.map((task) => (
                              <span
                                key={task.id}
                                className="planner-day-task-color"
                                style={{
                                  backgroundColor: taskColor(task),
                                }}
                              />
                            ))}
                          </span>
                        ) : null}
                        {dayHistoryColors.length > 0 ? (
                          <span className="planner-day-history-colors">
                            {dayHistoryColors
                              .slice(0, 4)
                              .map((color) => (
                                <span
                                  key={color}
                                  className="planner-day-history-color"
                                  style={{
                                    backgroundColor: color,
                                  }}
                                />
                              ))}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {week.segments.length > 0 ? (
              <div
                className={[
                  "planner-week-ranges",
                  week.outside ? "is-outside" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {week.segments.map((segment) => (
                  <div
                    key={segment.key}
                    className={[
                      "planner-range-bar",
                      segment.isStart ? "is-start" : "",
                      segment.isEnd ? "is-end" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      gridColumn: `${segment.startIndex + 1} / ${
                        segment.endIndex + 2
                      }`,
                      gridRow: segment.lane + 1,
                    }}
                    title={segment.task.title}
                  >
                    <span className="planner-range-title">
                      {segment.task.title}
                    </span>
                    <span
                      className="planner-range-line"
                      style={{
                        backgroundColor: taskColor(segment.task),
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

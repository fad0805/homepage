import { WEEKDAY_SHORT } from "@/lib/bookmark";
import { todayDateInputValue } from "@/lib/datetime";

import { monthCalendarDays, monthLabel, shiftPeriod } from "./bookmark-utils";

interface BookmarkCalendarModalProps {
  month: string;
  hoverDate: string | null;
  periodStart: string;
  onMonthChange: (updater: (previous: string) => string) => void;
  onHoverDateChange: (date: string | null) => void;
  onSelectDate: (date: string) => void;
  onClose: () => void;
  calendarRange: (value: string) => { start: string; end: string };
}

export function BookmarkCalendarModal({
  month,
  hoverDate,
  periodStart,
  onMonthChange,
  onHoverDateChange,
  onSelectDate,
  onClose,
  calendarRange,
}: BookmarkCalendarModalProps) {
  return (
      <div
        className="bookmark-modal-overlay"
        role="presentation"
        onClick={() => onClose()}
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
              onClick={() => onClose()}
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
                onMonthChange((previous) =>
                  shiftPeriod(previous, "month", -1),
                )
              }
            >
              ‹
            </button>
            <strong>{monthLabel(month)}</strong>
            <button
              type="button"
              className="bookmark-icon-button"
              aria-label="다음 달"
              onClick={() =>
                onMonthChange((previous) =>
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
            onMouseLeave={() => onHoverDateChange(null)}
          >
            {monthCalendarDays(month).map((day) => {
              const selectedRange = calendarRange(periodStart);
              const hoverRange = hoverDate
                ? calendarRange(hoverDate)
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
                    onHoverDateChange(day.key)
                  }
                  onFocus={() => onHoverDateChange(day.key)}
                  onClick={() => onSelectDate(day.key)}
                >
                  {day.day}
                </button>
              );
            })}
          </div>
          <div className="bookmark-period-modal-footer">
            <button
              type="button"
              className="bookmark-period-modal-today"
              onClick={() => onSelectDate(todayDateInputValue())}
            >
              오늘
            </button>
          </div>
        </div>
      </div>
  );
}

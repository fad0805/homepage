import type { ReactNode } from "react";

import { CloverIcon } from "@/app/bookmark/clover-rating";
import { formatTime24h, type BookmarkPeriod } from "@/lib/bookmark";

import type {
  PlannerEvent,
  PlannerSpecialDate,
  PlannerTask,
} from "./planner-types";
import { formatDateOnly, specialDdayLabel } from "./planner-utils";
import { PlannerHistoryList } from "./planner-history-list";

interface PlannerDayDetailProps {
  upcomingDdays: PlannerSpecialDate[];
  selectedDate: string;
  specialDates: PlannerSpecialDate[];
  dayBookmark: BookmarkPeriod | null;
  eventsLoading: boolean;
  tasks: PlannerTask[];
  events: PlannerEvent[];
  renderTaskCard: (task: PlannerTask) => ReactNode;
  onOpenSpecialList: () => void;
  onOpenSpecialEditor: (item: PlannerSpecialDate) => void;
  onOpenEvent: (event: PlannerEvent) => void;
}

export function PlannerDayDetail({
  upcomingDdays,
  selectedDate,
  specialDates,
  dayBookmark,
  eventsLoading,
  tasks,
  events,
  renderTaskCard,
  onOpenSpecialList,
  onOpenSpecialEditor,
  onOpenEvent,
}: PlannerDayDetailProps) {
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
      <PlannerHistoryList events={dateEvents} onOpen={onOpenEvent} />
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
          onClick={onOpenSpecialList}
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
              onClick={() => onOpenSpecialEditor(item)}
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
              onClick={() => onOpenSpecialEditor(item)}
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

  return renderDayDetail(tasks, events, specialDates);
}

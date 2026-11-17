import type { ReactNode } from "react";

import { formatDayLabel } from "./planner-utils";

interface PlannerDatePanelProps {
  selectedDate: string;
  today: string;
  taskCount: number;
  specialCount: number;
  eventCount: number;
  onSelectToday: () => void;
  onOpenNewTask: () => void;
  children: ReactNode;
}

export function PlannerDatePanel({
  selectedDate,
  today,
  taskCount,
  specialCount,
  eventCount,
  onSelectToday,
  onOpenNewTask,
  children,
}: PlannerDatePanelProps) {
  return (
    <section className="planner-day-panel planner-date-panel">
      <div className="planner-day-panel-header">
        <div>
          <p className="planner-eyebrow">
            {selectedDate === today ? "오늘" : "선택한 날짜"}
          </p>
          <h2>{formatDayLabel(selectedDate)}</h2>
          <p>
            일정 {taskCount}개 · 기념일{" "}
            {specialCount}개 · 이력{" "}
            {eventCount}개
          </p>
        </div>
        <div className="planner-day-panel-actions">
          {selectedDate !== today ? (
            <button
              type="button"
              className="planner-text-button"
              onClick={() => onSelectToday()}
            >
              오늘로
            </button>
          ) : null}
          <button
            type="button"
            className="planner-primary"
            onClick={onOpenNewTask}
          >
            {selectedDate && selectedDate < today
              ? "완료 기록"
              : "새 일정"}
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}

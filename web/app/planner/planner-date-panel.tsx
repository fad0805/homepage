import type { ReactNode } from "react";

import type { PlannerDateMarker } from "./planner-types";
import { formatDayLabel } from "./planner-utils";

interface PlannerDatePanelProps {
  selectedDate: string;
  today: string;
  taskCount: number;
  specialCount: number;
  eventCount: number;
  markers: PlannerDateMarker[];
  onSelectToday: () => void;
  onOpenNewTask: () => void;
  onOpenMarker: (marker: PlannerDateMarker) => void;
  children: ReactNode;
}

export function PlannerDatePanel({
  selectedDate,
  today,
  taskCount,
  specialCount,
  eventCount,
  markers,
  onSelectToday,
  onOpenNewTask,
  onOpenMarker,
  children,
}: PlannerDatePanelProps) {
  return (
    <section className="planner-day-panel planner-date-panel">
      <div className="planner-day-panel-header">
        <div>
          <div className="planner-day-label-row">
            {markers.length > 0 ? (
              <span className="planner-day-inline-markers">
                {markers.map((marker) => (
                  <button
                    type="button"
                    key={marker.id}
                    className={`planner-day-inline-marker${
                      marker.is_dday ? " is-dday" : ""
                    }`}
                    title={`${marker.title} 내용 보기`}
                    aria-label={`${marker.title} 내용 보기`}
                    onClick={() => onOpenMarker(marker)}
                  >
                    {marker.marker}
                  </button>
                ))}
              </span>
            ) : null}
            <p className="planner-eyebrow">
              {selectedDate === today ? "오늘" : "선택한 날짜"}
            </p>
          </div>
          <h2>{formatDayLabel(selectedDate)}</h2>
          <p>
            일정 {taskCount}개 · 마커 {markers.length}개
            {specialCount > 0 ? ` · 기념일 ${specialCount}개` : ""} ·
            이력 {eventCount}개
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

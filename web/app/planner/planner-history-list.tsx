import { formatDateTime } from "@/lib/datetime";

import type { PlannerEvent } from "./planner-types";
import { ACTION_LABELS, ENTITY_LABELS } from "./planner-types";

interface PlannerHistoryListProps {
  events: PlannerEvent[];
  onOpen: (event: PlannerEvent) => void;
}

export function PlannerHistoryList({
  events,
  onOpen,
}: PlannerHistoryListProps) {
  return (
    <ul className="planner-history-list">
      {events.map((event) => (
        <li key={event.id}>
          <button
            type="button"
            className="planner-history-item"
            onClick={() => onOpen(event)}
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
}

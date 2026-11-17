import type { ReactNode } from "react";

import type {
  PlannerEvent,
  PlannerSearchResults,
  PlannerTask,
} from "./planner-types";
import { formatDateOnly } from "./planner-utils";

interface PlannerSearchPanelProps {
  searchFrom: string;
  searchTo: string;
  searchQuery: string;
  searching: boolean;
  searchResults: PlannerSearchResults | null;
  onClose: () => void;
  renderTaskCard: (task: PlannerTask) => ReactNode;
  renderHistoryItems: (items: PlannerEvent[]) => ReactNode;
}

export function PlannerSearchPanel({
  searchFrom,
  searchTo,
  searchQuery,
  searching,
  searchResults,
  onClose,
  renderTaskCard,
  renderHistoryItems,
}: PlannerSearchPanelProps) {
  return (
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
          onClick={onClose}
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
  );
}

import type { ReactNode } from "react";

import type {
  PlannerColorGroup,
  PlannerTask,
  PlannerTab,
} from "./planner-types";
import { UNASSIGNED_TASK_COLOR } from "./planner-types";
import { colorGroupLabel } from "./planner-utils";

interface PlannerInactivePanelProps {
  activeTab: PlannerTab;
  inactiveTasks: PlannerTask[];
  trashedTasks: PlannerTask[];
  visibleInactiveTasks: PlannerTask[];
  inactiveColorGroups: PlannerColorGroup[];
  selectedInactiveGroup: PlannerColorGroup | null;
  inactiveFilterOpen: boolean;
  inactiveColorFilter: string | null;
  onToggleFilter: () => void;
  onColorFilterChange: (key: string | null) => void;
  onAddTask: () => void;
  renderTaskCard: (task: PlannerTask) => ReactNode;
}

export function PlannerInactivePanel({
  activeTab,
  inactiveTasks,
  trashedTasks,
  visibleInactiveTasks,
  inactiveColorGroups,
  selectedInactiveGroup,
  inactiveFilterOpen,
  inactiveColorFilter,
  onToggleFilter,
  onColorFilterChange,
  onAddTask,
  renderTaskCard,
}: PlannerInactivePanelProps) {
  return (
      <section className="planner-day-panel">
        <div className="planner-day-panel-header">
          <div>
            <h2>
              {activeTab === "inactive" ? "비활성 일정" : "휴지통"}
            </h2>
            <p>
              {activeTab === "inactive"
                ? "마감일이 지난 일정과 등록일 미지정 일정입니다. 여기서 추가한 일정은 비활성으로 저장됩니다."
                : "휴지통에 있는 일정은 30일 뒤 영구 삭제됩니다."}
            </p>
          </div>
          {activeTab === "inactive" ? (
            <div className="planner-day-panel-actions">
              <button
                type="button"
                className="planner-primary"
                onClick={onAddTask}
              >
                추가
              </button>
            </div>
          ) : null}
        </div>
        {activeTab === "inactive" ? (
          <>
            {inactiveTasks.length > 0 ? (
              <div className="planner-inactive-filter">
                <button
                  type="button"
                  className="planner-inactive-filter-toggle"
                  aria-expanded={inactiveFilterOpen}
                  onClick={onToggleFilter}
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
                        onColorFilterChange(null)
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
                            onColorFilterChange(
                              inactiveColorFilter === group.key
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
  );
}

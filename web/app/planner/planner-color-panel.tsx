import type { ReactNode } from "react";

import type { PlannerColorGroup, PlannerTask } from "./planner-types";
import { UNASSIGNED_TASK_COLOR } from "./planner-types";
import { colorGroupLabel } from "./planner-utils";

interface PlannerColorPanelProps {
  activeCount: number;
  chipCount: number;
  colorGroups: PlannerColorGroup[];
  selectedKeys: string[];
  selectedGroup: PlannerColorGroup | null;
  onSelectGroup: (key: string) => void;
  onClearSelection: () => void;
  onOpenChipManager: () => void;
  renderTaskCard: (task: PlannerTask) => ReactNode;
}

export function PlannerColorPanel({
  activeCount,
  chipCount,
  colorGroups,
  selectedKeys,
  selectedGroup,
  onSelectGroup,
  onClearSelection,
  onOpenChipManager,
  renderTaskCard,
}: PlannerColorPanelProps) {
  return (
    <section className="planner-day-panel planner-color-panel">
      <div className="planner-day-panel-header">
        <div>
          <p className="planner-eyebrow">색상별</p>
          <h2>색상 칩</h2>
          <p>
            활성 일정 {activeCount}개 · 칩{" "}
            {chipCount}개
          </p>
        </div>
        <div className="planner-day-panel-actions">
          <button
            type="button"
            className="planner-primary"
            onClick={onOpenChipManager}
          >
            칩 관리
          </button>
        </div>
      </div>

      {colorGroups.length === 0 ? (
        <p className="planner-empty">
          색상 칩에 지정된 활성 일정이 없습니다.
        </p>
      ) : (
        <>
          <div className="planner-color-swatch-grid">
            {colorGroups.map((group) => {
              const selected =
                selectedKeys.includes(group.key);
              const label = colorGroupLabel(group);
              return (
                <button
                  type="button"
                  key={group.key}
                  className={[
                    "planner-color-swatch-button",
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
                    onSelectGroup(group.key)
                  }
                />
              );
            })}
          </div>
          {selectedGroup ? (
            <div className="planner-color-task-panel">
              <div className="planner-color-task-header">
                <div className="planner-color-task-title">
                  <span
                    className="planner-color-group-swatch"
                    style={{
                      backgroundColor:
                        selectedGroup.color ||
                        UNASSIGNED_TASK_COLOR,
                    }}
                  />
                  <strong>
                    {colorGroupLabel(selectedGroup)}
                  </strong>
                  <span className="planner-color-task-count">
                    활성 {selectedGroup.tasks.length}개
                  </span>
                </div>
                <button
                  type="button"
                  className="planner-text-button"
                  onClick={() => onClearSelection()}
                >
                  선택 해제
                </button>
              </div>
              {selectedGroup.tasks.length === 0 ? (
                <p className="planner-empty">
                  이 칩에 등록된 활성 일정이 없습니다.
                </p>
              ) : (
                <ul className="planner-task-list">
                  {selectedGroup.tasks.map(
                    renderTaskCard,
                  )}
                </ul>
              )}
            </div>
          ) : (
            <p className="planner-empty">
              색상 칩을 선택하면 해당 일정이 표시됩니다.
            </p>
          )}
        </>
      )}
    </section>
  );
}

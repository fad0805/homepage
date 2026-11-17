import type { PlannerTab } from "./planner-types";

interface PlannerTabsProps {
  activeTab: PlannerTab;
  inactiveCount: number;
  trashedCount: number;
  onSelect: (tab: PlannerTab) => void;
}

export function PlannerTabs({
  activeTab,
  inactiveCount,
  trashedCount,
  onSelect,
}: PlannerTabsProps) {
  return (
    <div className="planner-tabs" role="tablist" aria-label="일정 보기">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "active"}
        className={activeTab === "active" ? "is-active" : ""}
        onClick={() => onSelect("active")}
      >
        진행 중
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "colors"}
        className={activeTab === "colors" ? "is-active" : ""}
        onClick={() => onSelect("colors")}
      >
        색상별
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "inactive"}
        className={activeTab === "inactive" ? "is-active" : ""}
        onClick={() => onSelect("inactive")}
      >
        비활성 {inactiveCount}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "trashed"}
        className={activeTab === "trashed" ? "is-active" : ""}
        onClick={() => onSelect("trashed")}
      >
        휴지통 {trashedCount}
      </button>
    </div>

  );
}

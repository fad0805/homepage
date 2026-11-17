import type { PlannerTask } from "./planner-types";
import { formatDateOnly, taskColor } from "./planner-utils";
import { PlannerNoteContent } from "./planner-note-content";

interface PlannerTaskCardProps {
  task: PlannerTask;
  noteSavingId: number | null;
  busy: boolean;
  onOpen: (task: PlannerTask) => void;
  onComplete: (task: PlannerTask) => void;
  onPin: (task: PlannerTask) => void;
  onToggleNote: (index: number) => void;
}

export function PlannerTaskCard({
  task,
  noteSavingId,
  busy,
  onOpen,
  onComplete,
  onPin,
  onToggleNote,
}: PlannerTaskCardProps) {
  return (
      <li
        className="planner-task-item planner-task-card"
        key={task.id}
        role="button"
        tabIndex={0}
        style={{
          borderLeftColor: taskColor(task),
          borderRightColor: taskColor(task),
        }}
        onClick={() => onOpen(task)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(task);
          }
        }}
      >
        <div className="planner-task-main">
          <div className="planner-task-title-row">
            {task.status === "active" ? (
              <input
                type="checkbox"
                className="planner-task-check"
                checked={false}
                disabled={busy}
                aria-label={`${task.title} 완료`}
                onClick={(event) => event.stopPropagation()}
                onChange={() => onComplete(task)}
              />
            ) : null}
            <strong>{task.title}</strong>
            <span className="planner-task-deadline">
              {task.end_date
                ? `마감 ${formatDateOnly(task.end_date)}`
                : "등록일 미지정"}
            </span>
          </div>
          {task.notes ? (
            <div
              className={`planner-task-notes${
                task.status === "active" ? " has-check" : ""
              }`}
            >
              <PlannerNoteContent
                notes={task.notes}
                disabled={
                  task.status === "trashed" || noteSavingId !== null
                }
                onToggle={(index) =>
                  void onToggleNote(index)
                }
              />
            </div>
          ) : null}
        </div>
        {task.status === "inactive" ? (
          <button
            type="button"
            className="planner-text-button planner-task-pin-toggle"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onPin(task);
            }}
          >
            {task.pinned ? "고정 해제" : "고정"}
          </button>
        ) : null}
      </li>
  );
}

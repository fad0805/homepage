import type { PlannerColor, PlannerTask } from "./planner-types";
import { formatDateOnly, taskColor } from "./planner-utils";
import { PlannerNoteContent } from "./planner-note-content";

interface PlannerTaskDetailModalProps {
  task: PlannerTask;
  selectedColor: PlannerColor | null;
  error: string | null;
  noteSavingId: number | null;
  busyKey: string | null;
  onClose: () => void;
  onToggleNote: (index: number) => void;
  onRestore: (task: PlannerTask) => void;
  onPermanentDelete: (task: PlannerTask) => void;
  onPin: (task: PlannerTask) => void;
  onEdit: (task: PlannerTask) => void;
  onTrash: (task: PlannerTask) => void;
  onDeactivate: (task: PlannerTask) => void;
  onComplete: (task: PlannerTask) => void;
}

export function PlannerTaskDetailModal({
  task,
  selectedColor,
  error,
  noteSavingId,
  busyKey,
  onClose,
  onToggleNote,
  onRestore,
  onPermanentDelete,
  onPin,
  onEdit,
  onTrash,
  onDeactivate,
  onComplete,
}: PlannerTaskDetailModalProps) {
  return (
      <div
        className="planner-modal-overlay is-task"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="planner-modal planner-task-detail-modal"
          role="dialog"
          aria-modal="true"
          aria-label="일정 상세"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="planner-modal-header">
            <div>
              <p className="planner-modal-eyebrow">일정</p>
              <h2>{task.title}</h2>
              <p className="planner-task-detail-meta">
                <span className="planner-task-detail-color">
                  <span
                    className="planner-task-color"
                    style={{
                      backgroundColor: taskColor(task),
                    }}
                    aria-hidden="true"
                  />
                  <span>
                    {taskColor?.name ||
                      (task.color || "").toUpperCase() ||
                      "미지정"}
                  </span>
                </span>
                <span>
                  {task.end_date
                    ? `마감 ${formatDateOnly(task.end_date)}`
                    : "등록일 미지정"}
                </span>
                {task.status === "inactive" ? (
                  <span className="planner-pin-badge">비활성</span>
                ) : task.status === "trashed" ? (
                  <span className="planner-pin-badge">휴지통</span>
                ) : null}
                {task.pinned ? (
                  <span className="planner-pin-badge">고정</span>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              className="planner-icon-button"
              aria-label="닫기"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          {error ? <p className="planner-error">{error}</p> : null}
          {task.notes ? (
            <div className="planner-task-detail-notes">
              <h3>메모</h3>
              <PlannerNoteContent
                notes={task.notes}
                disabled={
                  task.status === "trashed" ||
                  noteSavingId !== null
                }
                onToggle={(index) =>
                  void onToggleNote(index)
                }
              />
            </div>
          ) : null}
          <div className="planner-task-detail-actions">
            {task.status === "trashed" ? (
              <>
                <button
                  type="button"
                  className="planner-text-button is-accent"
                  disabled={busyKey !== null}
                  onClick={() => onRestore(task)}
                >
                  {busyKey === `restore-${task.id}`
                    ? "복구 중"
                    : "복구"}
                </button>
                <button
                  type="button"
                  className="planner-text-button is-danger"
                  disabled={busyKey !== null}
                  onClick={() => onPermanentDelete(task)}
                >
                  {busyKey === `permanent-${task.id}`
                    ? "삭제 중"
                    : "영구 삭제"}
                </button>
              </>
            ) : task.status === "inactive" ? (
              <>
                <button
                  type="button"
                  className={`planner-text-button${
                    task.pinned ? " is-active" : ""
                  }`}
                  aria-pressed={task.pinned}
                  disabled={busyKey !== null}
                  onClick={() => onPin(task)}
                >
                  {busyKey === `pin-${task.id}`
                    ? "변경 중"
                    : task.pinned
                      ? "고정 해제"
                      : "고정"}
                </button>
                <button
                  type="button"
                  className="planner-text-button"
                  disabled={busyKey !== null}
                  onClick={() => onEdit(task)}
                >
                  수정
                </button>
                {task.schedule_type !== "undated" ? (
                  <button
                    type="button"
                    className="planner-text-button is-accent"
                    disabled={busyKey !== null}
                    onClick={() => onRestore(task)}
                  >
                    {busyKey === `restore-${task.id}`
                      ? "복구 중"
                      : "복구"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="planner-text-button is-danger"
                  disabled={busyKey !== null}
                  onClick={() => onTrash(task)}
                >
                  {busyKey === `trash-${task.id}`
                    ? "이동 중"
                    : "삭제"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`planner-text-button${
                    task.pinned ? " is-active" : ""
                  }`}
                  aria-pressed={task.pinned}
                  disabled={busyKey !== null}
                  onClick={() => onPin(task)}
                >
                  {busyKey === `pin-${task.id}`
                    ? "변경 중"
                    : task.pinned
                      ? "고정 해제"
                      : "고정"}
                </button>
                <button
                  type="button"
                  className="planner-text-button"
                  disabled={busyKey !== null}
                  onClick={() => onEdit(task)}
                >
                  수정
                </button>
                <button
                  type="button"
                  className="planner-text-button"
                  disabled={busyKey !== null}
                  onClick={() => onDeactivate(task)}
                >
                  {busyKey === `deactivate-${task.id}`
                    ? "비활성 중"
                    : "비활성화"}
                </button>
                <button
                  type="button"
                  className="planner-text-button is-accent"
                  disabled={busyKey !== null}
                  onClick={() => onComplete(task)}
                >
                  {busyKey === `complete-${task.id}`
                    ? "완료 중"
                    : "완료"}
                </button>
                <button
                  type="button"
                  className="planner-text-button is-danger"
                  disabled={busyKey !== null}
                  onClick={() => onTrash(task)}
                >
                  {busyKey === `trash-${task.id}`
                    ? "이동 중"
                    : "삭제"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
  );
}

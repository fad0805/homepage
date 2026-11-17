import type {
  Dispatch,
  DragEvent as ReactDragEvent,
  FormEventHandler,
  MutableRefObject,
  ReactNode,
  SetStateAction,
} from "react";

import type { PlannerColor } from "./planner-types";

interface PlannerChipManagerProps {
  error: string | null;
  savedColors: PlannerColor[];
  draggingColorId: number | null;
  dragOverColorId: number | null;
  colorOrderSaving: boolean;
  deletingColorId: number | null;
  editingColorId: number | null;
  editChipColor: string;
  editChipName: string;
  chipSaving: boolean;
  draggingColorIdRef: MutableRefObject<number | null>;
  setDraggingColorId: Dispatch<SetStateAction<number | null>>;
  setDragOverColorId: Dispatch<SetStateAction<number | null>>;
  renderChipCreator: (selectForForm: boolean, compact: boolean) => ReactNode;
  onClose: () => void;
  onDropChip: (event: ReactDragEvent<HTMLLIElement>, saved: PlannerColor) => void;
  onMoveColor: (saved: PlannerColor, delta: number) => void;
  onStartEdit: (saved: PlannerColor) => void;
  onDelete: (saved: PlannerColor) => void;
  onEditSubmit: FormEventHandler<HTMLFormElement>;
  onEditColorChange: (color: string) => void;
  onEditNameChange: (name: string) => void;
  onCancelEdit: () => void;
}

export function PlannerChipManager({
  error,
  savedColors,
  draggingColorId,
  dragOverColorId,
  colorOrderSaving,
  deletingColorId,
  editingColorId,
  editChipColor,
  editChipName,
  chipSaving,
  draggingColorIdRef,
  setDraggingColorId,
  setDragOverColorId,
  renderChipCreator,
  onClose,
  onDropChip,
  onMoveColor,
  onStartEdit,
  onDelete,
  onEditSubmit,
  onEditColorChange,
  onEditNameChange,
  onCancelEdit,
}: PlannerChipManagerProps) {
  return (
    <div
      className="planner-modal-overlay is-task"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="planner-modal planner-chip-modal"
        role="dialog"
        aria-modal="true"
        aria-label="칩 관리"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="planner-modal-header">
          <div>
            <p className="planner-modal-eyebrow">색상별</p>
            <h2>칩 관리</h2>
            <p className="planner-chip-hint">
              드래그해서 순서를 바꾸고, 칩을 추가·수정·삭제할
              수 있습니다.
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
        {error ? <p className="planner-error">{error}</p> : null}
        <div className="planner-chip-add">
          <h3>칩 추가</h3>
          {renderChipCreator(false, false)}
        </div>
        <div className="planner-chip-manager">
          <h3>칩 순서</h3>
          {savedColors.length === 0 ? (
            <p className="planner-empty">
              등록된 색상 칩이 없습니다.
            </p>
          ) : (
            <ul className="planner-chip-manager-list">
              {savedColors.map((saved) => (
                <li
                  key={saved.id}
                  data-chip-id={saved.id}
                  className={[
                    "planner-chip-manager-item",
                    draggingColorId === saved.id
                      ? "is-dragging"
                      : "",
                    dragOverColorId === saved.id
                      ? "is-drag-over"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onDragOver={(event) => {
                    const sourceId =
                      draggingColorIdRef.current ??
                      draggingColorId;
                    if (
                      sourceId === null ||
                      sourceId === saved.id ||
                      colorOrderSaving
                    ) {
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragOverColorId(saved.id);
                  }}
                  onDragLeave={(event) => {
                    if (
                      event.relatedTarget instanceof Node &&
                      event.currentTarget.contains(
                        event.relatedTarget,
                      )
                    ) {
                      return;
                    }
                    setDragOverColorId((previous) =>
                      previous === saved.id ? null : previous,
                    );
                  }}
                  onDrop={(event) =>
                    onDropChip(event, saved)
                  }
                >
                  <div className="planner-chip-manager-row">
                    <span
                      className="planner-chip-drag-handle"
                      role="button"
                      tabIndex={0}
                      draggable={!colorOrderSaving}
                      aria-label={`${
                        saved.name || saved.color
                      } 순서 변경`}
                      aria-keyshortcuts="ArrowUp ArrowDown"
                      title="드래그해서 순서 변경 (↑↓ 키도 가능)"
                      onDragStart={(event) => {
                        if (colorOrderSaving) {
                          event.preventDefault();
                          return;
                        }
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "text/plain",
                          String(saved.id),
                        );
                        draggingColorIdRef.current = saved.id;
                        setDraggingColorId(saved.id);
                        setDragOverColorId(null);
                      }}
                      onDragEnd={() => {
                        draggingColorIdRef.current = null;
                        setDraggingColorId(null);
                        setDragOverColorId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          onMoveColor(saved, -1);
                        } else if (
                          event.key === "ArrowDown"
                        ) {
                          event.preventDefault();
                          onMoveColor(saved, 1);
                        }
                      }}
                    >
                      ⠿
                    </span>
                    <span
                      className="planner-chip-swatch"
                      style={{ backgroundColor: saved.color }}
                      aria-hidden="true"
                    />
                    <span className="planner-chip-name">
                      {saved.name || saved.color.toUpperCase()}
                    </span>
                    <span className="planner-chip-value">
                      {saved.color.toUpperCase()}
                    </span>
                    <div className="planner-chip-actions">
                      <button
                        type="button"
                        className="planner-text-button"
                        onClick={() => onStartEdit(saved)}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="planner-text-button is-danger"
                        disabled={deletingColorId !== null}
                        onClick={() =>
                          void onDelete(saved)
                        }
                      >
                        {deletingColorId === saved.id
                          ? "삭제 중"
                          : "삭제"}
                      </button>
                    </div>
                  </div>
                  {editingColorId === saved.id ? (
                    <form
                      className="planner-color-creator planner-color-edit"
                      onSubmit={onEditSubmit}
                    >
                      <input
                        type="color"
                        value={editChipColor}
                        aria-label="색상 칩 색상"
                        onChange={(event) =>
                          onEditColorChange(event.target.value)
                        }
                      />
                      <span className="planner-color-value">
                        {editChipColor.toUpperCase()}
                      </span>
                      <input
                        type="text"
                        className="planner-color-name-input"
                        value={editChipName}
                        maxLength={80}
                        placeholder="칩 이름 (선택)"
                        aria-label="색상 칩 이름"
                        onChange={(event) =>
                          onEditNameChange(event.target.value)
                        }
                      />
                      <button
                        type="submit"
                        className="planner-text-button"
                        disabled={chipSaving}
                      >
                        {chipSaving ? "저장 중" : "저장"}
                      </button>
                      <button
                        type="button"
                        className="planner-text-button"
                        onClick={onCancelEdit}
                      >
                        취소
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

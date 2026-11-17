import type {
  Dispatch,
  FormEventHandler,
  ReactNode,
  SetStateAction,
} from "react";

import type { PlannerColor, TaskFormState } from "./planner-types";
import { addDays } from "./planner-utils";

interface PlannerTaskModalProps {
  editingId: number | null;
  recordCompleted: boolean;
  createInactive: boolean;
  form: TaskFormState;
  setForm: Dispatch<SetStateAction<TaskFormState>>;
  error: string | null;
  busyKey: string | null;
  today: string;
  savedColors: PlannerColor[];
  selectedFormColor: PlannerColor | null;
  showChipCreator: boolean;
  setShowChipCreator: Dispatch<SetStateAction<boolean>>;
  renderChipCreator: (selectForForm: boolean) => ReactNode;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export function PlannerTaskModal({
  editingId,
  recordCompleted,
  createInactive,
  form,
  setForm,
  error,
  busyKey,
  today,
  savedColors,
  selectedFormColor,
  showChipCreator,
  setShowChipCreator,
  renderChipCreator,
  onClose,
  onSubmit,
}: PlannerTaskModalProps) {
  return (
      <div
        className="planner-modal-overlay is-task"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="planner-modal planner-task-modal"
          role="dialog"
          aria-modal="true"
          aria-label={
            editingId
              ? "일정 수정"
              : recordCompleted
                ? "완료 일정 기록"
                : createInactive
                  ? "비활성 일정 추가"
                  : "새 일정"
          }
          onClick={(event) => event.stopPropagation()}
        >
          <form className="planner-form is-modal" onSubmit={onSubmit}>
            <div className="planner-form-heading">
              <h2>
                {editingId
                  ? "일정 수정"
                  : recordCompleted
                    ? "완료 일정 기록"
                    : createInactive
                      ? "비활성 일정 추가"
                      : "새 일정"}
              </h2>
              <button
                type="button"
                className="planner-text-button"
                onClick={onClose}
              >
                취소
              </button>
            </div>
            {error ? <p className="planner-error">{error}</p> : null}
            {createInactive ? (
              <p className="planner-form-hint">
                추가한 일정은 비활성 일정으로 저장됩니다.
              </p>
            ) : null}
            <label>
              <span>제목</span>
              <input
                type="text"
                value={form.title}
                maxLength={255}
                placeholder={
                  recordCompleted
                    ? "무엇을 했나요?"
                    : "무엇을 해야 하나요?"
                }
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>메모</span>
              <textarea
                rows={3}
                value={form.notes}
                maxLength={4000}
                placeholder="선택 사항"
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
            <p className="planner-form-hint">
              메모는 `- 목록`, `- [ ] 체크` 형식을 지원합니다.
            </p>
            {recordCompleted ? null : (
              <label className="planner-checkbox">
                <input
                  type="checkbox"
                  checked={form.undated}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      undated: event.target.checked,
                    }))
                  }
                />
                <span>등록일 미지정 (항상 비활성)</span>
              </label>
            )}
            {recordCompleted || form.undated ? null : (
              <div
                className="planner-segmented"
                role="group"
                aria-label="일정 방식"
              >
                <button
                  type="button"
                  className={
                    form.scheduleType === "single" ? "is-active" : ""
                  }
                  aria-pressed={form.scheduleType === "single"}
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      scheduleType: "single",
                    }))
                  }
                >
                  단일 날짜
                </button>
                <button
                  type="button"
                  className={
                    form.scheduleType === "range" ? "is-active" : ""
                  }
                  aria-pressed={form.scheduleType === "range"}
                  onClick={() =>
                    setForm((previous) => ({
                      ...previous,
                      scheduleType: "range",
                    }))
                  }
                >
                  범위
                </button>
              </div>
            )}
            {form.undated ? null : (
              <div
                className={`planner-form-row${
                  recordCompleted && form.scheduleType === "single"
                    ? " is-single"
                    : ""
                }`}
              >
              <label>
                <span>
                  {recordCompleted && form.scheduleType === "single"
                    ? "완료일"
                    : "시작일"}
                </span>
                <input
                  type="date"
                  value={form.startDate}
                  max={recordCompleted ? addDays(today, -1) : undefined}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      startDate: event.target.value,
                    }))
                  }
                />
              </label>
              {recordCompleted && form.scheduleType === "single" ? (
                null
              ) : form.scheduleType === "single" ? (
                <label>
                  <span>마감 기간(일)</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={form.deadlineDays}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        deadlineDays:
                          Number(event.target.value) || 1,
                      }))
                    }
                  />
                </label>
              ) : (
                <label>
                  <span>{recordCompleted ? "완료일" : "종료일"}</span>
                  <input
                    type="date"
                    value={form.endDate}
                    min={form.startDate}
                    max={recordCompleted ? addDays(today, -1) : undefined}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        endDate: event.target.value,
                      }))
                    }
                  />
                </label>
              )}
              </div>
            )}
            {recordCompleted ? null : (
              <div className="planner-color-field">
                <span className="planner-field-label">색상 칩</span>
                <div className="planner-color-chips">
                  <button
                    type="button"
                    className={`planner-color-chip is-none${
                      form.colorId === null ? " is-active" : ""
                    }`}
                    aria-pressed={form.colorId === null}
                    onClick={() =>
                      setForm((previous) => ({
                        ...previous,
                        colorId: null,
                      }))
                    }
                  >
                    미지정
                  </button>
                  {savedColors.map((saved) => (
                    <button
                      key={saved.id}
                      type="button"
                      className={`planner-color-chip${
                        form.colorId === saved.id ? " is-active" : ""
                      }`}
                      style={{ backgroundColor: saved.color }}
                      aria-label={`색상 칩 ${saved.name || saved.color}`}
                      aria-pressed={form.colorId === saved.id}
                      title={
                        saved.name
                          ? `${saved.name} (${saved.color})`
                          : saved.color
                      }
                      onClick={() =>
                        setForm((previous) => ({
                          ...previous,
                          colorId: saved.id,
                        }))
                      }
                    />
                  ))}
                  <button
                    type="button"
                    className="planner-color-chip-add"
                    aria-label="새 색상 칩"
                    onClick={() =>
                      setShowChipCreator((previous) => !previous)
                    }
                  >
                    +
                  </button>
                </div>
                {selectedFormColor ? (
                  <span className="planner-color-selected-name">
                    {selectedFormColor.name ||
                      selectedFormColor.color.toUpperCase()}
                  </span>
                ) : null}
                {showChipCreator ? renderChipCreator(true) : null}
                {savedColors.length === 0 ? (
                  <p className="planner-form-hint">
                    색상 칩을 만들면 일정을 색상별로 모아볼 수 있습니다.
                  </p>
                ) : null}
              </div>
            )}
            {form.undated ? (
              <p className="planner-form-hint">
                등록일 미지정 일정은 항상 비활성으로 저장됩니다.
              </p>
            ) : recordCompleted ? (
              <p className="planner-form-hint">
                {form.scheduleType === "range"
                  ? "과거 범위 일정은 완료 이력으로 저장됩니다. 완료일은 범위의 마지막 날이며, 제목·메모·완료일만 남습니다."
                  : "과거 일정은 완료 이력으로 저장됩니다. 제목·메모·완료일만 남습니다."}
              </p>
            ) : form.scheduleType === "single" ? (
              <p className="planner-form-hint">
                {form.startDate === today
                  ? "오늘 정오 이전 등록은 오늘부터, 정오 이후 등록은 내일부터 마감 기간이 시작됩니다. 오후에 등록해도 오늘 달력에는 바로 표시됩니다."
                  : form.startDate > today
                    ? "미래 시작일은 시작일부터 마감 기간이 계산됩니다."
                    : form.startDate
                      ? "이미 시작된 일정은 기존 마감 기준을 유지합니다."
                      : "시작일을 선택해주세요."}
              </p>
            ) : (
              <p className="planner-form-hint">
                범위 일정은 시작일부터 종료일까지 매일 표시됩니다.
              </p>
            )}
            {recordCompleted ? null : (
              <label className="planner-checkbox">
                <input
                  type="checkbox"
                  checked={form.pinned}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      pinned: event.target.checked,
                    }))
                  }
                />
                <span>고정 (비활성화되어도 자동 휴지통 이동 방지)</span>
              </label>
            )}
            <button
              type="submit"
              className="planner-primary"
              disabled={busyKey !== null || !form.title.trim()}
            >
              {busyKey === "create"
                ? recordCompleted
                  ? "기록 중..."
                  : "추가 중..."
                : busyKey === `update-${editingId}`
                  ? "저장 중..."
                  : editingId
                    ? "저장"
                    : recordCompleted
                      ? "완료로 기록"
                      : "추가"}
            </button>
          </form>
        </div>
      </div>
  );
}

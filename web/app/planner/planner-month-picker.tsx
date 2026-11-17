import type { Dispatch, SetStateAction } from "react";

interface PlannerMonthPickerProps {
  year: number;
  month: number;
  years: number[];
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onClose: () => void;
  onApply: () => void;
}

export function PlannerMonthPicker({
  year,
  month,
  years,
  onYearChange,
  onMonthChange,
  onClose,
  onApply,
}: PlannerMonthPickerProps) {
  return (
    <div
      className="planner-modal-overlay is-task"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="planner-modal planner-month-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-label="년월 선택"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="planner-modal-header">
          <div>
            <p className="planner-eyebrow">CALENDAR</p>
            <h2>년월 선택</h2>
          </div>
          <button
            type="button"
            className="planner-text-button"
            onClick={onClose}
          >
            닫기
          </button>
        </header>
        <form
          className="planner-month-picker-form"
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <div className="planner-month-picker-fields">
            <label>
              <span>년</span>
              <select
                value={year}
                onChange={(event) =>
                  onYearChange(Number(event.target.value))
                }
              >
                {years.map((year) => (
                  <option value={year} key={year}>
                    {year}년
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>월</span>
              <select
                value={month}
                onChange={(event) =>
                  onMonthChange(Number(event.target.value))
                }
              >
                {Array.from({ length: 12 }, (_, index) => (
                  <option value={index + 1} key={index + 1}>
                    {index + 1}월
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="planner-form-actions">
            <button
              type="button"
              className="planner-text-button"
              onClick={onClose}
            >
              취소
            </button>
            <button type="submit" className="planner-primary">
              이동
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

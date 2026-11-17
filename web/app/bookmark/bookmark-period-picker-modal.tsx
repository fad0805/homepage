import { useState } from "react";

import {
  dateKey,
  parseDateKey,
  shiftPeriod,
} from "./bookmark-utils";

type PeriodPickerLevel = "month" | "quarter" | "year" | "decade";

interface BookmarkPeriodPickerModalProps {
  level: PeriodPickerLevel;
  value: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

const LEVEL_LABELS: Record<PeriodPickerLevel, string> = {
  month: "월 선택",
  quarter: "분기 선택",
  year: "연도 선택",
  decade: "연대 선택",
};

interface PeriodOption {
  value: string;
  label: string;
}

function decadeStartYear(year: number) {
  return Math.floor(year / 10) * 10;
}

function centuryStartYear(year: number) {
  return Math.floor(year / 100) * 100;
}

function initialCursor(value: string, level: PeriodPickerLevel) {
  const year = parseDateKey(value).getUTCFullYear();
  if (level === "month" || level === "quarter") {
    return dateKey(new Date(Date.UTC(year, 0, 1)));
  }
  if (level === "year") {
    return dateKey(
      new Date(Date.UTC(decadeStartYear(year), 0, 1)),
    );
  }
  return dateKey(
    new Date(Date.UTC(centuryStartYear(year), 0, 1)),
  );
}

function cursorStep(level: PeriodPickerLevel) {
  if (level === "month" || level === "quarter") return 1;
  if (level === "year") return 10;
  return 100;
}

function cursorLabel(cursor: string, level: PeriodPickerLevel) {
  const year = parseDateKey(cursor).getUTCFullYear();
  if (level === "month" || level === "quarter") {
    return `${year}년`;
  }
  if (level === "year") {
    return `${year}년대`;
  }
  return `${year}년대 ~ ${year + 90}년대`;
}

function periodOptions(
  cursor: string,
  level: PeriodPickerLevel,
): PeriodOption[] {
  const year = parseDateKey(cursor).getUTCFullYear();
  if (level === "month") {
    return Array.from({ length: 12 }, (_, index) => ({
      value: dateKey(new Date(Date.UTC(year, index, 1))),
      label: `${index + 1}월`,
    }));
  }
  if (level === "quarter") {
    return Array.from({ length: 4 }, (_, index) => ({
      value: dateKey(new Date(Date.UTC(year, index * 3, 1))),
      label: `${index + 1}분기`,
    }));
  }
  if (level === "year") {
    return Array.from({ length: 10 }, (_, index) => {
      const optionYear = year + index;
      return {
        value: dateKey(new Date(Date.UTC(optionYear, 0, 1))),
        label: `${optionYear}년`,
      };
    });
  }
  return Array.from({ length: 10 }, (_, index) => {
    const optionYear = year + index * 10;
    return {
      value: dateKey(new Date(Date.UTC(optionYear, 0, 1))),
      label: `${optionYear}년대`,
    };
  });
}

export function BookmarkPeriodPickerModal({
  level,
  value,
  onSelect,
  onClose,
}: BookmarkPeriodPickerModalProps) {
  const [cursor, setCursor] = useState(() =>
    initialCursor(value, level),
  );
  const options = periodOptions(cursor, level);

  const moveCursor = (delta: number) => {
    setCursor((previous) =>
      shiftPeriod(
        previous,
        "year",
        delta * cursorStep(level),
      ),
    );
  };

  return (
    <div
      className="bookmark-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="bookmark-modal bookmark-period-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-label={LEVEL_LABELS[level]}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="bookmark-modal-header">
          <div>
            <p className="bookmark-panel-eyebrow">PERIOD</p>
            <h2>{LEVEL_LABELS[level]}</h2>
          </div>
          <button
            type="button"
            className="bookmark-text-button"
            onClick={onClose}
          >
            닫기
          </button>
        </header>

        <div className="bookmark-period-picker-header">
          <button
            type="button"
            className="bookmark-icon-button"
            aria-label="이전 범위"
            onClick={() => moveCursor(-1)}
          >
            ‹
          </button>
          <strong>{cursorLabel(cursor, level)}</strong>
          <button
            type="button"
            className="bookmark-icon-button"
            aria-label="다음 범위"
            onClick={() => moveCursor(1)}
          >
            ›
          </button>
        </div>

        <div
          className={`bookmark-period-picker-grid is-${level}`}
        >
          {options.map((option) => (
            <button
              type="button"
              className={`bookmark-period-picker-option${
                option.value === value ? " is-active" : ""
              }`}
              aria-current={
                option.value === value ? "true" : undefined
              }
              key={option.value}
              onClick={() => onSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

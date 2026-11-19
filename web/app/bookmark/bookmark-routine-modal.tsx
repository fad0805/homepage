import type { FormEventHandler } from "react";

import {
  WEEKDAY_SHORT,
  type BookmarkRoutine,
  type BookmarkRoutineCategory,
  type BookmarkRoutineFrequency,
  type BookmarkTrackingMode,
} from "@/lib/bookmark";

import type { MonthlyMode } from "./bookmark-types";
import {
  FREQUENCY_LABELS,
  MODE_LABELS,
  TARGET_LABELS,
} from "./bookmark-types";
import { periodLabel } from "./bookmark-utils";

interface BookmarkRoutineModalProps {
  modalFrequency: BookmarkRoutineFrequency;
  error: string | null;
  itemTitle: string;
  setItemTitle: (value: string) => void;
  itemNotes: string;
  setItemNotes: (value: string) => void;
  routineCategoryId: number | null;
  setRoutineCategoryId: (value: number | null) => void;
  categories: BookmarkRoutineCategory[];
  editingRoutine: BookmarkRoutine | null;
  readOnly: boolean;
  routineMode: BookmarkTrackingMode;
  setRoutineMode: (mode: BookmarkTrackingMode) => void;
  routineTarget: string;
  setRoutineTarget: (value: string) => void;
  routineQuarter: number;
  setRoutineQuarter: (value: number) => void;
  routineWeekdaySelection: number[];
  onToggleWeekday: (weekday: number) => void;
  monthlyMode: MonthlyMode;
  setMonthlyMode: (mode: MonthlyMode) => void;
  routineDayOfMonth: string;
  setRoutineDayOfMonth: (value: string) => void;
  routineNthWeek: number;
  setRoutineNthWeek: (value: number) => void;
  routineWeekday: number;
  setRoutineWeekday: (value: number) => void;
  routineMonth: number;
  setRoutineMonth: (value: number) => void;
  routineWindowStart: number;
  setRoutineWindowStart: (value: number) => void;
  routineWindowEnd: number;
  setRoutineWindowEnd: (value: number) => void;
  itemSaving: boolean;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onStop: () => void;
  onDelete: () => void;
}

export function BookmarkRoutineModal({
  modalFrequency,
  error,
  itemTitle,
  setItemTitle,
  itemNotes,
  setItemNotes,
  routineCategoryId,
  setRoutineCategoryId,
  categories,
  editingRoutine,
  readOnly,
  routineMode,
  setRoutineMode,
  routineTarget,
  setRoutineTarget,
  routineQuarter,
  setRoutineQuarter,
  routineWeekdaySelection,
  onToggleWeekday,
  monthlyMode,
  setMonthlyMode,
  routineDayOfMonth,
  setRoutineDayOfMonth,
  routineNthWeek,
  setRoutineNthWeek,
  routineWeekday,
  setRoutineWeekday,
  routineMonth,
  setRoutineMonth,
  routineWindowStart,
  setRoutineWindowStart,
  routineWindowEnd,
  setRoutineWindowEnd,
  itemSaving,
  onClose,
  onSubmit,
  onStop,
  onDelete,
}: BookmarkRoutineModalProps) {
  return (
      <div
        className="bookmark-modal-overlay"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="bookmark-modal"
          role="dialog"
          aria-modal="true"
          aria-label="루틴 관리"
          onClick={(event) => event.stopPropagation()}
        >
          <form
            className="bookmark-item-form"
            onSubmit={onSubmit}
          >
            <header className="bookmark-modal-header">
              <h2>{FREQUENCY_LABELS[modalFrequency]} 루틴</h2>
              <button
                type="button"
                className="bookmark-text-button"
                onClick={onClose}
              >
                닫기
              </button>
            </header>
            {error ? (
              <p className="bookmark-error">{error}</p>
            ) : null}
            <fieldset
              className="bookmark-routine-fields"
              disabled={readOnly}
            >
            <label>
              <span>제목</span>
              <input
                type="text"
                value={itemTitle}
                maxLength={255}
                required
                placeholder="반복할 루틴"
                onChange={(event) =>
                  setItemTitle(event.target.value)
                }
              />
            </label>
            <label>
              <span>메모</span>
              <textarea
                rows={4}
                value={itemNotes}
                maxLength={4000}
                placeholder="선택 사항"
                onChange={(event) =>
                  setItemNotes(event.target.value)
                }
              />
            </label>
            <div className="bookmark-category-field">
              <span className="bookmark-field-label">카테고리</span>
              <div className="bookmark-category-picker">
                <label
                  className={
                    routineCategoryId === null ? "is-selected" : ""
                  }
                >
                  <input
                    type="checkbox"
                    checked={routineCategoryId === null}
                    onChange={() => setRoutineCategoryId(null)}
                  />
                  <span>미분류</span>
                </label>
                {categories.map((category) => {
                  const selected =
                    routineCategoryId === category.id;
                  return (
                    <label
                      className={selected ? "is-selected" : ""}
                      key={category.id}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setRoutineCategoryId(
                            selected ? null : category.id,
                          )
                        }
                      />
                      <span>{category.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {editingRoutine ? (
              <p className="bookmark-form-hint">
                시작일: {periodLabel(editingRoutine.start_date, "day")}
                {editingRoutine.end_date ? " · 중단됨" : ""}
              </p>
            ) : null}

            <div className="bookmark-schedule">
              <span className="bookmark-field-label">기록 방식</span>
              {modalFrequency === "daily" ? (
                <p className="bookmark-form-hint">
                  매일 1회 체크하는 루틴입니다.
                </p>
              ) : (
                <>
                  <div className="bookmark-mode-toggle">
                    {(["count", "date"] as BookmarkTrackingMode[]).map(
                      (mode) => (
                        <button
                          type="button"
                          key={mode}
                          className={
                            routineMode === mode ? "is-active" : ""
                          }
                          onClick={() => setRoutineMode(mode)}
                        >
                          {MODE_LABELS[mode]}
                        </button>
                      ),
                    )}
                  </div>

                  {routineMode === "count" ? (
                    <>
                      {modalFrequency === "quarterly" ? (
                        <div className="bookmark-schedule-row">
                          <label>
                            <span>분기</span>
                            <select
                              value={routineQuarter}
                              onChange={(event) =>
                                setRoutineQuarter(
                                  Number(event.target.value),
                                )
                              }
                            >
                              <option value={0}>매분기</option>
                              {[1, 2, 3, 4].map((quarter) => (
                                <option
                                  value={quarter}
                                  key={quarter}
                                >
                                  {quarter}분기
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>{TARGET_LABELS[modalFrequency]}</span>
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={routineTarget}
                              onChange={(event) =>
                                setRoutineTarget(event.target.value)
                              }
                            />
                          </label>
                        </div>
                      ) : (
                        <label>
                          <span>{TARGET_LABELS[modalFrequency]}</span>
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            value={routineTarget}
                            onChange={(event) =>
                              setRoutineTarget(event.target.value)
                            }
                          />
                        </label>
                      )}
                      {modalFrequency === "weekly" ? (
                        <div className="bookmark-schedule-row">
                          <label>
                            <span>시작 요일</span>
                            <select
                              value={routineWindowStart}
                              onChange={(event) =>
                                setRoutineWindowStart(Number(event.target.value))
                              }
                            >
                              {WEEKDAY_SHORT.map((label, index) => (
                                <option value={index} key={label}>
                                  {label}요일
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>종료 요일</span>
                            <select
                              value={routineWindowEnd}
                              onChange={(event) =>
                                setRoutineWindowEnd(Number(event.target.value))
                              }
                            >
                              {WEEKDAY_SHORT.map((label, index) => (
                                <option value={index} key={label}>
                                  {label}요일
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}
                      {modalFrequency === "monthly" ? (
                        <div className="bookmark-schedule-row">
                          <label>
                            <span>시작 일</span>
                            <input
                              type="number"
                              min={1}
                              max={31}
                              value={routineWindowStart}
                              onChange={(event) =>
                                setRoutineWindowStart(Number(event.target.value))
                              }
                            />
                          </label>
                          <label>
                            <span>종료 일</span>
                            <input
                              type="number"
                              min={1}
                              max={31}
                              value={routineWindowEnd}
                              onChange={(event) =>
                                setRoutineWindowEnd(Number(event.target.value))
                              }
                            />
                          </label>
                        </div>
                      ) : null}
                      {modalFrequency === "yearly" ? (
                        <div className="bookmark-schedule-row">
                          <label>
                            <span>시작 월</span>
                            <select
                              value={routineWindowStart}
                              onChange={(event) =>
                                setRoutineWindowStart(Number(event.target.value))
                              }
                            >
                              {Array.from({ length: 12 }, (_, index) => (
                                <option value={index + 1} key={index + 1}>
                                  {index + 1}월
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>종료 월</span>
                            <select
                              value={routineWindowEnd}
                              onChange={(event) =>
                                setRoutineWindowEnd(Number(event.target.value))
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
                      ) : null}
                      <p className="bookmark-form-hint">
                        {modalFrequency === "weekly"
                          ? "기본값은 월요일부터 일요일까지입니다."
                          : modalFrequency === "monthly"
                            ? "기본값은 1일부터 말일까지입니다."
                            : modalFrequency === "quarterly"
                              ? routineQuarter > 0
                                ? `${routineQuarter}분기 전체가 목표 기간입니다.`
                                : "매분기 전체가 목표 기간입니다."
                              : "기본값은 1월부터 12월까지입니다."}
                      </p>
                    </>
                  ) : (
                    <>
                      {modalFrequency === "weekly" ? (
                        <div className="bookmark-weekday-field">
                          <span>요일</span>
                          <div className="bookmark-weekday-picker">
                            {WEEKDAY_SHORT.map((label, index) => {
                              const selected =
                                routineWeekdaySelection.includes(index);
                              return (
                                <label
                                  className={
                                    selected ? "is-selected" : ""
                                  }
                                  key={label}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() =>
                                      onToggleWeekday(index)
                                    }
                                  />
                                  <span>{label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {modalFrequency === "monthly" ? (
                        <>
                          <label>
                            <span>방식</span>
                            <select
                              value={monthlyMode}
                              onChange={(event) =>
                                setMonthlyMode(
                                  event.target.value as MonthlyMode,
                                )
                              }
                            >
                              <option value="day">날짜</option>
                              <option value="nth">
                                몇 번째 요일
                              </option>
                            </select>
                          </label>
                          {monthlyMode === "day" ? (
                            <label>
                              <span>일</span>
                              <input
                                type="number"
                                min={1}
                                max={31}
                                value={routineDayOfMonth}
                                onChange={(event) =>
                                  setRoutineDayOfMonth(
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                          ) : (
                            <div className="bookmark-schedule-row">
                              <label>
                                <span>번째</span>
                                <select
                                  value={routineNthWeek}
                                  onChange={(event) =>
                                    setRoutineNthWeek(
                                      Number(event.target.value),
                                    )
                                  }
                                >
                                  {[1, 2, 3, 4, 5].map((value) => (
                                    <option value={value} key={value}>
                                      {value}번째
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>요일</span>
                                <select
                                  value={routineWeekday}
                                  onChange={(event) =>
                                    setRoutineWeekday(
                                      Number(event.target.value),
                                    )
                                  }
                                >
                                  {WEEKDAY_SHORT.map(
                                    (label, index) => (
                                      <option
                                        value={index}
                                        key={label}
                                      >
                                        {label}요일
                                      </option>
                                    ),
                                  )}
                                </select>
                              </label>
                            </div>
                          )}
                        </>
                      ) : null}

                      {modalFrequency === "yearly" ? (
                        <div className="bookmark-schedule-row">
                          <label>
                            <span>월</span>
                            <select
                              value={routineMonth}
                              onChange={(event) =>
                                setRoutineMonth(
                                  Number(event.target.value),
                                )
                              }
                            >
                              {Array.from(
                                { length: 12 },
                                (_, index) => (
                                  <option
                                    value={index + 1}
                                    key={index + 1}
                                  >
                                    {index + 1}월
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          <label>
                            <span>일</span>
                            <input
                              type="number"
                              min={1}
                              max={31}
                              value={routineDayOfMonth}
                              onChange={(event) =>
                                setRoutineDayOfMonth(
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                        </div>
                      ) : null}

                      {modalFrequency === "quarterly" ? (
                        <>
                          <label>
                            <span>분기</span>
                            <select
                              value={routineQuarter}
                              onChange={(event) =>
                                setRoutineQuarter(
                                  Number(event.target.value),
                                )
                              }
                            >
                              <option value={0}>매분기</option>
                              {[1, 2, 3, 4].map((quarter) => (
                                <option
                                  value={quarter}
                                  key={quarter}
                                >
                                  {quarter}분기
                                </option>
                              ))}
                            </select>
                          </label>
                          <p className="bookmark-form-hint">
                            {routineQuarter > 0
                              ? `${routineQuarter}분기에 1회 체크하는 루틴입니다.`
                              : "매분기 1회 체크하는 루틴입니다."}
                          </p>
                        </>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </div>
            </fieldset>
            {readOnly ? (
              <p className="bookmark-form-hint">
                중단된 루틴은 수정할 수 없습니다.
              </p>
            ) : null}

            <div className="bookmark-modal-actions">
              {editingRoutine && !editingRoutine.end_date ? (
                <button
                  type="button"
                  className="bookmark-text-button"
                  disabled={itemSaving}
                  onClick={() => void onStop()}
                >
                  중단
                </button>
              ) : null}
              {editingRoutine ? (
                <button
                  type="button"
                  className="bookmark-text-button is-danger"
                  disabled={itemSaving}
                  onClick={() => void onDelete()}
                >
                  완전 삭제
                </button>
              ) : null}
              {!readOnly ? (
                <button
                  type="submit"
                  className="bookmark-primary"
                  disabled={itemSaving || !itemTitle.trim()}
                >
                  {itemSaving ? "저장 중..." : "저장"}
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </div>
  );
}

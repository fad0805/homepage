"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  WEEKDAY_LABELS,
  type BookmarkGoal,
  type BookmarkPeriod,
  type BookmarkPeriodType,
  type BookmarkRoutine,
  type BookmarkRoutineFrequency,
  type BookmarkReview,
  routineScheduleLabel,
} from "@/lib/bookmark";
import { apiFetch } from "@/lib/api";
import { todayDateInputValue } from "@/lib/datetime";

import "@/public/styles/bookmark.scss";

type ModalKind = "routine" | "goal";
type MonthlyMode = "day" | "nth";

const PERIOD_TYPES: BookmarkPeriodType[] = [
  "year",
  "quarter",
  "month",
  "week",
  "day",
];
const PERIOD_LABELS: Record<BookmarkPeriodType, string> = {
  year: "연",
  quarter: "분기",
  month: "월",
  week: "주",
  day: "일",
};
const PERIOD_FREQUENCY: Record<
  BookmarkPeriodType,
  BookmarkRoutineFrequency
> = {
  year: "yearly",
  quarter: "quarterly",
  month: "monthly",
  week: "weekly",
  day: "daily",
};
const FREQUENCY_LABELS: Record<BookmarkRoutineFrequency, string> = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  quarterly: "매분기",
  yearly: "매년",
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad2(
    date.getUTCMonth() + 1,
  )}-${pad2(date.getUTCDate())}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function startOfPeriod(value: string, type: BookmarkPeriodType) {
  const date = parseDateKey(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  if (type === "year") {
    return dateKey(new Date(Date.UTC(year, 0, 1)));
  }
  if (type === "quarter") {
    return dateKey(new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1)));
  }
  if (type === "month") {
    return dateKey(new Date(Date.UTC(year, month, 1)));
  }
  if (type === "week") {
    const offset = (date.getUTCDay() + 6) % 7;
    return dateKey(new Date(Date.UTC(year, month, day - offset)));
  }
  return dateKey(date);
}

function shiftPeriod(
  value: string,
  type: BookmarkPeriodType,
  delta: number,
) {
  const date = parseDateKey(value);
  if (type === "year") {
    return dateKey(
      new Date(Date.UTC(date.getUTCFullYear() + delta, 0, 1)),
    );
  }
  if (type === "quarter") {
    return dateKey(
      new Date(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth() + delta * 3,
          1,
        ),
      ),
    );
  }
  if (type === "month") {
    return dateKey(
      new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1),
      ),
    );
  }
  const days = type === "week" ? delta * 7 : delta;
  return dateKey(
    new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + days,
      ),
    ),
  );
}

function periodLabel(value: string, type: BookmarkPeriodType) {
  const date = parseDateKey(value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  if (type === "year") return `${year}년`;
  if (type === "quarter") {
    return `${year}년 ${Math.floor((month - 1) / 3) + 1}분기`;
  }
  if (type === "month") return `${year}년 ${month}월`;
  if (type === "day") {
    return `${year}년 ${month}월 ${day}일 (${
      ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()]
    })`;
  }

  const end = parseDateKey(shiftPeriod(value, "day", 6));
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth() + 1;
  const endDay = end.getUTCDate();
  return `${year}년 ${month}월 ${day}일 ~ ${
    endYear !== year ? `${endYear}년 ` : ""
  }${endMonth}월 ${endDay}일`;
}

export default function BookmarkClient({ username }: { username: string }) {
  const initialToday = todayDateInputValue();
  const [periodType, setPeriodType] = useState<BookmarkPeriodType>("day");
  const [periodStart, setPeriodStart] = useState(() =>
    startOfPeriod(initialToday, "day"),
  );
  const [data, setData] = useState<BookmarkPeriod | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewContent, setReviewContent] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);

  const [modalKind, setModalKind] = useState<ModalKind | null>(null);
  const [editingRoutine, setEditingRoutine] =
    useState<BookmarkRoutine | null>(null);
  const [editingGoal, setEditingGoal] = useState<BookmarkGoal | null>(
    null,
  );
  const [itemTitle, setItemTitle] = useState("");
  const [itemNotes, setItemNotes] = useState("");
  const [itemSaving, setItemSaving] = useState(false);

  const [routineWeekday, setRoutineWeekday] = useState(0);
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>("day");
  const [routineDayOfMonth, setRoutineDayOfMonth] = useState("1");
  const [routineNthWeek, setRoutineNthWeek] = useState(1);
  const [routineMonth, setRoutineMonth] = useState(1);

  const loadPeriod = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await apiFetch<BookmarkPeriod>(
        `/api/bookmark?period_type=${periodType}&period_start=${periodStart}`,
        { cache: "no-store" },
      );
      setData(next);
      setReviewContent(next.review?.content ?? "");
      setReviewSaved(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "책갈피를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodType]);

  useEffect(() => {
    void loadPeriod();
  }, [loadPeriod]);

  const changePeriodType = (next: BookmarkPeriodType) => {
    setPeriodType(next);
    setPeriodStart((previous) => startOfPeriod(previous, next));
    closeModal();
  };

  const goToday = () => {
    setPeriodStart(startOfPeriod(todayDateInputValue(), periodType));
  };

  const movePeriod = (delta: number) => {
    setPeriodStart((previous) =>
      shiftPeriod(previous, periodType, delta),
    );
  };

  const routines = data?.routines ?? [];
  const goals = data?.goals ?? [];

  const openCreateRoutine = () => {
    setModalKind("routine");
    setEditingRoutine(null);
    setEditingGoal(null);
    setItemTitle("");
    setItemNotes("");
    setRoutineWeekday(0);
    setMonthlyMode("day");
    setRoutineDayOfMonth("1");
    setRoutineNthWeek(1);
    setRoutineMonth(1);
    setError(null);
  };

  const openEditRoutine = (routine: BookmarkRoutine) => {
    setModalKind("routine");
    setEditingRoutine(routine);
    setEditingGoal(null);
    setItemTitle(routine.title);
    setItemNotes(routine.notes ?? "");
    setRoutineWeekday(routine.weekday ?? 0);
    setMonthlyMode(routine.day_of_month !== null ? "day" : "nth");
    setRoutineDayOfMonth(
      routine.day_of_month !== null
        ? String(routine.day_of_month)
        : "1",
    );
    setRoutineNthWeek(routine.nth_week ?? 1);
    setRoutineMonth(routine.month ?? 1);
    setError(null);
  };

  const openCreateGoal = () => {
    setModalKind("goal");
    setEditingRoutine(null);
    setEditingGoal(null);
    setItemTitle("");
    setItemNotes("");
    setError(null);
  };

  const openEditGoal = (goal: BookmarkGoal) => {
    setModalKind("goal");
    setEditingGoal(goal);
    setEditingRoutine(null);
    setItemTitle(goal.title);
    setItemNotes(goal.notes ?? "");
    setError(null);
  };

  const closeModal = () => {
    setModalKind(null);
    setEditingRoutine(null);
    setEditingGoal(null);
    setItemTitle("");
    setItemNotes("");
  };

  const modalFrequency =
    modalKind === "routine"
      ? (editingRoutine?.frequency ?? PERIOD_FREQUENCY[periodType])
      : null;

  const routinePayload = () => {
    if (!modalFrequency) return {};
    if (modalFrequency === "weekly") {
      return { weekday: routineWeekday };
    }
    if (modalFrequency === "monthly") {
      if (monthlyMode === "day") {
        return {
          weekday: null,
          day_of_month: Number(routineDayOfMonth),
          nth_week: null,
          month: null,
        };
      }
      return {
        weekday: routineWeekday,
        day_of_month: null,
        nth_week: routineNthWeek,
        month: null,
      };
    }
    if (modalFrequency === "yearly") {
      return {
        weekday: null,
        day_of_month: Number(routineDayOfMonth),
        nth_week: null,
        month: routineMonth,
      };
    }
    return {
      weekday: null,
      day_of_month: null,
      nth_week: null,
      month: null,
    };
  };

  const handleSaveItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!itemTitle.trim() || itemSaving || !modalKind) return;

    setItemSaving(true);
    setError(null);
    try {
      if (modalKind === "routine") {
        const schedule = routinePayload();
        if (editingRoutine) {
          await apiFetch<BookmarkRoutine>(
            `/api/bookmark/routines/${editingRoutine.id}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                title: itemTitle,
                notes: itemNotes || null,
                ...schedule,
              }),
            },
          );
        } else {
          await apiFetch<BookmarkRoutine>("/api/bookmark/routines", {
            method: "POST",
            body: JSON.stringify({
              frequency: modalFrequency,
              title: itemTitle,
              notes: itemNotes || null,
              ...schedule,
            }),
          });
        }
      } else if (editingGoal) {
        await apiFetch<BookmarkGoal>(
          `/api/bookmark/goals/${editingGoal.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              title: itemTitle,
              notes: itemNotes || null,
            }),
          },
        );
      } else {
        await apiFetch<BookmarkGoal>("/api/bookmark/goals", {
          method: "POST",
          body: JSON.stringify({
            period_type: periodType,
            period_start: periodStart,
            title: itemTitle,
            notes: itemNotes || null,
          }),
        });
      }
      closeModal();
      await loadPeriod();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "책갈피 항목을 저장하지 못했습니다.",
      );
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!modalKind) return;
    const target = editingRoutine ?? editingGoal;
    if (!target) return;
    if (!window.confirm(`"${target.title}" 항목을 삭제할까요?`)) {
      return;
    }
    setItemSaving(true);
    setError(null);
    try {
      const path =
        modalKind === "routine"
          ? `/api/bookmark/routines/${target.id}`
          : `/api/bookmark/goals/${target.id}`;
      await apiFetch(path, { method: "DELETE" });
      closeModal();
      await loadPeriod();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "책갈피 항목을 삭제하지 못했습니다.",
      );
    } finally {
      setItemSaving(false);
    }
  };

  const toggleRoutine = async (routine: BookmarkRoutine) => {
    setError(null);
    setData((previous) =>
      previous
        ? {
            ...previous,
            routines: previous.routines.map((current) =>
              current.id === routine.id
                ? { ...current, done: !current.done }
                : current,
            ),
          }
        : previous,
    );
    try {
      await apiFetch<BookmarkRoutine>(
        `/api/bookmark/routines/${routine.id}/check`,
        {
          method: "PUT",
          body: JSON.stringify({
            period_type: periodType,
            period_start: periodStart,
            done: !routine.done,
          }),
        },
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "루틴 체크 상태를 변경하지 못했습니다.",
      );
      await loadPeriod();
    }
  };

  const toggleGoal = async (goal: BookmarkGoal) => {
    setError(null);
    setData((previous) =>
      previous
        ? {
            ...previous,
            goals: previous.goals.map((current) =>
              current.id === goal.id
                ? { ...current, done: !current.done }
                : current,
            ),
          }
        : previous,
    );
    try {
      await apiFetch<BookmarkGoal>(
        `/api/bookmark/goals/${goal.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ done: !goal.done }),
        },
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "목표 상태를 변경하지 못했습니다.",
      );
      await loadPeriod();
    }
  };

  const handleSaveReview = async () => {
    if (reviewSaving) return;
    setReviewSaving(true);
    setError(null);
    setReviewSaved(false);
    try {
      const saved = await apiFetch<BookmarkReview>(
        "/api/bookmark/review",
        {
          method: "PUT",
          body: JSON.stringify({
            period_type: periodType,
            period_start: periodStart,
            content: reviewContent,
          }),
        },
      );
      setData((previous) =>
        previous ? { ...previous, review: saved } : previous,
      );
      setReviewContent(saved.content);
      setReviewSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "회고를 저장하지 못했습니다.",
      );
    } finally {
      setReviewSaving(false);
    }
  };

  const renderRoutines = () =>
    routines.length === 0 ? (
      <p className="bookmark-empty-row">
        이 기간에 예정된 루틴이 없습니다.
      </p>
    ) : (
      <ul className="bookmark-item-list">
        {routines.map((routine) => (
          <li
            className={`bookmark-item${
              routine.done ? " is-done" : ""
            }`}
            key={routine.id}
          >
            <div className="bookmark-item-main">
              <label className="bookmark-item-check">
                <input
                  type="checkbox"
                  checked={routine.done}
                  onChange={() => void toggleRoutine(routine)}
                />
                <span>{routine.title}</span>
              </label>
              <p className="bookmark-item-schedule">
                {routineScheduleLabel(routine)}
              </p>
              {routine.notes ? (
                <p className="bookmark-item-notes">{routine.notes}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="bookmark-text-button"
              onClick={() => openEditRoutine(routine)}
            >
              수정
            </button>
          </li>
        ))}
      </ul>
    );

  const renderGoals = () =>
    goals.length === 0 ? (
      <p className="bookmark-empty-row">
        이 기간에 등록된 목표가 없습니다.
      </p>
    ) : (
      <ul className="bookmark-item-list">
        {goals.map((goal) => (
          <li
            className={`bookmark-item${goal.done ? " is-done" : ""}`}
            key={goal.id}
          >
            <div className="bookmark-item-main">
              <label className="bookmark-item-check">
                <input
                  type="checkbox"
                  checked={goal.done}
                  onChange={() => void toggleGoal(goal)}
                />
                <span>{goal.title}</span>
              </label>
              {goal.notes ? (
                <p className="bookmark-item-notes">{goal.notes}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="bookmark-text-button"
              onClick={() => openEditGoal(goal)}
            >
              수정
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <div id="bookmark-page">
      <main>
        <header className="bookmark-header">
          <div>
            <p className="bookmark-eyebrow">{username}의 비공개 기록</p>
            <h1>책갈피</h1>
            <p className="bookmark-description">
              연·분기·월·주·일 단위로 루틴과 목표를 관리하고 회고를
              남깁니다. 이 화면은 로그인한 본인에게만 보입니다.
            </p>
          </div>
        </header>

        <div className="bookmark-period-bar">
          <div className="bookmark-period-tabs" role="tablist">
            {PERIOD_TYPES.map((type) => (
              <button
                type="button"
                role="tab"
                key={type}
                aria-selected={periodType === type}
                className={periodType === type ? "is-active" : ""}
                onClick={() => changePeriodType(type)}
              >
                {PERIOD_LABELS[type]}
              </button>
            ))}
          </div>
          <div className="bookmark-period-nav">
            <button
              type="button"
              className="bookmark-icon-button"
              aria-label="이전 기간"
              onClick={() => movePeriod(-1)}
            >
              ‹
            </button>
            <strong>{periodLabel(periodStart, periodType)}</strong>
            <button
              type="button"
              className="bookmark-icon-button"
              aria-label="다음 기간"
              onClick={() => movePeriod(1)}
            >
              ›
            </button>
            <button
              type="button"
              className="bookmark-text-button"
              onClick={goToday}
            >
              오늘
            </button>
          </div>
        </div>

        {error ? <p className="bookmark-error">{error}</p> : null}

        {loading ? (
          <p className="bookmark-status">불러오는 중...</p>
        ) : (
          <div className="bookmark-layout">
            <div className="bookmark-main-column">
              <section className="bookmark-panel">
                <header className="bookmark-panel-header">
                  <div>
                    <p className="bookmark-panel-eyebrow">
                      {FREQUENCY_LABELS[PERIOD_FREQUENCY[periodType]]}
                    </p>
                    <h2>할일 / 루틴</h2>
                  </div>
                  <button
                    type="button"
                    className="bookmark-primary"
                    onClick={openCreateRoutine}
                  >
                    추가
                  </button>
                </header>
                {renderRoutines()}
              </section>

              <section className="bookmark-panel">
                <header className="bookmark-panel-header">
                  <div>
                    <p className="bookmark-panel-eyebrow">GOAL</p>
                    <h2>목표</h2>
                  </div>
                  <button
                    type="button"
                    className="bookmark-primary"
                    onClick={openCreateGoal}
                  >
                    추가
                  </button>
                </header>
                {renderGoals()}
              </section>
            </div>

            <section className="bookmark-panel bookmark-review-panel">
              <header className="bookmark-panel-header">
                <div>
                  <p className="bookmark-panel-eyebrow">REVIEW</p>
                  <h2>회고</h2>
                </div>
                {reviewSaved ? (
                  <span className="bookmark-saved">저장됨</span>
                ) : null}
              </header>
              <textarea
                className="bookmark-review-textarea"
                value={reviewContent}
                maxLength={20000}
                placeholder="이 기간을 돌아보세요."
                onChange={(event) => {
                  setReviewContent(event.target.value);
                  setReviewSaved(false);
                }}
              />
              <button
                type="button"
                className="bookmark-primary bookmark-review-save"
                disabled={reviewSaving}
                onClick={() => void handleSaveReview()}
              >
                {reviewSaving ? "저장 중..." : "회고 저장"}
              </button>
            </section>
          </div>
        )}
      </main>

      {modalKind ? (
        <div
          className="bookmark-modal-overlay"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="bookmark-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modalKind === "routine"
                ? "루틴 관리"
                : editingGoal
                  ? "목표 수정"
                  : "목표 추가"
            }
            onClick={(event) => event.stopPropagation()}
          >
            <form
              className="bookmark-item-form"
              onSubmit={handleSaveItem}
            >
              <header className="bookmark-modal-header">
                <h2>
                  {modalKind === "routine"
                    ? `${FREQUENCY_LABELS[modalFrequency ?? "daily"]} 루틴`
                    : editingGoal
                      ? "목표 수정"
                      : "목표 추가"}
                </h2>
                <button
                  type="button"
                  className="bookmark-text-button"
                  onClick={closeModal}
                >
                  닫기
                </button>
              </header>
              {error ? (
                <p className="bookmark-error">{error}</p>
              ) : null}
              <label>
                <span>제목</span>
                <input
                  type="text"
                  value={itemTitle}
                  maxLength={255}
                  required
                  placeholder={
                    modalKind === "goal"
                      ? "이 기간에 이루고 싶은 목표"
                      : "반복할 루틴"
                  }
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

              {modalKind === "routine" && modalFrequency ? (
                <div className="bookmark-schedule">
                  <span className="bookmark-field-label">
                    반복 일정
                  </span>
                  {modalFrequency === "weekly" ? (
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
                        {WEEKDAY_LABELS.map((label, index) => (
                          <option value={index} key={label}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
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
                          <option value="nth">몇 번째 요일</option>
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
                              {WEEKDAY_LABELS.map((label, index) => (
                                <option value={index} key={label}>
                                  {label}
                                </option>
                              ))}
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
                          {Array.from({ length: 12 }, (_, index) => (
                            <option value={index + 1} key={index + 1}>
                              {index + 1}월
                            </option>
                          ))}
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
                            setRoutineDayOfMonth(event.target.value)
                          }
                        />
                      </label>
                    </div>
                  ) : null}

                  {["daily", "quarterly"].includes(modalFrequency) ? (
                    <p className="bookmark-form-hint">
                      {modalFrequency === "daily"
                        ? "매일 체크할 루틴입니다."
                        : "매분기 체크할 루틴입니다."}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="bookmark-modal-actions">
                {editingRoutine || editingGoal ? (
                  <button
                    type="button"
                    className="bookmark-text-button is-danger"
                    disabled={itemSaving}
                    onClick={() => void handleDeleteItem()}
                  >
                    삭제
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="bookmark-primary"
                  disabled={itemSaving || !itemTitle.trim()}
                >
                  {itemSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import {
  WEEKDAY_SHORT,
  formatTime24h,
  routineWeekdays,
  type BookmarkGoal,
  type BookmarkPeriod,
  type BookmarkPeriodType,
  type BookmarkRating,
  type BookmarkReview,
  type BookmarkRoutine,
  type BookmarkRoutineCategory,
  type BookmarkRoutineFrequency,
  type BookmarkRoutineHistory,
  type BookmarkStatistics,
  type BookmarkRoutineStat,
  type BookmarkMoodTag,
  type BookmarkTrackingMode,
  routineScheduleLabel,
} from "@/lib/bookmark";
import { apiFetch } from "@/lib/api";
import { todayDateInputValue } from "@/lib/datetime";

import { BookmarkCalendarModal } from "./bookmark-calendar-modal";
import { BookmarkCategoryModal } from "./bookmark-category-modal";
import { BookmarkHistoryModal } from "./bookmark-history-modal";
import { BookmarkJournalPanel } from "./bookmark-journal-panel";
import { BookmarkMoodTagModal } from "./bookmark-mood-tag-modal";
import { BookmarkRoutineNotes } from "./bookmark-routine-notes";
import { BookmarkRoutineModal } from "./bookmark-routine-modal";
import { BookmarkStatisticsPanel } from "./bookmark-statistics-panel";
import { useBookmarkCalendar } from "./use-bookmark-calendar";
import { useBookmarkCategories } from "./use-bookmark-categories";
import { useBookmarkData } from "./use-bookmark-data";
import { useBookmarkHistory } from "./use-bookmark-history";
import { useBookmarkJournal } from "./use-bookmark-journal";
import { useBookmarkMoodTags } from "./use-bookmark-mood-tags";
import { useBookmarkRoutines } from "./use-bookmark-routines";
import { CloverRating } from "./clover-rating";
import {
  SortableCategoryItem,
  SortableMoodTagItem,
  SortableRoutineItem,
} from "./bookmark-sortable-items";
import {
  FREQUENCY_LABELS,
  MODE_LABELS,
  PERIOD_FREQUENCY,
  PERIOD_LABELS,
  PERIOD_TYPES,
  ROUTINE_SECTION_LABELS,
  STATS_COLORS,
  STATS_RANGES,
  STATS_RANGE_LABELS,
  TARGET_LABELS,
  VIEWS,
  VIEW_LABELS,
  type BookmarkView,
  type HistoryRoutine,
  type MonthlyMode,
  type StatsRange,
  type StatsSection,
} from "./bookmark-types";
import {
  dateKey,
  historyDayTitle,
  historyMonthLabel,
  historyQuarterLabel,
  monthCalendarDays,
  monthLabel,
  pad2,
  parseDateKey,
  periodLabel,
  quarterFromMonth,
  quarterStartMonth,
  shiftPeriod,
  startOfPeriod,
  statBucketEnd,
  statBucketLabel,
  statRangeBounds,
} from "./bookmark-utils";

import "@/public/styles/bookmark.scss";

export default function BookmarkClient({ username }: { username: string }) {
  const initialToday = todayDateInputValue();
  const [view, setView] = useState<BookmarkView>("today");
  const collapseStorageKey = `bookmark-category-collapse:${username}:${view}`;
  const [periodStart, setPeriodStart] = useState(initialToday);
  const {
    calendarOpen,
    calendarMonth,
    setCalendarMonth,
    calendarHoverDate,
    setCalendarHoverDate,
    openCalendar,
    closeCalendar,
    selectCalendarDate,
    calendarRange,
  } = useBookmarkCalendar({
    view,
    periodStart,
    setPeriodStart,
  });
  const [statsRange, setStatsRange] = useState<StatsRange>("month");
  const [statsSection, setStatsSection] =
    useState<StatsSection>("routines");
  const [expandedDoneSections, setExpandedDoneSections] = useState<
    Set<string>
  >(() => new Set());

  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );


  const applyPeriodRef = useRef<(data: BookmarkPeriod) => void>(
    () => {},
  );
  const handlePeriodLoaded = useCallback((next: BookmarkPeriod) => {
    applyPeriodRef.current(next);
  }, []);

  const {
    data,
    setData,
    loading,
    error,
    setError,
    statistics,
    statsLoading,
    statsError,
    categories,
    setCategories,
    moodTags,
    setMoodTags,
    loadPeriod,
    loadCategories,
    loadMoodTags,
    loadStatistics,
  } = useBookmarkData({
    view,
    periodStart,
    onPeriodLoaded: handlePeriodLoaded,
  });
  const {
    historyRoutine,
    historyData,
    historyLoading,
    historyError,
    openHistory,
    closeHistory,
  } = useBookmarkHistory();
  const recordPeriodType: BookmarkPeriodType =
    view === "today" || view === "stats" ? "day" : view;
  const {
    goalContent,
    setGoalContent,
    goalWakeTime,
    setGoalWakeTime,
    goalMoodTagId,
    setGoalMoodTagId,
    goalSaving,
    goalSaved,
    setGoalSaved,
    dayMetaSaving,
    dayMetaSaved,
    setDayMetaSaved,
    rating,
    ratingDraft,
    setRatingDraft,
    ratingSaving,
    reviewContent,
    setReviewContent,
    reviewSaving,
    reviewSaved,
    setReviewSaved,
    applyPeriod,
    handleSaveGoal,
    handleRatingChange,
    handleSaveDayMeta,
    handleSaveRating,
    handleSaveReview,
  } = useBookmarkJournal({
    periodStart,
    recordPeriodType,
    setData,
    onError: setError,
  });
  applyPeriodRef.current = applyPeriod;
  const {
    moodTagModalOpen,
    newMoodTagName,
    setNewMoodTagName,
    editingMoodTag,
    moodTagSaving,
    moodTagError,
    openMoodTagModal,
    startEditMoodTag,
    cancelEditMoodTag,
    closeMoodTagModal,
    handleAddMoodTag,
    handleMoodDragEnd,
    handleDeleteMoodTag,
  } = useBookmarkMoodTags({
    moodTags,
    setMoodTags,
    loadMoodTags,
    loadPeriod,
  });
  const {
    categoryModalOpen,
    newCategoryName,
    setNewCategoryName,
    editingCategory,
    collapsedSections,
    categorySaving,
    categoryError,
    setSectionCollapsed,
    openCategoryModal,
    closeCategoryModal,
    startEditCategory,
    cancelEditCategory,
    handleAddCategory,
    handleCategoryDragEnd,
    handleDeleteCategory,
  } = useBookmarkCategories({
    categories,
    setCategories,
    loadCategories,
    loadPeriod,
    collapseStorageKey,
  });

  const changeView = (next: BookmarkView) => {
    setView(next);
    if (next === "today") {
      setPeriodStart(todayDateInputValue());
    } else if (next !== "stats") {
      setPeriodStart(
        startOfPeriod(todayDateInputValue(), next),
      );
    }
    closeCalendar();
    closeRoutineModal();
  };

  const routines = data?.routines ?? [];
  const unitView: BookmarkPeriodType =
    view === "today" || view === "stats" ? "day" : view;
  const isTodaySelected = periodStart === todayDateInputValue();
  const {
    routineModalOpen,
    editingRoutine,
    itemTitle,
    setItemTitle,
    itemNotes,
    setItemNotes,
    itemSaving,
    routineOrderSaving,
    routineCategoryId,
    setRoutineCategoryId,
    routineMode,
    setRoutineMode,
    routineTarget,
    setRoutineTarget,
    routineWeekday,
    setRoutineWeekday,
    routineWeekdaySelection,
    monthlyMode,
    setMonthlyMode,
    routineDayOfMonth,
    setRoutineDayOfMonth,
    routineNthWeek,
    setRoutineNthWeek,
    routineMonth,
    setRoutineMonth,
    routineQuarter,
    setRoutineQuarter,
    modalFrequency,
    openCreateRoutine,
    openEditRoutine,
    closeRoutineModal,
    handleSaveRoutine,
    toggleRoutineWeekday,
    handleStopRoutine,
    handleDeleteRoutine,
    handleRoutineDragEnd,
    setRoutineCount,
    setRoutineDone,
    toggleRoutineNote,
  } = useBookmarkRoutines({
    routines,
    unitView,
    setData,
    loadPeriod,
    onError: setError,
  });

  const isRoutineDone = (routine: BookmarkRoutine) => {
    const isDaily = routine.frequency === "daily";
    const isCount =
      routine.tracking_mode === "count" && !isDaily;
    if (isCount || routine.frequency === "weekly") {
      return (
        routine.manual_done ||
        routine.completed_count >= routine.target_count
      );
    }
    return (
      routine.occurrences.length > 0 &&
      routine.occurrences.every((occurrence) => occurrence.done)
    );
  };

  const toggleDoneSection = (key: string) => {
    setExpandedDoneSections((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const renderRoutines = () => {
    if (routines.length === 0) {
      return (
        <p className="bookmark-empty-row">
          {view === "today"
            ? "오늘 수행할 루틴이 없습니다. 일·주·월·분기·연 탭에서 루틴을 추가할 수 있습니다."
            : "이 기간에 등록된 루틴이 없습니다."}
        </p>
      );
    }

    const categoryById = new Map(
      categories.map((category) => [category.id, category]),
    );
    type RoutineSection = {
      key: string;
      name: string;
      categoryId: number | null;
      pending: BookmarkRoutine[];
      done: BookmarkRoutine[];
    };
    const buildCategorySection = (
      key: string,
      name: string,
      categoryId: number | null,
      items: BookmarkRoutine[],
    ): RoutineSection | null => {
      const pending = items.filter(
        (routine) => !isRoutineDone(routine),
      );
      const done = items.filter(isRoutineDone);
      if (pending.length === 0 && done.length === 0) return null;
      return {
        key,
        name,
        categoryId,
        pending,
        done,
      };
    };

    const sections: RoutineSection[] = categories
      .map((category) =>
        buildCategorySection(
          `category-${category.id}`,
          category.name,
          category.id,
          routines.filter(
            (routine) => routine.category_id === category.id,
          ),
        ),
      )
      .filter((section): section is RoutineSection =>
        Boolean(section),
      );
    const uncategorized = routines.filter(
      (routine) =>
        routine.category_id === null ||
        !categoryById.has(routine.category_id),
    );
    const uncategorizedSection = buildCategorySection(
      "uncategorized",
      "미분류",
      null,
      uncategorized,
    );
    if (uncategorizedSection) {
      sections.push(uncategorizedSection);
    }

    const isSectionCollapsed = (section: RoutineSection) =>
      Boolean(collapsedSections[section.key]);
    const toggleSection = (section: RoutineSection) => {
      setSectionCollapsed(section.key, !isSectionCollapsed(section));
    };

    const renderRoutineItem = (routine: BookmarkRoutine) => {
      const isDaily = routine.frequency === "daily";
      const isCount =
        routine.tracking_mode === "count" && !isDaily;
      const isStopped = Boolean(routine.end_date);
      const allDone = isRoutineDone(routine);
      return (
        <SortableRoutineItem
          key={routine.id}
          id={routine.id}
          title={routine.title}
          disabled={routineOrderSaving}
          className={`bookmark-item is-clickable${
            allDone ? " is-done" : ""
          }`}
          onClick={() => openEditRoutine(routine)}
          onKeyDown={(event) => {
            if (
              event.target === event.currentTarget &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              openEditRoutine(routine);
            }
          }}
        >
          <div className="bookmark-item-main">
            <div className="bookmark-routine-heading">
              <input
                type="checkbox"
                className="bookmark-routine-check"
                checked={allDone}
                disabled={
                  isStopped ||
                  (!isCount && routine.occurrences.length === 0)
                }
                aria-label={`${routine.title} 완료`}
                onClick={(event) => event.stopPropagation()}
                onChange={() =>
                  void setRoutineDone(routine, !allDone)
                }
              />
              <span className="bookmark-routine-title">
                {routine.title}
              </span>
              {isStopped ? (
                <span className="bookmark-routine-status">중단됨</span>
              ) : null}
              <p className="bookmark-item-schedule">
                {routineScheduleLabel(routine)}
              </p>
              {routine.next_date ? (
                <span className="bookmark-routine-next">
                  예정 {periodLabel(routine.next_date, "day")}
                </span>
              ) : null}
              {isCount ? (
              <div className="bookmark-routine-counter">
                {!isStopped ? (
                  <button
                    type="button"
                    className="bookmark-count-button"
                    aria-label="1회 줄이기"
                    disabled={routine.completed_count <= 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      void setRoutineCount(
                        routine,
                        routine.completed_count - 1,
                      );
                    }}
                  >
                    −
                  </button>
                ) : null}
                <span className="bookmark-routine-progress">
                  <strong>{routine.completed_count}</strong>
                  <span>/ {routine.target_count}회</span>
                </span>
                {!isStopped ? (
                  <button
                    type="button"
                    className="bookmark-count-button"
                    aria-label="1회 추가"
                    disabled={
                      routine.completed_count >= routine.target_count
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      void setRoutineCount(
                        routine,
                        routine.completed_count + 1,
                      );
                    }}
                  >
                    +
                  </button>
                ) : null}
              </div>
              ) : null}
            </div>

            {routine.frequency === "weekly" &&
              routine.target_count > 1 ? (
              <p className="bookmark-routine-week-progress">
                이번 주 {routine.completed_count}/
                {routine.target_count}회
              </p>
            ) : null}

            {routine.notes ? (
              <BookmarkRoutineNotes
                notes={routine.notes}
                disabled={isStopped}
                onToggle={(index) =>
                  void toggleRoutineNote(routine, index)
                }
              />
            ) : null}
          </div>
        </SortableRoutineItem>
      );
    };

    const renderRoutineList = (
      key: string,
      items: BookmarkRoutine[],
    ) => (
      <DndContext
        key={key}
        sensors={dndSensors}
        collisionDetection={closestCenter}
        onDragEnd={(event) => handleRoutineDragEnd(items, event)}
      >
        <SortableContext
          items={items.map((routine) => routine.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="bookmark-item-list">
            {items.map(renderRoutineItem)}
          </ul>
        </SortableContext>
      </DndContext>
    );

    return (
      <div className="bookmark-routine-groups">
        {sections.map((section) => {
          const collapsed = isSectionCollapsed(section);
          const total = section.pending.length + section.done.length;
          const panelId = `bookmark-routine-section-${section.key}`;
          const doneKey = `${view}:${section.key}:done`;
          const doneExpanded = expandedDoneSections.has(doneKey);
          const donePanelId = `${panelId}-done`;

          return (
            <section
              className={`bookmark-category-group${
                collapsed ? " is-collapsed" : ""
              }`}
              key={section.key}
            >
              <header className="bookmark-category-group-header">
                <h3>
                  <button
                    type="button"
                    className="bookmark-category-group-toggle"
                    aria-expanded={!collapsed}
                    aria-controls={panelId}
                    onClick={() => toggleSection(section)}
                  >
                    <span
                      className="bookmark-category-group-arrow"
                      aria-hidden="true"
                    >
                      {collapsed ? "▸" : "▾"}
                    </span>
                    <span>{section.name}</span>
                  </button>
                </h3>
                <span>{total}</span>
              </header>

              <div id={panelId} hidden={collapsed}>
                {section.pending.length > 0
                  ? renderRoutineList(
                      `${section.key}-pending`,
                      section.pending,
                    )
                  : null}
                {section.done.length > 0 ? (
                  <div className="bookmark-routine-group is-done-group">
                    <header className="bookmark-routine-group-header">
                      <h3>
                        <button
                          type="button"
                          className="bookmark-routine-group-toggle"
                          aria-expanded={doneExpanded}
                          aria-controls={donePanelId}
                          onClick={() => toggleDoneSection(doneKey)}
                        >
                          <span
                            className="bookmark-category-group-arrow"
                            aria-hidden="true"
                          >
                            {doneExpanded ? "▾" : "▸"}
                          </span>
                          완료
                        </button>
                      </h3>
                      <span>{section.done.length}</span>
                    </header>
                    <div id={donePanelId} hidden={!doneExpanded}>
                      {renderRoutineList(
                        `${section.key}-done`,
                        section.done,
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  const renderStatistics = () => (
    <div className="bookmark-stats-view">
      <div className="bookmark-stats-sections" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={statsSection === "routines"}
          className={statsSection === "routines" ? "is-active" : ""}
          onClick={() => setStatsSection("routines")}
        >
          루틴 통계
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={statsSection === "journal"}
          className={statsSection === "journal" ? "is-active" : ""}
          onClick={() => setStatsSection("journal")}
        >
          회고 모아보기
        </button>
      </div>
      {statsSection === "routines" ? (
        <BookmarkStatisticsPanel
          statistics={statistics}
          statsLoading={statsLoading}
          statsError={statsError}
          statsRange={statsRange}
          onRangeChange={setStatsRange}
          onOpenHistory={openHistory}
        />
      ) : (
        <BookmarkJournalPanel />
      )}
    </div>
  );

  const isMonthlyHistory = historyRoutine?.frequency === "monthly";
  const historyBuckets = (() => {
    const rows = historyData?.monthly ?? [];
    if (!isMonthlyHistory) {
      return rows.map((row) => ({
        period_start: row.month_start,
        completed_count: row.completed_count,
        expected_count: row.expected_count,
      }));
    }
    const grouped = new Map<
      string,
      {
        period_start: string;
        completed_count: number;
        expected_count: number;
      }
    >();
    for (const row of rows) {
      const quarterStart = startOfPeriod(row.month_start, "quarter");
      const current = grouped.get(quarterStart);
      if (current) {
        current.completed_count += row.completed_count;
        current.expected_count += row.expected_count;
      } else {
        grouped.set(quarterStart, {
          period_start: quarterStart,
          completed_count: row.completed_count,
          expected_count: row.expected_count,
        });
      }
    }
    return [...grouped.values()].sort((a, b) =>
      a.period_start.localeCompare(b.period_start),
    );
  })();

  return (
    <div id="bookmark-page">
      <main>
        <header className="bookmark-header">
          <div>
            <p className="bookmark-eyebrow">{username}의 비공개 기록</p>
            <h1>책갈피</h1>
            <p className="bookmark-description">
              오늘 수행할 루틴을 먼저 모아 보여주고, 연·분기·월·주·일
              단위의 현황도 함께 확인할 수 있습니다. 목표와 별점,
              회고는 선택한 기간에 남깁니다.
            </p>
          </div>
        </header>

        <div className="bookmark-period-bar">
          <div className="bookmark-period-tabs" role="tablist">
            {VIEWS.map((type) => (
              <button
                type="button"
                role="tab"
                key={type}
                aria-selected={view === type}
                className={view === type ? "is-active" : ""}
                onClick={() => changeView(type)}
              >
                {VIEW_LABELS[type]}
              </button>
            ))}
          </div>
          {view === "today" ? (
            <button
              type="button"
              className="bookmark-today-date"
              title="달력에서 날짜 선택"
              onClick={openCalendar}
            >
              {periodLabel(periodStart, "day")}
            </button>
          ) : view === "stats" ? (
            <span className="bookmark-today-date">통계</span>
          ) : (
            <span className="bookmark-today-date">
              {periodLabel(periodStart, unitView)}
            </span>
          )}
        </div>

        {error ? <p className="bookmark-error">{error}</p> : null}

        {loading ? (
          <p className="bookmark-status">불러오는 중...</p>
        ) : view === "stats" ? (
          renderStatistics()
        ) : (
          <div className="bookmark-layout">
            <div className="bookmark-main-column">
              <section className="bookmark-panel">
                <header className="bookmark-panel-header">
                  <div>
                    <p className="bookmark-panel-eyebrow">
                      {view === "today"
                        ? isTodaySelected
                          ? "오늘 수행 가능"
                          : "선택일 기준"
                        : ROUTINE_SECTION_LABELS[unitView]}
                    </p>
                    <h2>
                      {view === "today"
                        ? isTodaySelected
                          ? "오늘의 루틴"
                          : "선택일의 루틴"
                        : "할일 / 루틴"}
                    </h2>
                  </div>
                  <div className="bookmark-panel-actions">
                    <button
                      type="button"
                      className="bookmark-text-button"
                      onClick={openCategoryModal}
                    >
                      카테고리
                    </button>
                    {view !== "today" ? (
                      <button
                        type="button"
                        className="bookmark-primary"
                        onClick={openCreateRoutine}
                      >
                        추가
                      </button>
                    ) : null}
                  </div>
                </header>
                {renderRoutines()}
              </section>
            </div>

            <div className="bookmark-record-column">
              <section className="bookmark-panel bookmark-record-panel">
                <header className="bookmark-panel-header">
                  <div>
                    <p className="bookmark-panel-eyebrow">GOAL</p>
                    <h2>목표</h2>
                  </div>
                  {goalSaved ? (
                    <span className="bookmark-saved">저장됨</span>
                  ) : null}
                </header>
                <textarea
                  className="bookmark-record-textarea"
                  value={goalContent}
                  maxLength={20000}
                  placeholder="이 기간에 이루고 싶은 목표나 바람을 적어보세요."
                  onChange={(event) => {
                    setGoalContent(event.target.value);
                    setGoalSaved(false);
                  }}
                />
                <button
                  type="button"
                  className="bookmark-primary bookmark-record-save"
                  disabled={goalSaving}
                  onClick={() => void handleSaveGoal()}
                >
                  {goalSaving ? "저장 중..." : "목표 저장"}
                </button>
              </section>

              {recordPeriodType === "day" ? (
                <section className="bookmark-panel bookmark-day-meta-panel">
                  <header className="bookmark-panel-header">
                    <div>
                      <p className="bookmark-panel-eyebrow">MORNING</p>
                      <h2>기상 / 기분</h2>
                    </div>
                    {dayMetaSaved ? (
                      <span className="bookmark-saved">저장됨</span>
                    ) : null}
                  </header>
                  <div className="bookmark-day-meta-fields">
                    <label>
                      <span>기상</span>
                      <input
                        type="time"
                        value={goalWakeTime}
                        onChange={(event) => {
                          setGoalWakeTime(event.target.value);
                          setDayMetaSaved(false);
                        }}
                      />
                    </label>
                    <label>
                      <span>기분</span>
                      <select
                        value={goalMoodTagId ?? ""}
                        onChange={(event) => {
                          setGoalMoodTagId(
                            event.target.value
                              ? Number(event.target.value)
                              : null,
                          );
                          setDayMetaSaved(false);
                        }}
                      >
                        <option value="">선택 안 함</option>
                        {moodTags.map((tag) => (
                          <option value={tag.id} key={tag.id}>
                            {tag.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="bookmark-day-meta-actions">
                    <button
                      type="button"
                      className="bookmark-text-button"
                      onClick={openMoodTagModal}
                    >
                      태그 관리
                    </button>
                    <button
                      type="button"
                      className="bookmark-primary bookmark-day-meta-save"
                      disabled={dayMetaSaving}
                      onClick={() => void handleSaveDayMeta()}
                    >
                      {dayMetaSaving ? "저장 중..." : "저장"}
                    </button>
                  </div>
                </section>
              ) : null}

              <section className="bookmark-panel bookmark-record-panel bookmark-review-panel">
                <header className="bookmark-panel-header bookmark-review-header">
                  <div>
                    <p className="bookmark-panel-eyebrow">REVIEW</p>
                    <h2>회고</h2>
                  </div>
                  <div className="bookmark-review-side">
                    <div className="bookmark-review-rating">
                      <CloverRating
                        value={ratingDraft}
                        onChange={handleRatingChange}
                        disabled={ratingSaving}
                      />
                      <button
                        type="button"
                        className="bookmark-primary bookmark-rating-save"
                        disabled={
                          ratingSaving || ratingDraft === rating
                        }
                        onClick={() => void handleSaveRating()}
                      >
                        {ratingSaving ? "저장 중..." : "저장"}
                      </button>
                    </div>
                    {reviewSaved ? (
                      <span className="bookmark-saved">저장됨</span>
                    ) : null}
                  </div>
                </header>
                <textarea
                  className="bookmark-record-textarea"
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
                  className="bookmark-primary bookmark-record-save"
                  disabled={reviewSaving}
                  onClick={() => void handleSaveReview()}
                >
                  {reviewSaving ? "저장 중..." : "회고 저장"}
                </button>
              </section>
            </div>
          </div>
        )}
      </main>

      {calendarOpen ? (
        <BookmarkCalendarModal
          month={calendarMonth}
          hoverDate={calendarHoverDate}
          periodStart={periodStart}
          onMonthChange={setCalendarMonth}
          onHoverDateChange={setCalendarHoverDate}
          onSelectDate={selectCalendarDate}
          onClose={closeCalendar}
          calendarRange={calendarRange}
        />
      ) : null}
      {routineModalOpen ? (
        <BookmarkRoutineModal
          modalFrequency={modalFrequency}
          error={error}
          itemTitle={itemTitle}
          setItemTitle={setItemTitle}
          itemNotes={itemNotes}
          setItemNotes={setItemNotes}
          routineCategoryId={routineCategoryId}
          setRoutineCategoryId={setRoutineCategoryId}
          categories={categories}
          editingRoutine={editingRoutine}
          readOnly={Boolean(editingRoutine?.end_date)}
          routineMode={routineMode}
          setRoutineMode={setRoutineMode}
          routineTarget={routineTarget}
          setRoutineTarget={setRoutineTarget}
          routineQuarter={routineQuarter}
          setRoutineQuarter={setRoutineQuarter}
          routineWeekdaySelection={routineWeekdaySelection}
          onToggleWeekday={toggleRoutineWeekday}
          monthlyMode={monthlyMode}
          setMonthlyMode={setMonthlyMode}
          routineDayOfMonth={routineDayOfMonth}
          setRoutineDayOfMonth={setRoutineDayOfMonth}
          routineNthWeek={routineNthWeek}
          setRoutineNthWeek={setRoutineNthWeek}
          routineWeekday={routineWeekday}
          setRoutineWeekday={setRoutineWeekday}
          routineMonth={routineMonth}
          setRoutineMonth={setRoutineMonth}
          itemSaving={itemSaving}
          onClose={closeRoutineModal}
          onSubmit={handleSaveRoutine}
          onStop={() => void handleStopRoutine()}
          onDelete={() => void handleDeleteRoutine()}
        />
      ) : null}
      {moodTagModalOpen ? (
        <BookmarkMoodTagModal
          error={moodTagError}
          editingTag={editingMoodTag}
          name={newMoodTagName}
          saving={moodTagSaving}
          tags={moodTags}
          sensors={dndSensors}
          onNameChange={setNewMoodTagName}
          onClose={closeMoodTagModal}
          onSubmitTag={() => void handleAddMoodTag()}
          onCancelEdit={cancelEditMoodTag}
          onDragEnd={handleMoodDragEnd}
          onEdit={startEditMoodTag}
          onDelete={(tag) => void handleDeleteMoodTag(tag)}
        />
      ) : null}
      {categoryModalOpen ? (
        <BookmarkCategoryModal
          error={categoryError}
          editingCategory={editingCategory}
          name={newCategoryName}
          saving={categorySaving}
          categories={categories}
          sensors={dndSensors}
          onNameChange={setNewCategoryName}
          onClose={closeCategoryModal}
          onSubmitCategory={() => void handleAddCategory()}
          onCancelEdit={cancelEditCategory}
          onDragEnd={handleCategoryDragEnd}
          onEdit={startEditCategory}
          onDelete={(category) => void handleDeleteCategory(category)}
        />
      ) : null}

      {historyRoutine ? (
        <BookmarkHistoryModal
          routine={historyRoutine}
          data={historyData}
          loading={historyLoading}
          error={historyError}
          buckets={historyBuckets}
          isMonthlyHistory={isMonthlyHistory}
          onClose={closeHistory}
        />
      ) : null}
    </div>
  );
}

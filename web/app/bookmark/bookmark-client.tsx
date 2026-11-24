"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
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
import { BookmarkPeriodPickerModal } from "./bookmark-period-picker-modal";
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
  TAB_LABELS,
  TARGET_LABELS,
  type BookmarkTab,
  type HistoryRoutine,
  type MonthlyMode,
  type StatsRange,
} from "./bookmark-types";
import {
  compactPeriodLabel,
  dateKey,
  historyDayTitle,
  historyMonthLabel,
  historyQuarterLabel,
  isPastPeriod,
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
  const [tab, setTab] = useState<BookmarkTab>("today");
  const [periodType, setPeriodType] =
    useState<BookmarkPeriodType>("day");
  const [anchorDate, setAnchorDate] = useState(initialToday);
  const periodStart = startOfPeriod(anchorDate, periodType);
  const collapseStorageKey = `bookmark-category-collapse:${username}:${
    tab === "today" ? periodType : tab
  }`;
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const periodMenuRef = useRef<HTMLDivElement>(null);
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
    periodType,
    anchorDate,
    setAnchorDate,
  });
  const [statsRange, setStatsRange] = useState<StatsRange>("month");

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

  const dataView =
    tab === "today"
      ? periodType === "day"
        ? "today"
        : periodType
      : tab;
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
    applyCachedPeriod,
    loadPeriod,
    loadCategories,
    loadMoodTags,
    loadStatistics,
  } = useBookmarkData({
    view: dataView,
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
  const recordPeriodType: BookmarkPeriodType = periodType;
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
    ratingEditable,
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

  const changeTab = (next: BookmarkTab) => {
    setTab(next);
    setPeriodMenuOpen(false);
    setPeriodPickerOpen(false);
    closeCalendar();
    closeRoutineModal();
  };

  const handleTodayTabClick = () => {
    if (tab !== "today") {
      const today = todayDateInputValue();
      applyCachedPeriod("today", today);
      setTab("today");
      setPeriodType("day");
      setAnchorDate(today);
      setPeriodMenuOpen(false);
      setPeriodPickerOpen(false);
      closeCalendar();
      closeRoutineModal();
      return;
    }
    setPeriodMenuOpen((previous) => !previous);
  };

  const selectPeriodType = (next: BookmarkPeriodType) => {
    setPeriodType(next);
    setTab("today");
    setPeriodMenuOpen(false);
    setPeriodPickerOpen(false);
    closeCalendar();
    closeRoutineModal();
  };

  const movePeriod = (delta: number) => {
    setAnchorDate((previous) =>
      shiftPeriod(previous, periodType, delta),
    );
    setPeriodMenuOpen(false);
    setPeriodPickerOpen(false);
    closeCalendar();
    closeRoutineModal();
  };

  const handleOpenPeriodSelector = () => {
    setPeriodMenuOpen(false);
    if (periodType === "day" || periodType === "week") {
      setPeriodPickerOpen(false);
      openCalendar();
      return;
    }
    closeCalendar();
    setPeriodPickerOpen(true);
  };

  const selectPeriodPickerValue = (value: string) => {
    setAnchorDate(value);
    setPeriodPickerOpen(false);
  };

  useEffect(() => {
    if (!periodMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!periodMenuRef.current?.contains(event.target as Node)) {
        setPeriodMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPeriodMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [periodMenuOpen]);

  const routines = data?.routines ?? [];
  const isTodaySelected = anchorDate === todayDateInputValue();
  const periodOptions = PERIOD_TYPES.map((type) => ({
    type,
    label: PERIOD_LABELS[type],
  }));
  const todayTabLabel =
    tab === "today"
      ? compactPeriodLabel(anchorDate, periodType)
      : TAB_LABELS.today;
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
    routineWindowStart,
    setRoutineWindowStart,
    routineWindowEnd,
    setRoutineWindowEnd,
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
    unitView: periodType,
    setData,
    loadPeriod,
    onError: setError,
  });

  const isCountRoutine = (routine: BookmarkRoutine) =>
    routine.tracking_mode === "count" && routine.frequency !== "daily";

  const isRoutineDone = (routine: BookmarkRoutine) => {
    const isCount = isCountRoutine(routine);
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

  const renderRoutines = () => {
    if (routines.length === 0) {
      return (
        <p className="bookmark-empty-row">
          {periodType === "day"
            ? isTodaySelected
              ? "오늘 수행할 루틴이 없습니다. 추가 버튼으로 새 루틴을 만들 수 있습니다."
              : "이 날짜에 수행할 루틴이 없습니다."
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
      items: BookmarkRoutine[];
    };
    const buildCategorySection = (
      key: string,
      name: string,
      categoryId: number | null,
      items: BookmarkRoutine[],
    ): RoutineSection | null => {
      if (items.length === 0) return null;
      return {
        key,
        name,
        categoryId,
        items,
      };
    };

    const buildCategorySections = (
      items: BookmarkRoutine[],
      keyPrefix = "",
    ): RoutineSection[] => {
      const sections = categories
        .map((category) =>
          buildCategorySection(
            `${keyPrefix}category-${category.id}`,
            category.name,
            category.id,
            items.filter(
              (routine) => routine.category_id === category.id,
            ),
          ),
        )
        .filter((section): section is RoutineSection =>
          Boolean(section),
        );
      const uncategorized = items.filter(
        (routine) =>
          routine.category_id === null ||
          !categoryById.has(routine.category_id),
      );
      const uncategorizedSection = buildCategorySection(
        `${keyPrefix}uncategorized`,
        "미분류",
        null,
        uncategorized,
      );
      if (uncategorizedSection) {
        sections.push(uncategorizedSection);
      }
      return sections;
    };

    const pendingRoutines = routines.filter(
      (routine) => !isRoutineDone(routine),
    );
    const doneRoutines = routines.filter(isRoutineDone);
    const dateRoutines = pendingRoutines.filter(
      (routine) => !isCountRoutine(routine),
    );
    const countRoutines = pendingRoutines.filter(isCountRoutine);
    const routineGroups = [
      {
        key: "date",
        label: `${MODE_LABELS.date} 루틴`,
        items: dateRoutines,
        sortable: true,
      },
      {
        key: "count",
        label: `${MODE_LABELS.count} 루틴`,
        items: [...countRoutines].sort(
          (a, b) =>
            b.completed_count - a.completed_count ||
            a.position - b.position ||
            a.id - b.id,
        ),
        sortable: false,
      },
      {
        key: "done",
        label: "완료",
        items: doneRoutines,
        sortable: true,
      },
    ]
      .map((group) => ({
        ...group,
        sections: buildCategorySections(
          group.items,
          `${group.key}:`,
        ),
      }))
      .filter((group) => group.sections.length > 0);

    const isSectionCollapsed = (section: RoutineSection) =>
      Boolean(collapsedSections[section.key]);
    const toggleSection = (section: RoutineSection) => {
      setSectionCollapsed(section.key, !isSectionCollapsed(section));
    };

    const renderRoutineItem = (
      routine: BookmarkRoutine,
      sortable = true,
    ) => {
      const isCount = isCountRoutine(routine);
      const isStopped = Boolean(routine.end_date);
      const allDone = isRoutineDone(routine);
      const isPast = isCount
        ? isPastPeriod(routine.period_start, routine.period_type)
        : routine.occurrences
            .filter((occurrence) => occurrence.done === allDone)
            .some((occurrence) =>
              isPastPeriod(occurrence.date, "day"),
            );
      const content = (
        <div className="bookmark-item-main">
          <div className="bookmark-routine-heading">
            <input
              type="checkbox"
              className="bookmark-routine-check"
              checked={allDone}
              disabled={
                isStopped ||
                isPast ||
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
            ) : isPast ? (
              <span className="bookmark-routine-status">지난 기간</span>
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
                  disabled={isPast || routine.completed_count <= 0}
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
                    isPast ||
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
      );
      const className = `bookmark-item is-clickable${
        allDone ? " is-done" : ""
      }`;
      const handleClick = () => openEditRoutine(routine);
      const handleKeyDown = (
        event: ReactKeyboardEvent<HTMLLIElement>,
      ) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          openEditRoutine(routine);
        }
      };

      if (sortable) {
        return (
          <SortableRoutineItem
            key={routine.id}
            id={routine.id}
            title={routine.title}
            disabled={routineOrderSaving}
            className={className}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
          >
            {content}
          </SortableRoutineItem>
        );
      }

      return (
        <li
          key={routine.id}
          className={className}
          role="button"
          tabIndex={0}
          aria-label={`${routine.title} 수정`}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
        >
          {content}
        </li>
      );
    };

    const renderRoutineList = (
      key: string,
      items: BookmarkRoutine[],
      sortable = true,
    ) =>
      sortable ? (
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
              {items.map((routine) => renderRoutineItem(routine, true))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul className="bookmark-item-list" key={key}>
          {items.map((routine) => renderRoutineItem(routine, false))}
        </ul>
      );

    const renderCategorySection = (
      section: RoutineSection,
      sortable: boolean,
    ) => {
      const collapsed = isSectionCollapsed(section);
      const panelId = `bookmark-routine-section-${section.key}`;

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
            <span>{section.items.length}</span>
          </header>

          <div id={panelId} hidden={collapsed}>
            {renderRoutineList(
              `${section.key}-list`,
              section.items,
              sortable,
            )}
          </div>
        </section>
      );
    };

    return (
      <div className="bookmark-routine-groups">
        {routineGroups.map((group) => {
          const collapseKey = `kind:${group.key}`;
          const collapsed =
            collapseKey in collapsedSections
              ? collapsedSections[collapseKey]
              : group.key === "done";
          const panelId = `bookmark-routine-kind-${group.key}`;

          return (
            <section
              className={`bookmark-routine-kind-group${
                collapsed ? " is-collapsed" : ""
              }`}
              key={group.key}
            >
              <header className="bookmark-routine-kind-header">
                <h3>
                  <button
                    type="button"
                    className="bookmark-routine-kind-toggle"
                    aria-expanded={!collapsed}
                    aria-controls={panelId}
                    onClick={() =>
                      setSectionCollapsed(collapseKey, !collapsed)
                    }
                  >
                    <span
                      className="bookmark-category-group-arrow"
                      aria-hidden="true"
                    >
                      {collapsed ? "▸" : "▾"}
                    </span>
                    <span>{group.label}</span>
                  </button>
                </h3>
                <span>{group.items.length}</span>
              </header>
              <div id={panelId} hidden={collapsed}>
                <div className="bookmark-routine-kind-body">
                  {group.sections.map((section) =>
                    renderCategorySection(section, group.sortable),
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  const renderJournal = () => (
    <div className="bookmark-stats-view">
      <BookmarkJournalPanel />
    </div>
  );

  const renderStatistics = () => (
    <div className="bookmark-stats-view">
      <BookmarkStatisticsPanel
        statistics={statistics}
        statsLoading={statsLoading}
        statsError={statsError}
        statsRange={statsRange}
        onRangeChange={setStatsRange}
        onOpenHistory={openHistory}
      />
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
          <div
            className="bookmark-period-tabs"
            role="tablist"
            aria-label="책갈피 보기"
          >
            <div className="bookmark-period-tab-wrap" ref={periodMenuRef}>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "today"}
                aria-haspopup="menu"
                aria-expanded={periodMenuOpen}
                title={
                  tab === "today" ? "기간 선택" : "오늘로 이동"
                }
                className={`bookmark-period-tab${
                  tab === "today" ? " is-active" : ""
                }`}
                onClick={handleTodayTabClick}
              >
                {todayTabLabel}
                <span
                  className="bookmark-period-tab-chevron"
                  aria-hidden="true"
                >
                  ▾
                </span>
              </button>
              {periodMenuOpen ? (
                <div
                  className="bookmark-period-menu"
                  role="menu"
                  aria-label="기간 선택"
                >
                  {periodOptions.map((option) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={periodType === option.type}
                      className={
                        periodType === option.type ? "is-active" : ""
                      }
                      key={option.type}
                      onClick={() => selectPeriodType(option.type)}
                    >
                      <span>{option.label}</span>
                      {periodType === option.type ? (
                        <span aria-hidden="true">✓</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "journal"}
              className={`bookmark-period-tab${
                tab === "journal" ? " is-active" : ""
              }`}
              onClick={() => changeTab("journal")}
            >
              {TAB_LABELS.journal}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "stats"}
              className={`bookmark-period-tab${
                tab === "stats" ? " is-active" : ""
              }`}
              onClick={() => changeTab("stats")}
            >
              {TAB_LABELS.stats}
            </button>
          </div>
          {tab === "today" ? (
            <div className="bookmark-period-nav">
              <button
                type="button"
                className="bookmark-icon-button"
                aria-label="이전 기간"
                onClick={() => movePeriod(-1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="bookmark-period-label"
                title={
                  periodType === "day" || periodType === "week"
                    ? "달력에서 날짜 선택"
                    : "기간 선택"
                }
                onClick={handleOpenPeriodSelector}
              >
                {periodLabel(anchorDate, "day")}
              </button>
              <button
                type="button"
                className="bookmark-icon-button"
                aria-label="다음 기간"
                onClick={() => movePeriod(1)}
              >
                ›
              </button>
            </div>
          ) : (
            <span className="bookmark-view-label">
              {tab === "journal"
                ? TAB_LABELS.journal
                : TAB_LABELS.stats}
            </span>
          )}
        </div>

        {tab === "today" && error ? (
          <p className="bookmark-error">{error}</p>
        ) : null}

        {tab === "journal" ? (
          renderJournal()
        ) : tab === "stats" ? (
          renderStatistics()
        ) : loading ? (
          <p className="bookmark-status">불러오는 중...</p>
        ) : (
          <div className="bookmark-layout">
            <div className="bookmark-main-column">
              <section className="bookmark-panel">
                <header className="bookmark-panel-header">
                  <div>
                    <p className="bookmark-panel-eyebrow">
                      {periodType === "day"
                        ? isTodaySelected
                          ? "오늘 수행 가능"
                          : "선택일 기준"
                        : ROUTINE_SECTION_LABELS[periodType]}
                    </p>
                    <h2>
                      {periodType === "day"
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
                    <button
                      type="button"
                      className="bookmark-primary"
                      onClick={openCreateRoutine}
                    >
                      추가
                    </button>
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
                        disabled={ratingSaving || !ratingEditable}
                      />
                      {ratingEditable ? (
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
                      ) : (
                        <span className="bookmark-rating-derived">
                          하위 평균
                        </span>
                      )}
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
          periodStart={anchorDate}
          onMonthChange={setCalendarMonth}
          onHoverDateChange={setCalendarHoverDate}
          onSelectDate={selectCalendarDate}
          onClose={closeCalendar}
          calendarRange={calendarRange}
        />
      ) : null}
      {periodPickerOpen &&
      periodType !== "day" &&
      periodType !== "week" ? (
        <BookmarkPeriodPickerModal
          level={periodType}
          value={periodStart}
          onSelect={selectPeriodPickerValue}
          onClose={() => setPeriodPickerOpen(false)}
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
          routineWindowStart={routineWindowStart}
          setRoutineWindowStart={setRoutineWindowStart}
          routineWindowEnd={routineWindowEnd}
          setRoutineWindowEnd={setRoutineWindowEnd}
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

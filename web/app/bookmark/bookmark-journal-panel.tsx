import { useState } from "react";

import { CloverIcon } from "@/app/bookmark/clover-rating";
import type {
  BookmarkJournalNode,
  BookmarkJournalNodeLevel,
  BookmarkJournalTree,
} from "@/lib/bookmark";
import { formatTime24h } from "@/lib/bookmark";
import { todayDateInputValue } from "@/lib/datetime";

import { BookmarkCalendarModal } from "./bookmark-calendar-modal";
import { BookmarkJournalEditModal } from "./bookmark-journal-edit-modal";
import { BookmarkPeriodPickerModal } from "./bookmark-period-picker-modal";
import { useBookmarkJournalTree } from "./use-bookmark-journal-tree";
import {
  parseDateKey,
  periodLabel,
  shiftPeriod,
  startOfPeriod,
  weekPeriodLabel,
  weekThursday,
} from "./bookmark-utils";

type JournalLevel = "week" | "month" | "quarter" | "year" | "decade";

const EMPTY_LABELS: Record<JournalLevel, string> = {
  week: "이 주에 기록된 회고가 없습니다.",
  month: "이 달에 기록된 회고가 없습니다.",
  quarter: "이 분기에 기록된 회고가 없습니다.",
  year: "이 해에 기록된 회고가 없습니다.",
  decade: "이 10년에 기록된 회고가 없습니다.",
};

function formatAverage(value: number | null) {
  if (value === null) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function countText(node: BookmarkJournalNode) {
  return (
    `목표 ${node.goal_count} · 후기 ${node.review_count} · ` +
    `평균 평점 ${formatAverage(node.average_rating)}`
  );
}

function renderRating(node: BookmarkJournalNode) {
  const value = node.rating?.rating ?? 0;
  if (value <= 0) return null;
  return (
    <span
      className="bookmark-journal-rating"
      aria-label={`${value}점`}
    >
      {[1, 2, 3, 4, 5].map((score) => (
        <span
          className={`bookmark-journal-clover${
            score <= value ? " is-filled" : ""
          }`}
          key={score}
        >
          <CloverIcon filled={score <= value} />
        </span>
      ))}
    </span>
  );
}

function hasOwnRecord(node: BookmarkJournalNode) {
  return (
    Boolean(node.goal?.content) ||
    Boolean(node.goal?.wake_time) ||
    node.goal?.mood_tag_id != null ||
    Boolean(node.review?.content) ||
    (node.rating?.rating ?? 0) > 0
  );
}

function renderRecord(
  node: BookmarkJournalNode,
  onEdit?: () => void,
) {
  if (!hasOwnRecord(node)) {
    return null;
  }
  return (
    <div
      className={`bookmark-journal-record${
        onEdit ? " is-editable" : ""
      }`}
      role={onEdit ? "button" : undefined}
      tabIndex={onEdit ? 0 : undefined}
      title={onEdit ? "클릭해서 수정" : undefined}
      aria-label={onEdit ? `${node.label} 기록 수정` : undefined}
      onClick={onEdit}
      onKeyDown={
        onEdit
          ? (event) => {
              if (
                event.target === event.currentTarget &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                onEdit();
              }
            }
          : undefined
      }
    >
      {node.goal?.wake_time || node.goal?.mood_tag_name ? (
        <div className="bookmark-journal-block">
          <span className="bookmark-journal-label">기상/기분</span>
          <p>
            {[
              formatTime24h(node.goal?.wake_time),
              node.goal?.mood_tag_name,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ) : null}
      {node.goal?.content ? (
        <div className="bookmark-journal-block">
          <span className="bookmark-journal-label">목표</span>
          <p>{node.goal.content}</p>
        </div>
      ) : null}
      {renderRating(node)}
      {node.review?.content ? (
        <div className="bookmark-journal-block">
          <span className="bookmark-journal-label">후기</span>
          <p>{node.review.content}</p>
        </div>
      ) : null}
    </div>
  );
}

function textOrDash(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : "-";
}

function hasAnyRecord(node: BookmarkJournalNode) {
  return (
    node.goal_count > 0 ||
    Boolean(node.goal?.wake_time) ||
    node.goal?.mood_tag_id != null ||
    node.review_count > 0 ||
    node.rating_count > 0
  );
}

function decadeStartForDate(value: string) {
  const year = parseDateKey(value).getUTCFullYear();
  return `${Math.floor(year / 10) * 10}-01-01`;
}

function levelStart(value: string, level: JournalLevel) {
  if (level === "decade") {
    return decadeStartForDate(value);
  }
  return startOfPeriod(value, level);
}

function journalPeriodRange(
  value: string,
  level: JournalLevel,
): { start: string; end: string } {
  const start = levelStart(value, level);
  if (level === "week") {
    return { start, end: shiftPeriod(start, "day", 6) };
  }
  if (level === "decade") {
    return {
      start,
      end: shiftPeriod(shiftPeriod(start, "year", 10), "day", -1),
    };
  }
  const next = shiftPeriod(start, level, 1);
  return { start, end: shiftPeriod(next, "day", -1) };
}

function levelLabel(
  value: string,
  level: JournalLevel | "day",
  node: BookmarkJournalNode | null,
) {
  if (level === "week") {
    return weekPeriodLabel(value);
  }
  if (node) return node.label;
  if (level === "decade") {
    return `${parseDateKey(value).getUTCFullYear()}년대`;
  }
  return periodLabel(value, level);
}

function withoutYear(label: string) {
  return label.replace(/^\d{4}년\s*/, "");
}

function findNode(
  tree: BookmarkJournalTree,
  level: JournalLevel,
  periodStart: string,
): BookmarkJournalNode | null {
  if (level === "decade") return null;
  if (level === "year") {
    return (
      tree.years.find(
        (year) => year.period_start === periodStart,
      ) ?? null
    );
  }
  const years = tree.years;
  if (level === "quarter") {
    return (
      years
        .flatMap((year) => year.children)
        .find(
          (quarter) => quarter.period_start === periodStart,
        ) ?? null
    );
  }
  const quarters = years.flatMap((year) => year.children);
  if (level === "month") {
    return (
      quarters
        .flatMap((quarter) => quarter.children)
        .find((month) => month.period_start === periodStart) ??
      null
    );
  }
  return (
    quarters
      .flatMap((quarter) => quarter.children)
      .flatMap((month) => month.children)
      .find((week) => week.period_start === periodStart) ?? null
  );
}

function emptyNode(
  level: BookmarkJournalNodeLevel,
  periodStart: string,
): BookmarkJournalNode {
  return {
    level,
    period_start: periodStart,
    period_end:
      level === "week"
        ? shiftPeriod(periodStart, "day", 6)
        : periodStart,
    label: levelLabel(periodStart, level, null),
    goal: null,
    rating: null,
    review: null,
    goal_count: 0,
    review_count: 0,
    rating_count: 0,
    average_rating: null,
    children: [],
  };
}

function weekDayNodes(
  node: BookmarkJournalNode,
): BookmarkJournalNode[] {
  const existing = new Map(
    node.children
      .filter((child) => child.level === "day")
      .map((child) => [child.period_start, child]),
  );
  return Array.from({ length: 7 }, (_, index) => {
    const start = shiftPeriod(node.period_start, "day", index);
    return existing.get(start) ?? emptyNode("day", start);
  });
}

type ParentLevel = Exclude<JournalLevel, "week">;

const CHILD_TABLE_LABELS: Record<
  ParentLevel,
  { title: string; column: string }
> = {
  month: { title: "주간 기록", column: "주" },
  quarter: { title: "월간 기록", column: "월" },
  year: { title: "분기 기록", column: "분기" },
  decade: { title: "연간 기록", column: "연도" },
};

function childLevelFor(level: ParentLevel): BookmarkJournalNodeLevel {
  if (level === "decade") return "year";
  if (level === "year") return "quarter";
  if (level === "quarter") return "month";
  return "week";
}

function monthWeekStarts(monthStart: string): string[] {
  const monthDate = parseDateKey(monthStart);
  let cursor = startOfPeriod(monthStart, "week");
  let thursday = parseDateKey(weekThursday(cursor));
  if (
    thursday.getUTCFullYear() !== monthDate.getUTCFullYear() ||
    thursday.getUTCMonth() !== monthDate.getUTCMonth()
  ) {
    cursor = shiftPeriod(cursor, "day", 7);
    thursday = parseDateKey(weekThursday(cursor));
  }
  const starts: string[] = [];
  while (
    thursday.getUTCFullYear() === monthDate.getUTCFullYear() &&
    thursday.getUTCMonth() === monthDate.getUTCMonth()
  ) {
    starts.push(cursor);
    cursor = shiftPeriod(cursor, "day", 7);
    thursday = parseDateKey(weekThursday(cursor));
  }
  return starts;
}

function childStartsFor(level: ParentLevel, start: string): string[] {
  if (level === "decade") {
    return Array.from({ length: 10 }, (_, index) =>
      shiftPeriod(start, "year", index),
    );
  }
  if (level === "year") {
    return Array.from({ length: 4 }, (_, index) =>
      shiftPeriod(start, "quarter", index),
    );
  }
  if (level === "quarter") {
    return Array.from({ length: 3 }, (_, index) =>
      shiftPeriod(start, "month", index),
    );
  }
  return monthWeekStarts(start);
}

function childNodesFor(
  level: ParentLevel,
  start: string,
  existing: BookmarkJournalNode[],
): BookmarkJournalNode[] {
  const childLevel = childLevelFor(level);
  const byStart = new Map(
    existing
      .filter((child) => child.level === childLevel)
      .map((child) => [child.period_start, child]),
  );
  return childStartsFor(level, start).map(
    (childStart) =>
      byStart.get(childStart) ?? emptyNode(childLevel, childStart),
  );
}

function childLabel(child: BookmarkJournalNode) {
  const label = levelLabel(child.period_start, child.level, child);
  return child.level === "year" ? label : withoutYear(label);
}

export function BookmarkJournalPanel() {
  const { tree, loading, error, reload, goToDate } =
    useBookmarkJournalTree();
  const [anchorDate, setAnchorDate] = useState(() =>
    todayDateInputValue(),
  );
  const [level, setLevel] = useState<JournalLevel>("week");
  const [editingNode, setEditingNode] =
    useState<BookmarkJournalNode | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfPeriod(todayDateInputValue(), "month"),
  );
  const [calendarHoverDate, setCalendarHoverDate] = useState<
    string | null
  >(null);

  const periodStart = levelStart(anchorDate, level);
  const pickerLevel = level === "week" ? null : level;
  const node = tree
    ? findNode(tree, level, periodStart)
    : null;
  const title = levelLabel(periodStart, level, node);
  const currentNode = level === "decade" ? null : node;

  const weekStart = startOfPeriod(anchorDate, "week");
  const groupingDate =
    level === "week" ? weekThursday(weekStart) : anchorDate;
  const monthStart = startOfPeriod(groupingDate, "month");
  const quarterStart = startOfPeriod(groupingDate, "quarter");
  const yearStart = startOfPeriod(groupingDate, "year");
  const decadeStart = decadeStartForDate(groupingDate);
  const lookup = (target: JournalLevel, start: string) =>
    tree ? findNode(tree, target, start) : null;

  const breadcrumb = [
    {
      level: "week" as const,
      start: weekStart,
      label: withoutYear(
        levelLabel(
          weekStart,
          "week",
          lookup("week", weekStart),
        ),
      ),
    },
    {
      level: "month" as const,
      start: monthStart,
      label: withoutYear(
        levelLabel(
          monthStart,
          "month",
          lookup("month", monthStart),
        ),
      ),
    },
    {
      level: "quarter" as const,
      start: quarterStart,
      label: withoutYear(
        levelLabel(
          quarterStart,
          "quarter",
          lookup("quarter", quarterStart),
        ),
      ),
    },
    {
      level: "year" as const,
      start: yearStart,
      label: levelLabel(
        yearStart,
        "year",
        lookup("year", yearStart),
      ),
    },
    {
      level: "decade" as const,
      start: decadeStart,
      label: `${parseDateKey(decadeStart).getUTCFullYear()}년대`,
    },
  ];

  const closeSelectors = () => {
    setCalendarOpen(false);
    setPeriodPickerOpen(false);
  };

  const selectLevel = (next: JournalLevel, start: string) => {
    // Changing the view level must not move the user's base date.
    setLevel(next);
    closeSelectors();
    goToDate(next === "week" ? weekThursday(anchorDate) : start);
  };

  const movePeriod = (delta: number) => {
    const next =
      level === "decade"
        ? shiftPeriod(periodStart, "year", delta * 10)
        : shiftPeriod(anchorDate, level, delta);
    setAnchorDate(next);
    closeSelectors();
    goToDate(level === "week" ? weekThursday(next) : next);
  };

  const openDateSelector = () => {
    setPeriodPickerOpen(false);
    setCalendarMonth(startOfPeriod(anchorDate, "month"));
    setCalendarHoverDate(null);
    setCalendarOpen(true);
  };

  const openPeriodSelector = () => {
    if (level === "week") {
      openDateSelector();
      return;
    }
    setCalendarOpen(false);
    setPeriodPickerOpen(true);
  };

  const closeCalendar = () => {
    setCalendarOpen(false);
  };

  const selectCalendarDate = (value: string) => {
    setAnchorDate(value);
    setCalendarOpen(false);
    goToDate(level === "week" ? weekThursday(value) : value);
  };

  const selectPeriodPickerValue = (value: string) => {
    setAnchorDate(value);
    setPeriodPickerOpen(false);
    goToDate(value);
  };

  const calendarRange = (value: string) =>
    journalPeriodRange(value, level);



  const renderDecade = () => {
    const goalCount = tree
      ? tree.years.reduce((sum, year) => sum + year.goal_count, 0)
      : 0;
    const reviewCount = tree
      ? tree.years.reduce(
          (sum, year) => sum + year.review_count,
          0,
        )
      : 0;
    const ratingCount = tree
      ? tree.years.reduce(
          (sum, year) => sum + year.rating_count,
          0,
        )
      : 0;
    const ratingSum = tree
      ? tree.years.reduce(
          (sum, year) =>
            sum +
            (year.average_rating ?? 0) * year.rating_count,
          0,
        )
      : 0;
    const average =
      ratingCount > 0
        ? Math.round((ratingSum / ratingCount) * 100) / 100
        : null;
    return (
      <div className="bookmark-journal-decade-summary">
        <div className="bookmark-journal-summary">
          <p>
            목표 {goalCount} · 후기 {reviewCount} · 평균 평점{" "}
            {formatAverage(average)}
          </p>
        </div>
      </div>
    );
  };

  const renderWeekDays = (node: BookmarkJournalNode) => (
    <div className="bookmark-journal-section">
      <h3>일간 기록</h3>
      <div className="bookmark-journal-table-wrap">
        <table className="bookmark-journal-table has-day-meta">
          <colgroup>
            <col className="is-date" />
            <col className="is-wake" />
            <col className="is-mood" />
            <col className="is-goal" />
            <col className="is-rating" />
            <col className="is-review" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">날짜</th>
              <th scope="col">기상</th>
              <th scope="col">기분</th>
              <th scope="col">목표</th>
              <th scope="col">별점</th>
              <th scope="col">회고</th>
            </tr>
          </thead>
          <tbody>
            {weekDayNodes(node).map((day) => (
              <tr
                key={day.period_start}
                className="is-editable"
                tabIndex={0}
                title="클릭해서 수정"
                aria-label={`${day.label} 기록 수정`}
                onClick={() => setEditingNode(day)}
                onKeyDown={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    setEditingNode(day);
                  }
                }}
              >
                <th scope="row">{withoutYear(day.label)}</th>
                <td>{textOrDash(formatTime24h(day.goal?.wake_time))}</td>
                <td>{textOrDash(day.goal?.mood_tag_name)}</td>
                <td>{textOrDash(day.goal?.content)}</td>
                <td>{renderRating(day) ?? "-"}</td>
                <td>{textOrDash(day.review?.content)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderChildTable = (
    parentLevel: ParentLevel,
    start: string,
    existing: BookmarkJournalNode[],
  ) => {
    const labels = CHILD_TABLE_LABELS[parentLevel];
    const children = childNodesFor(parentLevel, start, existing);
    return (
      <div className="bookmark-journal-section">
        <h3>{labels.title}</h3>
        <div className="bookmark-journal-table-wrap">
          <table className="bookmark-journal-table">
            <colgroup>
              <col className="is-date" />
              <col className="is-goal" />
              <col className="is-rating" />
              <col className="is-review" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">{labels.column}</th>
                <th scope="col">목표</th>
                <th scope="col">별점</th>
                <th scope="col">회고</th>
              </tr>
            </thead>
            <tbody>
              {children.map((child) => (
                <tr
                  key={`${child.level}:${child.period_start}`}
                  className="is-editable"
                  tabIndex={0}
                  title="클릭해서 수정"
                  aria-label={`${childLabel(child)} 기록 수정`}
                  onClick={() => setEditingNode(child)}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      setEditingNode(child);
                    }
                  }}
                >
                  <th scope="row">{childLabel(child)}</th>
                  <td>{textOrDash(child.goal?.content)}</td>
                  <td>{renderRating(child) ?? "-"}</td>
                  <td>{textOrDash(child.review?.content)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (loading) {
      return <p className="bookmark-status">회고를 불러오는 중...</p>;
    }
    if (error) {
      return <p className="bookmark-error">{error}</p>;
    }
    if (!tree) return null;
    if (level === "decade") {
      return (
        <>
          {renderDecade()}
          {renderChildTable("decade", periodStart, tree.years)}
        </>
      );
    }
    const targetNode =
      currentNode ?? emptyNode(level, periodStart);
    return (
      <>
        <div className="bookmark-journal-summary">
          <p className="bookmark-journal-hint">
            {countText(targetNode)}
          </p>
        </div>
        {renderRecord(targetNode, () => {
          setEditingNode(targetNode);
        }) ?? (
          <button
            type="button"
            className="bookmark-journal-empty-edit"
            onClick={() => setEditingNode(targetNode)}
          >
            {hasAnyRecord(targetNode)
              ? "이 기간에 직접 작성한 목표·기상·기분·별점·후기가 없습니다. 클릭해서 기록하기"
              : `${EMPTY_LABELS[level]} 클릭해서 기록하기`}
          </button>
        )}
        {level === "week"
          ? renderWeekDays(targetNode)
          : renderChildTable(
              level,
              periodStart,
              targetNode.children,
            )}
      </>
    );
  };

  return (
    <section className="bookmark-panel bookmark-journal-panel">
      <header className="bookmark-panel-header bookmark-journal-header">
        <div>
          <p className="bookmark-panel-eyebrow">JOURNAL</p>
          <h2>회고 모아보기</h2>
        </div>
        <button
          type="button"
          className="bookmark-text-button"
          title="기준일 선택"
          aria-haspopup="dialog"
          aria-expanded={calendarOpen}
          onClick={openDateSelector}
        >
          오늘
        </button>
      </header>

      <div className="bookmark-journal-toolbar">
        <div className="bookmark-journal-nav">
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
            className="bookmark-period-label bookmark-journal-period-label"
            title={
              level === "week"
                ? "달력에서 날짜 선택"
                : "기간 선택"
            }
            aria-haspopup="dialog"
            aria-expanded={calendarOpen || periodPickerOpen}
            onClick={openPeriodSelector}
          >
            {title}
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
      </div>

      <div className="bookmark-journal-breadcrumb">
        {breadcrumb.map((item, index) => (
          <span className="bookmark-journal-crumb" key={item.level}>
            {index > 0 ? <span>/</span> : null}
            {item.level === level ? (
              <strong>{item.label}</strong>
            ) : (
              <button
                type="button"
                onClick={() => selectLevel(item.level, item.start)}
              >
                {item.label}
              </button>
            )}
          </span>
        ))}
      </div>

      {renderContent()}

      {editingNode ? (
        <BookmarkJournalEditModal
          node={editingNode}
          onClose={() => setEditingNode(null)}
          onSaved={() => {
            setEditingNode(null);
            void reload();
          }}
        />
      ) : null}

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

      {periodPickerOpen && pickerLevel ? (
        <BookmarkPeriodPickerModal
          level={pickerLevel}
          value={periodStart}
          onSelect={selectPeriodPickerValue}
          onClose={() => setPeriodPickerOpen(false)}
        />
      ) : null}
    </section>
  );
}

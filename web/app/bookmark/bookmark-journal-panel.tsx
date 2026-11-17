import { useState } from "react";

import { CloverIcon } from "@/app/bookmark/clover-rating";
import type {
  BookmarkJournalNode,
  BookmarkJournalNodeLevel,
  BookmarkJournalTree,
} from "@/lib/bookmark";
import { todayDateInputValue } from "@/lib/datetime";

import { BookmarkJournalEditModal } from "./bookmark-journal-edit-modal";
import { useBookmarkJournalTree } from "./use-bookmark-journal-tree";
import {
  parseDateKey,
  periodLabel,
  shiftPeriod,
  startOfPeriod,
  weekLabel,
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

function levelLabel(
  value: string,
  level: JournalLevel | "day",
  node: BookmarkJournalNode | null,
) {
  if (level === "week") {
    const date = parseDateKey(value);
    return `${date.getUTCFullYear()}년 ${
      date.getUTCMonth() + 1
    }월 ${weekLabel(value)}`;
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
  let cursorDate = parseDateKey(cursor);
  if (
    cursorDate.getUTCFullYear() !== monthDate.getUTCFullYear() ||
    cursorDate.getUTCMonth() !== monthDate.getUTCMonth()
  ) {
    cursor = shiftPeriod(cursor, "day", 7);
    cursorDate = parseDateKey(cursor);
  }
  const starts: string[] = [];
  while (
    cursorDate.getUTCFullYear() === monthDate.getUTCFullYear() &&
    cursorDate.getUTCMonth() === monthDate.getUTCMonth()
  ) {
    starts.push(cursor);
    cursor = shiftPeriod(cursor, "day", 7);
    cursorDate = parseDateKey(cursor);
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

  const periodStart = levelStart(anchorDate, level);
  const node = tree
    ? findNode(tree, level, periodStart)
    : null;
  const title = levelLabel(periodStart, level, node);
  const currentNode = level === "decade" ? null : node;

  const weekStart = startOfPeriod(anchorDate, "week");
  const monthStart = startOfPeriod(anchorDate, "month");
  const quarterStart = startOfPeriod(anchorDate, "quarter");
  const yearStart = startOfPeriod(anchorDate, "year");
  const decadeStart = decadeStartForDate(anchorDate);
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

  const selectLevel = (next: JournalLevel) => {
    setLevel(next);
  };

  const moveWeek = (delta: number) => {
    const next = shiftPeriod(weekStart, "week", delta);
    setAnchorDate(next);
    setLevel("week");
    goToDate(next);
  };

  const goToday = () => {
    const today = todayDateInputValue();
    setAnchorDate(today);
    setLevel("week");
    goToDate(today);
  };

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
        <table className="bookmark-journal-table">
          <colgroup>
            <col className="is-date" />
            <col className="is-goal" />
            <col className="is-rating" />
            <col className="is-review" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">날짜</th>
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
              ? "이 기간에 직접 작성한 목표·별점·후기가 없습니다. 클릭해서 기록하기"
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
          onClick={goToday}
        >
          오늘
        </button>
      </header>

      <div className="bookmark-journal-toolbar">
        <div className="bookmark-journal-nav">
          {level === "week" ? (
            <button
              type="button"
              className="bookmark-icon-button"
              aria-label="이전 주"
              onClick={() => moveWeek(-1)}
            >
              ‹
            </button>
          ) : null}
          <strong>{title}</strong>
          {level === "week" ? (
            <button
              type="button"
              className="bookmark-icon-button"
              aria-label="다음 주"
              onClick={() => moveWeek(1)}
            >
              ›
            </button>
          ) : null}
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
                onClick={() => selectLevel(item.level)}
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
    </section>
  );
}

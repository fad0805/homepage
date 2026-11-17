import { useState } from "react";

import { CloverIcon } from "@/app/bookmark/clover-rating";
import type {
  BookmarkJournalNode,
  BookmarkJournalTree,
} from "@/lib/bookmark";
import { todayDateInputValue } from "@/lib/datetime";

import { useBookmarkJournalTree } from "./use-bookmark-journal-tree";
import {
  parseDateKey,
  periodLabel,
  shiftPeriod,
  startOfPeriod,
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
    `평점 ${formatAverage(node.average_rating)}`
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

function renderRecord(node: BookmarkJournalNode) {
  if (
    !node.rating &&
    !node.goal?.content &&
    !node.review?.content
  ) {
    return null;
  }
  return (
    <div className="bookmark-journal-record">
      {renderRating(node)}
      {node.goal?.content ? (
        <div className="bookmark-journal-block">
          <span className="bookmark-journal-label">목표</span>
          <p>{node.goal.content}</p>
        </div>
      ) : null}
      {node.review?.content ? (
        <div className="bookmark-journal-block">
          <span className="bookmark-journal-label">후기</span>
          <p>{node.review.content}</p>
        </div>
      ) : null}
    </div>
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
  level: JournalLevel,
  node: BookmarkJournalNode | null,
) {
  if (node) return node.label;
  if (level === "decade") {
    return `${parseDateKey(value).getUTCFullYear()}년대`;
  }
  return periodLabel(value, level);
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

export function BookmarkJournalPanel() {
  const { tree, loading, error, goToDate } =
    useBookmarkJournalTree();
  const [anchorDate, setAnchorDate] = useState(() =>
    todayDateInputValue(),
  );
  const [level, setLevel] = useState<JournalLevel>("week");

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
      label: levelLabel(
        weekStart,
        "week",
        lookup("week", weekStart),
      ),
    },
    {
      level: "month" as const,
      start: monthStart,
      label: levelLabel(
        monthStart,
        "month",
        lookup("month", monthStart),
      ),
    },
    {
      level: "quarter" as const,
      start: quarterStart,
      label: levelLabel(
        quarterStart,
        "quarter",
        lookup("quarter", quarterStart),
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
        <p>
          목표 {goalCount} · 후기 {reviewCount} · 평점{" "}
          {formatAverage(average)}
        </p>
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
      return tree.years.length > 0 ? (
        renderDecade()
      ) : (
        <p className="bookmark-empty-row">
          {EMPTY_LABELS.decade}
        </p>
      );
    }
    if (!currentNode) {
      return (
        <p className="bookmark-empty-row">
          {EMPTY_LABELS[level]}
        </p>
      );
    }
    return (
      <>
        <p className="bookmark-journal-hint">
          {countText(currentNode)}
        </p>
        {renderRecord(currentNode)}
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

      <p className="bookmark-journal-hint">
        주간 기록에서 시작해 월·분기·연·10년 단위로 올라갑니다.
      </p>

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
    </section>
  );
}

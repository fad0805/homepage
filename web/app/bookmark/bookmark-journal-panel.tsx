import { useEffect, useState } from "react";

import { CloverIcon } from "@/app/bookmark/clover-rating";
import type { BookmarkJournalNode } from "@/lib/bookmark";

import { pad2, parseDateKey } from "./bookmark-utils";
import { useBookmarkJournalTree } from "./use-bookmark-journal-tree";

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

export function BookmarkJournalPanel() {
  const { tree, loading, error, moveDecade, goToday } =
    useBookmarkJournalTree();
  const [yearStart, setYearStart] = useState<string | null>(null);
  const [monthStart, setMonthStart] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);

  useEffect(() => {
    setYearStart(null);
    setMonthStart(null);
    setWeekStart(null);
  }, [tree?.decade_start]);

  const yearNode =
    yearStart === null
      ? null
      : tree?.years.find((year) => year.period_start === yearStart) ??
        null;
  const monthNode =
    yearNode && monthStart !== null
      ? yearNode.children
          .flatMap((quarter) => quarter.children)
          .find((month) => month.period_start === monthStart) ?? null
      : null;
  const weekNode =
    monthNode && weekStart !== null
      ? monthNode.children.find(
          (week) => week.period_start === weekStart,
        ) ?? null
      : null;

  const decadeYear = tree
    ? parseDateKey(tree.decade_start).getUTCFullYear()
    : null;
  const decadeYears =
    decadeYear === null
      ? []
      : Array.from({ length: 10 }, (_, index) =>
          tree?.years.find(
            (year) => year.period_start === `${decadeYear + index}-01-01`,
          ) ?? null,
        );

  const monthsByStart = new Map(
    yearNode
      ? yearNode.children.flatMap((quarter) =>
          quarter.children.map((month) => [
            month.period_start,
            month,
          ] as const),
        )
      : [],
  );
  const yearMonths = yearNode
    ? Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        return {
          month,
          start: `${yearNode.period_start.slice(0, 4)}-${pad2(
            month,
          )}-01`,
          node: monthsByStart.get(
            `${yearNode.period_start.slice(0, 4)}-${pad2(month)}-01`,
          ) ?? null,
        };
      })
    : [];

  const goBack = () => {
    if (weekStart) {
      setWeekStart(null);
      return;
    }
    if (monthStart) {
      setMonthStart(null);
      return;
    }
    if (yearStart) {
      setYearStart(null);
    }
  };

  const renderDecade = () => {
    if (loading) {
      return <p className="bookmark-status">회고를 불러오는 중...</p>;
    }
    if (error) {
      return <p className="bookmark-error">{error}</p>;
    }
    if (!tree) return null;
    return (
      <div className="bookmark-journal-grid">
        {decadeYears.map((year, index) => {
          const label = `${decadeYear! + index}년`;
          return (
            <button
              type="button"
              className="bookmark-journal-card"
              key={label}
              disabled={year === null}
              onClick={() => {
                if (!year) return;
                setYearStart(year.period_start);
                setMonthStart(null);
                setWeekStart(null);
              }}
            >
              <strong>{label}</strong>
              <span>
                {year ? countText(year) : "기록 없음"}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderYear = (node: BookmarkJournalNode) => {
    const quarterRecords = node.children.filter(
      (quarter) =>
        quarter.rating ||
        quarter.goal?.content ||
        quarter.review?.content,
    );
    return (
      <>
        {renderRecord(node)}
        {quarterRecords.length > 0 ? (
          <div className="bookmark-journal-section">
            <h3>분기 기록</h3>
            <div className="bookmark-journal-record-list">
              {quarterRecords.map((quarter) => (
                <article
                  className="bookmark-journal-record-card"
                  key={quarter.period_start}
                >
                  <strong>{quarter.label}</strong>
                  {renderRecord(quarter)}
                </article>
              ))}
            </div>
          </div>
        ) : null}
        <div className="bookmark-journal-section">
          <h3>월간 기록</h3>
          <div className="bookmark-journal-grid is-months">
            {yearMonths.map(({ month, start, node: monthData }) => (
              <button
                type="button"
                className="bookmark-journal-card"
                key={start}
                disabled={monthData === null}
                onClick={() => {
                  if (!monthData) return;
                  setMonthStart(monthData.period_start);
                  setWeekStart(null);
                }}
              >
                <strong>{month}월</strong>
                <span>
                  {monthData
                    ? countText(monthData)
                    : "기록 없음"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  };

  const renderMonth = (node: BookmarkJournalNode) => (
    <>
      {renderRecord(node)}
      <div className="bookmark-journal-section">
        <h3>주 단위 기록</h3>
        {node.children.length === 0 ? (
          <p className="bookmark-empty-row">
            이 달에 기록된 주간 기록이 없습니다.
          </p>
        ) : (
          <div className="bookmark-journal-grid is-weeks">
            {node.children.map((week) => (
              <button
                type="button"
                className="bookmark-journal-card"
                key={week.period_start}
                onClick={() => setWeekStart(week.period_start)}
              >
                <strong>{week.label}</strong>
                <span>{countText(week)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const renderWeek = (node: BookmarkJournalNode) => (
    <>
      {renderRecord(node)}
      <div className="bookmark-journal-section">
        <h3>일간 기록</h3>
        {node.children.length === 0 ? (
          <p className="bookmark-empty-row">
            이 주에 기록된 일간 기록이 없습니다.
          </p>
        ) : (
          <div className="bookmark-journal-record-list">
            {node.children.map((day) => (
              <article
                className="bookmark-journal-day"
                key={day.period_start}
              >
                <strong>{day.label}</strong>
                {renderRecord(day)}
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );

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
          이번 10년
        </button>
      </header>

      <div className="bookmark-journal-toolbar">
        <div className="bookmark-journal-nav">
          <button
            type="button"
            className="bookmark-icon-button"
            aria-label="이전 10년"
            onClick={() => moveDecade(-1)}
          >
            ‹
          </button>
          <strong>{tree?.label ?? "..."}</strong>
          <button
            type="button"
            className="bookmark-icon-button"
            aria-label="다음 10년"
            onClick={() => moveDecade(1)}
          >
            ›
          </button>
        </div>
        {yearStart ? (
          <button
            type="button"
            className="bookmark-text-button"
            onClick={goBack}
          >
            위로
          </button>
        ) : null}
      </div>

      <p className="bookmark-journal-hint">
        주간·일간 기록은 주 시작일(월요일) 기준으로 묶입니다.
      </p>

      <div className="bookmark-journal-breadcrumb">
        <button
          type="button"
          onClick={() => {
            setYearStart(null);
            setMonthStart(null);
            setWeekStart(null);
          }}
        >
          {tree?.label ?? "10년"}
        </button>
        {yearNode ? (
          <>
            <span>/</span>
            <button
              type="button"
              onClick={() => {
                setMonthStart(null);
                setWeekStart(null);
              }}
            >
              {yearNode.label}
            </button>
          </>
        ) : null}
        {monthNode ? (
          <>
            <span>/</span>
            <button
              type="button"
              onClick={() => setWeekStart(null)}
            >
              {monthNode.label}
            </button>
          </>
        ) : null}
        {weekNode ? (
          <>
            <span>/</span>
            <strong>{weekNode.label}</strong>
          </>
        ) : null}
      </div>

      {weekNode
        ? renderWeek(weekNode)
        : monthNode
          ? renderMonth(monthNode)
          : yearNode
            ? renderYear(yearNode)
            : renderDecade()}
    </section>
  );
}

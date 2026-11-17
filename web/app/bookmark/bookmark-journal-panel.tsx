import { useEffect, useState } from "react";

import { CloverIcon } from "@/app/bookmark/clover-rating";
import type {
  BookmarkJournalNode,
  BookmarkJournalTree,
} from "@/lib/bookmark";
import { todayDateInputValue } from "@/lib/datetime";

import { useBookmarkJournalTree } from "./use-bookmark-journal-tree";
import { parseDateKey } from "./bookmark-utils";

function decadeStartForDate(value: string) {
  const year = parseDateKey(value).getUTCFullYear();
  return `${Math.floor(year / 10) * 10}-01-01`;
}

function findDayPath(tree: BookmarkJournalTree, target: string) {
  for (const year of tree.years) {
    for (const quarter of year.children) {
      for (const month of quarter.children) {
        for (const week of month.children) {
          const day = week.children.find(
            (item) => item.period_start === target,
          );
          if (day) {
            return { year, quarter, month, week, day };
          }
        }
      }
    }
  }
  return null;
}

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
  const { tree, loading, error, moveDecade, goToday, goToDate } =
    useBookmarkJournalTree();
  const [yearStart, setYearStart] = useState<string | null>(null);
  const [quarterStart, setQuarterStart] = useState<string | null>(
    null,
  );
  const [monthStart, setMonthStart] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [dayStart, setDayStart] = useState<string | null>(null);
  const [dayPicker, setDayPicker] = useState(() =>
    todayDateInputValue(),
  );
  const [pendingDay, setPendingDay] = useState<string | null>(null);
  const [dayJumpMessage, setDayJumpMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setYearStart(null);
    setQuarterStart(null);
    setMonthStart(null);
    setWeekStart(null);
    setDayStart(null);
  }, [tree?.decade_start]);

  useEffect(() => {
    if (!pendingDay || !tree) return;
    if (tree.decade_start !== decadeStartForDate(pendingDay)) {
      return;
    }
    const path = findDayPath(tree, pendingDay);
    setPendingDay(null);
    if (!path) {
      setDayJumpMessage(
        "해당 날짜에 기록된 일간 회고가 없습니다.",
      );
      return;
    }
    setDayJumpMessage(null);
    setYearStart(path.year.period_start);
    setQuarterStart(path.quarter.period_start);
    setMonthStart(path.month.period_start);
    setWeekStart(path.week.period_start);
    setDayStart(path.day.period_start);
  }, [pendingDay, tree]);

  const jumpToDay = () => {
    if (!dayPicker) return;
    setDayJumpMessage(null);
    setPendingDay(dayPicker);
    goToDate(dayPicker);
  };

  const yearNode =
    yearStart === null
      ? null
      : tree?.years.find((year) => year.period_start === yearStart) ??
        null;
  const quarterNode =
    yearNode && quarterStart !== null
      ? yearNode.children.find(
          (quarter) => quarter.period_start === quarterStart,
        ) ?? null
      : null;
  const monthNode =
    yearNode && monthStart !== null
      ? (quarterNode
          ? quarterNode.children
          : yearNode.children.flatMap(
              (quarter) => quarter.children,
            )
        ).find((month) => month.period_start === monthStart) ??
        null
      : null;
  const weekNode =
    monthNode && weekStart !== null
      ? monthNode.children.find(
          (week) => week.period_start === weekStart,
        ) ?? null
      : null;
  const dayNode =
    weekNode && dayStart !== null
      ? weekNode.children.find(
          (day) => day.period_start === dayStart,
        ) ?? null
      : null;

  const decadeYears = tree
    ? [...tree.years].sort((a, b) =>
        a.period_start.localeCompare(b.period_start),
      )
    : [];
  const yearMonths = yearNode
    ? yearNode.children
        .flatMap((quarter) => quarter.children)
        .sort((a, b) => a.period_start.localeCompare(b.period_start))
    : [];
  const quarterMonths = quarterNode
    ? [...quarterNode.children].sort((a, b) =>
        a.period_start.localeCompare(b.period_start),
      )
    : [];

  const openMonth = (month: BookmarkJournalNode) => {
    const parent = yearNode?.children.find((quarter) =>
      quarter.children.some(
        (item) => item.period_start === month.period_start,
      ),
    );
    setQuarterStart(parent?.period_start ?? null);
    setMonthStart(month.period_start);
    setWeekStart(null);
    setDayStart(null);
  };

  const goBack = () => {
    if (dayStart) {
      setDayStart(null);
      return;
    }
    if (weekStart) {
      setWeekStart(null);
      return;
    }
    if (monthStart) {
      setMonthStart(null);
      return;
    }
    if (quarterStart) {
      setQuarterStart(null);
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
    if (decadeYears.length === 0) {
      return (
        <p className="bookmark-empty-row">
          이 10년에 기록된 회고가 없습니다.
        </p>
      );
    }
    return (
      <div className="bookmark-journal-grid">
        {decadeYears.map((year) => (
          <button
            type="button"
            className="bookmark-journal-card"
            key={year.period_start}
            onClick={() => {
              setYearStart(year.period_start);
              setQuarterStart(null);
              setMonthStart(null);
              setWeekStart(null);
              setDayStart(null);
            }}
          >
            <strong>{year.label}</strong>
            <span>{countText(year)}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderYear = (node: BookmarkJournalNode) => {
    const quarters = node.children;
    return (
      <>
        {renderRecord(node)}
        {quarters.length > 0 ? (
          <div className="bookmark-journal-section">
            <h3>분기</h3>
            <div className="bookmark-journal-record-list">
              {quarters.map((quarter) => (
                <button
                  type="button"
                  className="bookmark-journal-record-card is-clickable"
                  key={quarter.period_start}
                  onClick={() => {
                    setQuarterStart(quarter.period_start);
                    setMonthStart(null);
                    setWeekStart(null);
                    setDayStart(null);
                  }}
                >
                  <strong>{quarter.label}</strong>
                  {renderRecord(quarter)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="bookmark-journal-section">
          <h3>월간 기록</h3>
          {yearMonths.length === 0 ? (
            <p className="bookmark-empty-row">
              이 해에 기록된 월간 회고가 없습니다.
            </p>
          ) : (
            <div className="bookmark-journal-grid is-months">
              {yearMonths.map((month) => (
                <button
                  type="button"
                  className="bookmark-journal-card"
                  key={month.period_start}
                  onClick={() => openMonth(month)}
                >
                  <strong>
                    {Number(month.period_start.slice(5, 7))}월
                  </strong>
                  <span>{countText(month)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </>
    );
  };

  const renderQuarter = (node: BookmarkJournalNode) => (
    <>
      {renderRecord(node)}
      <div className="bookmark-journal-section">
        <h3>월간 기록</h3>
        {quarterMonths.length === 0 ? (
          <p className="bookmark-empty-row">
            이 분기에 기록된 월간 회고가 없습니다.
          </p>
        ) : (
          <div className="bookmark-journal-grid is-months">
            {quarterMonths.map((month) => (
              <button
                type="button"
                className="bookmark-journal-card"
                key={month.period_start}
                onClick={() => openMonth(month)}
              >
                <strong>
                  {Number(month.period_start.slice(5, 7))}월
                </strong>
                <span>{countText(month)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

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
                onClick={() => {
                  setWeekStart(week.period_start);
                  setDayStart(null);
                }}
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
              <button
                type="button"
                className="bookmark-journal-day is-clickable"
                key={day.period_start}
                onClick={() => setDayStart(day.period_start)}
              >
                <strong>{day.label}</strong>
                {renderRecord(day)}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const renderDay = (node: BookmarkJournalNode) => (
    <>{renderRecord(node)}</>
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
          onClick={() => {
            setYearStart(null);
            setQuarterStart(null);
            setMonthStart(null);
            setWeekStart(null);
            setDayStart(null);
            setPendingDay(null);
            setDayJumpMessage(null);
            goToday();
          }}
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
        <div className="bookmark-journal-jump">
          <label htmlFor="bookmark-journal-day">
            일간부터 보기
          </label>
          <input
            id="bookmark-journal-day"
            type="date"
            value={dayPicker}
            onChange={(event) => {
              setDayPicker(event.target.value);
              setDayJumpMessage(null);
            }}
          />
          <button
            type="button"
            className="bookmark-text-button"
            disabled={!dayPicker}
            onClick={jumpToDay}
          >
            열기
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
      {dayJumpMessage ? (
        <p className="bookmark-journal-jump-message">
          {dayJumpMessage}
        </p>
      ) : null}

      <div className="bookmark-journal-breadcrumb">
        <button
          type="button"
          onClick={() => {
            setYearStart(null);
            setQuarterStart(null);
            setMonthStart(null);
            setWeekStart(null);
            setDayStart(null);
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
                setQuarterStart(null);
                setMonthStart(null);
                setWeekStart(null);
                setDayStart(null);
              }}
            >
              {yearNode.label}
            </button>
          </>
        ) : null}
        {quarterNode ? (
          <>
            <span>/</span>
            <button
              type="button"
              onClick={() => {
                setMonthStart(null);
                setWeekStart(null);
                setDayStart(null);
              }}
            >
              {quarterNode.label}
            </button>
          </>
        ) : null}
        {monthNode ? (
          <>
            <span>/</span>
            <button
              type="button"
              onClick={() => {
                setWeekStart(null);
                setDayStart(null);
              }}
            >
              {monthNode.label}
            </button>
          </>
        ) : null}
        {weekNode ? (
          <>
            <span>/</span>
            <button
              type="button"
              onClick={() => setDayStart(null)}
            >
              {weekNode.label}
            </button>
          </>
        ) : null}
        {dayNode ? (
          <>
            <span>/</span>
            <strong>{dayNode.label}</strong>
          </>
        ) : null}
      </div>

      {dayNode
        ? renderDay(dayNode)
        : weekNode
          ? renderWeek(weekNode)
          : monthNode
            ? renderMonth(monthNode)
            : quarterNode
              ? renderQuarter(quarterNode)
              : yearNode
                ? renderYear(yearNode)
                : renderDecade()}
    </section>
  );
}

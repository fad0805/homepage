import { CloverIcon } from "@/app/bookmark/clover-rating";
import type { BookmarkStatistics } from "@/lib/bookmark";

import type { StatsRange } from "./bookmark-types";
import {
  STATS_COLORS,
  STATS_RANGES,
  STATS_RANGE_LABELS,
} from "./bookmark-types";
import {
  pad2,
  parseDateKey,
  statBucketEnd,
  statBucketLabel,
  statRangeBounds,
} from "./bookmark-utils";

interface BookmarkStatisticsPanelProps {
  statistics: BookmarkStatistics | null;
  statsLoading: boolean;
  statsError: string | null;
  statsRange: StatsRange;
  onRangeChange: (range: StatsRange) => void;
  onOpenHistory: (routine: BookmarkStatistics["routines"][number]) => void;
}

export function BookmarkStatisticsPanel({
  statistics,
  statsLoading,
  statsError,
  statsRange,
  onRangeChange,
  onOpenHistory,
}: BookmarkStatisticsPanelProps) {

  if (statsLoading) {
    return <p className="bookmark-status">통계를 불러오는 중...</p>;
  }
  if (statsError) {
    return <p className="bookmark-error">{statsError}</p>;
  }
  const statsRoutines = statistics?.routines ?? [];
  const categories = statistics?.categories ?? [];
  const categoryIndex = new Map(
    categories.map((category, index) => [category.id, index]),
  );
  const orderedRoutines = [...statsRoutines].sort((a, b) => {
    const aIndex = a.category_id
      ? (categoryIndex.get(a.category_id) ?? 999)
      : 999;
    const bIndex = b.category_id
      ? (categoryIndex.get(b.category_id) ?? 999)
      : 999;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.title.localeCompare(b.title);
  });
  const range = statRangeBounds(statsRange);
  const aggregationLabels = {
    week: "주간 집계",
    month: "월간 집계",
    quarter: "분기 집계",
    year: "연간 집계",
  } as const;
  const width = 760;
  const height = 250;
  const left = 42;
  const right = 14;
  const top = 14;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const rangeStart = parseDateKey(range.start).getTime();
  const rangeEnd = parseDateKey(range.end).getTime();
  const rangeSpan = Math.max(1, rangeEnd - rangeStart);
  const xForTime = (time: number) =>
    left + ((time - rangeStart) / rangeSpan) * plotWidth;
  const yForRate = (rate: number) =>
    top + (1 - Math.max(0, Math.min(100, rate)) / 100) * plotHeight;

  const series = orderedRoutines.map((routine, index) => {
    const points = routine.buckets
      .flatMap((bucket) => {
        const bucketStart = parseDateKey(
          bucket.period_start,
        ).getTime();
        const bucketEnd = parseDateKey(
          statBucketEnd(bucket.period_start, routine.aggregation),
        ).getTime();
        if (
          bucket.expected_count <= 0 ||
          bucketStart > rangeEnd ||
          bucketEnd < rangeStart
        ) {
          return [];
        }
        const middle =
          (Math.max(bucketStart, rangeStart) +
            Math.min(bucketEnd, rangeEnd)) /
          2;
        const rate =
          (bucket.completed_count / bucket.expected_count) * 100;
        return [
          {
            x: xForTime(middle),
            y: yForRate(rate),
            bucket,
          },
        ];
      })
      .sort((a, b) => a.x - b.x);
    return {
      routine,
      color: STATS_COLORS[index % STATS_COLORS.length],
      points,
    };
  });
  const hasData = series.some((item) => item.points.length > 0);
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const time = rangeStart + (rangeSpan * index) / 4;
    const date = new Date(time);
    const label =
      statsRange === "year" || statsRange === "3years"
        ? `${date.getUTCFullYear()}.${pad2(date.getUTCMonth() + 1)}`
        : `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
    return { x: xForTime(time), label };
  });

  return (
    <section className="bookmark-panel bookmark-stats-panel">
      <header className="bookmark-panel-header bookmark-stats-header">
        <div>
          <p className="bookmark-panel-eyebrow">ROUTINE STATS</p>
          <h2>루틴 통계</h2>
        </div>
        <div className="bookmark-stats-ranges" role="tablist">
          {STATS_RANGES.map((item) => (
            <button
              type="button"
              role="tab"
              key={item}
              aria-selected={statsRange === item}
              className={statsRange === item ? "is-active" : ""}
              onClick={() => onRangeChange(item)}
            >
              {STATS_RANGE_LABELS[item]}
            </button>
          ))}
        </div>
      </header>
      <p className="bookmark-stats-hint">
        루틴을 누르면 상세 기록을 볼 수 있습니다.
      </p>
      {orderedRoutines.length === 0 ? (
        <p className="bookmark-empty-row">
          아직 통계로 볼 루틴이 없습니다.
        </p>
      ) : (
        <>
          <div className="bookmark-stats-chart-wrap">
            <svg
              className="bookmark-stats-line-chart"
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`${STATS_RANGE_LABELS[statsRange]} 루틴 달성률`}
            >
              {[0, 25, 50, 75, 100].map((value) => {
                const y = yForRate(value);
                return (
                  <g key={value}>
                    <line
                      className="bookmark-stats-grid-line"
                      x1={left}
                      x2={width - right}
                      y1={y}
                      y2={y}
                    />
                    <text
                      className="bookmark-stats-axis-label"
                      x={left - 8}
                      y={y + 3}
                      textAnchor="end"
                    >
                      {value}%
                    </text>
                  </g>
                );
              })}
              {ticks.map((tick) => (
                <text
                  className="bookmark-stats-axis-label"
                  key={tick.x}
                  x={tick.x}
                  y={height - 8}
                  textAnchor="middle"
                >
                  {tick.label}
                </text>
              ))}
              {series.map((item) => {
                if (item.points.length === 0) return null;
                const path = item.points
                  .map(
                    (point, index) =>
                      `${index === 0 ? "M" : "L"}${point.x} ${
                        point.y
                      }`,
                  )
                  .join(" ");
                return (
                  <g key={item.routine.id}>
                    <path
                      className="bookmark-stats-line"
                      d={path}
                      fill="none"
                      stroke={item.color}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    >
                      <title>{item.routine.title}</title>
                    </path>
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={12}
                      pointerEvents="stroke"
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        void onOpenHistory(item.routine)
                      }
                    />
                    {item.points.map((point) => (
                      <circle
                        className="bookmark-stats-point"
                        key={`${item.routine.id}-${point.bucket.period_start}`}
                        cx={point.x}
                        cy={point.y}
                        r={2.6}
                        fill={item.color}
                        onClick={() =>
                          void onOpenHistory(item.routine)
                        }
                      >
                        <title>
                          {item.routine.title} ·{" "}
                          {statBucketLabel(
                            point.bucket.period_start,
                            item.routine.aggregation,
                          )}{" "}
                          · {point.bucket.completed_count}/
                          {point.bucket.expected_count}
                        </title>
                      </circle>
                    ))}
                  </g>
                );
              })}
            </svg>
            {!hasData ? (
              <p className="bookmark-empty-row">
                이 기간에는 기록이 없습니다.
              </p>
            ) : null}
          </div>
          <div className="bookmark-stats-legend">
            {series.map((item) => (
              <button
                type="button"
                className={`bookmark-stats-legend-item${
                  item.points.length === 0 ? " is-empty" : ""
                }`}
                key={item.routine.id}
                onClick={() => void onOpenHistory(item.routine)}
              >
                <i style={{ background: item.color }} />
                <span>
                  {item.routine.title}
                  {item.routine.end_date ? (
                    <span className="bookmark-routine-status">
                      중단됨
                    </span>
                  ) : null}
                </span>
                <small>
                  {item.routine.category_name ?? "미분류"} ·{" "}
                  {aggregationLabels[item.routine.aggregation]} ·{" "}
                  {item.routine.retention_label}
                </small>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

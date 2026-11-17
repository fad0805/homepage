import { WEEKDAY_SHORT } from "@/lib/bookmark";

import type {
  BookmarkRoutineHistory,
} from "@/lib/bookmark";
import type { HistoryRoutine } from "./bookmark-types";
import { FREQUENCY_LABELS } from "./bookmark-types";
import {
  historyDayTitle,
  historyMonthLabel,
  historyQuarterLabel,
  parseDateKey,
} from "./bookmark-utils";

interface BookmarkHistoryModalProps {
  routine: HistoryRoutine;
  data: BookmarkRoutineHistory | null;
  loading: boolean;
  error: string | null;
  buckets: Array<{
    period_start: string;
    completed_count: number;
    expected_count: number;
  }>;
  isMonthlyHistory: boolean;
  onClose: () => void;
}

export function BookmarkHistoryModal({
  routine,
  data,
  loading,
  error,
  buckets,
  isMonthlyHistory,
  onClose,
}: BookmarkHistoryModalProps) {
  return (
    <div
      className="bookmark-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="bookmark-modal bookmark-history-modal"
        role="dialog"
        aria-modal="true"
        aria-label="루틴 달성 기록"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="bookmark-modal-header">
          <div>
            <p className="bookmark-panel-eyebrow">
              {FREQUENCY_LABELS[routine.frequency]}
            </p>
            <h2>{routine.title} 달성 기록</h2>
          </div>
          <button
            type="button"
            className="bookmark-text-button"
            onClick={onClose}
          >
            닫기
          </button>
        </header>

        {loading ? (
          <p className="bookmark-status">불러오는 중...</p>
        ) : null}
        {error ? (
          <p className="bookmark-error">{error}</p>
        ) : null}

        {data ? (
          <>
            {data.daily.length > 0 ? (
              <section className="bookmark-history-section">
                <div className="bookmark-history-heading">
                  <h3>최근 3개월 · 일간</h3>
                  <span>상세 기록 보관 범위</span>
                </div>
                <div className="bookmark-history-heatmap">
                  <div className="bookmark-history-weekdays">
                    {WEEKDAY_SHORT.map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>
                  <div className="bookmark-history-days">
                    {Array.from(
                      {
                        length:
                          (parseDateKey(
                            data.daily[0]?.date ?? "",
                          ).getUTCDay() +
                            6) %
                          7,
                      },
                      (_, index) => (
                        <span
                          className="bookmark-history-day is-blank"
                          key={`blank-${index}`}
                        />
                      ),
                    )}
                    {data.daily.map((day) => (
                      <span
                        className={`bookmark-history-day ${
                          day.scheduled
                            ? day.done
                              ? "is-done"
                              : "is-missed"
                            : "is-off"
                        }`}
                        key={day.date}
                        title={historyDayTitle(
                          day.date,
                          day.scheduled,
                          day.done,
                        )}
                      />
                    ))}
                  </div>
                </div>
                <div className="bookmark-history-legend">
                  <span>
                    <i className="is-done" />
                    완료
                  </span>
                  <span>
                    <i className="is-missed" />
                    미완료
                  </span>
                  <span>
                    <i className="is-off" />
                    예정 없음
                  </span>
                </div>
              </section>
            ) : (
              <p className="bookmark-history-note">
                일간 상세 그래프는 매일 또는 일자형 주간 루틴에서 제공됩니다.
              </p>
            )}

            <section className="bookmark-history-section">
              <div className="bookmark-history-heading">
                <h3>
                  {isMonthlyHistory
                    ? "분기 달성률"
                    : "월간 달성률"}
                </h3>
                <span>
                  {isMonthlyHistory
                    ? "월간 기록을 분기 단위로 묶어 표시"
                    : "3개월 이후는 월 단위 집계로 보관"}
                </span>
              </div>
              {buckets.length === 0 ? (
                <p className="bookmark-empty-row">
                  {isMonthlyHistory
                    ? "아직 분기 집계가 없습니다."
                    : "아직 월간 집계가 없습니다."}
                </p>
              ) : (
                <ul className="bookmark-history-months">
                  {buckets
                    .slice()
                    .reverse()
                    .map((bucket) => {
                      const rate =
                        bucket.expected_count > 0
                          ? Math.round(
                              (bucket.completed_count /
                                bucket.expected_count) *
                                100,
                            )
                          : 0;
                      return (
                        <li key={bucket.period_start}>
                          <span className="bookmark-history-month-label">
                            {isMonthlyHistory
                              ? historyQuarterLabel(
                                  bucket.period_start,
                                )
                              : historyMonthLabel(
                                  bucket.period_start,
                                )}
                          </span>
                          <div className="bookmark-history-bar">
                            <span
                              style={{
                                width: `${Math.min(100, rate)}%`,
                              }}
                            />
                          </div>
                          <span className="bookmark-history-rate">
                            {bucket.completed_count}/
                            {bucket.expected_count}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { BookmarkJournalNode, BookmarkMoodTag } from "@/lib/bookmark";
import { formatTime24h } from "@/lib/bookmark";

import { CloverRating } from "./clover-rating";

interface BookmarkJournalEditModalProps {
  node: BookmarkJournalNode;
  onClose: () => void;
  onSaved: () => void;
}

export function BookmarkJournalEditModal({
  node,
  onClose,
  onSaved,
}: BookmarkJournalEditModalProps) {
  const [goalContent, setGoalContent] = useState(
    node.goal?.content ?? "",
  );
  const [rating, setRating] = useState(node.rating?.rating ?? 0);
  const [reviewContent, setReviewContent] = useState(
    node.review?.content ?? "",
  );
  const [wakeTime, setWakeTime] = useState(
    formatTime24h(node.goal?.wake_time),
  );
  const [moodTagId, setMoodTagId] = useState<number | null>(
    node.goal?.mood_tag_id ?? null,
  );
  const [moodTags, setMoodTags] = useState<BookmarkMoodTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<BookmarkMoodTag[]>("/api/bookmark/mood-tags", {
      cache: "no-store",
    })
      .then((tags) => {
        if (!cancelled) setMoodTags(tags);
      })
      .catch(() => {
        // Mood can still be cleared if tags fail to load.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setGoalContent(node.goal?.content ?? "");
    setRating(node.rating?.rating ?? 0);
    setReviewContent(node.review?.content ?? "");
    setWakeTime(formatTime24h(node.goal?.wake_time));
    setMoodTagId(node.goal?.mood_tag_id ?? null);
    setError(null);
  }, [node]);

  const handleSave = async () => {
    if (saving) return;
    const currentGoal = node.goal?.content ?? "";
    const currentRating = node.rating?.rating ?? 0;
    const currentReview = node.review?.content ?? "";
    const requests: Promise<unknown>[] = [];

    if (goalContent !== currentGoal) {
      requests.push(
        apiFetch<unknown>("/api/bookmark/goals", {
          method: "PUT",
          body: JSON.stringify({
            period_type: node.level,
            period_start: node.period_start,
            content: goalContent,
          }),
        }),
      );
    }
    if (node.level === "day" && rating !== currentRating) {
      requests.push(
        apiFetch<unknown>("/api/bookmark/rating", {
          method: "PUT",
          body: JSON.stringify({
            period_type: node.level,
            period_start: node.period_start,
            rating,
          }),
        }),
      );
    }
    if (reviewContent !== currentReview) {
      requests.push(
        apiFetch<unknown>("/api/bookmark/review", {
          method: "PUT",
          body: JSON.stringify({
            period_type: node.level,
            period_start: node.period_start,
            content: reviewContent,
          }),
        }),
      );
    }
    let dayMetaRequest: Promise<unknown> | null = null;
    if (
      node.level === "day" &&
      (wakeTime !== formatTime24h(node.goal?.wake_time) ||
        moodTagId !== (node.goal?.mood_tag_id ?? null))
    ) {
      dayMetaRequest = apiFetch<unknown>("/api/bookmark/day-meta", {
        method: "PUT",
        body: JSON.stringify({
          period_start: node.period_start,
          wake_time: wakeTime || null,
          mood_tag_id: moodTagId,
        }),
      });
    }

    if (requests.length === 0 && !dayMetaRequest) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await Promise.all(requests);
      if (dayMetaRequest) await dayMetaRequest;
      onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "회고 기록을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="bookmark-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="bookmark-modal bookmark-journal-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${node.label} 기록 수정`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="bookmark-modal-header">
          <div>
            <p className="bookmark-panel-eyebrow">JOURNAL</p>
            <h2>{node.label}</h2>
          </div>
          <button
            type="button"
            className="bookmark-text-button"
            onClick={onClose}
          >
            닫기
          </button>
        </header>

        {error ? <p className="bookmark-error">{error}</p> : null}

        <form
          className="bookmark-item-form bookmark-journal-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <label>
            <span>목표</span>
            <textarea
              value={goalContent}
              maxLength={20000}
              placeholder="이 기간에 이루고 싶은 목표나 바람을 적어보세요."
              onChange={(event) =>
                setGoalContent(event.target.value)
              }
            />
          </label>

          {node.level === "day" ? (
            <div className="bookmark-day-meta-fields bookmark-journal-day-meta">
              <label>
                <span>기상</span>
                <input
                  type="time"
                  value={wakeTime}
                  disabled={saving}
                  onChange={(event) => setWakeTime(event.target.value)}
                />
              </label>
              <label>
                <span>기분</span>
                <select
                  value={moodTagId ?? ""}
                  disabled={saving}
                  onChange={(event) =>
                    setMoodTagId(
                      event.target.value
                        ? Number(event.target.value)
                        : null,
                    )
                  }
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
          ) : null}

          <div className="bookmark-journal-edit-rating">
            <span>
              {node.level === "day" ? "별점" : "별점 (하위 평균)"}
            </span>
            <CloverRating
              value={rating}
              onChange={setRating}
              disabled={saving || node.level !== "day"}
            />
          </div>

          <label>
            <span>회고</span>
            <textarea
              value={reviewContent}
              maxLength={20000}
              placeholder="이 기간을 돌아보세요."
              onChange={(event) =>
                setReviewContent(event.target.value)
              }
            />
          </label>

          <div className="bookmark-modal-actions">
            <button
              type="button"
              className="bookmark-text-button"
              disabled={saving}
              onClick={onClose}
            >
              취소
            </button>
            <button
              type="submit"
              className="bookmark-primary"
              disabled={saving}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

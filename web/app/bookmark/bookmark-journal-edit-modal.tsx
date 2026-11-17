"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { BookmarkJournalNode } from "@/lib/bookmark";

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGoalContent(node.goal?.content ?? "");
    setRating(node.rating?.rating ?? 0);
    setReviewContent(node.review?.content ?? "");
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
    if (rating !== currentRating) {
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

    if (requests.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await Promise.all(requests);
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

          <div className="bookmark-journal-edit-rating">
            <span>별점</span>
            <CloverRating
              value={rating}
              onChange={setRating}
              disabled={saving}
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

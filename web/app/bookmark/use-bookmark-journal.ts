import { useState, type Dispatch, type SetStateAction } from "react";

import { apiFetch } from "@/lib/api";
import {
  formatTime24h,
  type BookmarkGoal,
  type BookmarkPeriod,
  type BookmarkRating,
  type BookmarkReview,
} from "@/lib/bookmark";

interface UseBookmarkJournalOptions {
  periodStart: string;
  recordPeriodType: BookmarkPeriod["period_type"];
  setData: Dispatch<SetStateAction<BookmarkPeriod | null>>;
  onError: (message: string | null) => void;
}

export function useBookmarkJournal({
  periodStart,
  recordPeriodType,
  setData,
  onError,
}: UseBookmarkJournalOptions) {
  const [goalContent, setGoalContent] = useState("");
  const [goalWakeTime, setGoalWakeTime] = useState("");
  const [goalMoodTagId, setGoalMoodTagId] = useState<number | null>(
    null,
  );
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalSaved, setGoalSaved] = useState(false);
  const [dayMetaSaving, setDayMetaSaving] = useState(false);
  const [dayMetaSaved, setDayMetaSaved] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingDraft, setRatingDraft] = useState(0);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [reviewContent, setReviewContent] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);
  const ratingEditable = recordPeriodType === "day";

  const applyPeriod = (next: BookmarkPeriod) => {
    setGoalContent(next.goal?.content ?? "");
    setGoalWakeTime(formatTime24h(next.goal?.wake_time));
    setGoalMoodTagId(next.goal?.mood_tag_id ?? null);
    setRating(next.rating?.rating ?? 0);
    setRatingDraft(next.rating?.rating ?? 0);
    setReviewContent(next.review?.content ?? "");
    setGoalSaved(false);
    setDayMetaSaved(false);
    setReviewSaved(false);
  };

  const handleSaveGoal = async () => {
    if (goalSaving) return;
    setGoalSaving(true);
    onError(null);
    setGoalSaved(false);
    try {
      const saved = await apiFetch<BookmarkGoal>("/api/bookmark/goals", {
        method: "PUT",
        body: JSON.stringify({
          period_type: recordPeriodType,
          period_start: periodStart,
          content: goalContent,
        }),
      });
      setData((previous) =>
        previous ? { ...previous, goal: saved } : previous,
      );
      setGoalContent(saved.content);
      setGoalSaved(true);
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "목표를 저장하지 못했습니다.",
      );
    } finally {
      setGoalSaving(false);
    }
  };

  const handleRatingChange = (nextRating: number) => {
    if (!ratingEditable || ratingSaving) return;
    setRatingDraft(nextRating);
  };

  const handleSaveDayMeta = async () => {
    if (dayMetaSaving) return;
    setDayMetaSaving(true);
    onError(null);
    setDayMetaSaved(false);
    try {
      const saved = await apiFetch<BookmarkGoal>(
        "/api/bookmark/day-meta",
        {
          method: "PUT",
          body: JSON.stringify({
            period_start: periodStart,
            wake_time: goalWakeTime || null,
            mood_tag_id: goalMoodTagId,
          }),
        },
      );
      setGoalWakeTime(formatTime24h(saved.wake_time));
      setGoalMoodTagId(saved.mood_tag_id ?? null);
      setData((previous) =>
        previous ? { ...previous, goal: saved } : previous,
      );
      setDayMetaSaved(true);
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "기상·기분 기록을 저장하지 못했습니다.",
      );
    } finally {
      setDayMetaSaving(false);
    }
  };

  const handleSaveRating = async () => {
    if (!ratingEditable || ratingSaving || ratingDraft === rating) return;
    setRatingSaving(true);
    onError(null);
    try {
      const saved = await apiFetch<BookmarkRating | null>(
        "/api/bookmark/rating",
        {
          method: "PUT",
          body: JSON.stringify({
            period_type: recordPeriodType,
            period_start: periodStart,
            rating: ratingDraft,
          }),
        },
      );
      const nextRating = saved?.rating ?? 0;
      setRating(nextRating);
      setRatingDraft(nextRating);
      setData((previous) =>
        previous ? { ...previous, rating: saved } : previous,
      );
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "별점을 저장하지 못했습니다.",
      );
    } finally {
      setRatingSaving(false);
    }
  };

  const handleSaveReview = async () => {
    if (reviewSaving) return;
    setReviewSaving(true);
    onError(null);
    setReviewSaved(false);
    try {
      const saved = await apiFetch<BookmarkReview>(
        "/api/bookmark/review",
        {
          method: "PUT",
          body: JSON.stringify({
            period_type: recordPeriodType,
            period_start: periodStart,
            content: reviewContent,
          }),
        },
      );
      setData((previous) =>
        previous ? { ...previous, review: saved } : previous,
      );
      setReviewContent(saved.content);
      setReviewSaved(true);
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "회고를 저장하지 못했습니다.",
      );
    } finally {
      setReviewSaving(false);
    }
  };

  return {
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
  };
}

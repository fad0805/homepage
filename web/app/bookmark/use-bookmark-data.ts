import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

import type {
  BookmarkMoodTag,
  BookmarkPeriod,
  BookmarkRoutineCategory,
  BookmarkStatistics,
} from "@/lib/bookmark";

interface UseBookmarkDataOptions {
  view: string;
  periodStart: string;
  onPeriodLoaded: (data: BookmarkPeriod) => void;
}

export function useBookmarkData({
  view,
  periodStart,
  onPeriodLoaded,
}: UseBookmarkDataOptions) {
  const [data, setData] = useState<BookmarkPeriod | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statistics, setStatistics] =
    useState<BookmarkStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [categories, setCategories] = useState<
    BookmarkRoutineCategory[]
  >([]);
  const [moodTags, setMoodTags] = useState<BookmarkMoodTag[]>([]);
  // Keep the latest callback without making loadPeriod depend on its
  // identity. An inline callback would otherwise trigger the load effect on
  // every render and create an endless request loop.
  const onPeriodLoadedRef = useRef(onPeriodLoaded);

  useEffect(() => {
    onPeriodLoadedRef.current = onPeriodLoaded;
  }, [onPeriodLoaded]);

  const loadPeriod = useCallback(async () => {
    if (view === "stats") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const endpoint =
        view === "today"
          ? `/api/bookmark/today?period_start=${periodStart}`
          : `/api/bookmark?period_type=${view}&period_start=${periodStart}`;
      const next = await apiFetch<BookmarkPeriod>(endpoint, {
        cache: "no-store",
      });
      setData(next);
      onPeriodLoadedRef.current(next);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "책갈피를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [periodStart, view]);

  const loadCategories = useCallback(async () => {
    try {
      const next = await apiFetch<BookmarkRoutineCategory[]>(
        "/api/bookmark/categories",
        { cache: "no-store" },
      );
      setCategories(next);
    } catch {
      // The routine list can still render uncategorized entries.
    }
  }, []);

  const loadMoodTags = useCallback(async () => {
    try {
      const next = await apiFetch<BookmarkMoodTag[]>(
        "/api/bookmark/mood-tags",
        { cache: "no-store" },
      );
      setMoodTags(next);
    } catch {
      // Mood can still be cleared if tags fail to load.
    }
  }, []);

  const loadStatistics = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const next = await apiFetch<BookmarkStatistics>(
        "/api/bookmark/statistics",
        { cache: "no-store" },
      );
      setStatistics(next);
    } catch (reason) {
      setStatsError(
        reason instanceof Error
          ? reason.message
          : "통계를 불러오지 못했습니다.",
      );
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPeriod();
  }, [loadPeriod]);

  useEffect(() => {
    if (view === "stats") {
      void loadStatistics();
    }
  }, [loadStatistics, view]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadMoodTags();
  }, [loadMoodTags]);

  return {
    data,
    setData,
    loading,
    error,
    setError,
    statistics,
    statsLoading,
    statsError,
    categories,
    setCategories,
    moodTags,
    setMoodTags,
    loadPeriod,
    loadCategories,
    loadMoodTags,
    loadStatistics,
  };
}

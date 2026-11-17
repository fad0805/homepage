import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

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

function sameRecordData(
  previous: BookmarkPeriod,
  next: BookmarkPeriod,
) {
  return (
    previous.goal?.content === next.goal?.content &&
    previous.goal?.wake_time === next.goal?.wake_time &&
    previous.goal?.mood_tag_id === next.goal?.mood_tag_id &&
    previous.rating?.rating === next.rating?.rating &&
    previous.review?.content === next.review?.content
  );
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
  const [dataKey, setDataKey] = useState<string | null>(null);
  const [settledKey, setSettledKey] = useState<string | null>(
    null,
  );
  const cacheRef = useRef(new Map<string, BookmarkPeriod>());
  const dataKeyRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  // Keep the latest callback without making loadPeriod depend on its
  // identity. An inline callback would otherwise trigger the load effect on
  // every render and create an endless request loop.
  const onPeriodLoadedRef = useRef(onPeriodLoaded);

  useEffect(() => {
    onPeriodLoadedRef.current = onPeriodLoaded;
  }, [onPeriodLoaded]);

  const setDataAndCache: Dispatch<
    SetStateAction<BookmarkPeriod | null>
  > = useCallback((updater) => {
    setData((previous) => {
      const next =
        typeof updater === "function"
          ? (
              updater as (
                value: BookmarkPeriod | null,
              ) => BookmarkPeriod | null
            )(previous)
          : updater;
      const key = dataKeyRef.current;
      if (key) {
        if (next) {
          cacheRef.current.set(key, next);
        } else {
          cacheRef.current.delete(key);
        }
      }
      return next;
    });
  }, []);

  const applyCachedPeriod = useCallback(
    (targetView: string, targetStart: string) => {
      const key = `${targetView}:${targetStart}`;
      const cached = cacheRef.current.get(key);
      if (!cached) return false;
      dataKeyRef.current = key;
      setData(cached);
      setDataKey(key);
      setSettledKey(key);
      onPeriodLoadedRef.current(cached);
      return true;
    },
    [],
  );

  const loadPeriod = useCallback(async () => {
    const key = `${view}:${periodStart}`;
    if (view === "stats" || view === "journal") {
      setLoading(false);
      setSettledKey(null);
      return;
    }
    const cached = cacheRef.current.get(key) ?? null;
    const requestId = ++requestIdRef.current;
    const alreadyCurrent = dataKeyRef.current === key;
    if (cached) {
      if (!alreadyCurrent) {
        dataKeyRef.current = key;
        setData(cached);
        setDataKey(key);
        setSettledKey(key);
        onPeriodLoadedRef.current(cached);
      }
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const endpoint =
        view === "today"
          ? `/api/bookmark/today?period_start=${periodStart}`
          : `/api/bookmark?period_type=${view}&period_start=${periodStart}`;
      const next = await apiFetch<BookmarkPeriod>(endpoint, {
        cache: "no-store",
      });
      cacheRef.current.set(key, next);
      if (requestId !== requestIdRef.current) return;
      dataKeyRef.current = key;
      setData(next);
      setDataKey(key);
      setSettledKey(key);
      if (!cached || !sameRecordData(cached, next)) {
        onPeriodLoadedRef.current(next);
      }
    } catch (reason) {
      if (requestId !== requestIdRef.current) return;
      setSettledKey(key);
      if (!cached) {
        setError(
          reason instanceof Error
            ? reason.message
            : "책갈피를 불러오지 못했습니다.",
        );
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
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

  const targetKey = `${view}:${periodStart}`;
  const cached = cacheRef.current.get(targetKey) ?? null;
  const currentData = dataKey === targetKey ? data : cached;
  const isLoading =
    view === "journal" || view === "stats"
      ? false
      : currentData === null &&
        (loading || settledKey !== targetKey);
  const currentError =
    dataKey === targetKey || cached || settledKey === targetKey
      ? error
      : null;

  return {
    data: currentData,
    setData: setDataAndCache,
    loading: isLoading,
    error: currentError,
    setError,
    statistics,
    statsLoading,
    statsError,
    categories,
    setCategories,
    moodTags,
    setMoodTags,
    applyCachedPeriod,
    loadPeriod,
    loadCategories,
    loadMoodTags,
    loadStatistics,
  };
}

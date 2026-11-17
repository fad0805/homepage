import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { BookmarkJournalTree } from "@/lib/bookmark";
import { todayDateInputValue } from "@/lib/datetime";

import { parseDateKey, shiftPeriod } from "./bookmark-utils";

function currentDecadeStart(today: string) {
  const year = parseDateKey(today).getUTCFullYear();
  return `${Math.floor(year / 10) * 10}-01-01`;
}

export function useBookmarkJournalTree() {
  const [decadeStart, setDecadeStart] = useState(() =>
    currentDecadeStart(todayDateInputValue()),
  );
  const [tree, setTree] = useState<BookmarkJournalTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await apiFetch<BookmarkJournalTree>(
        `/api/bookmark/journal/tree?decade_start=${decadeStart}`,
        { cache: "no-store" },
      );
      if (requestId === requestRef.current) {
        setTree(next);
      }
    } catch (reason) {
      if (requestId === requestRef.current) {
        setError(
          reason instanceof Error
            ? reason.message
            : "회고 기록을 불러오지 못했습니다.",
        );
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [decadeStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const moveDecade = (delta: number) => {
    setDecadeStart((previous) =>
      shiftPeriod(previous, "year", delta * 10),
    );
  };

  const goToday = () => {
    setDecadeStart(currentDecadeStart(todayDateInputValue()));
  };

  const goToDate = (value: string) => {
    setDecadeStart(currentDecadeStart(value));
  };

  return {
    decadeStart,
    tree,
    loading,
    error,
    reload: load,
    moveDecade,
    goToday,
    goToDate,
  };
}

import { useState } from "react";

import { apiFetch } from "@/lib/api";
import type { BookmarkRoutineHistory } from "@/lib/bookmark";

import type { HistoryRoutine } from "./bookmark-types";

export function useBookmarkHistory() {
  const [historyRoutine, setHistoryRoutine] =
    useState<HistoryRoutine | null>(null);
  const [historyData, setHistoryData] =
    useState<BookmarkRoutineHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(
    null,
  );

  const openHistory = async (routine: HistoryRoutine) => {
    setHistoryRoutine(routine);
    setHistoryData(null);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const history = await apiFetch<BookmarkRoutineHistory>(
        `/api/bookmark/routines/${routine.id}/history`,
        { cache: "no-store" },
      );
      setHistoryData(history);
    } catch (reason) {
      setHistoryError(
        reason instanceof Error
          ? reason.message
          : "달성 기록을 불러오지 못했습니다.",
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistory = () => {
    setHistoryRoutine(null);
    setHistoryData(null);
    setHistoryError(null);
    setHistoryLoading(false);
  };

  return {
    historyRoutine,
    historyData,
    historyLoading,
    historyError,
    openHistory,
    closeHistory,
  };
}

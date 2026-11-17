import { useState, type FormEvent } from "react";

import { apiFetch } from "@/lib/api";

import type { PlannerSearchResults } from "./planner-types";
import { monthBounds } from "./planner-utils";

interface UsePlannerSearchOptions {
  viewMonth: string;
  onError: (message: string | null) => void;
}

export function usePlannerSearch({
  viewMonth,
  onError,
}: UsePlannerSearchOptions) {
  const initialBounds = monthBounds(viewMonth);
  const [searchFrom, setSearchFrom] = useState(initialBounds.start);
  const [searchTo, setSearchTo] = useState(initialBounds.end);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] =
    useState<PlannerSearchResults | null>(null);

  const defaultSearchBounds = monthBounds(viewMonth);
  const hasSearchFilter =
    searchOpen ||
    searchQuery.trim() !== "" ||
    searchFrom !== defaultSearchBounds.start ||
    searchTo !== defaultSearchBounds.end;

  const closeSearchResults = () => {
    setSearchOpen(false);
    setSearchResults(null);
    setSearching(false);
  };

  const updateSearchTaskNotes = (taskId: number, notes: string) => {
    setSearchResults((previous) =>
      previous
        ? {
            ...previous,
            tasks: previous.tasks.map((task) =>
              task.id === taskId ? { ...task, notes } : task,
            ),
          }
        : previous,
    );
  };

  const resetSearch = () => {
    const bounds = monthBounds(viewMonth);
    setSearchFrom(bounds.start);
    setSearchTo(bounds.end);
    setSearchQuery("");
    setSearchOpen(false);
    setSearchResults(null);
    setSearching(false);
    onError(null);
  };

  const handleSearch = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (searching) return;
    if (!searchFrom || !searchTo) {
      onError("검색할 날짜 범위를 입력해주세요.");
      return;
    }
    if (searchFrom > searchTo) {
      onError("검색 종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }
    const fromTime = Date.parse(`${searchFrom}T00:00:00Z`);
    const toTime = Date.parse(`${searchTo}T00:00:00Z`);
    if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
      onError("검색 날짜를 확인해주세요.");
      return;
    }
    if (Math.round((toTime - fromTime) / 86_400_000) > 366) {
      onError("한 번에 1년 범위까지만 검색할 수 있습니다.");
      return;
    }

    const trimmedQuery = searchQuery.trim();
    const queryString = trimmedQuery
      ? `&q=${encodeURIComponent(trimmedQuery)}`
      : "";
    setSearchOpen(true);
    setSearchResults(null);
    setSearching(true);
    onError(null);
    try {
      const data = await apiFetch<PlannerSearchResults>(
        `/api/planner/search?start=${searchFrom}&end=${searchTo}${queryString}`,
        { cache: "no-store" },
      );
      setSearchResults(data);
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "검색하지 못했습니다.",
      );
      setSearchOpen(false);
    } finally {
      setSearching(false);
    }
  };

  return {
    searchFrom,
    setSearchFrom,
    searchTo,
    setSearchTo,
    searchQuery,
    setSearchQuery,
    searchOpen,
    searching,
    searchResults,
    hasSearchFilter,
    handleSearch,
    closeSearchResults,
    updateSearchTaskNotes,
    resetSearch,
  };
}

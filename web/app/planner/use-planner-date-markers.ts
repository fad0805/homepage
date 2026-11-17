import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { apiFetch } from "@/lib/api";

import type {
  PlannerDateMarker,
  PlannerDateMarkersResponse,
} from "./planner-types";
import { dateMarkerAppearsOn } from "./planner-utils";

interface UsePlannerDateMarkersOptions {
  today: string;
  selectedDate: string;
  onError: (message: string | null) => void;
}

export function usePlannerDateMarkers({
  today,
  selectedDate,
  onError,
}: UsePlannerDateMarkersOptions) {
  const [dateMarkers, setDateMarkers] = useState<PlannerDateMarker[]>([]);
  const [markerSearch, setMarkerSearch] = useState("");
  const [editingMarkerId, setEditingMarkerId] = useState<number | null>(
    null,
  );
  const [markerTitle, setMarkerTitle] = useState("");
  const [markerMemo, setMarkerMemo] = useState("");
  const [markerDate, setMarkerDate] = useState(today);
  const [markerIsDday, setMarkerIsDday] = useState(false);
  const [markerPinned, setMarkerPinned] = useState(false);
  const [markerIntervalDays, setMarkerIntervalDays] = useState("");
  const [markerSaving, setMarkerSaving] = useState(false);

  const loadDateMarkers = useCallback(async () => {
    try {
      const data = await apiFetch<PlannerDateMarkersResponse>(
        "/api/bookmark/date-markers",
        { cache: "no-store" },
      );
      setDateMarkers(data.markers);
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "날짜 마커를 불러오지 못했습니다.",
      );
    }
  }, [onError]);

  useEffect(() => {
    void loadDateMarkers();
  }, [loadDateMarkers]);

  const ddayMarkers = useMemo(
    () => dateMarkers.filter((item) => item.is_dday),
    [dateMarkers],
  );
  const pinnedDdays = useMemo(
    () =>
      ddayMarkers
        .filter((item) => item.pinned)
        .sort((a, b) => a.marker_date.localeCompare(b.marker_date)),
    [ddayMarkers],
  );
  const editingMarker =
    editingMarkerId === null
      ? null
      : dateMarkers.find((item) => item.id === editingMarkerId) ?? null;
  const filteredDdayMarkers = useMemo(() => {
    const query = markerSearch.trim().toLowerCase();
    if (!query) return ddayMarkers;
    return ddayMarkers.filter((item) =>
      item.title.toLowerCase().includes(query),
    );
  }, [ddayMarkers, markerSearch]);
  const selectedDateMarkers = useMemo(
    () =>
      dateMarkers.filter((item) =>
        dateMarkerAppearsOn(item, selectedDate),
      ),
    [dateMarkers, selectedDate],
  );

  const resetMarkerForm = (date = today) => {
    setEditingMarkerId(null);
    setMarkerTitle("");
    setMarkerMemo("");
    setMarkerDate(date);
    setMarkerIsDday(false);
    setMarkerPinned(false);
    setMarkerIntervalDays("");
  };

  const startEditingMarker = (item: PlannerDateMarker) => {
    setEditingMarkerId(item.id);
    setMarkerTitle(item.title);
    setMarkerMemo(item.memo ?? "");
    setMarkerDate(item.marker_date);
    setMarkerIsDday(item.is_dday);
    setMarkerPinned(item.pinned);
    setMarkerIntervalDays(
      item.interval_days ? String(item.interval_days) : "",
    );
    onError(null);
  };

  const handleSubmitMarker = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!markerTitle.trim() || markerSaving) return;
    setMarkerSaving(true);
    onError(null);

    const intervalValue = markerIntervalDays.trim();
    const intervalDays =
      markerIsDday && intervalValue ? Number(intervalValue) : null;
    if (
      intervalDays !== null &&
      (!Number.isFinite(intervalDays) || intervalDays < 1)
    ) {
      onError("마커 간격은 1일 이상으로 입력해주세요.");
      setMarkerSaving(false);
      return;
    }

    const payload = {
      title: markerTitle,
      memo: markerMemo.trim() || null,
      marker_date: markerDate,
      is_dday: markerIsDday,
      pinned: markerIsDday ? markerPinned : false,
      interval_days: markerIsDday ? intervalDays : null,
    };
    try {
      if (editingMarkerId !== null) {
        await apiFetch<PlannerDateMarker>(
          `/api/bookmark/date-markers/${editingMarkerId}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );
      } else {
        await apiFetch<PlannerDateMarker>("/api/bookmark/date-markers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      await loadDateMarkers();
      resetMarkerForm();
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "날짜 마커를 저장하지 못했습니다.",
      );
    } finally {
      setMarkerSaving(false);
    }
  };

  const handleDeleteMarker = async (item: PlannerDateMarker) => {
    if (markerSaving) return;
    if (
      !window.confirm(
        `"${item.title}" 마커를 삭제할까요? 달력에서도 사라집니다.`,
      )
    ) {
      return;
    }
    setMarkerSaving(true);
    onError(null);
    try {
      await apiFetch(`/api/bookmark/date-markers/${item.id}`, {
        method: "DELETE",
      });
      if (editingMarkerId === item.id) {
        resetMarkerForm();
      }
      await loadDateMarkers();
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "날짜 마커를 삭제하지 못했습니다.",
      );
    } finally {
      setMarkerSaving(false);
    }
  };

  const handleToggleMarkerPin = async (item: PlannerDateMarker) => {
    if (markerSaving || !item.is_dday) return;
    setMarkerSaving(true);
    onError(null);
    try {
      await apiFetch<PlannerDateMarker>(
        `/api/bookmark/date-markers/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ pinned: !item.pinned }),
        },
      );
      await loadDateMarkers();
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "디데이 고정 상태를 바꾸지 못했습니다.",
      );
    } finally {
      setMarkerSaving(false);
    }
  };

  return {
    dateMarkers,
    markerSearch,
    setMarkerSearch,
    editingMarkerId,
    markerTitle,
    setMarkerTitle,
    markerMemo,
    setMarkerMemo,
    markerDate,
    setMarkerDate,
    markerIsDday,
    setMarkerIsDday,
    markerPinned,
    setMarkerPinned,
    markerIntervalDays,
    setMarkerIntervalDays,
    markerSaving,
    ddayMarkers,
    pinnedDdays,
    editingMarker,
    filteredDdayMarkers,
    selectedDateMarkers,
    loadDateMarkers,
    resetMarkerForm,
    startEditingMarker,
    handleSubmitMarker,
    handleDeleteMarker,
    handleToggleMarkerPin,
  };
}

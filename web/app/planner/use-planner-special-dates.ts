import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { apiFetch } from "@/lib/api";
import { todayDateInputValue } from "@/lib/datetime";

import type {
  PlannerSpecialDate,
  SpecialDateKind,
  SpecialModalTab,
} from "./planner-types";
import { specialDateAppearsOn } from "./planner-utils";

interface UsePlannerSpecialDatesOptions {
  today: string;
  selectedDate: string;
  onError: (message: string | null) => void;
}

export function usePlannerSpecialDates({
  today,
  selectedDate,
  onError,
}: UsePlannerSpecialDatesOptions) {
  const [specialDates, setSpecialDates] = useState<PlannerSpecialDate[]>([]);
  const [specialTab, setSpecialTab] = useState<SpecialModalTab>("form");
  const [specialSearch, setSpecialSearch] = useState("");
  const [specialModalOpen, setSpecialModalOpen] = useState(false);
  const [editingSpecialId, setEditingSpecialId] = useState<number | null>(
    null,
  );
  const [specialKind, setSpecialKind] =
    useState<SpecialDateKind>("yearly");
  const [specialTitle, setSpecialTitle] = useState("");
  const [specialEventDate, setSpecialEventDate] = useState(today);
  const [specialMonth, setSpecialMonth] = useState(1);
  const [specialDay, setSpecialDay] = useState(1);
  const [specialPinned, setSpecialPinned] = useState(false);
  const [specialSaving, setSpecialSaving] = useState(false);

  const loadSpecialDates = useCallback(async () => {
    try {
      const data = await apiFetch<{ special_dates: PlannerSpecialDate[] }>(
        "/api/bookmark/special-dates",
        { cache: "no-store" },
      );
      setSpecialDates(data.special_dates);
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "기념일을 불러오지 못했습니다.",
      );
    }
  }, [onError]);

  useEffect(() => {
    void loadSpecialDates();
  }, [loadSpecialDates]);

  const ddaySpecialDates = useMemo(
    () => specialDates.filter((item) => item.kind === "dday"),
    [specialDates],
  );
  const editingSpecial =
    editingSpecialId === null
      ? null
      : specialDates.find((item) => item.id === editingSpecialId) ??
        null;
  const filteredSpecialDates = useMemo(() => {
    const query = specialSearch.trim().toLowerCase();
    if (!query) return ddaySpecialDates;
    return ddaySpecialDates.filter((item) =>
      item.title.toLowerCase().includes(query),
    );
  }, [ddaySpecialDates, specialSearch]);
  const upcomingDdays = useMemo(() => {
    const candidates = ddaySpecialDates.filter(
      (item) =>
        item.event_date !== null &&
        !specialDateAppearsOn(item, selectedDate),
    );
    const upcoming = candidates
      .filter((item) => (item.event_date ?? "") >= today)
      .sort((a, b) =>
        (a.event_date ?? "").localeCompare(b.event_date ?? ""),
      )
      .slice(0, 3);
    const pinnedPast = candidates
      .filter(
        (item) =>
          (item.event_date ?? "") < today && item.pinned,
      )
      .sort((a, b) =>
        (b.event_date ?? "").localeCompare(a.event_date ?? ""),
      )
      .slice(0, 3);
    return [...upcoming, ...pinnedPast];
  }, [ddaySpecialDates, selectedDate, today]);

  const resetSpecialForm = () => {
    setEditingSpecialId(null);
    setSpecialKind("yearly");
    setSpecialTitle("");
    setSpecialEventDate(todayDateInputValue());
    setSpecialMonth(1);
    setSpecialDay(1);
    setSpecialPinned(false);
  };

  const openSpecialManager = () => {
    resetSpecialForm();
    setSpecialTab("form");
    setSpecialSearch("");
    setSpecialModalOpen(true);
  };

  const closeSpecialManager = () => {
    if (specialSaving) return;
    setSpecialModalOpen(false);
    setSpecialTab("form");
    setSpecialSearch("");
    resetSpecialForm();
  };

  const startEditingSpecial = (item: PlannerSpecialDate) => {
    setEditingSpecialId(item.id);
    setSpecialKind(item.kind);
    setSpecialTitle(item.title);
    setSpecialEventDate(item.event_date ?? todayDateInputValue());
    setSpecialMonth(item.month ?? 1);
    setSpecialDay(item.day ?? 1);
    setSpecialPinned(item.pinned);
    onError(null);
  };

  const openSpecialEditor = (item: PlannerSpecialDate) => {
    startEditingSpecial(item);
    setSpecialTab("form");
    setSpecialModalOpen(true);
  };

  const openSpecialList = () => {
    setSpecialSearch("");
    setSpecialTab("list");
    setSpecialModalOpen(true);
  };

  const handleSpecialEventDateChange = (value: string) => {
    setSpecialEventDate(value);
    if (editingSpecialId === null && value && value < today) {
      setSpecialPinned(true);
    }
  };

  const handleSubmitSpecial = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!specialTitle.trim() || specialSaving) return;
    setSpecialSaving(true);
    onError(null);
    const payload = {
      title: specialTitle,
      kind: specialKind,
      event_date: specialKind === "dday" ? specialEventDate : null,
      month: specialKind === "yearly" ? specialMonth : null,
      day: specialKind === "yearly" ? specialDay : null,
      pinned: specialKind === "dday" ? specialPinned : false,
    };
    try {
      if (editingSpecialId !== null) {
        await apiFetch<PlannerSpecialDate>(
          `/api/bookmark/special-dates/${editingSpecialId}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );
      } else {
        await apiFetch<PlannerSpecialDate>(
          "/api/bookmark/special-dates",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );
      }
      await loadSpecialDates();
      resetSpecialForm();
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "기념일을 저장하지 못했습니다.",
      );
    } finally {
      setSpecialSaving(false);
    }
  };

  const handleDeleteSpecial = async (item: PlannerSpecialDate) => {
    if (specialSaving) return;
    if (
      !window.confirm(
        `"${item.title}" 기념일을 삭제할까요? 과거 달력에서도 사라집니다.`,
      )
    ) {
      return;
    }
    setSpecialSaving(true);
    onError(null);
    try {
      await apiFetch(`/api/bookmark/special-dates/${item.id}`, {
        method: "DELETE",
      });
      if (editingSpecialId === item.id) {
        resetSpecialForm();
      }
      await loadSpecialDates();
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "기념일을 삭제하지 못했습니다.",
      );
    } finally {
      setSpecialSaving(false);
    }
  };

  const handleToggleSpecialPin = async (item: PlannerSpecialDate) => {
    if (specialSaving) return;
    setSpecialSaving(true);
    onError(null);
    try {
      await apiFetch<PlannerSpecialDate>(
        `/api/bookmark/special-dates/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ pinned: !item.pinned }),
        },
      );
      await loadSpecialDates();
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "디데이 고정 상태를 바꾸지 못했습니다.",
      );
    } finally {
      setSpecialSaving(false);
    }
  };

  return {
    specialDates,
    specialTab,
    setSpecialTab,
    specialSearch,
    setSpecialSearch,
    specialModalOpen,
    editingSpecialId,
    specialKind,
    setSpecialKind,
    specialTitle,
    setSpecialTitle,
    specialEventDate,
    specialMonth,
    setSpecialMonth,
    specialDay,
    setSpecialDay,
    specialPinned,
    setSpecialPinned,
    specialSaving,
    ddaySpecialDates,
    editingSpecial,
    filteredSpecialDates,
    upcomingDdays,
    loadSpecialDates,
    resetSpecialForm,
    openSpecialManager,
    closeSpecialManager,
    startEditingSpecial,
    openSpecialEditor,
    openSpecialList,
    handleSpecialEventDateChange,
    handleSubmitSpecial,
    handleDeleteSpecial,
    handleToggleSpecialPin,
  };
}

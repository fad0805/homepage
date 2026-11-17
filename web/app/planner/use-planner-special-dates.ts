import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { apiFetch } from "@/lib/api";

import type {
  PlannerSpecialDate,
  PlannerSpecialDatesResponse,
} from "./planner-types";

interface UsePlannerSpecialDatesOptions {
  onError: (message: string | null) => void;
}

export function usePlannerSpecialDates({
  onError,
}: UsePlannerSpecialDatesOptions) {
  const [specialDates, setSpecialDates] = useState<PlannerSpecialDate[]>([]);
  const [editingSpecialId, setEditingSpecialId] = useState<number | null>(
    null,
  );
  const [specialTitle, setSpecialTitle] = useState("");
  const [specialMonth, setSpecialMonth] = useState(1);
  const [specialDay, setSpecialDay] = useState(1);
  const [specialSaving, setSpecialSaving] = useState(false);

  const loadSpecialDates = useCallback(async () => {
    try {
      const data = await apiFetch<PlannerSpecialDatesResponse>(
        "/api/bookmark/special-dates",
        { cache: "no-store" },
      );
      // D-days moved to the date marker table. The anniversary modal only
      // manages yearly entries now.
      setSpecialDates(
        data.special_dates.filter((item) => item.kind === "yearly"),
      );
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

  const editingSpecial =
    editingSpecialId === null
      ? null
      : specialDates.find((item) => item.id === editingSpecialId) ??
        null;

  const resetSpecialForm = () => {
    setEditingSpecialId(null);
    setSpecialTitle("");
    setSpecialMonth(1);
    setSpecialDay(1);
  };

  const startEditingSpecial = (item: PlannerSpecialDate) => {
    setEditingSpecialId(item.id);
    setSpecialTitle(item.title);
    setSpecialMonth(item.month ?? 1);
    setSpecialDay(item.day ?? 1);
    onError(null);
  };

  const handleSubmitSpecial = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<boolean> => {
    event.preventDefault();
    if (!specialTitle.trim() || specialSaving) return false;
    setSpecialSaving(true);
    onError(null);
    const payload = {
      title: specialTitle,
      kind: "yearly",
      event_date: null,
      month: specialMonth,
      day: specialDay,
      pinned: false,
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
      return true;
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "기념일을 저장하지 못했습니다.",
      );
      return false;
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

  return {
    specialDates,
    editingSpecialId,
    specialTitle,
    setSpecialTitle,
    specialMonth,
    setSpecialMonth,
    specialDay,
    setSpecialDay,
    specialSaving,
    editingSpecial,
    loadSpecialDates,
    resetSpecialForm,
    startEditingSpecial,
    handleSubmitSpecial,
    handleDeleteSpecial,
  };
}

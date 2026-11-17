import { useState } from "react";

import { apiFetch } from "@/lib/api";

import type { PlannerEvent, PlannerEventPreview } from "./planner-types";

export function usePlannerEventPreview() {
  const [selectedEvent, setSelectedEvent] =
    useState<PlannerEvent | null>(null);
  const [preview, setPreview] = useState<PlannerEventPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openEvent = async (event: PlannerEvent) => {
    setSelectedEvent(event);
    setPreview(null);
    setPreviewLoading(true);
    try {
      const data = await apiFetch<PlannerEventPreview>(
        `/api/planner/events/${event.id}/preview`,
        { cache: "no-store" },
      );
      setPreview(data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeEvent = () => {
    setSelectedEvent(null);
    setPreview(null);
    setPreviewLoading(false);
  };

  return {
    selectedEvent,
    preview,
    previewLoading,
    openEvent,
    closeEvent,
  };
}

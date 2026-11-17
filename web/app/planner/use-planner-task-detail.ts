import { useState } from "react";

import type { PlannerTask } from "./planner-types";

interface UsePlannerTaskDetailOptions {
  onError: (message: string | null) => void;
}

export function usePlannerTaskDetail({
  onError,
}: UsePlannerTaskDetailOptions) {
  const [selectedTask, setSelectedTask] = useState<PlannerTask | null>(
    null,
  );

  const openTaskDetail = (task: PlannerTask) => {
    onError(null);
    setSelectedTask(task);
  };

  const closeTaskDetail = () => {
    setSelectedTask(null);
    onError(null);
  };

  return {
    selectedTask,
    setSelectedTask,
    openTaskDetail,
    closeTaskDetail,
  };
}

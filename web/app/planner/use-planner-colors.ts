import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { apiFetch } from "@/lib/api";

import type {
  PlannerColor,
  PlannerColorGroup,
  PlannerColorsResponse,
  PlannerTask,
  PlannerTab,
  TaskFormState,
} from "./planner-types";
import {
  DEFAULT_TASK_COLOR,
  UNASSIGNED_TASK_COLOR,
} from "./planner-types";
import { sortColorGroupTasks } from "./planner-utils";

interface UsePlannerColorsOptions {
  activeTab: PlannerTab;
  activeTasks: PlannerTask[];
  tasks: PlannerTask[];
  savedColors: PlannerColor[];
  setSavedColors: Dispatch<SetStateAction<PlannerColor[]>>;
  refreshData: () => Promise<void>;
  setForm: Dispatch<SetStateAction<TaskFormState>>;
  onError: (message: string | null) => void;
}

export function usePlannerColors({
  activeTab,
  activeTasks,
  tasks,
  savedColors,
  setSavedColors,
  refreshData,
  setForm,
  onError,
}: UsePlannerColorsOptions) {
  const [colorSaving, setColorSaving] = useState(false);
  const [colorOrderSaving, setColorOrderSaving] = useState(false);
  const [newChipColor, setNewChipColor] = useState(DEFAULT_TASK_COLOR);
  const [showChipCreator, setShowChipCreator] = useState(false);
  const [chipManagerOpen, setChipManagerOpen] = useState(false);
  const [draggingColorId, setDraggingColorId] = useState<
    number | null
  >(null);
  const draggingColorIdRef = useRef<number | null>(null);
  const [dragOverColorId, setDragOverColorId] = useState<
    number | null
  >(null);
  const [newChipName, setNewChipName] = useState("");
  const [editingColorId, setEditingColorId] = useState<
    number | null
  >(null);
  const [editChipColor, setEditChipColor] =
    useState(DEFAULT_TASK_COLOR);
  const [editChipName, setEditChipName] = useState("");
  const [chipSaving, setChipSaving] = useState(false);
  const [deletingColorId, setDeletingColorId] = useState<
    number | null
  >(null);
  const [selectedColorGroups, setSelectedColorGroups] = useState<
    string[]
  >([]);

  const colorGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        color: string | null;
        name: string | null;
        tasks: PlannerTask[];
      }
    >();
    for (const task of activeTasks) {
      const key = task.color_id
        ? `chip:${task.color_id}`
        : "unassigned";
      const saved = savedColors.find(
        (color) => color.id === task.color_id,
      );
      const color = task.color || saved?.color || UNASSIGNED_TASK_COLOR;
      const group = groups.get(key) ?? {
        color,
        name: saved?.name || null,
        tasks: [],
      };
      if (!group.name && saved?.name) {
        group.name = saved.name;
      }
      group.tasks.push(task);
      groups.set(key, group);
    }
    for (const saved of savedColors) {
      const key = `chip:${saved.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          color: saved.color,
          name: saved.name,
          tasks: [],
        });
      }
    }
    const savedOrder = new Map(
      savedColors.map((color, index) => [color.id, index]),
    );
    return Array.from(groups.entries())
      .map(([key, group]) => ({
        key,
        color: group.color,
        name: group.name,
        tasks: sortColorGroupTasks(group.tasks),
      }))
      .sort((a, b) => {
        const aUnassigned = a.key === "unassigned";
        const bUnassigned = b.key === "unassigned";
        if (aUnassigned !== bUnassigned) {
          return aUnassigned ? 1 : -1;
        }
        const aChip = a.key.startsWith("chip:")
          ? Number(a.key.slice(5))
          : null;
        const bChip = b.key.startsWith("chip:")
          ? Number(b.key.slice(5))
          : null;
        const aIndex =
          aChip === null
            ? Number.MAX_SAFE_INTEGER
            : (savedOrder.get(aChip) ?? Number.MAX_SAFE_INTEGER);
        const bIndex =
          bChip === null
            ? Number.MAX_SAFE_INTEGER
            : (savedOrder.get(bChip) ?? Number.MAX_SAFE_INTEGER);
        return (
          aIndex - bIndex ||
          (a.color || "").localeCompare(b.color || "") ||
          a.key.localeCompare(b.key)
        );
      });
  }, [activeTasks, savedColors]);

  useEffect(() => {
    const available = new Set(colorGroups.map((group) => group.key));
    setSelectedColorGroups((previous) => {
      const next = previous.filter((key) => available.has(key));
      return next.length === previous.length ? previous : next;
    });
  }, [colorGroups]);

  useEffect(() => {
    if (activeTab === "colors") return;
    setSelectedColorGroups([]);
    setShowChipCreator(false);
  }, [activeTab]);

  const selectedColorGroup =
    colorGroups.find(
      (group) => group.key === selectedColorGroups[0],
    ) ?? null;

  const handleCreateColor = async (selectForForm: boolean) => {
    if (colorSaving) return;
    setColorSaving(true);
    onError(null);
    try {
      const saved = await apiFetch<PlannerColor>("/api/planner/colors", {
        method: "POST",
        body: JSON.stringify({
          color: newChipColor,
          name: newChipName.trim() || null,
        }),
      });
      setSavedColors((previous) =>
        previous.some((color) => color.id === saved.id)
          ? previous.map((color) =>
              color.id === saved.id ? saved : color,
            )
          : [...previous, saved],
      );
      if (selectForForm) {
        setForm((previous) => ({
          ...previous,
          colorId: saved.id,
        }));
      }
      setNewChipName("");
      setShowChipCreator(false);
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "색상 칩을 만들지 못했습니다.",
      );
    } finally {
      setColorSaving(false);
    }
  };

  const startEditingColor = (saved: PlannerColor) => {
    setEditingColorId(saved.id);
    setEditChipColor(saved.color);
    setEditChipName(saved.name || "");
    setShowChipCreator(false);
    onError(null);
  };

  const persistColorOrder = async (
    next: PlannerColor[],
    previous: PlannerColor[],
  ) => {
    if (colorOrderSaving) return;
    setSavedColors(next);
    setColorOrderSaving(true);
    onError(null);
    try {
      const data = await apiFetch<PlannerColorsResponse>(
        "/api/planner/colors/order",
        {
          method: "PUT",
          body: JSON.stringify({
            ids: next.map((color) => color.id),
          }),
        },
      );
      setSavedColors(data.colors);
    } catch (reason) {
      setSavedColors(previous);
      onError(
        reason instanceof Error
          ? reason.message
          : "색상 칩 순서를 변경하지 못했습니다.",
      );
    } finally {
      setColorOrderSaving(false);
    }
  };

  const moveColorBy = (saved: PlannerColor, delta: number) => {
    if (colorOrderSaving) return;
    const currentIndex = savedColors.findIndex(
      (color) => color.id === saved.id,
    );
    const nextIndex = currentIndex + delta;
    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= savedColors.length
    ) {
      return;
    }
    const next = [...savedColors];
    [next[currentIndex], next[nextIndex]] = [
      next[nextIndex],
      next[currentIndex],
    ];
    void persistColorOrder(next, savedColors);
  };

  const moveColorForDrop = (
    items: PlannerColor[],
    sourceId: number,
    targetId: number,
    after: boolean,
  ) => {
    const sourceIndex = items.findIndex(
      (color) => color.id === sourceId,
    );
    if (sourceIndex < 0) return items;
    const next = [...items];
    const [moved] = next.splice(sourceIndex, 1);
    const targetIndex = next.findIndex(
      (color) => color.id === targetId,
    );
    if (targetIndex < 0) return items;
    next.splice(after ? targetIndex + 1 : targetIndex, 0, moved);
    return next;
  };

  const handleChipDrop = (
    event: ReactDragEvent<HTMLLIElement>,
    target: PlannerColor,
  ) => {
    event.preventDefault();
    const sourceId =
      draggingColorIdRef.current ??
      draggingColorId ??
      Number(event.dataTransfer.getData("text/plain"));
    draggingColorIdRef.current = null;
    setDraggingColorId(null);
    setDragOverColorId(null);
    if (
      !Number.isFinite(sourceId) ||
      sourceId === target.id ||
      colorOrderSaving
    ) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    const next = moveColorForDrop(
      savedColors,
      sourceId,
      target.id,
      after,
    );
    if (next === savedColors) return;
    void persistColorOrder(next, savedColors);
  };

  const selectColorGroup = (key: string) => {
    setSelectedColorGroups((previous) =>
      previous.includes(key) ? [] : [key],
    );
  };

  const openChipManager = () => {
    onError(null);
    setShowChipCreator(false);
    setChipManagerOpen(true);
  };

  const closeChipManager = () => {
    setChipManagerOpen(false);
    setEditingColorId(null);
    setEditChipName("");
    draggingColorIdRef.current = null;
    setDraggingColorId(null);
    setDragOverColorId(null);
    onError(null);
  };

  const cancelEditingColor = () => {
    setEditingColorId(null);
    setEditChipName("");
  };

  const handleEditColor = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (editingColorId === null || chipSaving) return;
    setChipSaving(true);
    onError(null);
    try {
      const saved = await apiFetch<PlannerColor>(
        `/api/planner/colors/${editingColorId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            color: editChipColor,
            name: editChipName.trim() || null,
          }),
        },
      );
      setSavedColors((previous) =>
        previous.map((color) =>
          color.id === saved.id ? saved : color,
        ),
      );
      setEditingColorId(null);
      setEditChipName("");
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "색상 칩을 수정하지 못했습니다.",
      );
    } finally {
      setChipSaving(false);
    }
  };

  const handleDeleteColor = async (saved: PlannerColor) => {
    if (deletingColorId !== null) return;
    const chipTasks = tasks.filter(
      (task) => task.color_id === saved.id,
    );
    const activeInactiveCount = chipTasks.filter(
      (task) =>
        task.status === "active" || task.status === "inactive",
    ).length;
    const trashedCount = chipTasks.filter(
      (task) => task.status === "trashed",
    ).length;
    const message = [
      `"${saved.name || saved.color}" 색상 칩을 삭제할까요?`,
    ];
    if (activeInactiveCount > 0) {
      message.push(
        `활성/비활성 일정 ${activeInactiveCount}개가 전부 미지정으로 바뀝니다.`,
      );
    }
    if (trashedCount > 0) {
      message.push(
        `휴지통 일정 ${trashedCount}개는 함께 영구 삭제됩니다.`,
      );
    }
    if (!window.confirm(message.join("\n"))) return;

    setDeletingColorId(saved.id);
    onError(null);
    try {
      await apiFetch(`/api/planner/colors/${saved.id}`, {
        method: "DELETE",
      });
      setSavedColors((previous) =>
        previous.filter((color) => color.id !== saved.id),
      );
      setSelectedColorGroups((previous) =>
        previous.filter((key) => key !== `chip:${saved.id}`),
      );
      if (editingColorId === saved.id) {
        setEditingColorId(null);
        setEditChipName("");
      }
      await refreshData();
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "색상 칩을 삭제하지 못했습니다.",
      );
    } finally {
      setDeletingColorId(null);
    }
  };

  return {
    colorSaving,
    colorOrderSaving,
    newChipColor,
    setNewChipColor,
    showChipCreator,
    setShowChipCreator,
    chipManagerOpen,
    draggingColorId,
    setDraggingColorId,
    draggingColorIdRef,
    dragOverColorId,
    setDragOverColorId,
    newChipName,
    setNewChipName,
    editingColorId,
    editChipColor,
    setEditChipColor,
    editChipName,
    setEditChipName,
    chipSaving,
    deletingColorId,
    selectedColorGroups,
    setSelectedColorGroups,
    colorGroups,
    selectedColorGroup,
    handleCreateColor,
    startEditingColor,
    handleChipDrop,
    moveColorBy,
    selectColorGroup,
    openChipManager,
    closeChipManager,
    cancelEditingColor,
    handleEditColor,
    handleDeleteColor,
  };
}

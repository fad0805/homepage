import { useState, type Dispatch, type SetStateAction } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { apiFetch } from "@/lib/api";
import type { BookmarkMoodTag } from "@/lib/bookmark";

interface UseBookmarkMoodTagsOptions {
  moodTags: BookmarkMoodTag[];
  setMoodTags: Dispatch<SetStateAction<BookmarkMoodTag[]>>;
  loadMoodTags: () => Promise<void>;
  loadPeriod: () => Promise<void>;
}

export function useBookmarkMoodTags({
  moodTags,
  setMoodTags,
  loadMoodTags,
  loadPeriod,
}: UseBookmarkMoodTagsOptions) {
  const [moodTagModalOpen, setMoodTagModalOpen] = useState(false);
  const [newMoodTagName, setNewMoodTagName] = useState("");
  const [editingMoodTag, setEditingMoodTag] =
    useState<BookmarkMoodTag | null>(null);
  const [moodTagSaving, setMoodTagSaving] = useState(false);
  const [moodTagError, setMoodTagError] = useState<string | null>(
    null,
  );

  const openMoodTagModal = () => {
    setMoodTagModalOpen(true);
    setNewMoodTagName("");
    setEditingMoodTag(null);
    setMoodTagError(null);
  };

  const startEditMoodTag = (tag: BookmarkMoodTag) => {
    setEditingMoodTag(tag);
    setNewMoodTagName(tag.name);
    setMoodTagError(null);
  };

  const cancelEditMoodTag = () => {
    setEditingMoodTag(null);
    setNewMoodTagName("");
    setMoodTagError(null);
  };

  const closeMoodTagModal = () => {
    setMoodTagModalOpen(false);
    setNewMoodTagName("");
    setEditingMoodTag(null);
    setMoodTagError(null);
  };

  const handleAddMoodTag = async () => {
    if (!newMoodTagName.trim() || moodTagSaving) return;
    setMoodTagSaving(true);
    setMoodTagError(null);
    try {
      if (editingMoodTag) {
        await apiFetch<BookmarkMoodTag>(
          `/api/bookmark/mood-tags/${editingMoodTag.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ name: newMoodTagName }),
          },
        );
        setEditingMoodTag(null);
      } else {
        await apiFetch<BookmarkMoodTag>("/api/bookmark/mood-tags", {
          method: "POST",
          body: JSON.stringify({ name: newMoodTagName }),
        });
      }
      setNewMoodTagName("");
      await loadMoodTags();
    } catch (reason) {
      setMoodTagError(
        reason instanceof Error
          ? reason.message
          : editingMoodTag
            ? "기분 태그를 수정하지 못했습니다."
            : "기분 태그를 추가하지 못했습니다.",
      );
    } finally {
      setMoodTagSaving(false);
    }
  };

  const persistMoodTagOrder = async (next: BookmarkMoodTag[]) => {
    if (moodTagSaving) return;
    setMoodTags(next);
    setMoodTagSaving(true);
    setMoodTagError(null);
    try {
      const saved = await apiFetch<BookmarkMoodTag[]>(
        "/api/bookmark/mood-tags/order",
        {
          method: "PUT",
          body: JSON.stringify({
            ids: next.map((tag) => tag.id),
          }),
        },
      );
      setMoodTags(saved);
    } catch (reason) {
      setMoodTagError(
        reason instanceof Error
          ? reason.message
          : "기분 태그 순서를 변경하지 못했습니다.",
      );
      await loadMoodTags();
    } finally {
      setMoodTagSaving(false);
    }
  };

  const handleMoodDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || moodTagSaving) return;
    const oldIndex = moodTags.findIndex(
      (tag) => tag.id === active.id,
    );
    const newIndex = moodTags.findIndex(
      (tag) => tag.id === over.id,
    );
    if (oldIndex < 0 || newIndex < 0) return;
    void persistMoodTagOrder(arrayMove(moodTags, oldIndex, newIndex));
  };

  const handleDeleteMoodTag = async (tag: BookmarkMoodTag) => {
    if (moodTagSaving) return;
    if (!window.confirm(`"${tag.name}" 기분 태그를 삭제할까요?`)) {
      return;
    }
    setMoodTagSaving(true);
    setMoodTagError(null);
    try {
      await apiFetch(`/api/bookmark/mood-tags/${tag.id}`, {
        method: "DELETE",
      });
      if (editingMoodTag?.id === tag.id) {
        setEditingMoodTag(null);
        setNewMoodTagName("");
      }
      await loadMoodTags();
      await loadPeriod();
    } catch (reason) {
      setMoodTagError(
        reason instanceof Error
          ? reason.message
          : "기분 태그를 삭제하지 못했습니다.",
      );
    } finally {
      setMoodTagSaving(false);
    }
  };

  return {
    moodTagModalOpen,
    newMoodTagName,
    setNewMoodTagName,
    editingMoodTag,
    moodTagSaving,
    moodTagError,
    openMoodTagModal,
    startEditMoodTag,
    cancelEditMoodTag,
    closeMoodTagModal,
    handleAddMoodTag,
    handleMoodDragEnd,
    handleDeleteMoodTag,
  };
}

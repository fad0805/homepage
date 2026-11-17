import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { apiFetch } from "@/lib/api";
import type { BookmarkRoutineCategory } from "@/lib/bookmark";

interface UseBookmarkCategoriesOptions {
  categories: BookmarkRoutineCategory[];
  setCategories: Dispatch<SetStateAction<BookmarkRoutineCategory[]>>;
  loadCategories: () => Promise<void>;
  loadPeriod: () => Promise<void>;
  collapseStorageKey: string;
}

export function useBookmarkCategories({
  categories,
  setCategories,
  loadCategories,
  loadPeriod,
  collapseStorageKey,
}: UseBookmarkCategoriesOptions) {
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] =
    useState<BookmarkRoutineCategory | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let next: Record<string, boolean> = {};
    try {
      const raw = window.localStorage.getItem(collapseStorageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          next = parsed as Record<string, boolean>;
        }
      }
    } catch {
      // Ignore malformed or unavailable local storage.
    }
    setCollapsedSections(next);
  }, [collapseStorageKey]);

  const setSectionCollapsed = (key: string, collapsed: boolean) => {
    setCollapsedSections((previous) => {
      const next = { ...previous, [key]: collapsed };
      try {
        window.localStorage.setItem(
          collapseStorageKey,
          JSON.stringify(next),
        );
      } catch {
        // The in-memory state still works for this session.
      }
      return next;
    });
  };

  const openCategoryModal = () => {
    setCategoryModalOpen(true);
    setNewCategoryName("");
    setEditingCategory(null);
    setCategoryError(null);
  };

  const closeCategoryModal = () => {
    setCategoryModalOpen(false);
    setNewCategoryName("");
    setEditingCategory(null);
    setCategoryError(null);
  };

  const startEditCategory = (category: BookmarkRoutineCategory) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setCategoryError(null);
  };

  const cancelEditCategory = () => {
    setEditingCategory(null);
    setNewCategoryName("");
    setCategoryError(null);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || categorySaving) return;
    setCategorySaving(true);
    setCategoryError(null);
    try {
      if (editingCategory) {
        await apiFetch<BookmarkRoutineCategory>(
          `/api/bookmark/categories/${editingCategory.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ name: newCategoryName }),
          },
        );
        setEditingCategory(null);
      } else {
        await apiFetch<BookmarkRoutineCategory>(
          "/api/bookmark/categories",
          {
            method: "POST",
            body: JSON.stringify({ name: newCategoryName }),
          },
        );
      }
      setNewCategoryName("");
      await loadCategories();
      await loadPeriod();
    } catch (reason) {
      setCategoryError(
        reason instanceof Error
          ? reason.message
          : editingCategory
            ? "카테고리를 수정하지 못했습니다."
            : "카테고리를 추가하지 못했습니다.",
      );
    } finally {
      setCategorySaving(false);
    }
  };

  const persistCategoryOrder = async (
    next: BookmarkRoutineCategory[],
  ) => {
    if (categorySaving) return;
    setCategories(next);
    setCategorySaving(true);
    setCategoryError(null);
    try {
      const saved = await apiFetch<BookmarkRoutineCategory[]>(
        "/api/bookmark/categories/order",
        {
          method: "PUT",
          body: JSON.stringify({
            ids: next.map((category) => category.id),
          }),
        },
      );
      setCategories(saved);
    } catch (reason) {
      setCategoryError(
        reason instanceof Error
          ? reason.message
          : "카테고리 순서를 변경하지 못했습니다.",
      );
      await loadCategories();
    } finally {
      setCategorySaving(false);
    }
  };

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || categorySaving) return;
    const oldIndex = categories.findIndex(
      (category) => category.id === active.id,
    );
    const newIndex = categories.findIndex(
      (category) => category.id === over.id,
    );
    if (oldIndex < 0 || newIndex < 0) return;
    void persistCategoryOrder(
      arrayMove(categories, oldIndex, newIndex),
    );
  };

  const handleDeleteCategory = async (
    category: BookmarkRoutineCategory,
  ) => {
    if (categorySaving) return;
    if (
      !window.confirm(
        `"${category.name}" 카테고리를 삭제할까요? 루틴은 미분류로 이동합니다.`,
      )
    ) {
      return;
    }
    setCategorySaving(true);
    setCategoryError(null);
    try {
      await apiFetch(`/api/bookmark/categories/${category.id}`, {
        method: "DELETE",
      });
      if (editingCategory?.id === category.id) {
        setEditingCategory(null);
        setNewCategoryName("");
      }
      await loadCategories();
      await loadPeriod();
    } catch (reason) {
      setCategoryError(
        reason instanceof Error
          ? reason.message
          : "카테고리를 삭제하지 못했습니다.",
      );
    } finally {
      setCategorySaving(false);
    }
  };

  return {
    categoryModalOpen,
    newCategoryName,
    setNewCategoryName,
    editingCategory,
    collapsedSections,
    categorySaving,
    categoryError,
    setSectionCollapsed,
    openCategoryModal,
    closeCategoryModal,
    startEditCategory,
    cancelEditCategory,
    handleAddCategory,
    handleCategoryDragEnd,
    handleDeleteCategory,
  };
}

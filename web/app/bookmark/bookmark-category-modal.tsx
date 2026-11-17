import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  type SensorDescriptor,
  type SensorOptions,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import type { BookmarkRoutineCategory } from "@/lib/bookmark";

import { SortableCategoryItem } from "./bookmark-sortable-items";

interface BookmarkCategoryModalProps {
  error: string | null;
  editingCategory: BookmarkRoutineCategory | null;
  name: string;
  saving: boolean;
  categories: BookmarkRoutineCategory[];
  sensors: SensorDescriptor<SensorOptions>[];
  onNameChange: (name: string) => void;
  onClose: () => void;
  onSubmitCategory: () => void;
  onCancelEdit: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  onEdit: (category: BookmarkRoutineCategory) => void;
  onDelete: (category: BookmarkRoutineCategory) => void;
}

export function BookmarkCategoryModal({
  error,
  editingCategory,
  name,
  saving,
  categories,
  sensors,
  onNameChange,
  onClose,
  onSubmitCategory,
  onCancelEdit,
  onDragEnd,
  onEdit,
  onDelete,
}: BookmarkCategoryModalProps) {
  return (
      <div
        className="bookmark-modal-overlay"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="bookmark-modal bookmark-category-modal"
          role="dialog"
          aria-modal="true"
          aria-label="루틴 카테고리 관리"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="bookmark-modal-header">
            <div>
              <p className="bookmark-panel-eyebrow">CATEGORY</p>
              <h2>루틴 카테고리</h2>
            </div>
            <button
              type="button"
              className="bookmark-text-button"
              onClick={onClose}
            >
              닫기
            </button>
          </header>

          {error ? (
            <p className="bookmark-error">{error}</p>
          ) : null}

          {editingCategory ? (
            <p className="bookmark-form-hint">
              {editingCategory.name} 카테고리 수정 중
            </p>
          ) : null}
          <form
            className="bookmark-category-add"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmitCategory();
            }}
          >
            <input
              type="text"
              value={name}
              maxLength={80}
              placeholder={
                editingCategory ? "카테고리 이름" : "새 카테고리 이름"
              }
              onChange={(event) =>
                onNameChange(event.target.value)
              }
            />
            <button
              type="submit"
              className="bookmark-primary"
              disabled={saving || !name.trim()}
            >
              {editingCategory ? "저장" : "추가"}
            </button>
            {editingCategory ? (
              <button
                type="button"
                className="bookmark-text-button"
                disabled={saving}
                onClick={onCancelEdit}
              >
                취소
              </button>
            ) : null}
          </form>

          {categories.length === 0 ? (
            <p className="bookmark-empty-row">
              아직 카테고리가 없습니다.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={categories.map((category) => category.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="bookmark-category-list">
                  {categories.map((category) => (
                    <SortableCategoryItem
                      key={category.id}
                      category={category}
                      saving={saving}
                      onEdit={onEdit}
                      onDelete={(item) =>
                        void onDelete(item)
                      }
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
          <p className="bookmark-form-hint">
            카테고리를 드래그해 순서를 바꿀 수 있습니다. 삭제하면
            해당 루틴은 미분류로 이동합니다.
          </p>
        </div>
      </div>
  );
}

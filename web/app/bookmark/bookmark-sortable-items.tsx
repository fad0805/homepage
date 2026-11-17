import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { KeyboardEvent, ReactNode } from "react";

import type {
  BookmarkMoodTag,
  BookmarkRoutineCategory,
} from "@/lib/bookmark";

export function SortableMoodTagItem({
  tag,
  saving,
  onEdit,
  onDelete,
}: {
  tag: BookmarkMoodTag;
  saving: boolean;
  onEdit: (tag: BookmarkMoodTag) => void;
  onDelete: (tag: BookmarkMoodTag) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tag.id, disabled: saving });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`bookmark-category-item${
        isDragging ? " is-dragging" : ""
      }`}
    >
      <span>{tag.name}</span>
      <div className="bookmark-category-actions">
        <button
          type="button"
          className="bookmark-drag-handle"
          aria-label={`${tag.name} 순서 변경`}
          disabled={saving}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <button
          type="button"
          className="bookmark-text-button"
          disabled={saving}
          onClick={() => onEdit(tag)}
        >
          수정
        </button>
        <button
          type="button"
          className="bookmark-text-button is-danger"
          disabled={saving}
          onClick={() => onDelete(tag)}
        >
          삭제
        </button>
      </div>
    </li>
  );
}

export function SortableCategoryItem({
  category,
  saving,
  onEdit,
  onDelete,
}: {
  category: BookmarkRoutineCategory;
  saving: boolean;
  onEdit: (category: BookmarkRoutineCategory) => void;
  onDelete: (category: BookmarkRoutineCategory) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id, disabled: saving });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`bookmark-category-item${
        isDragging ? " is-dragging" : ""
      }`}
    >
      <span>{category.name}</span>
      <div className="bookmark-category-actions">
        <button
          type="button"
          className="bookmark-drag-handle"
          aria-label={`${category.name} 순서 변경`}
          disabled={saving}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <button
          type="button"
          className="bookmark-text-button"
          disabled={saving}
          onClick={() => onEdit(category)}
        >
          수정
        </button>
        <button
          type="button"
          className="bookmark-text-button is-danger"
          disabled={saving}
          onClick={() => onDelete(category)}
        >
          삭제
        </button>
      </div>
    </li>
  );
}

export function SortableRoutineItem({
  id,
  title,
  disabled,
  className,
  onClick,
  onKeyDown,
  children,
}: {
  id: number;
  title: string;
  disabled: boolean;
  className: string;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => void;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  const { onPointerDown } = listeners ?? {};
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${className}${isDragging ? " is-dragging" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${title} 수정`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") return;
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest(
            "button, input, label, a, select, textarea, summary",
          )
        ) {
          return;
        }
        onPointerDown?.(event);
      }}
    >
      {children}
      <button
        type="button"
        className="bookmark-drag-handle bookmark-routine-drag"
        aria-label={`${title} 순서 변경`}
        disabled={disabled}
        {...attributes}
        {...listeners}
        onClick={(event) => event.stopPropagation()}
      >
        ⠿
      </button>
    </li>
  );
}

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

import type { BookmarkMoodTag } from "@/lib/bookmark";

import { SortableMoodTagItem } from "./bookmark-sortable-items";

interface BookmarkMoodTagModalProps {
  error: string | null;
  editingTag: BookmarkMoodTag | null;
  name: string;
  saving: boolean;
  tags: BookmarkMoodTag[];
  sensors: SensorDescriptor<SensorOptions>[];
  onNameChange: (name: string) => void;
  onClose: () => void;
  onSubmitTag: () => void;
  onCancelEdit: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  onEdit: (tag: BookmarkMoodTag) => void;
  onDelete: (tag: BookmarkMoodTag) => void;
}

export function BookmarkMoodTagModal({
  error,
  editingTag,
  name,
  saving,
  tags,
  sensors,
  onNameChange,
  onClose,
  onSubmitTag,
  onCancelEdit,
  onDragEnd,
  onEdit,
  onDelete,
}: BookmarkMoodTagModalProps) {
  return (
      <div
        className="bookmark-modal-overlay"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="bookmark-modal bookmark-category-modal bookmark-mood-tag-modal"
          role="dialog"
          aria-modal="true"
          aria-label="기분 태그 관리"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="bookmark-modal-header">
            <div>
              <p className="bookmark-panel-eyebrow">MOOD</p>
              <h2>기분 태그</h2>
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

          {editingTag ? (
            <p className="bookmark-form-hint">
              {editingTag.name} 태그 수정 중
            </p>
          ) : null}
          <form
            className="bookmark-category-add"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmitTag();
            }}
          >
            <input
              type="text"
              value={name}
              maxLength={40}
              placeholder={
                editingTag ? "기분 태그 이름" : "새 기분 태그"
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
              {editingTag ? "저장" : "추가"}
            </button>
            {editingTag ? (
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

          {tags.length === 0 ? (
            <p className="bookmark-empty-row">
              아직 기분 태그가 없습니다.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={tags.map((tag) => tag.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="bookmark-category-list">
                  {tags.map((tag) => (
                    <SortableMoodTagItem
                      key={tag.id}
                      tag={tag}
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
            삭제한 태그를 선택한 날짜 기록은 기분 없음으로 바뀝니다.
          </p>
        </div>
      </div>
  );
}

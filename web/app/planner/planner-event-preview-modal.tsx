import Link from "next/link";

import { formatDateTime } from "@/lib/datetime";

import type { PlannerEvent, PlannerEventPreview } from "./planner-types";
import { ACTION_LABELS, ENTITY_LABELS } from "./planner-types";
import { changeValue, fieldLabel } from "./planner-utils";

interface PlannerEventPreviewModalProps {
  event: PlannerEvent;
  preview: PlannerEventPreview | null;
  previewLoading: boolean;
  onClose: () => void;
  onRestoreCompleted: (event: PlannerEvent) => void;
}

export function PlannerEventPreviewModal({
  event,
  preview,
  previewLoading,
  onClose,
  onRestoreCompleted,
}: PlannerEventPreviewModalProps) {
  const previewFields = preview?.fields ?? {};
  const fieldEntries = Object.entries(previewFields).filter(
    ([key, value]) => key !== "tags" && Boolean(value),
  );
  const rawTags = preview?.tags ?? [];
  const tags =
    rawTags.length > 0
      ? rawTags
      : (previewFields.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
  const hasContent = Boolean(preview?.content_html);

  return (
    <div
      className="planner-modal-overlay is-event"
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`planner-modal${hasContent ? " is-event-preview" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="변경 이력 상세"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="planner-modal-header">
          <div>
            <p className="planner-modal-eyebrow">
              {ENTITY_LABELS[event.entity_type] ||
                event.entity_type}
              {" · "}
              {ACTION_LABELS[event.action] ||
                event.action}
            </p>
            <h2>{event.title || "제목 없음"}</h2>
            <p className="planner-modal-time">
              {formatDateTime(event.occurred_at)}
            </p>
          </div>
          <button
            type="button"
            className="planner-icon-button"
            aria-label="닫기"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {event.notes ? (
          <div className="planner-event-notes">
            <h3>메모</h3>
            <p>{event.notes}</p>
          </div>
        ) : null}

        {event.changes && event.changes.length > 0 ? (
          <div className="planner-change-list">
            {event.changes.map((change, index) => (
              <div className="planner-change" key={`${change.field}-${index}`}>
                <strong>{fieldLabel(change.field)}</strong>
                {change.kind === "text" ||
                change.kind === "value" ? (
                  <>
                    <p className="planner-change-before">
                      {changeValue(change.before)}
                    </p>
                    <p className="planner-change-after">
                      {changeValue(change.after)}
                    </p>
                  </>
                ) : change.kind === "image_changed" ? (
                  <p>이미지가 변경되었습니다.</p>
                ) : change.kind === "link_changed" ? (
                  <p>링크가 변경되었습니다.</p>
                ) : change.kind === "password_changed" ? (
                  <p>비밀번호가 변경되었습니다.</p>
                ) : (
                  <p>내용이 변경되었습니다.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="planner-empty">
            {event.action === "created"
              ? "새로 생성된 항목입니다."
              : event.action === "deleted"
                ? "삭제된 항목입니다. 스냅샷은 보관하지 않습니다."
                : event.action === "completed"
                  ? "완료된 일정입니다. 완료 이력만 보관합니다."
                  : "저장된 상세 변경 내용이 없습니다."}
          </p>
        )}

        <div className="planner-preview">
          <h3>현재 내용</h3>
          {previewLoading ? (
            <p className="planner-status">불러오는 중...</p>
          ) : preview?.available ? (
            <>
              {preview.title ? (
                <p className="planner-preview-title">
                  <span>현재 제목</span>
                  <strong>{preview.title}</strong>
                </p>
              ) : null}
              {preview.summary ? (
                <p className="planner-preview-summary">
                  {preview.summary}
                </p>
              ) : null}
              {fieldEntries.length > 0 ? (
                <dl className="planner-preview-fields">
                  {fieldEntries.map(([key, value]) => (
                    <div key={key}>
                      <dt>{fieldLabel(key)}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {preview.content_html ? (
                <div
                  className="planner-preview-content"
                  dangerouslySetInnerHTML={{
                    __html: preview.content_html,
                  }}
                />
              ) : null}
              {tags.length > 0 ? (
                <div className="tag-list planner-preview-tags">
                  {tags.map((tag, index) => (
                    <span className="tag" key={`${tag}-${index}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {preview.detail_url ? (
                <Link
                  className="planner-preview-detail-link"
                  href={preview.detail_url}
                >
                  상세 페이지로 이동
                </Link>
              ) : null}
              {!preview.title &&
              !preview.summary &&
              !preview.content_html &&
              fieldEntries.length === 0 &&
              tags.length === 0 ? (
                <p className="planner-empty">
                  표시할 현재 내용이 없습니다.
                </p>
              ) : null}
            </>
          ) : (
            <p className="planner-empty">
              삭제되었거나 완료된 항목이라 현재 내용을 볼 수 없습니다.
            </p>
          )}
        </div>

        {event.action === "completed" &&
        event.entity_type === "task" ? (
          <div className="planner-event-restore">
            <p className="planner-empty">
              완료한 일정을 새 일정으로 다시 만들 수 있습니다.
              시작일은 새 일정 폼에서 설정하세요.
            </p>
            <button
              type="button"
              className="planner-primary"
              onClick={() =>
                onRestoreCompleted(event)
              }
            >
              새 일정으로 다시 만들기
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

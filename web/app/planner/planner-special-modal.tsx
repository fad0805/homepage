import type { FormEventHandler } from "react";

import type {
  PlannerSpecialDate,
  SpecialDateKind,
  SpecialModalTab,
} from "./planner-types";
import { specialDdayLabel } from "./planner-utils";

interface PlannerSpecialModalProps {
  tab: SpecialModalTab;
  ddayCount: number;
  filtered: PlannerSpecialDate[];
  kind: SpecialDateKind;
  title: string;
  month: number;
  day: number;
  eventDate: string;
  pinned: boolean;
  editingSpecial: PlannerSpecialDate | null;
  editingId: number | null;
  saving: boolean;
  search: string;
  onClose: () => void;
  onTabChange: (tab: SpecialModalTab) => void;
  onKindChange: (kind: SpecialDateKind) => void;
  onTitleChange: (title: string) => void;
  onMonthChange: (month: number) => void;
  onDayChange: (day: number) => void;
  onEventDateChange: (value: string) => void;
  onPinnedChange: (pinned: boolean) => void;
  onSearchChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onDelete: (item: PlannerSpecialDate) => void;
  onReset: () => void;
  onStartEdit: (item: PlannerSpecialDate) => void;
  onTogglePin: (item: PlannerSpecialDate) => void;
}

export function PlannerSpecialModal({
  tab,
  ddayCount,
  filtered,
  kind,
  title,
  month,
  day,
  eventDate,
  pinned,
  editingSpecial,
  editingId,
  saving,
  search,
  onClose,
  onTabChange,
  onKindChange,
  onTitleChange,
  onMonthChange,
  onDayChange,
  onEventDateChange,
  onPinnedChange,
  onSearchChange,
  onSubmit,
  onDelete,
  onReset,
  onStartEdit,
  onTogglePin,
}: PlannerSpecialModalProps) {
  return (
    <div
      className="planner-modal-overlay is-task"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="planner-modal planner-task-modal planner-special-modal"
        role="dialog"
        aria-modal="true"
        aria-label="기념일 관리"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="planner-special-modal-top">
          <button
            type="button"
            className="planner-text-button"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        <div className="planner-special-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "form"}
            className={tab === "form" ? "is-active" : ""}
            onClick={() => onTabChange("form")}
          >
            등록
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "list"}
            className={tab === "list" ? "is-active" : ""}
            onClick={() => onTabChange("list")}
          >
            디데이 목록 {ddayCount}
          </button>
        </div>

        {tab === "form" ? (
          <form
            className="planner-form is-modal"
            onSubmit={onSubmit}
          >
          <div className="planner-segmented" role="group">
            <button
              type="button"
              className={kind === "yearly" ? "is-active" : ""}
              onClick={() => onKindChange("yearly")}
            >
              기념일
            </button>
            <button
              type="button"
              className={kind === "dday" ? "is-active" : ""}
              onClick={() => onKindChange("dday")}
            >
              디데이
            </button>
          </div>
          <label>
            <span>이름</span>
            <input
              type="text"
              value={title}
              maxLength={255}
              required
              placeholder={
                kind === "yearly"
                  ? "생일, 기념일"
                  : "디데이 이름"
              }
              onChange={(event) =>
                onTitleChange(event.target.value)
              }
            />
          </label>
          {kind === "yearly" ? (
            <div className="planner-date-row">
              <label>
                <span>월</span>
                <select
                  value={month}
                  onChange={(event) =>
                    onMonthChange(Number(event.target.value))
                  }
                >
                  {Array.from({ length: 12 }, (_, index) => (
                    <option value={index + 1} key={index + 1}>
                      {index + 1}월
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>일</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={day}
                  onChange={(event) =>
                    onDayChange(Number(event.target.value))
                  }
                />
              </label>
            </div>
          ) : (
            <label>
              <span>날짜</span>
              <input
                type="date"
                value={eventDate}
                required
                onChange={(event) =>
                  onEventDateChange(event.target.value)
                }
              />
            </label>
          )}
          {kind === "dday" ? (
            <label className="planner-checkbox planner-special-pin">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(event) =>
                  onPinnedChange(event.target.checked)
                }
              />
              <span>
                날짜가 지나도 D+ 카운트로 계속 표시
              </span>
            </label>
          ) : null}
          <div className="planner-form-actions">
            {editingSpecial !== null ? (
              <button
                type="button"
                className="planner-text-button is-danger planner-special-delete"
                disabled={saving}
                onClick={() => void onDelete(editingSpecial)}
              >
                삭제
              </button>
            ) : null}
            {editingId !== null ? (
              <button
                type="button"
                className="planner-text-button"
                onClick={onReset}
              >
                새로 등록
              </button>
            ) : null}
            <button
              type="submit"
              className="planner-primary"
              disabled={saving || !title.trim()}
            >
              {saving
                ? "저장 중..."
                : editingId !== null
                  ? "수정 저장"
                  : "등록"}
            </button>
          </div>
          </form>
        ) : (
          <div className="planner-special-manager">
            <input
              type="search"
              className="planner-special-search"
              value={search}
              placeholder="이름으로 디데이 검색"
              aria-label="디데이 검색"
              onChange={(event) =>
                onSearchChange(event.target.value)
              }
            />
            <div className="planner-special-list">
              {filtered.length === 0 ? (
                <p className="planner-empty">
                  {ddayCount === 0
                    ? "아직 등록된 디데이가 없습니다."
                    : "검색 결과가 없습니다."}
                </p>
              ) : (
                filtered.map((item) => (
                  <div className="planner-special-item" key={item.id}>
                    <button
                      type="button"
                      className="planner-special-main"
                      onClick={() => onStartEdit(item)}
                    >
                      <strong>{item.title}</strong>
                      <span>
                        {item.kind === "yearly"
                          ? `매년 ${item.month}월 ${item.day}일`
                          : `${item.event_date} · ${specialDdayLabel(
                              item.event_date ?? "",
                            )}`}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`planner-text-button planner-special-pin-toggle${
                        item.pinned ? " is-active" : ""
                      }`}
                      aria-pressed={item.pinned}
                      disabled={saving}
                      onClick={() => void onTogglePin(item)}
                    >
                      {item.pinned ? "고정 해제" : "고정"}
                    </button>
                    <button
                      type="button"
                      className="planner-text-button is-danger"
                      disabled={saving}
                      onClick={() => void onDelete(item)}
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import type { FormEventHandler } from "react";

import type {
  CalendarModalTab,
  PlannerDateMarker,
  PlannerDateMarkerIntervalInput,
  PlannerDateMarkerIntervalUnit,
  PlannerSpecialDate,
} from "./planner-types";
import { formatDateOnly, specialDdayLabel } from "./planner-utils";

interface PlannerSpecialModalProps {
  tab: CalendarModalTab;
  onTabChange: (tab: CalendarModalTab) => void;

  specialTitle: string;
  specialMonth: number;
  specialDay: number;
  editingSpecial: PlannerSpecialDate | null;
  editingSpecialId: number | null;
  specialSaving: boolean;
  onSpecialTitleChange: (title: string) => void;
  onSpecialMonthChange: (month: number) => void;
  onSpecialDayChange: (day: number) => void;
  onSubmitSpecial: FormEventHandler<HTMLFormElement>;
  onDeleteSpecial: (item: PlannerSpecialDate) => void;
  onResetSpecial: () => void;

  ddayCount: number;
  filteredDdays: PlannerDateMarker[];
  markerTitle: string;
  markerMemo: string;
  markerDate: string;
  markerIsDday: boolean;
  markerPinned: boolean;
  markerIntervals: PlannerDateMarkerIntervalInput[];
  editingMarker: PlannerDateMarker | null;
  editingMarkerId: number | null;
  markerSaving: boolean;
  markerSearch: string;
  onMarkerTitleChange: (title: string) => void;
  onMarkerMemoChange: (memo: string) => void;
  onMarkerDateChange: (date: string) => void;
  onMarkerIsDdayChange: (isDday: boolean) => void;
  onMarkerPinnedChange: (pinned: boolean) => void;
  onAddMarkerInterval: () => void;
  onMarkerIntervalChange: (
    index: number,
    patch: Partial<PlannerDateMarkerIntervalInput>,
  ) => void;
  onRemoveMarkerInterval: (index: number) => void;
  onMarkerSearchChange: (value: string) => void;
  onSubmitMarker: FormEventHandler<HTMLFormElement>;
  onDeleteMarker: (item: PlannerDateMarker) => void;
  onResetMarker: () => void;
  onStartEditMarker: (item: PlannerDateMarker) => void;
  onToggleMarkerPin: (item: PlannerDateMarker) => void;

  onClose: () => void;
}

export function PlannerSpecialModal({
  tab,
  onTabChange,
  specialTitle,
  specialMonth,
  specialDay,
  editingSpecial,
  editingSpecialId,
  specialSaving,
  onSpecialTitleChange,
  onSpecialMonthChange,
  onSpecialDayChange,
  onSubmitSpecial,
  onDeleteSpecial,
  onResetSpecial,
  ddayCount,
  filteredDdays,
  markerTitle,
  markerMemo,
  markerDate,
  markerIsDday,
  markerPinned,
  markerIntervals,
  editingMarker,
  editingMarkerId,
  markerSaving,
  markerSearch,
  onMarkerTitleChange,
  onMarkerMemoChange,
  onMarkerDateChange,
  onMarkerIsDdayChange,
  onMarkerPinnedChange,
  onAddMarkerInterval,
  onMarkerIntervalChange,
  onRemoveMarkerInterval,
  onMarkerSearchChange,
  onSubmitMarker,
  onDeleteMarker,
  onResetMarker,
  onStartEditMarker,
  onToggleMarkerPin,
  onClose,
}: PlannerSpecialModalProps) {
  return (
    <div
      className="planner-modal-overlay is-task"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="planner-modal planner-task-modal planner-special-modal planner-date-marker-modal"
        role="dialog"
        aria-modal="true"
        aria-label="기념일과 마커 관리"
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
            aria-selected={tab === "yearly"}
            className={tab === "yearly" ? "is-active" : ""}
            onClick={() => onTabChange("yearly")}
          >
            기념일
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "marker"}
            className={tab === "marker" ? "is-active" : ""}
            onClick={() => onTabChange("marker")}
          >
            마커
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "dday"}
            className={tab === "dday" ? "is-active" : ""}
            onClick={() => onTabChange("dday")}
          >
            디데이 {ddayCount}
          </button>
        </div>

        {tab === "yearly" ? (
          <form className="planner-form is-modal" onSubmit={onSubmitSpecial}>
            <label>
              <span>이름</span>
              <input
                type="text"
                value={specialTitle}
                maxLength={255}
                required
                placeholder="생일, 기념일"
                onChange={(event) =>
                  onSpecialTitleChange(event.target.value)
                }
              />
            </label>
            <div className="planner-date-row">
              <label>
                <span>월</span>
                <select
                  value={specialMonth}
                  onChange={(event) =>
                    onSpecialMonthChange(Number(event.target.value))
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
                  value={specialDay}
                  onChange={(event) =>
                    onSpecialDayChange(Number(event.target.value))
                  }
                />
              </label>
            </div>
            <div className="planner-form-actions">
              {editingSpecial !== null ? (
                <button
                  type="button"
                  className="planner-text-button is-danger planner-special-delete"
                  disabled={specialSaving}
                  onClick={() => void onDeleteSpecial(editingSpecial)}
                >
                  삭제
                </button>
              ) : null}
              {editingSpecialId !== null ? (
                <button
                  type="button"
                  className="planner-text-button"
                  onClick={onResetSpecial}
                >
                  새로 등록
                </button>
              ) : null}
              <button
                type="submit"
                className="planner-primary"
                disabled={specialSaving || !specialTitle.trim()}
              >
                {specialSaving
                  ? "저장 중..."
                  : editingSpecialId !== null
                    ? "수정 저장"
                    : "등록"}
              </button>
            </div>
          </form>
        ) : tab === "marker" ? (
          <form className="planner-form is-modal" onSubmit={onSubmitMarker}>
            <label>
              <span>이름</span>
              <input
                type="text"
                value={markerTitle}
                maxLength={255}
                required
                placeholder="첫 글자는 마커로 캘린더에 표시됩니다"
                onChange={(event) =>
                  onMarkerTitleChange(event.target.value)
                }
              />
            </label>
            <label>
              <span>날짜</span>
              <input
                type="date"
                value={markerDate}
                required
                onChange={(event) =>
                  onMarkerDateChange(event.target.value)
                }
              />
            </label>
            {markerIsDday && markerDate ? (
              <p className="planner-marker-dday-preview">
                저장한 날짜 기준 {specialDdayLabel(markerDate)}
              </p>
            ) : null}
            <label>
              <span>메모</span>
              <textarea
                value={markerMemo}
                rows={3}
                maxLength={4000}
                placeholder="메모를 남겨두세요."
                onChange={(event) =>
                  onMarkerMemoChange(event.target.value)
                }
              />
            </label>
            <label className="planner-checkbox planner-special-pin">
              <input
                type="checkbox"
                checked={markerIsDday}
                onChange={(event) =>
                  onMarkerIsDdayChange(event.target.checked)
                }
              />
              <span>디데이로 설정</span>
            </label>
            {markerIsDday ? (
              <>
                <label className="planner-checkbox planner-special-pin">
                  <input
                    type="checkbox"
                    checked={markerPinned}
                    onChange={(event) =>
                      onMarkerPinnedChange(event.target.checked)
                    }
                  />
                  <span>날짜 상세에 D+ 카운트로 고정 표시</span>
                </label>
                <div className="planner-marker-intervals">
                  <span className="planner-marker-intervals-label">
                    달력 표시 간격
                  </span>
                  {markerIntervals.length > 0 ? (
                    <div className="planner-marker-interval-list">
                      {markerIntervals.map((interval, index) => (
                        <div
                          className="planner-marker-interval-row"
                          key={index}
                        >
                          <input
                            type="number"
                            min={1}
                            max={3650}
                            step={1}
                            value={interval.value}
                            placeholder={
                              interval.unit === "year" ? "1" : "100"
                            }
                            aria-label="달력 표시 간격 값"
                            onChange={(event) =>
                              onMarkerIntervalChange(index, {
                                value: event.target.value,
                              })
                            }
                          />
                          <select
                            value={interval.unit}
                            aria-label="달력 표시 간격 단위"
                            onChange={(event) =>
                              onMarkerIntervalChange(index, {
                                unit: event.target
                                  .value as PlannerDateMarkerIntervalUnit,
                              })
                            }
                          >
                            <option value="day">일마다</option>
                            <option value="year">년마다</option>
                          </select>
                          <button
                            type="button"
                            className="planner-text-button is-danger"
                            aria-label="달력 표시 간격 삭제"
                            onClick={() => onRemoveMarkerInterval(index)}
                          >
                            삭제
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="planner-text-button planner-marker-interval-add"
                    onClick={onAddMarkerInterval}
                  >
                    + 간격 추가
                  </button>
                  <p className="planner-marker-hint">
                    여러 간격을 추가하면 모두 달력에 표시됩니다. 비우면
                    저장한 날짜에만 표시합니다.
                  </p>
                </div>
              </>
            ) : null}
            <div className="planner-form-actions">
              {editingMarker !== null ? (
                <button
                  type="button"
                  className="planner-text-button is-danger planner-special-delete"
                  disabled={markerSaving}
                  onClick={() => void onDeleteMarker(editingMarker)}
                >
                  삭제
                </button>
              ) : null}
              {editingMarkerId !== null ? (
                <button
                  type="button"
                  className="planner-text-button"
                  onClick={onResetMarker}
                >
                  새로 등록
                </button>
              ) : null}
              <button
                type="submit"
                className="planner-primary"
                disabled={markerSaving || !markerTitle.trim()}
              >
                {markerSaving
                  ? "저장 중..."
                  : editingMarkerId !== null
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
              value={markerSearch}
              placeholder="이름으로 디데이 검색"
              aria-label="디데이 검색"
              onChange={(event) =>
                onMarkerSearchChange(event.target.value)
              }
            />
            <p className="planner-marker-hint">
              단순 마커는 목록에 표시하지 않습니다. 달력이나 날짜
              상세에서 마커를 눌러 내용을 확인하세요.
            </p>
            <div className="planner-special-list">
              {filteredDdays.length === 0 ? (
                <p className="planner-empty">
                  {ddayCount === 0
                    ? "아직 등록된 디데이가 없습니다."
                    : "검색 결과가 없습니다."}
                </p>
              ) : (
                filteredDdays.map((item) => (
                  <div className="planner-special-item" key={item.id}>
                    <button
                      type="button"
                      className="planner-special-main"
                      onClick={() => onStartEditMarker(item)}
                    >
                      <span className="planner-special-title-row">
                        <span className="planner-special-marker">
                          {item.marker}
                        </span>
                        <strong>{item.title}</strong>
                      </span>
                      <span>
                        {formatDateOnly(item.marker_date)} ·{" "}
                        {specialDdayLabel(item.marker_date)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`planner-text-button planner-special-pin-toggle${
                        item.pinned ? " is-active" : ""
                      }`}
                      aria-pressed={item.pinned}
                      disabled={markerSaving}
                      onClick={() => void onToggleMarkerPin(item)}
                    >
                      {item.pinned ? "고정 해제" : "고정"}
                    </button>
                    <button
                      type="button"
                      className="planner-text-button is-danger"
                      disabled={markerSaving}
                      onClick={() => void onDeleteMarker(item)}
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

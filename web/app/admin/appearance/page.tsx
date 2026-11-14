"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  DEFAULT_LAYOUT,
  DEFAULT_SIDE_POSITION,
  LAYOUT_OPTIONS,
  SIDE_POSITION_OPTIONS,
  type LayoutKey,
  type SidePosition,
} from "@/config/appearance";
import { apiFetch } from "@/lib/api";
import {
  clearAppearancePreview,
  getAppearancePreview,
  setAppearancePreview,
} from "@/lib/appearance-preview";

import "@/public/styles/admin/appearance.scss";

interface Appearance {
  layout_key: LayoutKey;
  side_position: SidePosition;
}

type Notice = { type: "success" | "error"; text: string };

export default function AdminAppearance() {
  const router = useRouter();
  const [layoutKey, setLayoutKey] = useState<LayoutKey>(DEFAULT_LAYOUT);
  const [savedLayoutKey, setSavedLayoutKey] =
    useState<LayoutKey>(DEFAULT_LAYOUT);
  const [sidePosition, setSidePosition] =
    useState<SidePosition>(DEFAULT_SIDE_POSITION);
  const [savedSidePosition, setSavedSidePosition] =
    useState<SidePosition>(DEFAULT_SIDE_POSITION);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Appearance>(
        "/api/users/me/appearance",
      );
      const savedSide =
        data.side_position ?? DEFAULT_SIDE_POSITION;
      const activePreview = getAppearancePreview();

      setSavedLayoutKey(data.layout_key);
      setSavedSidePosition(savedSide);
      setLayoutKey(activePreview?.layoutKey ?? data.layout_key);
      setSidePosition(activePreview?.sidePosition ?? savedSide);
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "외관 설정을 불러오지 못했습니다.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const data = await apiFetch<Appearance>(
        "/api/users/me/appearance",
        {
          method: "PUT",
          body: JSON.stringify({
            layout_key: layoutKey,
            side_position: sidePosition,
          }),
        },
      );
      const savedSide =
        data.side_position ?? DEFAULT_SIDE_POSITION;

      setLayoutKey(data.layout_key);
      setSavedLayoutKey(data.layout_key);
      setSidePosition(savedSide);
      setSavedSidePosition(savedSide);
      setAppearancePreview({
        layoutKey: data.layout_key,
        sidePosition: savedSide,
      });
      document.documentElement.dataset.appearance = data.layout_key;
      router.refresh();
      setNotice({
        type: "success",
        text: "외관 설정을 저장했습니다.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "외관 설정을 저장하지 못했습니다.",
      });
    } finally {
      setSaving(false);
    }
  };

  const saved =
    LAYOUT_OPTIONS.find((option) => option.key === savedLayoutKey) ??
    LAYOUT_OPTIONS[0];
  const isDirty =
    layoutKey !== savedLayoutKey ||
    sidePosition !== savedSidePosition;
  const savedSideLabel =
    savedSidePosition === "right" ? "오른쪽" : "왼쪽";

  return (
    <div id="admin-appearance">
      <header className="admin-appearance-header">
        <div>
          <h1>외관 관리</h1>
          <p className="admin-appearance-hint">
            레이아웃을 선택하면 이 화면에 바로 임시 적용됩니다.
            저장해야 사이트에 반영됩니다.
          </p>
        </div>
        <span className="admin-appearance-current">
          현재 적용: {saved.label}
          {savedLayoutKey === "side" ? ` · ${savedSideLabel}` : ""}
        </span>
      </header>

      {notice ? (
        <div className={`admin-notice admin-notice-${notice.type}`}>
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <p className="admin-appearance-hint">불러오는 중...</p>
      ) : (
        <div className="admin-appearance-form">
          <div className="admin-appearance-layout">
            <div className="admin-appearance-menu">
              <div
                className="admin-appearance-list"
                role="radiogroup"
                aria-label="레이아웃 선택"
              >
            {LAYOUT_OPTIONS.map((option) => {
              const isSelected = layoutKey === option.key;

              return (
                <div
                  key={option.key}
                  className={`admin-appearance-card${
                    isSelected ? " is-selected" : ""
                  }`}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className="admin-appearance-card__select"
                    onClick={() => {
                      setLayoutKey(option.key);
                      setAppearancePreview({
                        layoutKey: option.key,
                        sidePosition,
                      });
                    }}
                  >
                    {isSelected ? (
                      <span className="admin-appearance-card__selected">
                        ✓ 선택됨
                      </span>
                    ) : null}
                    <span className="admin-appearance-card__heading">
                      <strong>{option.label}</strong>
                      <span>{option.englishLabel}</span>
                    </span>
                    <span className="admin-appearance-card__description">
                      {option.description}
                    </span>
                  </button>

                  {isSelected && option.key === "side" ? (
                    <div className="admin-appearance-card__side-position">
                      <span className="admin-appearance-card__side-label">
                        메뉴 위치
                      </span>
                      <div
                        className="admin-appearance-side-position"
                        role="radiogroup"
                        aria-label="사이드 메뉴 위치"
                      >
                        <div className="admin-appearance-side-position__options">
                          {SIDE_POSITION_OPTIONS.map((sideOption) => (
                            <label
                              key={sideOption.key}
                              className={
                                sidePosition === sideOption.key
                                  ? "is-selected"
                                  : ""
                              }
                            >
                              <input
                                type="radio"
                                name="side-position"
                                value={sideOption.key}
                                checked={sidePosition === sideOption.key}
                                onChange={() => {
                                  setSidePosition(sideOption.key);
                                  setAppearancePreview({
                                    layoutKey,
                                    sidePosition: sideOption.key,
                                  });
                                }}
                              />
                              <span>{sideOption.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

            </div>

          </div>

          <div className="admin-appearance-footer">
            <div className="admin-appearance-actions">
              <button
                type="button"
                className="admin-button"
                onClick={() => {
                  setLayoutKey(savedLayoutKey);
                  setSidePosition(savedSidePosition);
                  clearAppearancePreview();
                }}
                disabled={saving || !isDirty}
              >
                되돌리기
              </button>
              <button
                type="button"
                className="admin-button primary"
                onClick={() => void handleSave()}
                disabled={saving || !isDirty}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

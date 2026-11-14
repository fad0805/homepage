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

import "@/public/styles/appearance.scss";
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
      setLayoutKey(data.layout_key);
      setSavedLayoutKey(data.layout_key);
      setSidePosition(data.side_position ?? DEFAULT_SIDE_POSITION);
      setSavedSidePosition(data.side_position ?? DEFAULT_SIDE_POSITION);
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
      setLayoutKey(data.layout_key);
      setSavedLayoutKey(data.layout_key);
      setSidePosition(data.side_position ?? DEFAULT_SIDE_POSITION);
      setSavedSidePosition(
        data.side_position ?? DEFAULT_SIDE_POSITION,
      );
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
            사이트 전체의 메뉴 위치와 접힘 방식을 선택합니다. 설정은
            작가별로 저장됩니다.
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
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`admin-appearance-card${
                    isSelected ? " is-selected" : ""
                  }`}
                  onClick={() => setLayoutKey(option.key)}
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
              );
            })}
          </div>

            </div>

            <section className="admin-appearance-preview-section">
            <div
              aria-label="레이아웃 미리보기"
              className={`admin-appearance-preview is-${layoutKey}${
                layoutKey === "side" && sidePosition === "right"
                  ? " is-side-right"
                  : ""
              }`}
            >
              <div className="admin-appearance-preview__shell">
                <aside className="admin-appearance-preview__sidebar">
                  <span className="admin-appearance-preview__brand">
                    어디에도 없는 섬
                  </span>
                  <nav className="admin-appearance-preview__side-nav">
                    <span>작가소개</span>
                    <span>등장인물</span>
                    <span>목차</span>
                    <span>삽화</span>
                  </nav>
                  <span className="admin-appearance-preview__collapse">
                    «
                  </span>
                </aside>

                <div className="admin-appearance-preview__main">
                  <header className="admin-appearance-preview__topbar">
                    <span className="admin-appearance-preview__hamburger">
                      ☰
                    </span>
                    <span className="admin-appearance-preview__brand">
                      어디에도 없는 섬
                    </span>
                    <nav className="admin-appearance-preview__nav">
                      <span>작가소개</span>
                      <span>등장인물</span>
                      <span>목차</span>
                      <span>삽화</span>
                    </nav>
                  </header>

                  <div className="admin-appearance-preview__content">
                    <section className="admin-appearance-preview__hero">
                      <p className="admin-appearance-preview__eyebrow">
                        MISSING ISLAND
                      </p>
                      <h3>당신은 어떤 이야기를 가지고 있나요?</h3>
                      <p className="admin-appearance-preview__lead">
                        선택한 레이아웃에 따라 메뉴의 위치와 접힘 방식이
                        달라집니다. 색상은 현재 테마를 그대로 유지합니다.
                      </p>
                    </section>

                    <section className="admin-appearance-preview__cards">
                      <article>
                        <span />
                        <strong>작가소개</strong>
                      </article>
                      <article>
                        <span />
                        <strong>목차</strong>
                      </article>
                      <article>
                        <span />
                        <strong>삽화</strong>
                      </article>
                    </section>
                  </div>

                  <nav className="admin-appearance-preview__bottom-nav">
                    <span>작가소개</span>
                    <span>등장인물</span>
                    <span>목차</span>
                    <span>삽화</span>
                  </nav>
                </div>
              </div>
            </div>
            </section>
          </div>

          <div className="admin-appearance-footer">
            {layoutKey === "side" ? (
              <div
                className="admin-appearance-side-position"
                role="radiogroup"
                aria-label="사이드 메뉴 위치"
              >
                <div className="admin-appearance-side-position__options">
                  {SIDE_POSITION_OPTIONS.map((option) => (
                    <label
                      key={option.key}
                      className={
                        sidePosition === option.key
                          ? "is-selected"
                          : ""
                      }
                    >
                      <input
                        type="radio"
                        name="side-position"
                        value={option.key}
                        checked={sidePosition === option.key}
                        onChange={() => setSidePosition(option.key)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="admin-appearance-actions">
              <button
                type="button"
                className="admin-button"
                onClick={() => {
                  setLayoutKey(savedLayoutKey);
                  setSidePosition(savedSidePosition);
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

"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  DEFAULT_LAYOUT,
  LAYOUT_OPTIONS,
  type LayoutKey,
} from "@/config/appearance";
import { apiFetch } from "@/lib/api";

import "@/public/styles/appearance.scss";
import "@/public/styles/admin/appearance.scss";

interface Appearance {
  layout_key: LayoutKey;
}

type Notice = { type: "success" | "error"; text: string };

export default function AdminAppearance() {
  const router = useRouter();
  const [layoutKey, setLayoutKey] = useState<LayoutKey>(DEFAULT_LAYOUT);
  const [savedLayoutKey, setSavedLayoutKey] =
    useState<LayoutKey>(DEFAULT_LAYOUT);
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
          body: JSON.stringify({ layout_key: layoutKey }),
        },
      );
      setLayoutKey(data.layout_key);
      setSavedLayoutKey(data.layout_key);
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

  const selected =
    LAYOUT_OPTIONS.find((option) => option.key === layoutKey) ??
    LAYOUT_OPTIONS[0];
  const saved =
    LAYOUT_OPTIONS.find((option) => option.key === savedLayoutKey) ??
    LAYOUT_OPTIONS[0];

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
          <div
            className="admin-appearance-grid"
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
                  <span
                    className={`admin-appearance-card__preview is-${option.key}`}
                  >
                    <span className="admin-appearance-card__mini">
                      <span className="admin-appearance-card__mini-nav">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="admin-appearance-card__mini-main">
                        <span className="admin-appearance-card__brand">
                          어디에도 없는 섬
                        </span>
                        <span className="admin-appearance-card__line" />
                        <span className="admin-appearance-card__line is-short" />
                      </span>
                    </span>
                  </span>
                  <span className="admin-appearance-card__body">
                    <span className="admin-appearance-card__heading">
                      <strong>{option.label}</strong>
                      <span>{option.englishLabel}</span>
                    </span>
                    <span className="admin-appearance-card__description">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <section className="admin-appearance-preview-section">
            <header>
              <h2>미리보기</h2>
              <span>{selected.label}</span>
            </header>
            <div
              className={`admin-appearance-preview is-${layoutKey}`}
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

          <div className="admin-appearance-actions">
            <button
              type="button"
              className="admin-button"
              onClick={() => setLayoutKey(savedLayoutKey)}
              disabled={saving || layoutKey === savedLayoutKey}
            >
              되돌리기
            </button>
            <button
              type="button"
              className="admin-button primary"
              onClick={() => void handleSave()}
              disabled={saving || layoutKey === savedLayoutKey}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useTheme, type Theme } from "@/components/theme-provider";
import {
  COLOR_THEME_OPTIONS,
  DEFAULT_COLOR_THEME,
  DEFAULT_LAYOUT,
  DEFAULT_SIDE_POSITION,
  DEFAULT_THEME_MODE,
  LAYOUT_OPTIONS,
  SIDE_POSITION_OPTIONS,
  THEME_MODE_OPTIONS,
  getColorThemeOption,
  type ColorThemeKey,
  type LayoutKey,
  type SidePosition,
  type ThemeMode,
} from "@/config/appearance";
import { apiFetch } from "@/lib/api";
import {
  clearAppearancePreview,
  getAppearancePreview,
  setAppearancePreview,
} from "@/lib/appearance-preview";
import {
  normalizeHex,
  type ColorOverrides,
} from "@/lib/color-theme";

import "@/public/styles/admin/appearance.scss";

interface Appearance {
  layout_key: LayoutKey;
  side_position: SidePosition;
  default_theme: ThemeMode;
  color_theme: ColorThemeKey;
  color_background: string | null;
  color_content: string | null;
  color_accent: string | null;
  color_background_dark: string | null;
  color_content_dark: string | null;
  color_accent_dark: string | null;
}

type Notice = { type: "success" | "error"; text: string };

const COLOR_FIELDS = [
  {
    key: "background",
    label: "전체 배경",
    hint: "사이트 바깥쪽 배경",
  },
  {
    key: "content",
    label: "콘텐츠 배경",
    hint: "글과 카드가 놓이는 영역",
  },
  {
    key: "accent",
    label: "포인트",
    hint: "제목과 링크에 쓰이는 색",
  },
] as const;

function overridesFromAppearance(
  data: Appearance,
): ColorOverrides {
  return {
    background: data.color_background,
    content: data.color_content,
    accent: data.color_accent,
    darkBackground: data.color_background_dark,
    darkContent: data.color_content_dark,
    darkAccent: data.color_accent_dark,
  };
}

const OVERRIDE_KEYS = [
  "background",
  "content",
  "accent",
  "darkBackground",
  "darkContent",
  "darkAccent",
] as const;

function sameOverrides(a: ColorOverrides, b: ColorOverrides) {
  return OVERRIDE_KEYS.every(
    (key) => normalizeHex(a[key]) === normalizeHex(b[key]),
  );
}

type ColorMode = "light" | "dark";
type ColorFieldKey = (typeof COLOR_FIELDS)[number]["key"];

const DARK_FIELD_KEYS = {
  background: "darkBackground",
  content: "darkContent",
  accent: "darkAccent",
} as const;

function overrideKeyFor(field: ColorFieldKey, mode: ColorMode) {
  return mode === "light" ? field : DARK_FIELD_KEYS[field];
}

export default function AdminAppearance() {
  const router = useRouter();
  const { theme } = useTheme();
  const initialThemeRef = useRef<Theme | null>(null);
  const [layoutKey, setLayoutKey] = useState<LayoutKey>(DEFAULT_LAYOUT);
  const [savedLayoutKey, setSavedLayoutKey] =
    useState<LayoutKey>(DEFAULT_LAYOUT);
  const [sidePosition, setSidePosition] =
    useState<SidePosition>(DEFAULT_SIDE_POSITION);
  const [savedSidePosition, setSavedSidePosition] =
    useState<SidePosition>(DEFAULT_SIDE_POSITION);
  const [defaultTheme, setDefaultTheme] =
    useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [savedDefaultTheme, setSavedDefaultTheme] =
    useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [colorTheme, setColorTheme] =
    useState<ColorThemeKey>(DEFAULT_COLOR_THEME);
  const [savedColorTheme, setSavedColorTheme] =
    useState<ColorThemeKey>(DEFAULT_COLOR_THEME);
  const [colorOverrides, setColorOverrides] =
    useState<ColorOverrides>({});
  const [savedColorOverrides, setSavedColorOverrides] =
    useState<ColorOverrides>({});
  const [colorMode, setColorMode] = useState<ColorMode>("light");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (initialThemeRef.current === null) {
      initialThemeRef.current = theme;
    }
    setColorMode(theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      const originalTheme = initialThemeRef.current;
      if (originalTheme) {
        document.documentElement.setAttribute(
          "data-theme",
          originalTheme,
        );
      }
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Appearance>(
        "/api/users/me/appearance",
      );
      const savedSide =
        data.side_position ?? DEFAULT_SIDE_POSITION;
      const savedDefaultTheme =
        data.default_theme ?? DEFAULT_THEME_MODE;
      const savedTheme = data.color_theme ?? DEFAULT_COLOR_THEME;
      const savedOverrides = overridesFromAppearance(data);
      const activePreview = getAppearancePreview();

      setSavedLayoutKey(data.layout_key);
      setSavedSidePosition(savedSide);
      setDefaultTheme(savedDefaultTheme);
      setSavedDefaultTheme(savedDefaultTheme);
      setSavedColorTheme(savedTheme);
      setSavedColorOverrides(savedOverrides);
      setLayoutKey(activePreview?.layoutKey ?? data.layout_key);
      setSidePosition(activePreview?.sidePosition ?? savedSide);
      setColorTheme(activePreview?.colorTheme ?? savedTheme);
      setColorOverrides(
        activePreview?.colorOverrides ?? savedOverrides,
      );
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

  const preview = useCallback(
    (next: {
      layoutKey?: LayoutKey;
      sidePosition?: SidePosition;
      colorTheme?: ColorThemeKey;
      colorOverrides?: ColorOverrides;
    }) => {
      setAppearancePreview({
        layoutKey: next.layoutKey ?? layoutKey,
        sidePosition: next.sidePosition ?? sidePosition,
        colorTheme: next.colorTheme ?? colorTheme,
        colorOverrides: next.colorOverrides ?? colorOverrides,
      });
    },
    [colorOverrides, colorTheme, layoutKey, sidePosition],
  );

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
            default_theme: defaultTheme,
            color_theme: colorTheme,
            color_background:
              normalizeHex(colorOverrides.background),
            color_content:
              normalizeHex(colorOverrides.content),
            color_accent: normalizeHex(colorOverrides.accent),
            color_background_dark:
              normalizeHex(colorOverrides.darkBackground),
            color_content_dark:
              normalizeHex(colorOverrides.darkContent),
            color_accent_dark:
              normalizeHex(colorOverrides.darkAccent),
          }),
        },
      );
      const savedSide =
        data.side_position ?? DEFAULT_SIDE_POSITION;
      const savedDefaultTheme =
        data.default_theme ?? DEFAULT_THEME_MODE;
      const savedTheme = data.color_theme ?? DEFAULT_COLOR_THEME;
      const savedOverrides = overridesFromAppearance(data);

      setLayoutKey(data.layout_key);
      setSavedLayoutKey(data.layout_key);
      setSidePosition(savedSide);
      setSavedSidePosition(savedSide);
      setDefaultTheme(savedDefaultTheme);
      setSavedDefaultTheme(savedDefaultTheme);
      setColorTheme(savedTheme);
      setSavedColorTheme(savedTheme);
      setColorOverrides(savedOverrides);
      setSavedColorOverrides(savedOverrides);
      setAppearancePreview({
        layoutKey: data.layout_key,
        sidePosition: savedSide,
        colorTheme: savedTheme,
        colorOverrides: savedOverrides,
      });
      document.documentElement.dataset.appearance = data.layout_key;
      const originalTheme = initialThemeRef.current ?? theme;
      setColorMode(originalTheme);
      document.documentElement.setAttribute(
        "data-theme",
        originalTheme,
      );
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
  const savedColor = getColorThemeOption(savedColorTheme);
  const selectedColor = getColorThemeOption(colorTheme);
  const isDirty =
    layoutKey !== savedLayoutKey ||
    sidePosition !== savedSidePosition ||
    defaultTheme !== savedDefaultTheme ||
    colorTheme !== savedColorTheme ||
    !sameOverrides(colorOverrides, savedColorOverrides);
  const savedSideLabel =
    savedSidePosition === "right" ? "오른쪽" : "왼쪽";

  const modePalette =
    colorMode === "light" ? selectedColor.light : selectedColor.dark;
  const effectiveColors = {
    background:
      normalizeHex(
        colorOverrides[overrideKeyFor("background", colorMode)],
      ) ?? modePalette.background,
    content:
      normalizeHex(
        colorOverrides[overrideKeyFor("content", colorMode)],
      ) ?? modePalette.content,
    accent:
      normalizeHex(
        colorOverrides[overrideKeyFor("accent", colorMode)],
      ) ?? modePalette.accent,
  };
  const hasColorOverride = OVERRIDE_KEYS.some((key) =>
    Boolean(normalizeHex(colorOverrides[key])),
  );

  const setColorField = (
    field: ColorFieldKey,
    value: string | null,
  ) => {
    const key = overrideKeyFor(field, colorMode);
    const next = { ...colorOverrides, [key]: value };
    setColorOverrides(next);
    preview({ colorOverrides: next });
  };

  const toggleColorMode = () => {
    const next: ColorMode =
      colorMode === "light" ? "dark" : "light";
    setColorMode(next);
    document.documentElement.setAttribute("data-theme", next);
  };

  return (
    <div id="admin-appearance">
      <header className="admin-appearance-header">
        <div>
          <h1>외관 관리</h1>
          <p className="admin-appearance-hint">
            레이아웃과 색 테마를 선택하면 이 화면에 바로 임시
            적용됩니다. 저장해야 사이트에 반영됩니다.
          </p>
        </div>
        <span className="admin-appearance-current">
          현재 적용: {saved.label} · {savedColor.label} · 기본{" "}
          {savedDefaultTheme === "dark" ? "다크" : "라이트"}
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
                          preview({ layoutKey: option.key });
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
                                    checked={
                                      sidePosition === sideOption.key
                                    }
                                    onChange={() => {
                                      setSidePosition(sideOption.key);
                                      preview({
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

          <section className="admin-appearance-default-theme">
            <div className="admin-appearance-section-head">
              <div>
                <h2>기본 테마</h2>
                <p className="admin-appearance-hint">
                  저장된 테마가 없는 방문자에게 처음 보여줄
                  라이트/다크 테마를 정합니다. 방문자가 직접
                  전환한 테마는 그대로 유지됩니다.
                </p>
              </div>
            </div>
            <div
              className="admin-appearance-theme-options"
              role="radiogroup"
              aria-label="기본 테마 선택"
            >
              {THEME_MODE_OPTIONS.map((option) => {
                const isSelected = defaultTheme === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`admin-appearance-theme-card${
                      isSelected ? " is-selected" : ""
                    }`}
                    onClick={() => setDefaultTheme(option.key)}
                  >
                    {isSelected ? (
                      <span className="admin-appearance-theme-card__selected">
                        ✓ 선택됨
                      </span>
                    ) : null}
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="admin-appearance-colors">
            <div className="admin-appearance-section-head">
              <div>
                <h2>색 테마</h2>
                <p className="admin-appearance-hint">
                  템플릿을 고른 뒤 라이트/다크 색상을 각각 조정할
                  수 있습니다.
                </p>
              </div>
            </div>

            <div
              className="admin-appearance-color-list"
              role="radiogroup"
              aria-label="색 테마 선택"
            >
              {COLOR_THEME_OPTIONS.map((option) => {
                const isSelected = colorTheme === option.key;

                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`admin-appearance-color-card${
                      isSelected ? " is-selected" : ""
                    }`}
                    onClick={() => {
                      setColorTheme(option.key);
                      setColorOverrides({});
                      preview({
                        colorTheme: option.key,
                        colorOverrides: {},
                      });
                    }}
                  >
                    {isSelected ? (
                      <span className="admin-appearance-color-card__selected">
                        ✓ 선택됨
                      </span>
                    ) : null}
                    <span
                      className="admin-appearance-color-card__swatches"
                      aria-hidden="true"
                    >
                      <i
                        style={{
                          background:
                            colorMode === "light"
                              ? option.light.background
                              : option.dark.background,
                        }}
                      />
                      <i
                        style={{
                          background:
                            colorMode === "light"
                              ? option.light.content
                              : option.dark.content,
                        }}
                      />
                      <i
                        style={{
                          background:
                            colorMode === "light"
                              ? option.light.accent
                              : option.dark.accent,
                        }}
                      />
                    </span>
                    <span className="admin-appearance-color-card__heading">
                      <strong>{option.label}</strong>
                      <span>{option.englishLabel}</span>
                    </span>
                    <span className="admin-appearance-color-card__description">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="admin-appearance-tweaks">
              {COLOR_FIELDS.map((field) => {
                const overrideKey = overrideKeyFor(
                  field.key,
                  colorMode,
                );
                const hasOverride = Boolean(
                  normalizeHex(colorOverrides[overrideKey]),
                );

                return (
                  <div
                    className="admin-appearance-color-row"
                    key={field.key}
                  >
                    <div className="admin-appearance-color-row__text">
                      <strong>{field.label}</strong>
                      <span>{field.hint}</span>
                    </div>
                    <div className="admin-appearance-color-row__control">
                      {hasOverride ? (
                        <button
                          type="button"
                          className="admin-appearance-color-reset"
                          onClick={() => setColorField(field.key, null)}
                        >
                          템플릿 색
                        </button>
                      ) : null}
                      <code>
                        {effectiveColors[field.key].toUpperCase()}
                      </code>
                      <input
                        type="color"
                        aria-label={`${field.label} 색상`}
                        value={effectiveColors[field.key]}
                        onChange={(event) =>
                          setColorField(
                            field.key,
                            event.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                );
              })}

              <div className="admin-appearance-tweaks__footer">
                <span>선택한 템플릿은 유지됩니다.</span>
                <div className="admin-appearance-tweaks__actions">
                  <button
                    type="button"
                    className="admin-appearance-color-mode-toggle"
                    onClick={toggleColorMode}
                    aria-pressed={colorMode === "dark"}
                    aria-label={`${
                      colorMode === "light" ? "라이트" : "다크"
                    } 색상 편집 중, ${
                      colorMode === "light" ? "다크" : "라이트"
                    } 색상으로 전환`}
                  >
                    <span
                      className="admin-appearance-color-mode-toggle__track"
                      aria-hidden="true"
                    >
                      <span />
                    </span>
                    <span>
                      {colorMode === "light"
                        ? "라이트 색상"
                        : "다크 색상"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="admin-button admin-appearance-reset-all"
                    onClick={() => {
                      setColorOverrides({});
                      preview({ colorOverrides: {} });
                    }}
                    disabled={!hasColorOverride}
                  >
                    기본 템플릿으로 되돌리기
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="admin-appearance-footer">
            <div className="admin-appearance-actions">
              <button
                type="button"
                className="admin-button"
                onClick={() => {
                  setLayoutKey(savedLayoutKey);
                  setSidePosition(savedSidePosition);
                  setColorTheme(savedColorTheme);
                  setColorOverrides(savedColorOverrides);
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

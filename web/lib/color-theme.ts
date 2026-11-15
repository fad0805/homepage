import type { CSSProperties } from "react";

import {
  DEFAULT_COLOR_THEME,
  getColorThemeOption,
  type ColorThemeKey,
  type ColorThemePalette,
} from "@/config/appearance";

export interface ColorOverrides {
  background?: string | null;
  content?: string | null;
  accent?: string | null;
  darkBackground?: string | null;
  darkContent?: string | null;
  darkAccent?: string | null;
}

export interface ResolvedColorTheme {
  light: ColorThemePalette & { main: string; sub: string };
  dark: ColorThemePalette & { main: string; sub: string };
}

const LIGHT_TEXT = "#f7f4e8";
const DARK_TEXT = "#171717";
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function normalizeHex(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function hasColorOverrides(overrides: ColorOverrides) {
  return Boolean(
    normalizeHex(overrides.background) ??
      normalizeHex(overrides.content) ??
      normalizeHex(overrides.accent) ??
      normalizeHex(overrides.darkBackground) ??
      normalizeHex(overrides.darkContent) ??
      normalizeHex(overrides.darkAccent),
  );
}

function parseHex(value: string): [number, number, number] {
  return [
    parseInt(value.slice(1, 3), 16),
    parseInt(value.slice(3, 5), 16),
    parseInt(value.slice(5, 7), 16),
  ];
}

function toHex(channels: [number, number, number]) {
  return `#${channels
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Blend two hex colors; `weight` is the share of `a` (0–1). */
export function mixColor(a: string, b: string, weight: number) {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const ratio = Math.max(0, Math.min(1, weight));
  return toHex([
    ar * ratio + br * (1 - ratio),
    ag * ratio + bg * (1 - ratio),
    ab * ratio + bb * (1 - ratio),
  ]);
}

function relativeLuminance(hex: string) {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function pickTextColor(background: string) {
  return contrastRatio(background, DARK_TEXT) >=
    contrastRatio(background, LIGHT_TEXT)
    ? DARK_TEXT
    : LIGHT_TEXT;
}

/** Nudge `foreground` toward black/white until it is readable on `background`. */
function ensureContrast(foreground: string, background: string, min = 4.5) {
  if (contrastRatio(foreground, background) >= min) return foreground;

  const target =
    relativeLuminance(background) > 0.35 ? "#000000" : "#ffffff";
  let next = foreground;

  // Start close to the chosen color and only blend toward the target as
  // much as needed. Using `step / 10` here would jump straight to a nearly
  // black/white color and destroy the selected accent's saturation.
  for (let step = 1; step <= 10; step += 1) {
    next = mixColor(foreground, target, 1 - step / 10);
    if (contrastRatio(next, background) >= min) return next;
  }

  return next;
}

export function resolveColorTheme(
  themeKey: ColorThemeKey,
  overrides: ColorOverrides = {},
): ResolvedColorTheme {
  const option = getColorThemeOption(themeKey ?? DEFAULT_COLOR_THEME);
  const backgroundOverride = normalizeHex(overrides.background);
  const contentOverride = normalizeHex(overrides.content);
  const accentOverride = normalizeHex(overrides.accent);
  const darkBackgroundOverride = normalizeHex(overrides.darkBackground);
  const darkContentOverride = normalizeHex(overrides.darkContent);
  const darkAccentOverride = normalizeHex(overrides.darkAccent);

  const lightBackground =
    backgroundOverride ?? option.light.background;
  const lightContent = contentOverride ?? option.light.content;
  const lightAccent = ensureContrast(
    accentOverride ?? option.light.accent,
    lightContent,
  );
  const lightText = backgroundOverride
    ? pickTextColor(lightBackground)
    : option.light.text;
  const lightInput = contentOverride
    ? mixColor(lightContent, "#ffffff", 0.5)
    : option.light.inputBackground;
  const lightEmpty = backgroundOverride
    ? mixColor(lightBackground, "#000000", 0.86)
    : option.light.emptyBanner;

  const darkBackground = darkBackgroundOverride
    ? darkBackgroundOverride
    : backgroundOverride
      ? mixColor(backgroundOverride, option.dark.background, 0.14)
      : option.dark.background;
  const darkContent = darkContentOverride
    ? darkContentOverride
    : contentOverride
      ? mixColor(contentOverride, option.dark.content, 0.14)
      : option.dark.content;
  const darkAccent = darkAccentOverride
    ? ensureContrast(darkAccentOverride, darkContent)
    : accentOverride
      ? ensureContrast(
          mixColor(accentOverride, "#ffffff", 0.55),
          darkContent,
        )
      : option.dark.accent;
  const darkText =
    darkBackgroundOverride || backgroundOverride
      ? pickTextColor(darkBackground)
      : option.dark.text;
  const darkInput =
    darkContentOverride || contentOverride
      ? darkContent
      : option.dark.inputBackground;
  const darkEmpty = darkBackgroundOverride
    ? mixColor(darkBackground, option.dark.emptyBanner, 0.55)
    : backgroundOverride
      ? mixColor(darkBackground, option.dark.emptyBanner, 0.55)
      : option.dark.emptyBanner;

  return {
    light: {
      main: lightBackground,
      sub: lightContent,
      background: lightBackground,
      content: lightContent,
      accent: lightAccent,
      text: lightText,
      inputBackground: lightInput,
      emptyBanner: lightEmpty,
    },
    dark: {
      main: darkAccent,
      sub: darkContent,
      background: darkBackground,
      content: darkContent,
      accent: darkAccent,
      text: darkText,
      inputBackground: darkInput,
      emptyBanner: darkEmpty,
    },
  };
}

/**
 * Expose one variable per mode. globals.scss maps these into the semantic
 * tokens (`--background`, `--title-color`, ...) for the active `data-theme`,
 * which keeps older mobile browsers working without `light-dark()`.
 */
export function toCssVariables(
  themeKey: ColorThemeKey,
  overrides: ColorOverrides = {},
) {
  const { light, dark } = resolveColorTheme(themeKey, overrides);

  return {
    "--theme-light-main": light.main,
    "--theme-light-sub": light.sub,
    "--theme-light-background": light.background,
    "--theme-light-content": light.content,
    "--theme-light-foreground": light.text,
    "--theme-light-accent": light.accent,
    "--theme-light-input": light.inputBackground,
    "--theme-light-empty": light.emptyBanner,
    "--theme-dark-main": dark.main,
    "--theme-dark-sub": dark.sub,
    "--theme-dark-background": dark.background,
    "--theme-dark-content": dark.content,
    "--theme-dark-foreground": dark.text,
    "--theme-dark-accent": dark.accent,
    "--theme-dark-input": dark.inputBackground,
    "--theme-dark-empty": dark.emptyBanner,
  };
}

export function buildColorThemeStyle(
  themeKey: ColorThemeKey,
  overrides: ColorOverrides = {},
) {
  return toCssVariables(themeKey, overrides) as CSSProperties;
}

export function applyColorTheme(
  element: HTMLElement,
  themeKey: ColorThemeKey,
  overrides: ColorOverrides = {},
) {
  element.dataset.colorTheme = themeKey;

  const variables = toCssVariables(themeKey, overrides);
  for (const [name, value] of Object.entries(variables)) {
    element.style.setProperty(name, value);
  }
}

export function getThemeMetaColors(
  themeKey: ColorThemeKey,
  overrides: ColorOverrides = {},
) {
  const { light, dark } = resolveColorTheme(themeKey, overrides);
  return {
    light: light.background,
    dark: dark.background,
  };
}

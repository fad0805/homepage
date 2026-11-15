export type LayoutKey =
  | "editorial"
  | "side"
  | "collapsible"
  | "drawer";

export type SidePosition = "left" | "right";

export interface LayoutOption {
  key: LayoutKey;
  label: string;
  englishLabel: string;
  description: string;
}

export interface SidePositionOption {
  key: SidePosition;
  label: string;
}

export const DEFAULT_LAYOUT: LayoutKey = "editorial";
export const DEFAULT_SIDE_POSITION: SidePosition = "left";

export const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    key: "editorial",
    label: "상단 메뉴",
    englishLabel: "Top Navigation",
    description: "제목 아래에 메뉴를 가로로 배치하는 기본 구조입니다.",
  },
  {
    key: "side",
    label: "사이드 메뉴",
    englishLabel: "Side Navigation",
    description: "왼쪽 고정 사이드바에 메뉴를 세로로 배치합니다.",
  },
  {
    key: "collapsible",
    label: "하단 메뉴",
    englishLabel: "Bottom Sticky Menu",
    description: "화면 하단에 고정된 메뉴 바를 표시합니다.",
  },
  {
    key: "drawer",
    label: "드로어 메뉴",
    englishLabel: "Drawer Menu",
    description: "상단 버튼을 눌렀을 때 메뉴가 옆에서 열립니다.",
  },
];

export const SIDE_POSITION_OPTIONS: SidePositionOption[] = [
  { key: "left", label: "왼쪽" },
  { key: "right", label: "오른쪽" },
];

export type ColorThemeKey = "mint" | "sepia" | "blue" | "rose";

export interface ColorThemePalette {
  /** Page background. */
  background: string;
  /** Content/card background. */
  content: string;
  /** Titles, links and other emphasized ink. */
  accent: string;
  text: string;
  inputBackground: string;
  emptyBanner: string;
}

export interface ColorThemeOption {
  key: ColorThemeKey;
  label: string;
  englishLabel: string;
  description: string;
  light: ColorThemePalette;
  dark: ColorThemePalette;
}

export const DEFAULT_COLOR_THEME: ColorThemeKey = "mint";

export const COLOR_THEME_OPTIONS: ColorThemeOption[] = [
  {
    key: "mint",
    label: "민트",
    englishLabel: "Mint",
    description: "사이트의 기본이 되는 차분한 민트빛 테마입니다.",
    light: {
      background: "#bedbbb",
      content: "#fdfbe9",
      accent: "#2f522b",
      text: "#171717",
      inputBackground: "#fffcfc",
      emptyBanner: "#adcfaa",
    },
    dark: {
      background: "#090c0a",
      content: "#1f201e",
      accent: "#55954f",
      text: "#f3f0dc",
      inputBackground: "#1f201e",
      emptyBanner: "#455b43",
    },
  },
  {
    key: "sepia",
    label: "세피아",
    englishLabel: "Sepia",
    description: "오래된 종이처럼 따뜻하고 부드러운 베이지 테마입니다.",
    light: {
      background: "#e7dbc3",
      content: "#fbf6ea",
      accent: "#7b5630",
      text: "#2b241b",
      inputBackground: "#fffdf7",
      emptyBanner: "#d3c2a1",
    },
    dark: {
      background: "#14110d",
      content: "#221d17",
      accent: "#d0ab7c",
      text: "#ece1cc",
      inputBackground: "#221d17",
      emptyBanner: "#5a4a36",
    },
  },
  {
    key: "blue",
    label: "블루",
    englishLabel: "Blue",
    description: "맑은 바다를 떠올리는 차갑고 선명한 테마입니다.",
    light: {
      background: "#a8cbe2",
      content: "#f8fbfd",
      accent: "#164e6c",
      text: "#0d1c26",
      inputBackground: "#ffffff",
      emptyBanner: "#7fa9c3",
    },
    dark: {
      background: "#070d13",
      content: "#16222c",
      accent: "#86bdd9",
      text: "#d9e8f2",
      inputBackground: "#16222c",
      emptyBanner: "#33566b",
    },
  },
  {
    key: "rose",
    label: "로즈",
    englishLabel: "Rose",
    description: "은은한 장미빛으로 따뜻한 분위기를 내는 테마입니다.",
    light: {
      background: "#e9ccd1",
      content: "#fdf4f5",
      accent: "#86394a",
      text: "#2b171b",
      inputBackground: "#fffcfc",
      emptyBanner: "#dcb4bb",
    },
    dark: {
      background: "#130b0d",
      content: "#251a1d",
      accent: "#dfa3ae",
      text: "#f3e1e4",
      inputBackground: "#251a1d",
      emptyBanner: "#5e3a42",
    },
  },
];

export function getColorThemeOption(key: ColorThemeKey): ColorThemeOption {
  return (
    COLOR_THEME_OPTIONS.find((option) => option.key === key) ??
    COLOR_THEME_OPTIONS[0]
  );
}

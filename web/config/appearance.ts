export type LayoutKey =
  | "editorial"
  | "side"
  | "collapsible"
  | "drawer";

export interface LayoutOption {
  key: LayoutKey;
  label: string;
  englishLabel: string;
  description: string;
}

export const DEFAULT_LAYOUT: LayoutKey = "editorial";

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
    label: "접이식 사이드",
    englishLabel: "Collapsible Sidebar",
    description: "사이드 메뉴를 접거나 펼칠 수 있고 상태를 기억합니다.",
  },
  {
    key: "drawer",
    label: "드로어 메뉴",
    englishLabel: "Drawer Menu",
    description: "상단 버튼을 눌렀을 때 메뉴가 옆에서 열립니다.",
  },
];

"use client";

import type { MobilePanel } from "./manuscript-types";

interface ManuscriptBinderMenuProps {
  activePanel: MobilePanel;
  onSelect: (panel: Exclude<MobilePanel, null>) => void;
}

export function ManuscriptBinderMenu({
  activePanel,
  onSelect,
}: ManuscriptBinderMenuProps) {
  return (
    <div className="ms-binder-tabs" role="group" aria-label="바인더 메뉴">
      <button
        type="button"
        aria-pressed={activePanel === "nav"}
        className={activePanel === "nav" ? "is-active" : ""}
        aria-label="내비 바인더 열기"
        title="내비 바인더"
        onClick={() => onSelect("nav")}
      >
        내비
      </button>
      <button
        type="button"
        aria-pressed={activePanel === "info"}
        className={activePanel === "info" ? "is-active" : ""}
        aria-label="정보 바인더 열기"
        title="정보 바인더"
        onClick={() => onSelect("info")}
      >
        정보
      </button>
    </div>
  );
}

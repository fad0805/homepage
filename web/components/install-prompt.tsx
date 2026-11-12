"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import "@/public/styles/install-prompt.scss";

const DISMISS_KEY = "missing-island-install-dismissed";
const DISMISS_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

type Mode = "chromium" | "ios" | null;

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function isIos() {
  const userAgent = navigator.userAgent;

  if (/iphone|ipad|ipod/i.test(userAgent)) return true;

  // iPadOS reports itself as macOS, but exposes touch points.
  return /macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
}

function wasDismissed() {
  try {
    const dismissedAt = Number(
      window.localStorage.getItem(DISMISS_KEY) ?? "0",
    );

    return (
      Number.isFinite(dismissedAt) &&
      dismissedAt > 0 &&
      Date.now() - dismissedAt < DISMISS_PERIOD_MS
    );
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // The prompt is still hidden for this session.
  }
}

function InstallIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3v11" />
      <path d="m7.5 9.5 4.5 4.5 4.5-4.5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function InstallPrompt() {
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>(null);
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const hidden =
    pathname.startsWith("/admin") || pathname.startsWith("/signin");

  useEffect(() => {
    if (hidden || isStandalone() || wasDismissed()) return;

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setMode("chromium");
    };

    const handleInstalled = () => {
      setMode(null);
      setPromptEvent(null);
      setShowIosHelp(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);

    // iOS never fires beforeinstallprompt, so offer manual instructions.
    const iosTimer = isIos()
      ? window.setTimeout(() => setMode("ios"), 1800)
      : undefined;

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);

      if (iosTimer !== undefined) window.clearTimeout(iosTimer);
    };
  }, [hidden]);

  if (hidden || mode === null) return null;

  const dismiss = () => {
    rememberDismissal();
    setMode(null);
    setShowIosHelp(false);
  };

  const install = async () => {
    if (mode === "ios") {
      setShowIosHelp((visible) => !visible);
      return;
    }

    if (!promptEvent) return;

    setInstalling(true);

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      if (choice.outcome === "accepted") {
        setMode(null);
      } else {
        // The event cannot be reused; the browser may offer it again later.
        setPromptEvent(null);
        setMode(null);
      }
    } catch {
      setPromptEvent(null);
      setMode(null);
    } finally {
      setInstalling(false);
    }
  };

  const label =
    mode === "ios" ? "홈 화면에 추가" : installing ? "설치 중…" : "앱 설치";

  return (
    <div className="install-prompt" role="region" aria-label="앱 설치">
      {showIosHelp ? (
        <div className="install-prompt__help">
          <p>
            하단의 <strong>공유</strong> 버튼을 누른 뒤{" "}
            <strong>홈 화면에 추가</strong>를 선택하세요.
          </p>
          <button
            type="button"
            onClick={() => setShowIosHelp(false)}
          >
            알겠어요
          </button>
        </div>
      ) : null}

      <div className="install-prompt__row">
        <button
          className="install-prompt__action"
          type="button"
          onClick={install}
          disabled={installing}
        >
          <InstallIcon />
          {label}
        </button>
        <button
          className="install-prompt__close"
          type="button"
          aria-label="설치 안내 닫기"
          title="닫기"
          onClick={dismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}

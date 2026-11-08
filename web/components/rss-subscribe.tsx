"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface RssSubscribeProps {
  path: string;
  label?: string;
}

type PanelPosition = {
  top?: number;
  bottom?: number;
  right: number;
  maxHeight: number;
};

export function RssSubscribe({
  path,
  label = "RSS 구독",
}: RssSubscribeProps) {
  const [feedUrl, setFeedUrl] = useState(path);
  const [copied, setCopied] = useState(false);
  const [panelPosition, setPanelPosition] =
    useState<PanelPosition | null>(null);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    setFeedUrl(new URL(path, window.location.origin).toString());
  }, [path]);

  const updatePosition = useCallback(() => {
    const details = detailsRef.current;
    if (!details) return;

    const rect = details.getBoundingClientRect();
    const margin = 8;
    const panelWidth = Math.min(280, window.innerWidth * 0.7);
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;

    // Keep the panel on screen while aligning its right edge to the button.
    const right = Math.max(
      margin,
      Math.min(
        window.innerWidth - rect.right,
        window.innerWidth - panelWidth - margin,
      ),
    );

    setPanelPosition({
      top: openUp ? undefined : rect.bottom + margin,
      bottom: openUp ? window.innerHeight - rect.top + margin : undefined,
      right,
      maxHeight: Math.max(140, openUp ? spaceAbove : spaceBelow),
    });
  }, []);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;

    const close = () => {
      if (details.open) details.open = false;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!details.open) return;
      if (details.contains(event.target as Node)) return;
      close();
    };
    const handleScroll = (event: Event) => {
      if (!details.open) return;
      if (details.contains(event.target as Node)) return;
      close();
    };
    const handleResize = () => {
      if (details.open) updatePosition();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [updatePosition]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <details
      className="rss-subscribe"
      ref={detailsRef}
      onToggle={(event) => {
        if (event.currentTarget.open) {
          updatePosition();
        } else {
          setPanelPosition(null);
        }
      }}
    >
      <summary>{label}</summary>
      <div
        className="rss-subscribe__panel"
        style={
          panelPosition
            ? {
                position: "fixed",
                top: panelPosition.top ?? "auto",
                bottom: panelPosition.bottom ?? "auto",
                right: panelPosition.right,
                left: "auto",
                maxHeight: panelPosition.maxHeight,
                overflowY: "auto",
                zIndex: 100,
              }
            : { visibility: "hidden" }
        }
      >
        <p>피드 주소를 복사해 사용하는 리더에 추가하세요.</p>
        <code>{feedUrl}</code>
        <div className="rss-subscribe__actions">
          <button type="button" onClick={copyUrl}>
            {copied ? "복사됨" : "주소 복사"}
          </button>
          <a
            href={`https://feedly.com/i/subscription/feed/${encodeURIComponent(feedUrl)}`}
            target="_blank"
            rel="noreferrer"
          >
            Feedly에서 구독
          </a>
        </div>
      </div>
    </details>
  );
}

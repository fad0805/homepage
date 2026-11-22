"use client";

import { useEffect, useRef, useState } from "react";

interface LinksCategoryBannerProps {
  url: string;
  name: string;
}

export function LinksCategoryBanner({
  url,
  name,
}: LinksCategoryBannerProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  const copyBannerUrl = async () => {
    try {
      const copyUrl = url.startsWith("/uploads")
        ? new URL(url, window.location.origin).toString()
        : url;
      await navigator.clipboard.writeText(copyUrl);
      setCopied(true);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimerRef.current = null;
      }, 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      className="links-category-banner"
      onClick={copyBannerUrl}
      aria-label={
        copied ? `${name} 배너 링크 복사됨` : `${name} 배너 링크 복사`
      }
    >
      <span className="links-category-banner__image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="banner" />
        <span
          className={`links-category-banner__overlay${
            copied ? " is-copied" : ""
          }`}
          aria-hidden="true"
        >
          {copied ? "복사됨" : "클릭하기"}
        </span>
      </span>
    </button>
  );
}

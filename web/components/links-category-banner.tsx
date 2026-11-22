"use client";

import { useState } from "react";

interface LinksCategoryBannerProps {
  url: string;
  name: string;
}

export function LinksCategoryBanner({
  url,
  name,
}: LinksCategoryBannerProps) {
  const [copied, setCopied] = useState(false);

  const copyBannerUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
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
        <span className="links-category-banner__overlay" aria-hidden="true">
          클릭하기
        </span>
      </span>
    </button>
  );
}

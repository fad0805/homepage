"use client";

import { useEffect, useState } from "react";

interface RssSubscribeProps {
  path: string;
  label?: string;
}

export function RssSubscribe({
  path,
  label = "RSS 구독",
}: RssSubscribeProps) {
  const [feedUrl, setFeedUrl] = useState(path);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setFeedUrl(new URL(path, window.location.origin).toString());
  }, [path]);

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
    <details className="rss-subscribe">
      <summary>{label}</summary>
      <div className="rss-subscribe__panel">
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

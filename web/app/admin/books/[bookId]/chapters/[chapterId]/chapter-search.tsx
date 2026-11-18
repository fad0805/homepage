"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { searchTokens } from "@/lib/search";

import "@/public/styles/admin/books.scss";

export interface ChapterSearchResult {
  id: number;
  book_id: number;
  title: string;
  subtitle: string | null;
  created_at: string | null;
  book: { id: number; title: string } | null;
  snippet: string;
}

function Highlighted({ text, tokens }: { text: string; tokens: string[] }) {
  const escaped = tokens
    .filter(Boolean)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return <>{text}</>;

  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  const lowered = new Set(tokens.map((token) => token.toLowerCase()));
  return (
    <>
      {parts.map((part, index) =>
        lowered.has(part.toLowerCase()) ? (
          <mark key={index}>{part}</mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function ChapterSearch({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (result: ChapterSearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChapterSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const tokens = searchTokens(query);
    if (tokens.length === 0) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const data = await apiFetch<ChapterSearchResult[]>(
          `/api/chapters/search?q=${encodeURIComponent(query)}&limit=50`,
        );
        if (!cancelled) setResults(data);
      } catch (cause) {
        if (!cancelled) {
          setResults([]);
          setError(
            cause instanceof Error ? cause.message : "검색에 실패했습니다.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  if (!open) return null;

  const tokens = searchTokens(query);

  return (
    <div
      className="chapter-search-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="chapter-search"
        role="dialog"
        aria-modal="true"
        aria-label="전체 챕터 검색"
      >
        <header className="chapter-search__header">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목, 본문, 태그 검색 (전체 챕터)"
            maxLength={100}
          />
          <button type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

        <div className="chapter-search__body">
          {tokens.length === 0 ? (
            <p className="chapter-search__hint">
              검색어를 입력하세요. 제목·본문·태그에서 찾습니다.
            </p>
          ) : loading ? (
            <p className="chapter-search__hint">검색 중...</p>
          ) : error ? (
            <p className="chapter-search__error">{error}</p>
          ) : results.length === 0 ? (
            <p className="chapter-search__hint">검색 결과가 없습니다.</p>
          ) : (
            <>
              <p className="chapter-search__count">
                검색 결과 {results.length}건 (최대 50건)
              </p>
              <ul className="chapter-search__results">
                {results.map((result) => (
                  <li key={result.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(result)}
                      className="chapter-search__result"
                    >
                      <span className="chapter-search__meta">
                        {result.book?.title ?? "책 정보 없음"}
                        {result.created_at
                          ? ` · ${formatDateTime(result.created_at)}`
                          : ""}
                      </span>
                      <span className="chapter-search__title">
                        <Highlighted text={result.title} tokens={tokens} />
                      </span>
                      {result.snippet ? (
                        <span className="chapter-search__snippet">
                          <Highlighted
                            text={result.snippet}
                            tokens={tokens}
                          />
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

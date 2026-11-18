"use client";

import { paginationPages } from "@/lib/pagination";

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = paginationPages(page, totalPages);

  return (
    <nav className="pagination" aria-label="페이지 이동">
      <button
        type="button"
        className="pagination__button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        이전
      </button>
      {pages.map((value, index) =>
        value === "ellipsis" ? (
          <span className="pagination__ellipsis" key={`ellipsis-${index}`}>
            …
          </span>
        ) : (
          <button
            type="button"
            className={`pagination__button${value === page ? " is-active" : ""}`}
            onClick={() => onChange(value)}
            aria-current={value === page ? "page" : undefined}
            key={value}
          >
            {value}
          </button>
        ),
      )}
      <button
        type="button"
        className="pagination__button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
      >
        다음
      </button>
    </nav>
  );
}

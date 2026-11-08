"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

function getPages(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | "ellipsis"> = [1];
  if (page > 3) pages.push("ellipsis");

  for (
    let current = Math.max(2, page - 1);
    current <= Math.min(totalPages - 1, page + 1);
    current += 1
  ) {
    pages.push(current);
  }

  if (page < totalPages - 2) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPages(page, totalPages);

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

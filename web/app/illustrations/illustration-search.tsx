"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function MagnifierIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IllustrationSearch({
  query,
  sort,
  filterBasis,
  from,
  to,
  today,
}: {
  query: string;
  sort: "taken" | "created";
  filterBasis: "taken" | "created";
  from: string | null;
  to: string | null;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    inputRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const navigate = (value: string) => {
    const form = inputRef.current?.form;
    const formData = form ? new FormData(form) : null;
    const formFilter = formData
      ? String(formData.get("filter") ?? filterBasis)
      : filterBasis;
    const formFrom = formData
      ? String(formData.get("from") ?? "").trim()
      : (from ?? "");
    const formTo = formData
      ? String(formData.get("to") ?? "").trim()
      : (to ?? "");

    const effectiveFrom = formFrom || null;
    // The "to" input defaults to today. Only treat it as an explicit range
    // end when the user set a start date, changed the end date, or already
    // had a date range applied.
    const effectiveTo =
      formTo && (formFrom || formTo !== today || to)
        ? formTo
        : null;

    const params = new URLSearchParams();
    if (sort !== "taken") params.set("sort", sort);
    if (formFilter !== "taken") params.set("filter", formFilter);

    const trimmed = value.trim();
    if (trimmed) {
      if (effectiveFrom) params.set("from", effectiveFrom);
      if (effectiveTo) params.set("to", effectiveTo);
      params.set("q", trimmed);
    }

    const queryString = params.toString();
    router.replace(
      `/illustrations${queryString ? `?${queryString}` : ""}`,
      { scroll: false },
    );
  };

  const schedule = (value: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      navigate(value);
    }, 300);
  };

  const clearPending = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <div className="illustrations-search" ref={wrapperRef}>
      <button
        type="button"
        className="illustrations-search__toggle"
        aria-label="삽화 검색"
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            clearPending();
          }
          setOpen((value) => !value);
        }}
      >
        <MagnifierIcon />
      </button>

      {open ? (
        <div className="illustrations-search__popover">
          <div className="illustrations-search__row">
            <input
              ref={inputRef}
              type="search"
              defaultValue={query}
              placeholder="제목·태그 검색"
              aria-label="삽화 제목 또는 태그 검색"
              onChange={(event) => schedule(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  clearPending();
                  navigate(event.currentTarget.value);
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

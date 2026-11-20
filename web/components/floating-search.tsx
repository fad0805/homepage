"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import "@/public/styles/floating-search.scss";

interface FloatingSearchProps {
  variant?: "floating" | "sidebar" | "drawer";
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function FloatingSearch({ variant = "floating" }: FloatingSearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (variant !== "floating") {
    return (
      <Link
        className={`floating-search__button floating-search--${variant}`}
        href="/search"
        title="전체 검색"
        aria-label="전체 검색"
      >
        <SearchIcon />
      </Link>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = value.trim();
    if (!query) return;
    setOpen(false);
    setValue("");
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="floating-search" ref={wrapperRef}>
      <button
        className="floating-search__button"
        type="button"
        title="전체 검색"
        aria-label="전체 검색"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <SearchIcon />
      </button>
      {open ? (
        <form className="floating-search__popover" onSubmit={submit}>
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="전체 검색"
            aria-label="전체 검색어"
            maxLength={100}
          />
          <button type="submit" aria-label="검색">
            검색
          </button>
        </form>
      ) : null}
    </div>
  );
}

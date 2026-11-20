"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { apiFetch } from "@/lib/api";

import "@/public/styles/tag-input.scss";

interface TagInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  single?: boolean;
  id?: string;
  className?: string;
}

function tokenBeforeCaret(value: string) {
  const index = value.lastIndexOf(",");
  return value.slice(index + 1).trim();
}

function selectedTags(value: string) {
  const parts = value.split(",");
  return new Set(
    parts
      .slice(0, -1)
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function TagInput({
  value,
  onChange,
  placeholder = "쉼표로 구분",
  disabled = false,
  single = false,
  id,
  className = "",
}: TagInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestRef = useRef(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const token = tokenBeforeCaret(value);
  const excluded = useMemo(() => selectedTags(value), [value]);

  useEffect(() => {
    const query = token.trim();
    if (!query) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(() => {
      void apiFetch<string[]>(
        `/api/tags?query=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      )
        .then((items) => {
          if (requestId !== requestRef.current) return;
          const lower = query.toLowerCase();
          const next = items.filter((item) => {
            const key = item.toLowerCase();
            return key !== lower && !excluded.has(key);
          });
          setSuggestions(next);
          setActiveIndex(next.length > 0 ? 0 : -1);
          setOpen(next.length > 0);
        })
        .catch(() => {
          if (requestId !== requestRef.current) return;
          setSuggestions([]);
          setOpen(false);
          setActiveIndex(-1);
        });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [excluded, token]);

  const applySuggestion = (name: string) => {
    if (single) {
      onChange(`${name}, `);
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    const index = value.lastIndexOf(",");
    const prefix = index >= 0 ? value.slice(0, index + 1) : "";
    onChange(`${prefix}${prefix ? " " : ""}${name}, `);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((previous) =>
        (previous + 1) % suggestions.length,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((previous) =>
        (previous - 1 + suggestions.length) % suggestions.length,
      );
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      applySuggestion(suggestions[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className={`tag-input ${className}`.trim()}>
      <input
        ref={inputRef}
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id ? `${id}-suggestions` : undefined}
      />
      {open && suggestions.length > 0 ? (
        <div
          className="tag-input__menu"
          id={id ? `${id}-suggestions` : undefined}
          role="listbox"
        >
          {suggestions.map((name, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={
                index === activeIndex ? "is-active" : ""
              }
              key={name}
              onMouseDown={(event) => {
                event.preventDefault();
                applySuggestion(name);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";

export function CloverIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="clover-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.2"
      >
        <path d="M12 12C8.7 11.1 7.2 8.4 8.1 6.1 8.9 4.2 11.1 3.6 12 5.2c.9-1.6 3.1-1 3.9.9.9 2.3-.6 5-3.9 5.9Z" />
        <path
          d="M12 12C8.7 11.1 7.2 8.4 8.1 6.1 8.9 4.2 11.1 3.6 12 5.2c.9-1.6 3.1-1 3.9.9.9 2.3-.6 5-3.9 5.9Z"
          transform="rotate(120 12 12)"
        />
        <path
          d="M12 12C8.7 11.1 7.2 8.4 8.1 6.1 8.9 4.2 11.1 3.6 12 5.2c.9-1.6 3.1-1 3.9.9.9 2.3-.6 5-3.9 5.9Z"
          transform="rotate(240 12 12)"
        />
      </g>
      <path
        d="M12 12c.1 3 .8 6 2 9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function CloverRating({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const display = hover || value;

  return (
    <div
      className="clover-rating"
      role="radiogroup"
      aria-label="세잎클로버 별점"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === score}
          aria-label={`${score}점`}
          className={`clover-rating-button${
            score <= display ? " is-filled" : ""
          }`}
          disabled={disabled}
          key={score}
          onMouseEnter={() => setHover(score)}
          onFocus={() => setHover(score)}
          onBlur={() => setHover(0)}
          onClick={() => onChange(value === score ? 0 : score)}
        >
          <CloverIcon filled={score <= display} />
        </button>
      ))}
    </div>
  );
}

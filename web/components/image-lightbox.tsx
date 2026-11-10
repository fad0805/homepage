"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type TouchEvent,
} from "react";

import "@/public/styles/image-lightbox.scss";

export interface LightboxImage {
  src: string;
  alt?: string | null;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: ImageLightboxProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  const total = images.length;
  const current = images[index];

  const move = useCallback(
    (delta: number) => {
      if (total <= 1) return;
      onIndexChange((index + delta + total) % total);
    },
    [index, onIndexChange, total],
  );

  useEffect(() => {
    closeButtonRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move, onClose]);

  if (!current) return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    onClose();
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (total <= 1) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    swipedRef.current = true;
    move(deltaX < 0 ? 1 : -1);
    window.setTimeout(() => {
      swipedRef.current = false;
    }, 350);
  };

  return (
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="이미지 확대"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchStartRef.current = null;
      }}
    >
      <button
        ref={closeButtonRef}
        type="button"
        className="image-lightbox__close"
        onClick={onClose}
        aria-label="확대 이미지 닫기"
      >
        ×
      </button>

      {total > 1 ? (
        <button
          type="button"
          className="image-lightbox__nav is-prev"
          onClick={() => move(-1)}
          aria-label="이전 이미지"
        >
          ‹
        </button>
      ) : null}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="image-lightbox__image"
        src={current.src}
        alt={current.alt ?? ""}
        draggable={false}
      />

      {total > 1 ? (
        <button
          type="button"
          className="image-lightbox__nav is-next"
          onClick={() => move(1)}
          aria-label="다음 이미지"
        >
          ›
        </button>
      ) : null}

      {total > 1 ? (
        <span className="image-lightbox__counter">
          {index + 1} / {total}
        </span>
      ) : null}
    </div>
  );
}

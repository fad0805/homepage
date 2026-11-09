"use client";

import { useEffect, useRef, useState } from "react";

import type { IllustrationImageItem } from "@/lib/illustration-types";

export function IllustrationDetailGallery({
  images,
}: {
  images: IllustrationImageItem[];
}) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setIndex((current) =>
      images.length === 0 ? 0 : Math.min(current, images.length - 1),
    );
  }, [images.length]);

  if (images.length === 0) {
    return <p className="illustrations-state">등록된 이미지가 없습니다.</p>;
  }

  const current = images[index];
  const move = (delta: number) => {
    setIndex((value) => (value + delta + images.length) % images.length);
  };

  useEffect(() => {
    if (images.length <= 1) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((value) => (value - 1 + images.length) % images.length);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((value) => (value + 1) % images.length);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [images.length]);

  return (
    <div className="illustration-detail__viewer">
      <div
        className="illustration-detail__main"
        onTouchStart={(event) => {
          if (images.length <= 1) return;
          const touch = event.touches[0];
          touchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start) return;

          const touch = event.changedTouches[0];
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          if (
            Math.abs(deltaX) < 45 ||
            Math.abs(deltaX) <= Math.abs(deltaY)
          ) {
            return;
          }
          move(deltaX < 0 ? 1 : -1);
        }}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.original_name || "삽화"}
        />
        {images.length > 1 ? (
          <>
            <button
              type="button"
              className="illustration-detail__nav is-prev"
              onClick={() => move(-1)}
              aria-label="이전 이미지"
            >
              ‹
            </button>
            <button
              type="button"
              className="illustration-detail__nav is-next"
              onClick={() => move(1)}
              aria-label="다음 이미지"
            >
              ›
            </button>
            <span className="illustration-detail__counter">
              {index + 1} / {images.length}
            </span>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="illustration-detail__thumbs">
          {images.map((image, imageIndex) => (
            <button
              type="button"
              className={`illustration-detail__thumb${
                imageIndex === index ? " is-active" : ""
              }`}
              key={image.id}
              onClick={() => setIndex(imageIndex)}
              aria-label={`${imageIndex + 1}번째 이미지 보기`}
              aria-pressed={imageIndex === index}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.original_name || "삽화"}
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

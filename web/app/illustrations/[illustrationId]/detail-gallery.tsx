"use client";

import { useEffect, useRef, useState } from "react";

import { ImageLightbox } from "@/components/image-lightbox";
import type { IllustrationImageItem } from "@/lib/illustration-types";

export function IllustrationDetailGallery({
  images,
}: {
  images: IllustrationImageItem[];
}) {
  const [index, setIndex] = useState(0);
  const [maxRatio, setMaxRatio] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  const imageKey = images.map((image) => image.url).join("|");

  useEffect(() => {
    let cancelled = false;
    if (images.length === 0) {
      setMaxRatio(null);
      return;
    }

    const ratios: number[] = [];
    let pending = images.length;

    const finish = () => {
      if (cancelled) return;
      pending -= 1;
      if (pending === 0) {
        setMaxRatio(ratios.length > 0 ? Math.max(...ratios) : null);
      }
    };

    images.forEach((item) => {
      const image = new window.Image();
      image.onload = () => {
        if (image.naturalWidth > 0) {
          ratios.push(image.naturalHeight / image.naturalWidth);
        }
        finish();
      };
      image.onerror = finish;
      image.src = item.url;
    });

    return () => {
      cancelled = true;
    };
  }, [imageKey, images]);

  useEffect(() => {
    setIndex((current) =>
      images.length === 0 ? 0 : Math.min(current, images.length - 1),
    );
    setLightboxIndex((current) =>
      current === null || current < images.length ? current : null,
    );
  }, [images.length]);

  const current = images[index];
  const move = (delta: number) => {
    setIndex((value) => (value + delta + images.length) % images.length);
  };

  useEffect(() => {
    if (images.length <= 1 || lightboxIndex !== null) return;

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
  }, [images.length, lightboxIndex]);

  if (!current) {
    return <p className="illustrations-state">등록된 이미지가 없습니다.</p>;
  }

  return (
    <div className="illustration-detail__viewer">
      <div
        className="illustration-detail__main"
        style={{
          aspectRatio: maxRatio ? `1 / ${maxRatio}` : "4 / 3",
        }}
        onTouchStart={(event) => {
          if (images.length <= 1) return;
          const touch = event.touches[0];
          if (!touch) return;
          touchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start) return;

          const touch = event.changedTouches[0];
          if (!touch) return;
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          if (
            Math.abs(deltaX) < 45 ||
            Math.abs(deltaX) <= Math.abs(deltaY)
          ) {
            return;
          }
          swipedRef.current = true;
          move(deltaX < 0 ? 1 : -1);
          window.setTimeout(() => {
            swipedRef.current = false;
          }, 350);
        }}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.original_name || "삽화"}
          role="button"
          tabIndex={0}
          aria-label={`${current.original_name || "삽화"} 확대 보기`}
          onClick={() => {
            if (swipedRef.current) {
              swipedRef.current = false;
              return;
            }
            setLightboxIndex(index);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setLightboxIndex(index);
            }
          }}
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

      {lightboxIndex !== null ? (
        <ImageLightbox
          images={images.map((image) => ({
            src: image.url,
            alt: image.original_name || "삽화",
          }))}
          index={lightboxIndex}
          onIndexChange={(nextIndex) => {
            setIndex(nextIndex);
            setLightboxIndex(nextIndex);
          }}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}

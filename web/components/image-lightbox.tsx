"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent,
  type TouchList as ReactTouchList,
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

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

function touchDistance(touches: ReactTouchList) {
  const first = touches[0];
  const second = touches[1];
  if (!first || !second) return null;
  return Math.hypot(
    first.clientX - second.clientX,
    first.clientY - second.clientY,
  );
}

export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: ImageLightboxProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartRef = useRef<{ distance: number; scale: number } | null>(null);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const swipedRef = useRef(false);
  const [scale, setScale] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const total = images.length;
  const current = images[index];

  const move = useCallback(
    (delta: number) => {
      if (total <= 1) return;
      onIndexChange((index + delta + total) % total);
    },
    [index, onIndexChange, total],
  );

  const changeZoom = useCallback((delta: number) => {
    setScale((previous) => clampZoom(previous + delta));
  }, []);

  const resetZoom = useCallback(() => {
    setScale(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    resetZoom();
  }, [current?.src, index, resetZoom]);

  useEffect(() => {
    if (scale === MIN_ZOOM) setOffset({ x: 0, y: 0 });
  }, [scale]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
    };

    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [changeZoom]);

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
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        changeZoom(ZOOM_STEP);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        changeZoom(-ZOOM_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [changeZoom, move, onClose, resetZoom]);

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
    if (event.touches.length === 2) {
      const distance = touchDistance(event.touches);
      if (distance) {
        pinchStartRef.current = { distance, scale };
      }
      touchStartRef.current = null;
      return;
    }
    if (scale > MIN_ZOOM || event.touches.length !== 1) return;
    if (total <= 1) return;

    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const pinch = pinchStartRef.current;
    if (!pinch || event.touches.length !== 2) return;
    const distance = touchDistance(event.touches);
    if (!distance) return;
    setScale(clampZoom((pinch.scale * distance) / pinch.distance));
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (pinchStartRef.current) {
      if (event.touches.length === 0) pinchStartRef.current = null;
      return;
    }
    if (scale > MIN_ZOOM) return;

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

  const handlePointerDown = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (scale <= MIN_ZOOM) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
    const start = dragStartRef.current;
    if (!start) return;

    const image = imageRef.current;
    const maxX = image ? ((scale - MIN_ZOOM) * image.offsetWidth) / 2 : 0;
    const maxY = image ? ((scale - MIN_ZOOM) * image.offsetHeight) / 2 : 0;

    setOffset({
      x: Math.max(
        -maxX,
        Math.min(maxX, start.offsetX + event.clientX - start.x),
      ),
      y: Math.max(
        -maxY,
        Math.min(maxY, start.offsetY + event.clientY - start.y),
      ),
    });
  };

  const endPointerDrag = () => {
    dragStartRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="이미지 확대"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchStartRef.current = null;
        pinchStartRef.current = null;
        dragStartRef.current = null;
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

      <div
        className="image-lightbox__zoom"
        role="group"
        aria-label="이미지 확대축소"
      >
        <button
          type="button"
          onClick={() => changeZoom(-ZOOM_STEP)}
          disabled={scale <= MIN_ZOOM}
          aria-label="이미지 축소"
        >
          −
        </button>
        <button
          type="button"
          className="image-lightbox__zoom-value"
          onClick={resetZoom}
          aria-label="원래 크기로"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={() => changeZoom(ZOOM_STEP)}
          disabled={scale >= MAX_ZOOM}
          aria-label="이미지 확대"
        >
          +
        </button>
      </div>

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
        ref={imageRef}
        className={`image-lightbox__image${scale > MIN_ZOOM ? " is-zoomed" : ""}`}
        src={current.src}
        alt={current.alt ?? ""}
        draggable={false}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
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

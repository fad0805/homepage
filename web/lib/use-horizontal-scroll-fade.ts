"use client";

import { useEffect, useRef, useState } from "react";

export interface ScrollFade {
  left: boolean;
  right: boolean;
}

const EMPTY_FADE: ScrollFade = { left: false, right: false };

/**
 * Tracks a horizontally scrollable element and reports which edges still have
 * content. Used to fade clipped items without hiding the edge item at either
 * end of the scroll range.
 */
export function useHorizontalScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [fade, setFade] = useState<ScrollFade>(EMPTY_FADE);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let frame = 0;

    const update = () => {
      const maxScroll = element.scrollWidth - element.clientWidth;
      const left = element.scrollLeft > 1;
      const right = maxScroll > 1 && element.scrollLeft < maxScroll - 1;

      setFade((current) =>
        current.left === left && current.right === right
          ? current
          : { left, right },
      );
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    update();
    element.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    observer?.observe(element);

    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, []);

  const fadeClassName = [
    fade.left ? "has-left-fade" : "",
    fade.right ? "has-right-fade" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { ref, fadeClassName };
}

"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface FadeState {
  left: boolean;
  right: boolean;
}

export function CharacterRow({ children }: { children: ReactNode }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [fades, setFades] = useState<FadeState>({
    left: false,
    right: false,
  });

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    let frame = 0;

    const update = () => {
      const maxScroll = element.scrollWidth - element.clientWidth;
      const left = element.scrollLeft > 1;
      const right =
        maxScroll > 1 && element.scrollLeft < maxScroll - 1;

      setFades((current) =>
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

    const observer = new ResizeObserver(schedule);
    observer.observe(element);

    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, []);

  const classes = [
    "characters",
    fades.left ? "has-left-fade" : "",
    fades.right ? "has-right-fade" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} ref={rowRef}>
      {children}
    </div>
  );
}

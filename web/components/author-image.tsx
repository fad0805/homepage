"use client";

import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "@tiptap/extension-image";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

import { AUTHOR_IMAGE_MAX_HEIGHT_REM } from "@/config/author";

export type AuthorImageAlign = "left" | "center" | "right";

function getMaxImageHeight() {
  const rootSize =
    parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return AUTHOR_IMAGE_MAX_HEIGHT_REM * rootSize;
}

function AuthorImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, title, width, align, wrap } = node.attrs;
  const imgRef = useRef<HTMLImageElement>(null);
  const [resizing, setResizing] = useState(false);

  const effectiveAlign: AuthorImageAlign =
    align === "left" || align === "right" ? align : "center";
  const effectiveWrap = Boolean(wrap) && effectiveAlign !== "center";

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const image = imgRef.current;
      if (!image) return;

      const startX = event.clientX;
      const startWidth = image.getBoundingClientRect().width;
      const ratio =
        image.naturalHeight > 0
          ? image.naturalWidth / image.naturalHeight
          : 1;
      const maxHeight = getMaxImageHeight();
      const container = image.closest(".admin-editor__content");
      const containerWidth = container
        ? container.getBoundingClientRect().width - 32
        : window.innerWidth;
      const maxWidth = Math.min(containerWidth, maxHeight * ratio);
      const minWidth = Math.min(80, maxWidth);

      setResizing(true);

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextWidth = Math.min(
          maxWidth,
          Math.max(minWidth, startWidth + delta),
        );
        updateAttributes({ width: Math.round(nextWidth) });
      };

      const handleUp = () => {
        setResizing(false);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    },
    [updateAttributes],
  );

  const style: CSSProperties = {
    width: width ? `${width}px` : "fit-content",
    maxWidth: "100%",
    float: effectiveWrap ? effectiveAlign : "none",
    clear: effectiveWrap ? "none" : "both",
    margin: effectiveWrap
      ? effectiveAlign === "left"
        ? "0.3rem 1.2rem 0.9rem 0"
        : "0.3rem 0 0.9rem 1.2rem"
      : effectiveAlign === "center"
        ? "1.2rem auto"
        : effectiveAlign === "left"
          ? "1.2rem auto 1.2rem 0"
          : "1.2rem 0 1.2rem auto",
    position: "relative",
    borderRadius: "0.7rem",
    outline: selected ? "2px solid var(--title-color)" : "none",
    outlineOffset: "2px",
  };

  return (
    <NodeViewWrapper
      className={`author-image-node${resizing ? " is-resizing" : ""}`}
      style={style}
      data-align={effectiveAlign}
      data-wrap={effectiveWrap ? "true" : "false"}
    >
      <div className="author-image-node__frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={alt ?? ""}
          title={title ?? undefined}
          draggable={false}
          style={{
            display: "block",
            width: width ? "100%" : "auto",
            height: "auto",
            maxHeight: `${AUTHOR_IMAGE_MAX_HEIGHT_REM}rem`,
            maxWidth: "100%",
            objectFit: "contain",
            borderRadius: "0.7rem",
          }}
        />
        <span
          className="author-image-node__handle"
          onPointerDown={startResize}
          role="separator"
          aria-label="이미지 크기 조절"
        />
      </div>
    </NodeViewWrapper>
  );
}

export const AuthorImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const raw =
            element.getAttribute("width") || element.style.width || "";
          if (!raw) return null;
          const parsed = Number.parseInt(raw, 10);
          return Number.isFinite(parsed) ? parsed : null;
        },
        renderHTML: (attributes) =>
          attributes.width
            ? {
                width: attributes.width,
                style: `width: ${attributes.width}px`,
              }
            : {},
      },
      align: {
        default: "center",
        parseHTML: (element) => {
          const value = element.getAttribute("data-align");
          return value === "left" || value === "right" ? value : "center";
        },
        renderHTML: (attributes) => ({
          "data-align":
            attributes.align === "left" || attributes.align === "right"
              ? attributes.align
              : "center",
        }),
      },
      wrap: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-wrap") === "true",
        renderHTML: (attributes) => ({
          "data-wrap": attributes.wrap ? "true" : "false",
        }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(AuthorImageView);
  },
});

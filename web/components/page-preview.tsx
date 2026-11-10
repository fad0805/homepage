"use client";

import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Node } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

interface PagePreviewAttrs {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
  siteName: string | null;
  width: number | null;
  align: "left" | "center" | "right";
}

function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function PreviewBody({ attrs }: { attrs: PagePreviewAttrs }) {
  return (
    <>
      <span className="rich-page-preview__site">
        {attrs.siteName || hostLabel(attrs.url)}
      </span>
      <strong className="rich-page-preview__title">
        {attrs.title || attrs.url}
      </strong>
      {attrs.description ? (
        <span className="rich-page-preview__description">
          {attrs.description}
        </span>
      ) : null}
      <span className="rich-page-preview__url">{attrs.url}</span>
    </>
  );
}

function PagePreviewView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  const attrs = node.attrs as PagePreviewAttrs;
  const cardRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);

  const effectiveAlign: PagePreviewAttrs["align"] =
    attrs.align === "left" || attrs.align === "right"
      ? attrs.align
      : "center";

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const card = cardRef.current;
      if (!card) return;

      const startX = event.clientX;
      const startWidth = card.getBoundingClientRect().width;
      const container = card.closest(".admin-editor__content");
      const containerWidth = container
        ? container.getBoundingClientRect().width - 32
        : window.innerWidth;
      const maxWidth = Math.max(1, containerWidth);
      const minWidth = Math.min(220, maxWidth);

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
    width: attrs.width ? `${attrs.width}px` : "100%",
    maxWidth: "100%",
    marginLeft:
      effectiveAlign === "center"
        ? "auto"
        : effectiveAlign === "right"
          ? "auto"
          : "0",
    marginRight:
      effectiveAlign === "center"
        ? "auto"
        : effectiveAlign === "left"
          ? "auto"
          : "0",
    position: "relative",
  };

  return (
    <NodeViewWrapper
      className={`rich-page-preview-node${selected ? " is-selected" : ""}${
        resizing ? " is-resizing" : ""
      }`}
      style={style}
      data-align={effectiveAlign}
      contentEditable={false}
    >
      <div className="rich-page-preview" ref={cardRef}>
        {attrs.image ? (
          <span className="rich-page-preview__media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attrs.image} alt="" draggable={false} />
          </span>
        ) : null}
        <span className="rich-page-preview__body">
          <PreviewBody attrs={attrs} />
        </span>
      </div>
      <span
        className="rich-page-preview-node__handle"
        onPointerDown={startResize}
        role="separator"
        aria-label="페이지 미리보기 크기 조절"
      />
      <button
        type="button"
        className="rich-page-preview-node__remove"
        aria-label="페이지 미리보기 삭제"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          deleteNode();
        }}
      >
        ×
      </button>
    </NodeViewWrapper>
  );
}

export const PagePreview = Node.create({
  name: "pagePreview",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      url: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-url") ||
          element.querySelector("a")?.getAttribute("href") ||
          element.getAttribute("href") ||
          "",
        renderHTML: () => ({}),
      },
      title: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-title") || "",
        renderHTML: () => ({}),
      },
      description: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-description"),
        renderHTML: () => ({}),
      },
      image: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-image"),
        renderHTML: () => ({}),
      },
      siteName: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-site-name"),
        renderHTML: () => ({}),
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const raw =
            element.getAttribute("data-width") ||
            element.style.width ||
            "";
          if (!raw) return null;
          const parsed = Number.parseInt(raw, 10);
          return Number.isFinite(parsed) ? parsed : null;
        },
        renderHTML: () => ({}),
      },
      align: {
        default: "center",
        parseHTML: (element) => {
          const value = element.getAttribute("data-align");
          return value === "left" || value === "right" ? value : "center";
        },
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-page-preview]" }];
  },

  renderHTML({ node }) {
    const attrs = node.attrs as PagePreviewAttrs;
    const effectiveAlign: PagePreviewAttrs["align"] =
      attrs.align === "left" || attrs.align === "right"
        ? attrs.align
        : "center";
    const styleParts: string[] = [];
    if (attrs.width) {
      styleParts.push(`width: ${attrs.width}px`);
    }
    if (effectiveAlign === "center") {
      styleParts.push("margin-left: auto", "margin-right: auto");
    } else if (effectiveAlign === "left") {
      styleParts.push("margin-left: 0", "margin-right: auto");
    } else {
      styleParts.push("margin-left: auto", "margin-right: 0");
    }

    const blockAttrs: Record<string, string> = {
      class: "rich-page-preview-block",
      "data-page-preview": "true",
      "data-url": attrs.url,
      "data-align": effectiveAlign,
      style: styleParts.join("; "),
    };

    if (attrs.title) blockAttrs["data-title"] = attrs.title;
    if (attrs.description) blockAttrs["data-description"] = attrs.description;
    if (attrs.image) blockAttrs["data-image"] = attrs.image;
    if (attrs.siteName) blockAttrs["data-site-name"] = attrs.siteName;
    if (attrs.width) blockAttrs["data-width"] = String(attrs.width);

    const linkAttrs: Record<string, string> = {
      class: "rich-page-preview",
      href: attrs.url,
      target: "_blank",
      rel: "noopener noreferrer",
    };

    const body: DOMOutputSpec[] = [
      [
        "span",
        { class: "rich-page-preview__site" },
        attrs.siteName || hostLabel(attrs.url),
      ],
      [
        "strong",
        { class: "rich-page-preview__title" },
        attrs.title || attrs.url,
      ],
    ];
    if (attrs.description) {
      body.push([
        "span",
        { class: "rich-page-preview__description" },
        attrs.description,
      ]);
    }
    body.push([
      "span",
      { class: "rich-page-preview__url" },
      attrs.url,
    ]);

    const children: DOMOutputSpec[] = [];
    if (attrs.image) {
      children.push([
        "span",
        { class: "rich-page-preview__media" },
        ["img", { src: attrs.image, alt: "", loading: "lazy" }],
      ]);
    }
    children.push(["span", { class: "rich-page-preview__body" }, ...body]);

    return ["div", blockAttrs, ["a", linkAttrs, ...children]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PagePreviewView);
  },
});

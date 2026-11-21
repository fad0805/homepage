"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";

import { AuthorImage } from "@/components/author-image";
import { ManuscriptParagraph } from "@/components/manuscript-paragraph";
import { ManuscriptTab } from "@/components/manuscript-tab";
import { PagePreview } from "@/components/page-preview";
import { AUTHOR_IMAGE_MAX_HEIGHT_REM } from "@/config/author";
import { apiFetch } from "@/lib/api";
import { findLinkTokens } from "@/lib/linkify";
import { useHorizontalScrollFade } from "@/lib/use-horizontal-scroll-fade";

import "@/public/styles/admin/author.scss";

const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export type EditorNotice = { type: "success" | "error"; text: string };

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Endpoint that accepts a multipart `file` field and returns `{ url }`. */
  uploadUrl: string;
  onNotice?: (notice: EditorNotice) => void;
  /** Reduce the editor's vertical height for compact forms. */
  compact?: boolean;
  /** Show a font-size picker in the toolbar. */
  enableFontSize?: boolean;
  /** Show the highlight toggle in the toolbar. */
  enableHighlight?: boolean;
  /** Match the editor's content typography to the public chapter view. */
  variant?: "default" | "chapter" | "workspace";
  /** Render as a read-only surface (used before a node is selected). */
  readOnly?: boolean;
  /** Receive the live editor instance for programmatic navigation. */
  onEditorReady?: (editor: Editor | null) => void;
  /** Reset the editor scroll position when the displayed document changes. */
  scrollResetKey?: string | number | null;
}

function ToolbarButton({
  children,
  onClick,
  active = false,
  disabled = false,
  title,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`admin-editor__button${active ? " is-active" : ""}${
        className ? ` ${className}` : ""
      }`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

interface ToolbarMenuItem {
  label: string;
  active?: boolean;
  onSelect: () => void;
}

function ToolbarMenu({
  label,
  items,
  active = false,
  disabled = false,
}: {
  label: string;
  items: ToolbarMenuItem[];
  active?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const positionPanel = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setPanelStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: Math.min(rect.left, Math.max(8, window.innerWidth - 152)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    positionPanel();
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [open, positionPanel]);

  return (
    <div className="admin-editor__menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`admin-editor__button admin-editor__menu-trigger${
          active ? " is-active" : ""
        }`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <span className="admin-editor__menu-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              style={panelStyle}
              className="admin-editor__menu-panel"
              role="menu"
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={`admin-editor__menu-item${
                    item.active ? " is-active" : ""
                  }`}
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function ToolbarRow({
  children,
  secondary = false,
}: {
  children: ReactNode;
  secondary?: boolean;
}) {
  const { ref, fadeClassName } = useHorizontalScrollFade<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={[
        "admin-editor__toolbar-row",
        secondary ? "admin-editor__toolbar-row--secondary" : "",
        fadeClassName,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "내용을 입력해주세요.",
  uploadUrl,
  onNotice,
  compact = false,
  enableFontSize = false,
  enableHighlight = false,
  variant = "default",
  readOnly = false,
  onEditorReady,
  scrollResetKey,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  const onNoticeRef = useRef(onNotice);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pasteImageRef = useRef<(file: File) => void>(() => {});
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loadingPagePreview, setLoadingPagePreview] = useState(false);
  const [htmlMode, setHtmlMode] = useState(false);
  const [htmlSource, setHtmlSource] = useState("");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onNoticeRef.current = onNotice;
  }, [onNotice]);

  const notify = useCallback((notice: EditorNotice) => {
    onNoticeRef.current?.(notice);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false,
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: "https",
        },
      }),
      ManuscriptParagraph,
      ManuscriptTab,
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      AuthorImage.configure({
        inline: false,
        allowBase64: false,
      }),
      PagePreview,
      Placeholder.configure({ placeholder }),
    ],
    content: value || "<p></p>",
    editable: !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        const files = Array.from(clipboard.files ?? []);
        let image = files.find((file) =>
          file.type.startsWith("image/"),
        );
        if (!image) {
          for (const item of Array.from(clipboard.items ?? [])) {
            if (
              item.kind === "file" &&
              item.type.startsWith("image/")
            ) {
              image = item.getAsFile() ?? undefined;
              if (image) break;
            }
          }
        }
        if (!image) return false;
        event.preventDefault();
        pasteImageRef.current(image);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(current.getHTML());
    },
  });

  useEffect(() => {
    if (!editor || htmlMode) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "<p></p>");
    }
    onEditorReady?.(editor);
  }, [editor, htmlMode, value, onEditorReady]);

  useEffect(() => {
    if (!editor) return;
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Switching documents reuses this component, so explicitly return to the top
  // instead of inheriting the previous document's scroll position.
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [scrollResetKey]);

  const toggleHtmlMode = useCallback(() => {
    if (!editor) return;
    if (htmlMode) {
      editor.commands.setContent(htmlSource || "<p></p>", {
        emitUpdate: true,
      });
      const nextHtml = editor.getHTML();
      onChangeRef.current(nextHtml);
      setHtmlMode(false);
      return;
    }
    setHtmlSource(editor.getHTML());
    setHtmlMode(true);
  }, [editor, htmlMode, htmlSource]);

  const setLink = useCallback(() => {
    if (!editor) return;

    const previousUrl = editor.getAttributes("link").href as
      | string
      | undefined;
    const url = window.prompt("링크 URL", previousUrl ?? "https://");
    if (url === null) return;

    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  }, [editor]);

  const linkifyEditorContent = useCallback(() => {
    if (!editor) return;

    const { state } = editor;
    const linkType = state.schema.marks.link;
    if (!linkType) return;

    const tr = state.tr;
    let changed = false;

    state.doc.descendants((node, pos) => {
      if (
        !node.isTextblock ||
        node.type.name === "codeBlock" ||
        node.content.size !== node.textContent.length
      ) {
        return;
      }

      for (const token of findLinkTokens(node.textContent)) {
        const from = pos + 1 + token.start;
        const to = pos + 1 + token.end;
        if (from >= to) continue;
        if (state.doc.rangeHasMark(from, to, linkType)) continue;

        const codeType = state.schema.marks.code;
        if (codeType && state.doc.rangeHasMark(from, to, codeType)) {
          continue;
        }

        tr.addMark(from, to, linkType.create({ href: token.href }));
        changed = true;
      }
    });

    if (!changed) return;

    tr.setMeta("preventAutolink", true);
    editor.view.dispatch(tr);
  }, [editor]);

  const insertPagePreview = useCallback(async () => {
    if (!editor) return;

    const input = window.prompt("페이지 URL", "https://");
    if (input === null) return;

    const raw = input.trim();
    if (!raw) return;

    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    setLoadingPagePreview(true);
    try {
      const preview = await apiFetch<{
        url: string;
        title: string;
        description: string | null;
        image: string | null;
        site_name: string | null;
      }>(`/api/embeds/preview?url=${encodeURIComponent(url)}`);

      editor
        .chain()
        .focus()
        .insertContent({
          type: "pagePreview",
          attrs: {
            url: preview.url,
            title: preview.title,
            description: preview.description,
            image: preview.image,
            siteName: preview.site_name,
          },
        })
        .run();

      notify({ type: "success", text: "페이지 미리보기를 추가했습니다." });
    } catch (error) {
      notify({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "페이지 미리보기를 불러오지 못했습니다.",
      });
    } finally {
      setLoadingPagePreview(false);
    }
  }, [editor, notify]);

  const uploadAndInsertImage = useCallback(
    async (file: File) => {
      if (!editor) return;

      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        notify({
          type: "error",
          text: "PNG / JPEG / WEBP / GIF 이미지만 업로드할 수 있습니다.",
        });
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        notify({
          type: "error",
          text: "이미지는 50MB 이하만 업로드할 수 있습니다.",
        });
        return;
      }

      setUploadingImage(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const uploaded = await apiFetch<{ url: string }>(uploadUrl, {
          method: "POST",
          body,
        });

        const size = await new Promise<{ width: number; height: number }>(
          (resolve, reject) => {
            const image = new Image();
            image.onload = () =>
              resolve({
                width: image.naturalWidth,
                height: image.naturalHeight,
              });
            image.onerror = () =>
              reject(new Error("이미지를 불러오지 못했습니다."));
            image.src = uploaded.url;
          },
        );

        const rootSize =
          parseFloat(getComputedStyle(document.documentElement).fontSize) ||
          16;
        const maxHeight = AUTHOR_IMAGE_MAX_HEIGHT_REM * rootSize;
        const ratio = size.height > 0 ? size.width / size.height : 1;
        const containerWidth = editor.view.dom.clientWidth || 800;
        let width = size.width;
        if (size.height > maxHeight) {
          width = maxHeight * ratio;
        }
        width = Math.min(width, containerWidth);

        editor
          .chain()
          .focus()
          .insertContent({
            type: "image",
            attrs: {
              src: uploaded.url,
              alt: file.name || "붙여넣은 이미지",
              width: Math.round(width),
              align: "center",
              wrap: false,
            },
          })
          .run();

        // Select the image we just inserted so its alignment and text-wrap
        // controls appear immediately in the editor.
        const inserted = { pos: -1 };
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === "image" && node.attrs.src === uploaded.url) {
            inserted.pos = pos;
            return false;
          }
          return true;
        });
        if (inserted.pos >= 0) {
          editor.chain().focus().setNodeSelection(inserted.pos).run();
        }

        notify({ type: "success", text: "이미지를 추가했습니다." });
      } catch (error) {
        notify({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "이미지를 업로드하지 못했습니다.",
        });
      } finally {
        setUploadingImage(false);
      }
    },
    [editor, notify, uploadUrl],
  );

  useEffect(() => {
    pasteImageRef.current = (file) => {
      void uploadAndInsertImage(file);
    };
  }, [uploadAndInsertImage]);

  const handleImageFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      await uploadAndInsertImage(file);
    },
    [uploadAndInsertImage],
  );

  const activeColor = editor?.getAttributes("textStyle").color;
  const textColor =
    typeof activeColor === "string" && /^#[0-9a-f]{6}$/i.test(activeColor)
      ? activeColor
      : "#2f803c";
  const activeHighlightColor = editor?.getAttributes("highlight").color;
  const highlightColor =
    typeof activeHighlightColor === "string" &&
    /^#[0-9a-f]{6}$/i.test(activeHighlightColor)
      ? activeHighlightColor
      : "#f5e27a";
  const imageAttrs = editor?.getAttributes("image") ?? {};
  const imageAlign: "left" | "center" | "right" =
    imageAttrs.align === "left" || imageAttrs.align === "right"
      ? imageAttrs.align
      : "center";
  const imageWrap = Boolean(imageAttrs.wrap) && imageAlign !== "center";
  const setImageWrap = useCallback(
    (nextWrap: boolean) => {
      if (!editor) return;

      const attrs = editor.getAttributes("image");
      const currentWidth =
        typeof attrs.width === "number" ? attrs.width : null;
      let nextWidth: number | null = null;

      // When text wrap is turned on, make sure the image leaves room for a
      // readable text column even in the narrower admin editor.
      if (nextWrap && !imageWrap) {
        const dom = editor.view.nodeDOM(
          editor.state.selection.from,
        ) as HTMLElement | null;
        const imageEl = dom?.querySelector("img") as HTMLImageElement | null;
        const displayedWidth =
          currentWidth ??
          (imageEl
            ? Math.round(imageEl.getBoundingClientRect().width)
            : null);
        const containerWidth = editor.view.dom.clientWidth || 800;
        const maxWrappedWidth = Math.round(containerWidth * 0.6);
        if (displayedWidth && displayedWidth > maxWrappedWidth) {
          nextWidth = maxWrappedWidth;
        }
      }

      editor
        .chain()
        .focus()
        .updateAttributes("image", {
          wrap: nextWrap,
          ...(nextWidth !== null ? { width: nextWidth } : {}),
        })
        .run();
    },
    [editor, imageWrap],
  );
  const isImageSelected = Boolean(editor?.isActive("image"));
  const paragraphIndent = Math.max(
    0,
    Number.parseInt(
      editor?.getAttributes("paragraph").indentLeft ?? "0",
      10,
    ) || 0,
  );
  const changeParagraphIndent = (delta: number) => {
    if (!editor) return;
    const next = Math.max(0, paragraphIndent + delta);
    editor
      .chain()
      .focus()
      .updateAttributes("paragraph", {
        indentLeft: next ? `${next}px` : null,
      })
      .run();
  };
  const alignMenuItems: ToolbarMenuItem[] = isImageSelected
    ? [
        {
          label: "왼쪽 정렬",
          active: imageAlign === "left",
          onSelect: () =>
            editor
              ?.chain()
              .focus()
              .updateAttributes("image", {
                align: "left",
                wrap: imageWrap,
              })
              .run(),
        },
        {
          label: "가운데 정렬",
          active: imageAlign === "center",
          onSelect: () =>
            editor
              ?.chain()
              .focus()
              .updateAttributes("image", {
                align: "center",
                wrap: false,
              })
              .run(),
        },
        {
          label: "오른쪽 정렬",
          active: imageAlign === "right",
          onSelect: () =>
            editor
              ?.chain()
              .focus()
              .updateAttributes("image", {
                align: "right",
                wrap: imageWrap,
              })
              .run(),
        },
        ...(imageAlign === "center"
          ? []
          : [
              {
                label: imageWrap ? "글씨 옆 배치 해제" : "글씨를 옆에 배치",
                active: imageWrap,
                onSelect: () => setImageWrap(!imageWrap),
              },
            ]),
      ]
    : [
        {
          label: "왼쪽 정렬",
          active: editor?.isActive({ textAlign: "left" }),
          onSelect: () => editor?.chain().focus().setTextAlign("left").run(),
        },
        {
          label: "가운데 정렬",
          active: editor?.isActive({ textAlign: "center" }),
          onSelect: () => editor?.chain().focus().setTextAlign("center").run(),
        },
        {
          label: "오른쪽 정렬",
          active: editor?.isActive({ textAlign: "right" }),
          onSelect: () => editor?.chain().focus().setTextAlign("right").run(),
        },
      ];
  const imageWidth =
    typeof imageAttrs.width === "number" ? imageAttrs.width : null;
  const pagePreviewAttrs = editor?.getAttributes("pagePreview") ?? {};
  const pagePreviewAlign: "left" | "center" | "right" =
    pagePreviewAttrs.align === "left" || pagePreviewAttrs.align === "right"
      ? pagePreviewAttrs.align
      : "center";
  const pagePreviewWidth =
    typeof pagePreviewAttrs.width === "number"
      ? pagePreviewAttrs.width
      : null;

  return (
    <div
      className={`admin-editor${compact ? " admin-editor--compact" : ""}${
        variant === "chapter" ? " admin-editor--chapter" : ""
      }${
        variant === "workspace"
          ? " ms-editor ms-editor--workspace admin-editor--chapter"
          : ""
      }${
        readOnly ? " ms-editor--placeholder" : ""
      }`}
    >
      <div className="admin-editor__toolbar">
        <ToolbarRow>
          {enableFontSize ? (
            <label className="admin-editor__font-size">
              <span>크기</span>
              <select
                value={
                  (editor?.getAttributes("textStyle").fontSize as string) ??
                  "13pt"
                }
                disabled={!editor}
                onChange={(event) => {
                  const size = event.target.value;
                  // 13pt is Scrivener's logical default. Outside the manuscript
                  // workspace there is no -3pt CSS, so writing it explicitly
                  // makes the text jump larger. Clear the override instead and
                  // let the editor's base size (already 10pt for published
                  // chapters) take over.
                  if (size && size !== "13pt") {
                    editor?.chain().focus().setFontSize(size).run();
                  } else {
                    editor?.chain().focus().unsetFontSize().run();
                  }
                }}
              >
                <option value="">기본</option>
                <option value="10pt">10pt</option>
                <option value="11pt">11pt</option>
                <option value="12pt">12pt</option>
                <option value="13pt">13pt (기본)</option>
                <option value="14pt">14pt</option>
                <option value="16pt">16pt</option>
                <option value="18pt">18pt</option>
                <option value="21pt">21pt</option>
                <option value="24pt">24pt</option>
                <option value="30pt">30pt</option>
                <option value="36pt">36pt</option>
              </select>
            </label>
          ) : null}
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive("bold")}
            disabled={!editor}
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive("italic")}
            disabled={!editor}
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            active={editor?.isActive("underline")}
            disabled={!editor}
          >
            <u>U</u>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            active={editor?.isActive("strike")}
            disabled={!editor}
          >
            <s>S</s>
          </ToolbarButton>
          <ToolbarMenu
            label="형식"
            active={editor?.isActive("heading")}
            disabled={!editor}
            items={[
              {
                label: "본문",
                active:
                  editor?.isActive("paragraph") &&
                  !editor?.isActive("heading"),
                onSelect: () => editor?.chain().focus().setParagraph().run(),
              },
              {
                label: "H2",
                active: editor?.isActive("heading", { level: 2 }),
                onSelect: () =>
                  editor?.chain().focus().setHeading({ level: 2 }).run(),
              },
              {
                label: "H3",
                active: editor?.isActive("heading", { level: 3 }),
                onSelect: () =>
                  editor?.chain().focus().setHeading({ level: 3 }).run(),
              },
            ]}
          />
          <ToolbarMenu
            label="정렬"
            active={
              isImageSelected
                ? imageAlign !== "center" || imageWrap
                : editor?.isActive({ textAlign: "center" }) ||
                  editor?.isActive({ textAlign: "right" })
            }
            disabled={!editor}
            items={alignMenuItems}
          />
          <ToolbarButton
            onClick={() => changeParagraphIndent(-24)}
            disabled={!editor || paragraphIndent === 0}
            title="내어쓰기 (Mod-[)"
          >
            ⇤
          </ToolbarButton>
          <ToolbarButton
            onClick={() => changeParagraphIndent(24)}
            disabled={!editor}
            title="들여쓰기 (Mod-])"
          >
            ⇥
          </ToolbarButton>
          <ToolbarMenu
            label="목록"
            active={
              editor?.isActive("bulletList") ||
              editor?.isActive("orderedList")
            }
            disabled={!editor}
            items={[
              {
                label: "글머리 목록",
                active: editor?.isActive("bulletList"),
                onSelect: () =>
                  editor?.chain().focus().toggleBulletList().run(),
              },
              {
                label: "번호 목록",
                active: editor?.isActive("orderedList"),
                onSelect: () =>
                  editor?.chain().focus().toggleOrderedList().run(),
              },
            ]}
          />
          <ToolbarButton
            onClick={() => editor?.chain().focus().undo().run()}
            disabled={!editor || !editor.can().undo()}
          >
            ↶
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().redo().run()}
            disabled={!editor || !editor.can().redo()}
          >
            ↷
          </ToolbarButton>
          <ToolbarButton
            onClick={toggleHtmlMode}
            active={htmlMode}
            disabled={!editor}
            title={
              htmlMode
                ? "에디터로 돌아가기"
                : "HTML 소스 직접 편집"
            }
            className="admin-editor__html-view"
          >
            HTML
          </ToolbarButton>
        </ToolbarRow>
        <ToolbarRow secondary>
          <div className="admin-editor__color">
            <span>색</span>
            <input
              type="color"
              value={textColor}
              disabled={!editor}
              aria-label="글자 색"
              onChange={(event) =>
                editor?.chain().focus().setColor(event.target.value).run()
              }
            />
            <button
              type="button"
              className="admin-editor__color-reset"
              onClick={() => editor?.chain().focus().unsetColor().run()}
              disabled={!editor}
              title="기본 색으로 초기화"
              aria-label="색 초기화"
            >
              ×
            </button>
          </div>
          {enableHighlight ? (
            <div className="admin-editor__highlight">
              <button
                type="button"
                className={`admin-editor__button${
                  editor?.isActive("highlight") ? " is-active" : ""
                }`}
                onClick={() =>
                  editor
                    ?.chain()
                    .focus()
                    .toggleHighlight({ color: highlightColor })
                    .run()
                }
                disabled={!editor}
                title="형광펜"
              >
                형광
              </button>
              <input
                type="color"
                value={highlightColor}
                disabled={!editor}
                aria-label="형광 배경색"
                onChange={(event) =>
                  editor
                    ?.chain()
                    .focus()
                    .setHighlight({ color: event.target.value })
                    .run()
                }
              />
              <button
                type="button"
                className="admin-editor__color-reset"
                onClick={() =>
                  editor?.chain().focus().unsetHighlight().run()
                }
                disabled={!editor}
                title="형광 초기화"
                aria-label="형광 초기화"
              >
                ×
              </button>
            </div>
          ) : null}
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            active={editor?.isActive("blockquote")}
            disabled={!editor}
          >
            인용
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleCode().run()}
            active={editor?.isActive("code")}
            disabled={!editor}
          >
            코드
          </ToolbarButton>
          <ToolbarButton
            onClick={setLink}
            active={editor?.isActive("link")}
            disabled={!editor}
          >
            링크
          </ToolbarButton>
          <ToolbarButton
            onClick={insertPagePreview}
            disabled={!editor || loadingPagePreview}
            title="페이지 미리보기 임베드"
          >
            {loadingPagePreview ? "불러오는 중..." : "페이지"}
          </ToolbarButton>
          <ToolbarButton
            onClick={() => imageInputRef.current?.click()}
            disabled={!editor || uploadingImage}
          >
            {uploadingImage ? "업로드 중..." : "이미지"}
          </ToolbarButton>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={handleImageFile}
          />
        </ToolbarRow>
      </div>
      {editor?.isActive("image") ? (
        <div className="admin-editor__image-controls">
          <span className="admin-editor__image-label">이미지 정렬</span>
          <ToolbarButton
            onClick={() =>
              editor
                .chain()
                .focus()
                .updateAttributes("image", {
                  align: "left",
                  wrap: imageWrap,
                })
                .run()
            }
            active={imageAlign === "left"}
          >
            왼쪽
          </ToolbarButton>
          <ToolbarButton
            onClick={() =>
              editor
                .chain()
                .focus()
                .updateAttributes("image", {
                  align: "center",
                  wrap: false,
                })
                .run()
            }
            active={imageAlign === "center"}
          >
            가운데
          </ToolbarButton>
          <ToolbarButton
            onClick={() =>
              editor
                .chain()
                .focus()
                .updateAttributes("image", {
                  align: "right",
                  wrap: imageWrap,
                })
                .run()
            }
            active={imageAlign === "right"}
          >
            오른쪽
          </ToolbarButton>
          <label
            className="admin-editor__image-wrap"
            title="왼쪽/오른쪽 정렬에서 이미지 옆에 글씨를 배치합니다. 이미지가 넓으면 글씨가 들어갈 공간을 확보하기 위해 자동으로 줄어듭니다."
          >
            <input
              type="checkbox"
              checked={imageWrap}
              disabled={imageAlign === "center"}
              onChange={(event) => setImageWrap(event.target.checked)}
            />
            글씨를 옆에 배치
          </label>
          {imageWidth ? (
            <span className="admin-editor__image-size">{imageWidth}px</span>
          ) : null}
        </div>
      ) : null}
      {editor?.isActive("pagePreview") ? (
        <div className="admin-editor__image-controls">
          <span className="admin-editor__image-label">페이지</span>
          <ToolbarButton
            onClick={() =>
              editor
                .chain()
                .focus()
                .updateAttributes("pagePreview", { align: "left" })
                .run()
            }
            active={pagePreviewAlign === "left"}
          >
            왼쪽
          </ToolbarButton>
          <ToolbarButton
            onClick={() =>
              editor
                .chain()
                .focus()
                .updateAttributes("pagePreview", { align: "center" })
                .run()
            }
            active={pagePreviewAlign === "center"}
          >
            가운데
          </ToolbarButton>
          <ToolbarButton
            onClick={() =>
              editor
                .chain()
                .focus()
                .updateAttributes("pagePreview", { align: "right" })
                .run()
            }
            active={pagePreviewAlign === "right"}
          >
            오른쪽
          </ToolbarButton>
          <ToolbarButton
            onClick={() =>
              editor
                .chain()
                .focus()
                .updateAttributes("pagePreview", { width: null })
                .run()
            }
            disabled={!pagePreviewWidth}
          >
            전체 너비
          </ToolbarButton>
          {pagePreviewWidth ? (
            <span className="admin-editor__image-size">
              {pagePreviewWidth}px
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        ref={contentRef}
        className={`admin-editor__content${
          variant === "workspace" ? " ms-editor__surface" : ""
        }`}
        onClick={
          htmlMode ? undefined : () => editor?.chain().focus().run()
        }
        onBlur={
          htmlMode
            ? undefined
            : (event) => {
                const related = event.relatedTarget;
                if (
                  related instanceof Node &&
                  event.currentTarget
                    .closest(".admin-editor")
                    ?.contains(related)
                ) {
                  return;
                }
                linkifyEditorContent();
              }
        }
      >
        {htmlMode ? (
          <textarea
            className="admin-editor__html-source"
            value={htmlSource}
            wrap="soft"
            spellCheck={false}
            aria-label="HTML 소스"
            onChange={(event) => {
              const next = event.target.value;
              setHtmlSource(next);
              onChangeRef.current(next);
            }}
          />
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
    </div>
  );
}

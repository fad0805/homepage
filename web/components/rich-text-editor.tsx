"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";

import { AuthorImage } from "@/components/author-image";
import { AUTHOR_IMAGE_MAX_HEIGHT_REM } from "@/config/author";
import { apiFetch } from "@/lib/api";

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
}

function ToolbarButton({
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`admin-editor__button${active ? " is-active" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "내용을 입력해주세요.",
  uploadUrl,
  onNotice,
  compact = false,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  const onNoticeRef = useRef(onNotice);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

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
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
        },
      }),
      TextStyle,
      Color,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      AuthorImage.configure({
        inline: false,
        allowBase64: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "<p></p>",
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(current.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "<p></p>");
    }
  }, [editor, value]);

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

  const handleImageFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !editor) return;

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
              alt: file.name,
              width: Math.round(width),
              align: "center",
              wrap: false,
            },
          })
          .run();

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

  const activeColor = editor?.getAttributes("textStyle").color;
  const textColor =
    typeof activeColor === "string" && /^#[0-9a-f]{6}$/i.test(activeColor)
      ? activeColor
      : "#2f803c";
  const imageAttrs = editor?.getAttributes("image") ?? {};
  const imageAlign: "left" | "center" | "right" =
    imageAttrs.align === "left" || imageAttrs.align === "right"
      ? imageAttrs.align
      : "center";
  const imageWrap = Boolean(imageAttrs.wrap) && imageAlign !== "center";
  const imageWidth =
    typeof imageAttrs.width === "number" ? imageAttrs.width : null;

  return (
    <div className={`admin-editor${compact ? " admin-editor--compact" : ""}`}>
      <div className="admin-editor__toolbar">
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
        <ToolbarButton
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={editor?.isActive("heading", { level: 2 })}
          disabled={!editor}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 3 }).run()
          }
          active={editor?.isActive("heading", { level: 3 })}
          disabled={!editor}
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
          active={editor?.isActive({ textAlign: "left" })}
          disabled={!editor}
        >
          좌
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor?.chain().focus().setTextAlign("center").run()
          }
          active={editor?.isActive({ textAlign: "center" })}
          disabled={!editor}
        >
          중
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor?.chain().focus().setTextAlign("right").run()
          }
          active={editor?.isActive({ textAlign: "right" })}
          disabled={!editor}
        >
          우
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive("bulletList")}
          disabled={!editor}
        >
          • 목록
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive("orderedList")}
          disabled={!editor}
        >
          1. 목록
        </ToolbarButton>
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
        <label className="admin-editor__color">
          <span>색</span>
          <input
            type="color"
            value={textColor}
            disabled={!editor}
            onChange={(event) =>
              editor?.chain().focus().setColor(event.target.value).run()
            }
          />
        </label>
        <ToolbarButton
          onClick={() => editor?.chain().focus().unsetColor().run()}
          disabled={!editor}
        >
          색 초기화
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
      </div>
      {editor?.isActive("image") ? (
        <div className="admin-editor__image-controls">
          <span className="admin-editor__image-label">이미지</span>
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
          <label className="admin-editor__image-wrap">
            <input
              type="checkbox"
              checked={imageWrap}
              disabled={imageAlign === "center"}
              onChange={(event) =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("image", {
                    wrap: event.target.checked,
                  })
                  .run()
              }
            />
            텍스트 감싸기
          </label>
          {imageWidth ? (
            <span className="admin-editor__image-size">{imageWidth}px</span>
          ) : null}
        </div>
      ) : null}
      <div
        className="admin-editor__content"
        onClick={() => editor?.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

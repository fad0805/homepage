"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";

import { AuthorImage } from "@/components/author-image";
import {
  AUTHOR_IMAGE_MAX_HEIGHT_REM,
  profileToHtml,
  type AuthorProfile,
} from "@/config/author";

import "@/public/styles/admin/author.scss";

type Notice = { type: "success" | "error"; text: string };

const MAX_AUTHOR_IMAGE_SIZE = 50 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

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

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers,
  });

  if (response.status === 401) {
    window.location.href = "/signin";
    throw new Error("로그인이 필요합니다.");
  }

  if (!response.ok) {
    let detail = `요청에 실패했습니다. (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") {
        detail = data.detail;
      }
    } catch {
      // Ignore malformed error bodies.
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export default function AdminProfile() {
  const [profile, setProfile] = useState<AuthorProfile | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const pendingContent = useRef<string | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

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
      Placeholder.configure({
        placeholder: "작가소개 내용을 입력해주세요.",
      }),
    ],
    content: "",
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
  });

  useEffect(() => {
    editorRef.current = editor;
    if (editor && pendingContent.current !== null) {
      editor.commands.setContent(pendingContent.current);
      pendingContent.current = null;
    }
  }, [editor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profiles = await apiFetch<AuthorProfile[]>("/api/profiles");
      const first = profiles[0];
      const nextTitle = first?.title ?? "";
      const nextSubtitle = first?.subtitle ?? "";
      const nextProfile = first?.profile ?? "";
      const nextHtml = profileToHtml(nextProfile);

      setProfile(first ?? null);
      setTitle(nextTitle);
      setSubtitle(nextSubtitle);

      if (editorRef.current) {
        editorRef.current.commands.setContent(nextHtml);
      } else {
        pendingContent.current = nextHtml;
      }
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "프로필을 불러오지 못했습니다.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setLink = () => {
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
  };

  const handleImageFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editor) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setNotice({
        type: "error",
        text: "PNG / JPEG / WEBP / GIF 이미지만 업로드할 수 있습니다.",
      });
      return;
    }
    if (file.size > MAX_AUTHOR_IMAGE_SIZE) {
      setNotice({
        type: "error",
        text: "이미지는 50MB 이하만 업로드할 수 있습니다.",
      });
      return;
    }

    setUploadingImage(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const uploaded = await apiFetch<{ url: string }>(
        "/api/profiles/upload",
        {
          method: "POST",
          body,
        },
      );

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

      setNotice({ type: "success", text: "이미지를 추가했습니다." });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "이미지를 업로드하지 못했습니다.",
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextTitle = title.trim();
    const nextSubtitle = subtitle.trim();
    const nextContent = editor?.getHTML() ?? "";
    const plainText = nextContent
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();

    if (!nextTitle) {
      setNotice({ type: "error", text: "제목을 입력해주세요." });
      return;
    }

    if (!plainText) {
      setNotice({ type: "error", text: "소개 내용을 입력해주세요." });
      return;
    }

    setSaving(true);
    try {
      if (profile?.id) {
        const updated = await apiFetch<AuthorProfile>(
          `/api/profiles/${profile.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              title: nextTitle,
              subtitle: nextSubtitle,
              profile: nextContent,
            }),
          },
        );
        setProfile(updated);
      } else {
        const created = await apiFetch<AuthorProfile>("/api/profiles", {
          method: "POST",
          body: JSON.stringify({
            title: nextTitle,
            subtitle: nextSubtitle,
            profile: nextContent,
          }),
        });
        setProfile(created);
      }
      setTitle(nextTitle);
      setSubtitle(nextSubtitle);
      setNotice({ type: "success", text: "프로필을 저장했습니다." });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "프로필을 저장하지 못했습니다.",
      });
    } finally {
      setSaving(false);
    }
  };

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
    <div id="admin-author">
      <header className="admin-author-header">
        <div>
          <h1>프로필 관리</h1>
          <p className="admin-author-hint">
            작가소개 페이지에 표시할 제목, 서브타이틀, 소개를 편집합니다.
          </p>
        </div>
        <Link className="admin-button" href="/author" target="_blank">
          공개 페이지 보기
        </Link>
      </header>

      {notice ? (
        <div className={`admin-notice admin-notice-${notice.type}`}>
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <p className="admin-author-loading">불러오는 중...</p>
      ) : (
        <form className="admin-author-form" onSubmit={handleSubmit}>
          <label className="admin-field">
            <span>제목</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="작가 이름 또는 소개 제목"
            />
          </label>

          <label className="admin-field">
            <span>서브타이틀</span>
            <input
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="제목 아래에 표시할 문구"
            />
          </label>

          <div className="admin-field">
            <span>소개</span>
            <div className="admin-editor">
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
                  onClick={() =>
                    editor?.chain().focus().toggleUnderline().run()
                  }
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
                  onClick={() =>
                    editor?.chain().focus().setTextAlign("left").run()
                  }
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
                  onClick={() =>
                    editor?.chain().focus().toggleBulletList().run()
                  }
                  active={editor?.isActive("bulletList")}
                  disabled={!editor}
                >
                  • 목록
                </ToolbarButton>
                <ToolbarButton
                  onClick={() =>
                    editor?.chain().focus().toggleOrderedList().run()
                  }
                  active={editor?.isActive("orderedList")}
                  disabled={!editor}
                >
                  1. 목록
                </ToolbarButton>
                <ToolbarButton
                  onClick={() =>
                    editor?.chain().focus().toggleBlockquote().run()
                  }
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
                      editor
                        ?.chain()
                        .focus()
                        .setColor(event.target.value)
                        .run()
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
                    <span className="admin-editor__image-size">
                      {imageWidth}px
                    </span>
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
          </div>

          <div className="admin-author-actions">
            <button
              type="submit"
              className="admin-button primary"
              disabled={saving || !editor}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

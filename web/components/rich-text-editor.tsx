"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";

import "@/public/styles/admin/author.scss";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
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
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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

  const activeColor = editor?.getAttributes("textStyle").color;
  const textColor =
    typeof activeColor === "string" && /^#[0-9a-f]{6}$/i.test(activeColor)
      ? activeColor
      : "#2f803c";

  return (
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
      <div
        className="admin-editor__content"
        onClick={() => editor?.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

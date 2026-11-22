"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { RichTextEditor } from "@/components/rich-text-editor";
import { apiFetch } from "@/lib/api";

import "@/public/styles/admin/author.scss";
import "@/public/styles/admin/index.scss";

interface IndexPage {
  scope: "author" | "integrated";
  user_id: number | null;
  title: string;
  subtitle: string;
  copyright_name: string;
  content_html: string;
}

type Notice = { type: "success" | "error"; text: string };

export default function AdminIndex() {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [copyrightName, setCopyrightName] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<IndexPage>("/api/index-page?scope=integrated");
      setTitle(data.title);
      setSubtitle(data.subtitle);
      setCopyrightName(data.copyright_name);
      setContent(data.content_html);
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "인덱스 페이지를 불러오지 못했습니다.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const updated = await apiFetch<IndexPage>("/api/index-page", {
        method: "PUT",
        body: JSON.stringify({
          scope: "integrated",
          title,
          subtitle,
          copyright_name: copyrightName,
          content_html: content,
        }),
      });
      setTitle(updated.title);
      setSubtitle(updated.subtitle);
      setCopyrightName(updated.copyright_name);
      setContent(updated.content_html);
      setNotice({ type: "success", text: "인덱스 페이지를 저장했습니다." });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "인덱스 페이지를 저장하지 못했습니다.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="admin-index">
      <header className="admin-author-header">
        <div>
          <h1>인덱스 관리</h1>
          <p className="admin-author-hint">
            화면 상단에 표시할 사이트 제목·부제, 푸터 카피라이트 이름, 메인
            인덱스(/) 내용을 편집합니다. 제목은 브라우저 탭 이름으로도
            사용됩니다.
          </p>
        </div>
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
          <div className="admin-field">
            <span>화면에 표시되는 타이틀</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="상단 사이트 이름 · 브라우저 탭 제목"
              maxLength={120}
            />
          </div>

          <div className="admin-field">
            <span>화면에 표시되는 부제</span>
            <input
              type="text"
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="사이트 이름 아래에 작게 표시됩니다."
              maxLength={160}
            />
            <small className="admin-field-hint">
              영문자는 화면에 대문자로 표시됩니다.
            </small>
          </div>

          <div className="admin-field">
            <span>인덱스 내용</span>
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="메인 인덱스에 표시할 내용을 입력해주세요."
              uploadUrl="/api/index-page/upload"
              onNotice={setNotice}
              enableFontSize
              enableHighlight
            />
          </div>

          <div className="admin-field">
            <span>카피라이트 이름</span>
            <input
              type="text"
              value={copyrightName}
              onChange={(event) => setCopyrightName(event.target.value)}
              placeholder="저작권 표시에 사용할 이름"
              maxLength={120}
            />
            <small className="admin-field-hint">
              비워두면 이름 없이 저작권 문구가 표시됩니다.
            </small>
          </div>

          <div className="admin-author-actions">
            <button
              type="submit"
              className="admin-button primary"
              disabled={saving}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

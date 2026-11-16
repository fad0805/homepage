"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { RichTextEditor } from "@/components/rich-text-editor";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";

import "@/public/styles/admin/author.scss";
import "@/public/styles/admin/index.scss";

interface IndexPage {
  scope: "author" | "integrated";
  user_id: number | null;
  content_html: string;
}

type Notice = { type: "success" | "error"; text: string };
type IndexScope = "author" | "integrated";

export default function AdminIndex() {
  const { isAdmin } = useAuth();
  const [scope, setScope] = useState<IndexScope>("author");
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<IndexPage>(
        scope === "integrated"
          ? "/api/index-page?scope=integrated"
          : "/api/index-page/mine",
      );
      setContent(data.content_html);
      setSavedContent(data.content_html);
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
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleScopeChange = (next: IndexScope) => {
    if (next === scope) return;
    if (
      content !== savedContent &&
      !window.confirm(
        "저장하지 않은 변경사항이 있습니다. 범위를 바꿀까요?",
      )
    ) {
      return;
    }
    setNotice(null);
    setScope(next);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const updated = await apiFetch<IndexPage>("/api/index-page", {
        method: "PUT",
        body: JSON.stringify({
          scope,
          content_html: content,
        }),
      });
      setContent(updated.content_html);
      setSavedContent(updated.content_html);
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
            메인 인덱스에 표시할 내용을 리치 텍스트로 편집합니다.
          </p>
        </div>
        <div className="admin-index-meta">
          {isAdmin ? (
            <label className="admin-index-scope">
              <span>관리 대상</span>
              <select
                value={scope}
                onChange={(event) =>
                  handleScopeChange(event.target.value as IndexScope)
                }
              >
                <option value="author">내 인덱스</option>
                <option value="integrated">통합 페이지 인덱스</option>
              </select>
            </label>
          ) : null}
          <span className="admin-index-target">
            {scope === "integrated"
              ? "통합 메인 페이지 /"
              : "작가 메인 페이지 /@slug"}
          </span>
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

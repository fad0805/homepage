"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";

import { RichTextEditor } from "@/components/rich-text-editor";
import { profileToHtml, type AuthorProfile } from "@/config/author";

import "@/public/styles/admin/author.scss";

type Notice = { type: "success" | "error"; text: string };

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  let response = await fetch(url, {
    credentials: "include",
    ...init,
    headers,
  });

  // Retry once when a concurrent request just rotated the auth cookies.
  if (response.status === 401) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    response = await fetch(url, {
      credentials: "include",
      ...init,
      headers,
    });
  }

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
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

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
      setContent(nextHtml);
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextTitle = title.trim();
    const nextSubtitle = subtitle.trim();
    const nextContent = content;
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
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="작가소개 내용을 입력해주세요."
              uploadUrl="/api/profiles/upload"
              onNotice={setNotice}
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

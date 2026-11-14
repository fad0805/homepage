"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { apiFetch } from "@/lib/api";

import "@/public/styles/admin/account.scss";

interface Account {
  username: string;
  role: string;
  nickname: string;
  slug: string;
}

type Notice = { type: "success" | "error"; text: string };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function AdminAccount() {
  const [account, setAccount] = useState<Account | null>(null);
  const [nickname, setNickname] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Account>("/api/users/me/account");
      setAccount(data);
      setNickname(data.nickname);
      setSlug(data.slug);
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "계정 정보를 불러오지 못했습니다.",
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
    const nextNickname = nickname.trim();
    const nextSlug = slug.trim().toLowerCase();

    if (!nextNickname) {
      setNotice({ type: "error", text: "닉네임을 입력해주세요." });
      return;
    }
    if (!SLUG_PATTERN.test(nextSlug)) {
      setNotice({
        type: "error",
        text: "URL 표시명은 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.",
      });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const updated = await apiFetch<Account>("/api/users/me/account", {
        method: "PUT",
        body: JSON.stringify({
          nickname: nextNickname,
          slug: nextSlug,
        }),
      });
      setAccount(updated);
      setNickname(updated.nickname);
      setSlug(updated.slug);
      setNotice({ type: "success", text: "계정 정보를 저장했습니다." });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "계정 정보를 저장하지 못했습니다.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="admin-account">
      <header className="admin-account-header">
        <div>
          <h1>계정 관리</h1>
          <p className="admin-account-hint">
            공개 사이트에 표시할 닉네임과 주소 표시명을 설정합니다.
          </p>
        </div>
      </header>

      {notice ? (
        <div className={`admin-notice admin-notice-${notice.type}`}>
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <p className="admin-account-loading">불러오는 중...</p>
      ) : (
        <form className="admin-account-form" onSubmit={handleSubmit}>
          <div
            className={`admin-account-summary${
              account?.role === "admin" ? "" : " is-single"
            }`}
          >
            <div>
              <span>아이디</span>
              <strong>{account?.username ?? ""}</strong>
            </div>
            {account?.role === "admin" ? (
              <div>
                <span>권한</span>
                <strong>관리자</strong>
              </div>
            ) : null}
          </div>

          <label className="admin-field">
            <span>닉네임</span>
            <input
              value={nickname}
              maxLength={80}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="공개 사이트에 표시할 이름"
            />
          </label>

          <label className="admin-field">
            <span>URL 표시명</span>
            <input
              value={slug}
              maxLength={48}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="예: aramkim"
            />
          </label>

          <p className="admin-account-preview">
            공개 주소: <strong>/@{slug.trim().toLowerCase() || "..."}</strong>
          </p>
          <p className="admin-account-help">
            영문 소문자, 숫자, 하이픈만 사용할 수 있습니다. 공개 주소가
            바뀌면 기존 링크는 더 이상 연결되지 않습니다.
          </p>

          <div className="admin-account-actions">
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

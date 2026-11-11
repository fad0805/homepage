"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

import "@/public/styles/admin/connections.scss";

type MastodonVisibility = "public" | "unlisted" | "private";

interface MastodonSettings {
  enabled: boolean;
  instance_url: string | null;
  site_url: string | null;
  visibility: MastodonVisibility;
  has_access_token: boolean;
  access_token_hint: string | null;
  updated_at: string | null;
}

interface MastodonTestResult {
  ok: boolean;
  account: string | null;
  display_name: string | null;
  message: string | null;
}

type Notice = { type: "success" | "error"; text: string };

export default function AdminConnections() {
  const [enabled, setEnabled] = useState(false);
  const [enabledTouched, setEnabledTouched] = useState(false);
  const [instanceUrl, setInstanceUrl] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [visibility, setVisibility] =
    useState<MastodonVisibility>("public");
  const [accessToken, setAccessToken] = useState("");
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [tokenHint, setTokenHint] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [postingTest, setPostingTest] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((type: Notice["type"], text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ type, text });
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<MastodonSettings>(
        "/api/settings/mastodon",
      );
      setEnabled(data.enabled);
      setEnabledTouched(false);
      setInstanceUrl(data.instance_url ?? "");
      setSiteUrl(data.site_url || window.location.origin);
      setVisibility(data.visibility ?? "public");
      setHasAccessToken(data.has_access_token);
      setTokenHint(data.access_token_hint);
      setUpdatedAt(data.updated_at);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "연결 설정을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        instance_url: instanceUrl.trim() || null,
        site_url: siteUrl.trim() || null,
        visibility,
        access_token: accessToken.trim() || null,
      };
      if (enabledTouched) {
        payload.enabled = enabled;
      }

      const data = await apiFetch<MastodonSettings>(
        "/api/settings/mastodon",
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
      setEnabled(data.enabled);
      setEnabledTouched(false);
      setInstanceUrl(data.instance_url ?? "");
      setSiteUrl(data.site_url ?? "");
      setVisibility(data.visibility ?? "public");
      setHasAccessToken(data.has_access_token);
      setTokenHint(data.access_token_hint);
      setUpdatedAt(data.updated_at);
      setAccessToken("");
      notify("success", "연결 설정을 저장했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "연결 설정을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (testing) return;

    setTesting(true);
    try {
      const result = await apiFetch<MastodonTestResult>(
        "/api/settings/mastodon/test",
        {
          method: "POST",
          body: JSON.stringify({
            instance_url: instanceUrl.trim() || null,
            access_token: accessToken.trim() || null,
          }),
        },
      );
      const name = result.account
        ? `@${result.account}`
        : result.display_name || "마스토돈 계정";
      notify("success", `${name} 연결에 성공했습니다.`);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "마스토돈 연결 테스트에 실패했습니다.",
      );
    } finally {
      setTesting(false);
    }
  };

  const handleTestPost = async () => {
    if (postingTest) return;
    if (
      !window.confirm(
        "마스토돈 계정에 테스트 알림을 실제로 게시할까요?",
      )
    ) {
      return;
    }

    setPostingTest(true);
    try {
      await apiFetch("/api/settings/mastodon/test-status", {
        method: "POST",
      });
      notify("success", "마스토돈에 테스트 알림을 게시했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "테스트 알림을 게시하지 못했습니다.",
      );
    } finally {
      setPostingTest(false);
    }
  };

  return (
    <div id="admin-connections">
      <header className="admin-connections-toolbar">
        <div>
          <h1>연결 관리</h1>
          <p className="admin-connections-hint">
            목차나 삽화를 발행하면 마스토돈 계정에 자동으로 알림을
            게시합니다. 예약 발행한 목차는 발행 시각에 맞춰
            게시됩니다.
          </p>
        </div>
      </header>

      {notice ? (
        <p className={`admin-notice admin-notice-${notice.type}`}>
          {notice.text}
        </p>
      ) : null}

      {!loading && !enabled ? (
        <p className="admin-connections-disabled">
          자동 알림이 꺼져 있습니다. 알림을 받으려면 아래에서 자동
          알림을 켜고 저장해주세요.
        </p>
      ) : null}

      {loading ? (
        <p className="admin-connections-state">불러오는 중...</p>
      ) : (
        <form className="admin-connections-card" onSubmit={handleSave}>
          <div className="admin-connections-card__header">
            <div>
              <h2>마스토돈 알림 API</h2>
              <p>
                인스턴스와 액세스 토큰을 저장하면 발행 알림이
                활성화됩니다.
              </p>
            </div>
            <label className="admin-connections-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => {
                  setEnabled(event.target.checked);
                  setEnabledTouched(true);
                }}
              />
              <span>{enabled ? "자동 알림 켜짐" : "자동 알림 꺼짐"}</span>
            </label>
          </div>

          <label className="admin-field">
            <span>인스턴스 주소</span>
            <input
              value={instanceUrl}
              onChange={(event) => setInstanceUrl(event.target.value)}
              placeholder="예: mastodon.social"
              autoComplete="off"
            />
          </label>

          <label className="admin-field">
            <span>액세스 토큰</span>
            <input
              type="password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder={
                hasAccessToken
                  ? "저장된 토큰 사용 중 · 변경할 때만 입력"
                  : "마스토돈 액세스 토큰"
              }
              autoComplete="new-password"
            />
          </label>

          <p className="admin-connections-token-status">
            {hasAccessToken
              ? `저장된 토큰: ${tokenHint ?? "••••"}`
              : "저장된 토큰이 없습니다."}
            {updatedAt ? ` · 마지막 저장 ${formatDateTime(updatedAt)}` : ""}
          </p>

          <label className="admin-field">
            <span>사이트 공개 주소</span>
            <input
              value={siteUrl}
              onChange={(event) => setSiteUrl(event.target.value)}
              placeholder="예: https://example.com"
              autoComplete="off"
            />
          </label>
          <p className="admin-connections-help">
            알림 게시물에 들어갈 목차·삽화 링크의 기본 주소입니다.
          </p>

          <label className="admin-field">
            <span>공개 범위</span>
            <select
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as MastodonVisibility)
              }
            >
              <option value="public">공개</option>
              <option value="unlisted">미공개</option>
              <option value="private">팔로워만</option>
            </select>
          </label>
          <p className="admin-connections-help">
            공개는 누구나 볼 수 있고, 미공개는 공개 타임라인에서
            제외됩니다. 팔로워만은 팔로워에게만 표시됩니다.
          </p>

          <div className="admin-connections-actions">
            <button
              type="button"
              className="admin-button"
              onClick={handleTest}
              disabled={testing || saving || postingTest}
            >
              {testing ? "확인 중..." : "연결 테스트"}
            </button>
            <button
              type="button"
              className="admin-button"
              onClick={handleTestPost}
              disabled={testing || saving || postingTest}
            >
              {postingTest ? "게시 중..." : "테스트 알림 게시"}
            </button>
            <button
              type="submit"
              className="admin-button primary"
              disabled={saving || postingTest}
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>

          <div className="admin-connections-guide">
            <h3>액세스 토큰 발급 방법</h3>
            <ol>
              <li>
                마스토돈에서 설정 → 개발 → 새 애플리케이션을 만듭니다.
              </li>
              <li>
                권한에 <code>write:statuses</code>,{" "}
                <code>read:accounts</code>를 선택합니다.
              </li>
              <li>
                생성된 액세스 토큰을 위 입력란에 붙여넣고 저장합니다.
              </li>
            </ol>
          </div>
        </form>
      )}
    </div>
  );
}

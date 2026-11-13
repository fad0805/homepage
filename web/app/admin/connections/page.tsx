"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

import "@/public/styles/admin/connections.scss";

type MastodonVisibility = "public" | "unlisted" | "private";
type MastodonNotifyScope = "all" | "books" | "book" | "illustrations";
type MastodonProvider = "mastodon" | "misskey";

interface MastodonProfile {
  id: number;
  name: string;
  enabled: boolean;
  provider: MastodonProvider;
  instance_url: string | null;
  site_url: string | null;
  visibility: MastodonVisibility;
  notify_scope: MastodonNotifyScope;
  notify_book_id: number | null;
  has_access_token: boolean;
  access_token_hint: string | null;
  updated_at: string | null;
}

interface ProfileDraft {
  name: string;
  instance_url: string;
  site_url: string;
  visibility: MastodonVisibility;
  notify_scope: MastodonNotifyScope;
  notify_book_id: number | null;
  access_token: string;
  has_access_token: boolean;
  access_token_hint: string | null;
  updated_at: string | null;
  provider: MastodonProvider;
}

interface MastodonTestResult {
  ok: boolean;
  provider: MastodonProvider;
  account: string | null;
  display_name: string | null;
  message: string | null;
}

interface BookOption {
  id: number;
  title: string;
}

type Notice = { type: "success" | "error"; text: string };

function toDraft(profile: MastodonProfile): ProfileDraft {
  return {
    name: profile.name,
    instance_url: profile.instance_url ?? "",
    site_url: profile.site_url ?? "",
    visibility: profile.visibility ?? "public",
    notify_scope: profile.notify_scope ?? "all",
    notify_book_id: profile.notify_book_id ?? null,
    access_token: "",
    has_access_token: profile.has_access_token,
    access_token_hint: profile.access_token_hint,
    updated_at: profile.updated_at,
    provider: profile.provider ?? "mastodon",
  };
}

function serviceName(provider: MastodonProvider) {
  return provider === "misskey" ? "미스키" : "마스토돈";
}

function scopeLabel(
  scope: MastodonNotifyScope,
  bookId: number | null,
  books: BookOption[],
) {
  if (scope === "all") return "전체 (목차 + 삽화)";
  if (scope === "books") return "목차 전체";
  if (scope === "illustrations") return "삽화 전체";
  const book = books.find((item) => item.id === bookId);
  return book ? `책: ${book.title}` : "목차 내 특정 책";
}

export default function AdminConnections() {
  const [profiles, setProfiles] = useState<MastodonProfile[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [books, setBooks] = useState<BookOption[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [postingTest, setPostingTest] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
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

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setBooksLoading(true);
    try {
      const [profileData, bookData] = await Promise.all([
        apiFetch<MastodonProfile[]>("/api/settings/mastodon"),
        apiFetch<BookOption[]>("/api/books").catch(() => []),
      ]);
      setProfiles(profileData);
      setBooks(bookData);
      const first = profileData[0] ?? null;
      setSelectedId(first?.id ?? null);
      setDraft(first ? toDraft(first) : null);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "알림 설정을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
      setBooksLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const selectProfile = (profile: MastodonProfile) => {
    setSelectedId(profile.id);
    setDraft(toDraft(profile));
  };

  const patchDraft = (patch: Partial<ProfileDraft>) => {
    setDraft((current) =>
      current ? { ...current, ...patch } : current,
    );
  };

  const replaceProfile = (
    updated: MastodonProfile,
    resetDraft = true,
  ) => {
    setProfiles((current) =>
      current.map((profile) =>
        profile.id === updated.id ? updated : profile,
      ),
    );
    if (selectedId !== updated.id) return;

    if (resetDraft) {
      setDraft(toDraft(updated));
      return;
    }

    // Toggling enabled may also change the detected provider. Keep any
    // unsaved form edits intact.
    setDraft((current) =>
      current
        ? {
            ...current,
            provider: updated.provider,
            has_access_token: updated.has_access_token,
            access_token_hint: updated.access_token_hint,
            updated_at: updated.updated_at,
          }
        : current,
    );
  };

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const created = await apiFetch<MastodonProfile>(
        "/api/settings/mastodon",
        {
          method: "POST",
          body: JSON.stringify({
            name: `알림 설정 ${profiles.length + 1}`,
          }),
        },
      );
      setProfiles((current) => [...current, created]);
      setSelectedId(created.id);
      setDraft(toDraft(created));
      notify("success", "새 알림 설정을 추가했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "알림 설정을 추가하지 못했습니다.",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (profile: MastodonProfile) => {
    if (deleting) return;
    if (
      !window.confirm(
        `'${profile.name}' 알림 설정을 삭제할까요?`,
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      await apiFetch(`/api/settings/mastodon/${profile.id}`, {
        method: "DELETE",
      });
      const remaining = profiles.filter(
        (item) => item.id !== profile.id,
      );
      setProfiles(remaining);
      if (selectedId === profile.id) {
        const next = remaining[0] ?? null;
        setSelectedId(next?.id ?? null);
        setDraft(next ? toDraft(next) : null);
      }
      notify("success", "알림 설정을 삭제했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "알림 설정을 삭제하지 못했습니다.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async (
    profile: MastodonProfile,
    enabled: boolean,
  ) => {
    if (togglingId !== null) return;
    setTogglingId(profile.id);
    try {
      const updated = await apiFetch<MastodonProfile>(
        `/api/settings/mastodon/${profile.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ enabled }),
        },
      );
      replaceProfile(updated, false);
      notify(
        "success",
        enabled ? "자동 알림을 켰습니다." : "자동 알림을 껐습니다.",
      );
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "자동 알림 상태를 변경하지 못했습니다.",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProfile || !draft || saving) return;

    const name = draft.name.trim();
    if (!name) {
      notify("error", "알림 설정 이름을 입력해주세요.");
      return;
    }
    if (draft.notify_scope === "book" && draft.notify_book_id === null) {
      notify("error", "알림 대상 책을 선택해주세요.");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        instance_url: draft.instance_url.trim() || null,
        site_url: draft.site_url.trim() || null,
        visibility: draft.visibility,
        notify_scope: draft.notify_scope,
        notify_book_id:
          draft.notify_scope === "book" ? draft.notify_book_id : null,
        access_token: draft.access_token.trim() || null,
      };

      const updated = await apiFetch<MastodonProfile>(
        `/api/settings/mastodon/${selectedProfile.id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
      replaceProfile(updated);
      notify("success", "알림 설정을 저장했습니다.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "알림 설정을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!draft || testing) return;
    setTesting(true);
    try {
      const result = await apiFetch<MastodonTestResult>(
        "/api/settings/mastodon/test",
        {
          method: "POST",
          body: JSON.stringify({
            settings_id: selectedProfile?.id ?? null,
            instance_url: draft.instance_url.trim() || null,
            access_token: draft.access_token.trim() || null,
          }),
        },
      );
      const name = result.account
        ? `@${result.account}`
        : result.display_name || "계정";
      patchDraft({ provider: result.provider });
      notify(
        "success",
        `${serviceName(result.provider)} ${name} 연결에 성공했습니다.`,
      );
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "연결 테스트에 실패했습니다.",
      );
    } finally {
      setTesting(false);
    }
  };

  const handleTestPost = async () => {
    if (!selectedProfile || postingTest) return;
    if (
      !window.confirm(
        "선택한 계정에 테스트 알림을 실제로 게시할까요?",
      )
    ) {
      return;
    }

    setPostingTest(true);
    try {
      await apiFetch(
        `/api/settings/mastodon/${selectedProfile.id}/test-status`,
        { method: "POST" },
      );
      notify("success", "테스트 알림을 게시했습니다.");
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
            여러 개의 알림 설정을 만들어 메뉴별로 다른 계정에 알림을
            보낼 수 있습니다. 자동 알림을 켠 모든 설정으로 같은
            콘텐츠가 전송됩니다. 관리자 연결은 모든 사용자의
            콘텐츠에 적용되며, 작성자 본인의 연결 설정이 있으면 해당
            설정을 우선 사용합니다.
          </p>
        </div>
      </header>

      {notice ? (
        <p className={`admin-notice admin-notice-${notice.type}`}>
          {notice.text}
        </p>
      ) : null}

      {loading ? (
        <p className="admin-connections-state">불러오는 중...</p>
      ) : (
        <>
          <section className="admin-connections-card">
            <div className="admin-connections-card__header">
              <div>
                <h2>알림 설정 목록</h2>
                <p>
                  각 설정의 자동 알림을 따로 켜고 끌 수 있습니다.
                  설정별로 다른 서비스·계정·알림 범위를 지정하세요.
                </p>
              </div>
              <button
                type="button"
                className="admin-button primary"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? "추가 중..." : "설정 추가"}
              </button>
            </div>

            {profiles.length === 0 ? (
              <p className="admin-connections-empty">
                등록된 알림 설정이 없습니다. 설정을 추가하고 액세스
                토큰을 저장해주세요.
              </p>
            ) : (
              <ul className="admin-connections-profile-list">
                {profiles.map((profile) => (
                  <li
                    key={profile.id}
                    className={
                      profile.id === selectedId ? "is-active" : ""
                    }
                  >
                    <label className="admin-connections-toggle">
                      <input
                        type="checkbox"
                        checked={profile.enabled}
                        onChange={(event) =>
                          handleToggle(profile, event.target.checked)
                        }
                        disabled={togglingId !== null}
                      />
                      <span>자동 알림</span>
                    </label>
                    <button
                      type="button"
                      className="admin-connections-profile-main"
                      onClick={() => selectProfile(profile)}
                    >
                      <strong>{profile.name}</strong>
                      <span>
                        {serviceName(profile.provider)} ·{" "}
                        {scopeLabel(
                          profile.notify_scope,
                          profile.notify_book_id,
                          books,
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="admin-button danger admin-connections-profile-delete"
                      onClick={() => handleDelete(profile)}
                      disabled={deleting}
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selectedProfile && draft ? (
            <form
              className="admin-connections-card"
              onSubmit={handleSave}
            >
              <div className="admin-connections-card__header">
                <div>
                  <h2>{selectedProfile.name} 편집</h2>
                  <p>
                    {serviceName(selectedProfile.provider)} ·{" "}
                    {scopeLabel(
                      selectedProfile.notify_scope,
                      selectedProfile.notify_book_id,
                      books,
                    )}
                  </p>
                </div>
                <label className="admin-connections-toggle">
                  <input
                    type="checkbox"
                    checked={selectedProfile.enabled}
                    onChange={(event) =>
                      handleToggle(
                        selectedProfile,
                        event.target.checked,
                      )
                    }
                    disabled={togglingId !== null}
                  />
                  <span>
                    {selectedProfile.enabled
                      ? "자동 알림 켜짐"
                      : "자동 알림 꺼짐"}
                  </span>
                </label>
              </div>

              <label className="admin-field">
                <span>설정 이름</span>
                <input
                  value={draft.name}
                  onChange={(event) =>
                    patchDraft({ name: event.target.value })
                  }
                  placeholder="예: 목차 알림, 삽화 알림"
                />
              </label>

              <label className="admin-field">
                <span>인스턴스 주소</span>
                <input
                  value={draft.instance_url}
                  onChange={(event) =>
                    patchDraft({ instance_url: event.target.value })
                  }
                  placeholder="예: mastodon.social 또는 misskey.io"
                  autoComplete="off"
                />
              </label>

              <label className="admin-field">
                <span>액세스 토큰 (마스토돈/미스키)</span>
                <input
                  type="password"
                  value={draft.access_token}
                  onChange={(event) =>
                    patchDraft({ access_token: event.target.value })
                  }
                  placeholder={
                    draft.has_access_token
                      ? "저장된 토큰 사용 중 · 변경할 때만 입력"
                      : "마스토돈 또는 미스키 액세스 토큰"
                  }
                  autoComplete="new-password"
                />
              </label>

              <p className="admin-connections-token-status">
                인식된 서비스: {serviceName(draft.provider)}
                {" · "}
                {draft.has_access_token
                  ? `저장된 토큰: ${draft.access_token_hint ?? "••••"}`
                  : "저장된 토큰이 없습니다."}
                {draft.updated_at
                  ? ` · 마지막 저장 ${formatDateTime(draft.updated_at)}`
                  : ""}
              </p>

              <label className="admin-field">
                <span>사이트 공개 주소</span>
                <input
                  value={draft.site_url}
                  onChange={(event) =>
                    patchDraft({ site_url: event.target.value })
                  }
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
                  value={draft.visibility}
                  onChange={(event) =>
                    patchDraft({
                      visibility: event.target
                        .value as MastodonVisibility,
                    })
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

              <label className="admin-field">
                <span>자동 알림 대상</span>
                <select
                  value={draft.notify_scope}
                  onChange={(event) =>
                    patchDraft({
                      notify_scope: event.target
                        .value as MastodonNotifyScope,
                    })
                  }
                >
                  <option value="all">전체 (목차 + 삽화)</option>
                  <option value="books">목차 전체</option>
                  <option value="book">목차 내 특정 책</option>
                  <option value="illustrations">삽화 전체</option>
                </select>
              </label>
              <p className="admin-connections-help">
                이 설정으로 알림을 받을 콘텐츠 범위입니다.
              </p>

              {draft.notify_scope === "book" ? (
                <label className="admin-field">
                  <span>알림 대상 책</span>
                  <select
                    value={draft.notify_book_id ?? ""}
                    onChange={(event) =>
                      patchDraft({
                        notify_book_id: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                    disabled={booksLoading}
                  >
                    <option value="">책 선택</option>
                    {books.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

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
                  type="button"
                  className="admin-button danger"
                  onClick={() => handleDelete(selectedProfile)}
                  disabled={deleting || saving}
                >
                  설정 삭제
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
                    마스토돈: 설정 → 개발 → 새 애플리케이션에서{" "}
                    <code>write:statuses</code>,{" "}
                    <code>read:accounts</code> 권한으로 발급합니다.
                  </li>
                  <li>
                    미스키: 설정 → API → 액세스 토큰에서 노트 작성
                    권한을 포함해 발급합니다.
                  </li>
                  <li>
                    발급된 토큰을 위 입력란에 붙여넣고 저장하면
                    서비스를 자동으로 인식합니다.
                  </li>
                </ol>
              </div>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}

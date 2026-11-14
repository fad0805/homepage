"use client";

import { useCallback, useEffect, useState } from "react";

import { Pagination } from "@/components/pagination";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

import "@/public/styles/admin/gallery.scss";

const INVITES_PER_PAGE = 10;

type InviteStatus = "unused" | "used" | "expired" | "revoked";
type SessionStatus = "active" | "expired" | "revoked";
type ResourceType = "illustration" | "chapter" | "book";

interface GalleryResource {
  type: ResourceType;
  id: number;
  title: string;
  owner_id: number | null;
  owner_name: string | null;
}

interface GalleryInvite {
  id: number;
  resource: GalleryResource | null;
  note: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  status: InviteStatus;
}

interface GallerySession {
  id: number;
  created_at: string;
  expires_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  status: SessionStatus;
  resources: GalleryResource[];
}

const INVITE_LABEL: Record<InviteStatus, string> = {
  unused: "미사용",
  used: "사용됨",
  expired: "만료",
  revoked: "폐기",
};

const SESSION_LABEL: Record<SessionStatus, string> = {
  active: "유효",
  expired: "만료",
  revoked: "폐기",
};

const TYPE_LABEL: Record<ResourceType, string> = {
  illustration: "삽화",
  chapter: "게시물",
  book: "책",
};

function resourceLabel(resource: GalleryResource | null) {
  if (!resource) return "-";
  return `[${TYPE_LABEL[resource.type]}] ${resource.title || `#${resource.id}`}`;
}

function sessionOwnerLabel(session: GallerySession) {
  const names = Array.from(
    new Set(
      session.resources
        .map((resource) => resource.owner_name)
        .filter((name): name is string => Boolean(name)),
    ),
  );
  return names.length > 0 ? names.join(", ") : "-";
}

export default function AdminGalleryPage() {
  const { isAdmin } = useAuth();
  const [invites, setInvites] = useState<GalleryInvite[]>([]);
  const [sessions, setSessions] = useState<GallerySession[]>([]);
  const [invitePage, setInvitePage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [inviteData, sessionData] = await Promise.all([
        apiFetch<GalleryInvite[]>("/api/gallery/invites"),
        apiFetch<GallerySession[]>("/api/gallery/sessions"),
      ]);
      setInvites(inviteData);
      setSessions(sessionData);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function revokeInvite(id: number) {
    if (!window.confirm("이 비밀번호를 폐기할까요?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/gallery/invites/${id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "폐기하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeSession(id: number) {
    if (
      !window.confirm(
        isAdmin
          ? "이 브라우저의 열람 권한을 폐기할까요?"
          : "내 콘텐츠에 대한 이 브라우저의 열람 권한을 폐기할까요?",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/gallery/sessions/${id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "폐기하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const totalInvitePages = Math.max(
    1,
    Math.ceil(invites.length / INVITES_PER_PAGE),
  );
  const currentInvitePage = Math.min(invitePage, totalInvitePages);
  const pagedInvites = invites.slice(
    (currentInvitePage - 1) * INVITES_PER_PAGE,
    currentInvitePage * INVITES_PER_PAGE,
  );

  return (
    <div className="gallery-admin">
      <header>
        <h2>열람 관리</h2>
        <p>
          {isAdmin
            ? "모든 사용자의 발급 기록과 열람 중인 브라우저를 확인하고 폐기할 수 있습니다."
            : "내가 발급한 기록과 내 콘텐츠를 열람 중인 브라우저를 확인할 수 있습니다."}
          {" "}새 비밀번호는 각 삽화·게시물·책 관리 화면에서 발급합니다.
          폐기된 기록은 30일 뒤 자동으로 삭제됩니다.
        </p>
      </header>

      {error ? <p className="gallery-admin__error">{error}</p> : null}

      <section className="gallery-panel">
        <h3>발급 기록</h3>
        {loading ? (
          <p>불러오는 중...</p>
        ) : invites.length === 0 ? (
          <p>발급한 비밀번호가 없습니다.</p>
        ) : (
          <div className="gallery-table-wrap">
            <table className="gallery-table gallery-table--invites">
              <thead>
                <tr>
                  <th>상태</th>
                  <th>대상</th>
                  <th>작성자</th>
                  <th>메모</th>
                  <th>발급</th>
                  <th>만료</th>
                  <th>사용</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pagedInvites.map((invite) => (
                  <tr key={invite.id}>
                    <td>
                      <span
                        className={`gallery-status gallery-status--${invite.status}`}
                      >
                        {INVITE_LABEL[invite.status]}
                      </span>
                    </td>
                    <td className="gallery-wrap-text">
                      {resourceLabel(invite.resource)}
                    </td>
                    <td>{invite.resource?.owner_name || "-"}</td>
                    <td>{invite.note || "-"}</td>
                    <td>{formatDateTime(invite.created_at)}</td>
                    <td>{formatDateTime(invite.expires_at)}</td>
                    <td>{formatDateTime(invite.used_at)}</td>
                    <td>
                      {invite.status === "unused" ? (
                        <button
                          type="button"
                          onClick={() => revokeInvite(invite.id)}
                          disabled={busy}
                        >
                          폐기
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={currentInvitePage}
          totalPages={totalInvitePages}
          onChange={setInvitePage}
        />
      </section>

      <section className="gallery-panel">
        <h3>열람 중인 브라우저</h3>
        {loading ? (
          <p>불러오는 중...</p>
        ) : sessions.length === 0 ? (
          <p>열람 중인 브라우저가 없습니다.</p>
        ) : (
          <div className="gallery-table-wrap">
            <table className="gallery-table">
              <thead>
                <tr>
                  <th>상태</th>
                  <th>열람 범위</th>
                  <th>작성자</th>
                  <th>열람 시작</th>
                  <th>만료</th>
                  <th>마지막 접속</th>
                  <th>IP</th>
                  <th>브라우저</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <span
                        className={`gallery-status gallery-status--${session.status}`}
                      >
                        {SESSION_LABEL[session.status]}
                      </span>
                    </td>
                    <td className="gallery-wrap-text">
                      {session.resources.length === 0
                        ? "-"
                        : session.resources
                            .map((resource) => resourceLabel(resource))
                            .join(", ")}
                    </td>
                    <td className="gallery-wrap-text">
                      {sessionOwnerLabel(session)}
                    </td>
                    <td>{formatDateTime(session.created_at)}</td>
                    <td>{formatDateTime(session.expires_at)}</td>
                    <td>{formatDateTime(session.last_seen_at)}</td>
                    <td>{session.ip_address || "-"}</td>
                    <td className="gallery-ua" title={session.user_agent ?? ""}>
                      {session.user_agent || "-"}
                    </td>
                    <td>
                      {session.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => revokeSession(session.id)}
                          disabled={busy}
                        >
                          폐기
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

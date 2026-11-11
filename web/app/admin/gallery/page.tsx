"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

import "@/public/styles/admin/gallery.scss";

type InviteStatus = "unused" | "used" | "expired" | "revoked";
type SessionStatus = "active" | "expired" | "revoked";

interface GalleryInvite {
  id: number;
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
}

interface CreatedInvite {
  id: number;
  code: string;
  note: string | null;
  expires_at: string;
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

const EXPIRY_OPTIONS = [
  { value: "1", label: "1시간" },
  { value: "6", label: "6시간" },
  { value: "24", label: "24시간" },
  { value: "72", label: "3일" },
  { value: "168", label: "7일" },
];

export default function AdminGalleryPage() {
  const [invites, setInvites] = useState<GalleryInvite[]>([]);
  const [sessions, setSessions] = useState<GallerySession[]>([]);
  const [note, setNote] = useState("");
  const [hours, setHours] = useState("24");
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setCopied(false);

    try {
      const result = await apiFetch<CreatedInvite>("/api/gallery/invites", {
        method: "POST",
        body: JSON.stringify({
          note: note.trim() || null,
          expires_in_hours: Number(hours),
        }),
      });
      setCreated(result);
      setNote("");
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "비밀번호를 만들지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(id: number) {
    if (!window.confirm("이 비밀번호를 폐기할까요?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/gallery/invites/${id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "폐기하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeSession(id: number) {
    if (!window.confirm("이 브라우저의 열람 권한을 폐기할까요?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/gallery/sessions/${id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "폐기하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
    } catch {
      setError("클립보드에 복사하지 못했습니다.");
    }
  }

  return (
    <div className="gallery-admin">
      <header>
        <h2>삽화 열람 관리</h2>
        <p>
          일회용 비밀번호를 발급하면 한 브라우저에서 한 번만 사용할 수
          있습니다. 사용된 브라우저에는 만료일까지 열람 쿠키가 유지됩니다.
        </p>
      </header>

      {error ? <p className="gallery-admin__error">{error}</p> : null}

      <section className="gallery-panel">
        <h3>새 일회용 비밀번호</h3>
        <form className="gallery-create" onSubmit={handleCreate}>
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="메모 (예: OO에게 전달)"
            maxLength={255}
          />
          <select
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy}>
            {busy ? "발급 중..." : "발급"}
          </button>
        </form>

        {created ? (
          <div className="gallery-created">
            <p>이 비밀번호는 지금만 표시됩니다.</p>
            <div>
              <code>{created.code}</code>
              <button type="button" onClick={copyCode}>
                {copied ? "복사됨" : "복사"}
              </button>
            </div>
            <small>만료: {formatDateTime(created.expires_at)}</small>
          </div>
        ) : null}
      </section>

      <section className="gallery-panel">
        <h3>발급 기록</h3>
        {loading ? (
          <p>불러오는 중...</p>
        ) : invites.length === 0 ? (
          <p>발급한 비밀번호가 없습니다.</p>
        ) : (
          <div className="gallery-table-wrap">
            <table className="gallery-table">
              <thead>
                <tr>
                  <th>상태</th>
                  <th>메모</th>
                  <th>발급</th>
                  <th>만료</th>
                  <th>사용</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id}>
                    <td>
                      <span className={`gallery-status gallery-status--${invite.status}`}>
                        {INVITE_LABEL[invite.status]}
                      </span>
                    </td>
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
                      <span className={`gallery-status gallery-status--${session.status}`}>
                        {SESSION_LABEL[session.status]}
                      </span>
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

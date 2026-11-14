"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

import "@/public/styles/admin/account.scss";

interface Account {
  username: string;
  role: string;
  nickname: string;
  slug: string;
}

interface AccountSummary {
  id: number;
  username: string;
  nickname: string;
  slug: string | null;
  role: string;
  created_at: string | null;
  updated_at: string | null;
  is_self: boolean;
}

type Notice = { type: "success" | "error"; text: string };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function roleLabel(role: string) {
  return role === "admin" ? "관리자" : "일반 사용자";
}

export default function AdminAccount() {
  const { isAdmin } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [nickname, setNickname] = useState("");
  const [slug, setSlug] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [viewingAccount, setViewingAccount] =
    useState<AccountSummary | null>(null);

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

  const openAccounts = useCallback(async () => {
    if (!isAdmin) return;

    setAccountsOpen(true);
    setViewingAccount(null);
    setAccountsError(null);
    setAccountsLoading(true);
    try {
      const data = await apiFetch<AccountSummary[]>("/api/users");
      setAccounts(data.filter((item) => !item.is_self));
    } catch (error) {
      setAccounts([]);
      setAccountsError(
        error instanceof Error
          ? error.message
          : "계정 목록을 불러오지 못했습니다.",
      );
    } finally {
      setAccountsLoading(false);
    }
  }, [isAdmin]);

  const closeAccounts = useCallback(() => {
    setAccountsOpen(false);
    setViewingAccount(null);
    setAccountsError(null);
  }, []);

  useEffect(() => {
    if (!accountsOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAccounts();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [accountsOpen, closeAccounts]);

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

  const handlePasswordSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setNotice({
        type: "error",
        text: "비밀번호 항목을 모두 입력해주세요.",
      });
      return;
    }
    if (newPassword.length < 8) {
      setNotice({
        type: "error",
        text: "새 비밀번호는 8자 이상 입력해주세요.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({
        type: "error",
        text: "새 비밀번호 확인이 일치하지 않습니다.",
      });
      return;
    }

    setChangingPassword(true);
    setNotice(null);
    try {
      await apiFetch<{ success: boolean }>("/api/users/me/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice({
        type: "success",
        text: "비밀번호를 변경했습니다.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "비밀번호를 변경하지 못했습니다.",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const isAdminAccount = isAdmin && account?.role === "admin";
  const summaryClassName = `admin-account-summary${
    account?.role === "admin" ? "" : " is-single"
  }`;
  const summaryContent = (
    <>
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
    </>
  );

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
          {isAdminAccount ? (
            <button
              type="button"
              className={`${summaryClassName} is-clickable`}
              onClick={openAccounts}
              aria-haspopup="dialog"
            >
              {summaryContent}
              <span className="admin-account-summary-action">
                다른 계정 보기 →
              </span>
            </button>
          ) : (
            <div className={summaryClassName}>{summaryContent}</div>
          )}

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

      {!loading ? (
        <form
          className="admin-account-password"
          onSubmit={handlePasswordSubmit}
        >
          <header>
            <h2>비밀번호 변경</h2>
            <p>
              현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다.
            </p>
          </header>

          <label className="admin-field">
            <span>현재 비밀번호</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>

          <label className="admin-field">
            <span>새 비밀번호</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>

          <label className="admin-field">
            <span>새 비밀번호 확인</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>

          <p className="admin-account-help">
            새 비밀번호는 8자 이상이어야 합니다.
          </p>

          <div className="admin-account-actions">
            <button
              type="submit"
              className="admin-button primary"
              disabled={changingPassword}
            >
              {changingPassword ? "변경 중..." : "비밀번호 변경"}
            </button>
          </div>
        </form>
      ) : null}

      {accountsOpen ? (
        <div className="admin-modal-backdrop" onClick={closeAccounts}>
          <div
            className="admin-modal admin-account-accounts-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-account-accounts-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-modal-header">
              <h2 id="admin-account-accounts-title">
                {viewingAccount ? "계정 정보" : "다른 계정"}
              </h2>
              <button
                type="button"
                className="admin-modal-close"
                onClick={closeAccounts}
                aria-label="닫기"
              >
                ×
              </button>
            </header>

            <div className="admin-modal-body">
              {viewingAccount ? (
                <>
                  <dl className="admin-account-detail">
                    <div>
                      <dt>닉네임</dt>
                      <dd>{viewingAccount.nickname || "-"}</dd>
                    </div>
                    <div>
                      <dt>아이디</dt>
                      <dd>{viewingAccount.username}</dd>
                    </div>
                    <div>
                      <dt>URL 표시명</dt>
                      <dd>
                        {viewingAccount.slug
                          ? `/@${viewingAccount.slug}`
                          : "-"}
                      </dd>
                    </div>
                    <div>
                      <dt>권한</dt>
                      <dd>{roleLabel(viewingAccount.role)}</dd>
                    </div>
                    <div>
                      <dt>가입일</dt>
                      <dd>{formatDateTime(viewingAccount.created_at)}</dd>
                    </div>
                    <div>
                      <dt>수정일</dt>
                      <dd>{formatDateTime(viewingAccount.updated_at)}</dd>
                    </div>
                  </dl>
                  <p className="admin-account-readonly">
                    다른 계정의 정보는 조회만 할 수 있습니다.
                  </p>
                </>
              ) : accountsLoading ? (
                <p className="admin-account-loading">불러오는 중...</p>
              ) : accountsError ? (
                <p className="admin-account-modal-error">
                  {accountsError}
                </p>
              ) : accounts.length === 0 ? (
                <p className="admin-account-empty">
                  다른 계정이 없습니다.
                </p>
              ) : (
                <ul className="admin-account-list">
                  {accounts.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="admin-account-list-item"
                        onClick={() => setViewingAccount(item)}
                      >
                        <span className="admin-account-list-info">
                          <strong>{item.nickname || item.username}</strong>
                          <span>
                            @{item.slug ?? "-"} · {item.username}
                          </span>
                        </span>
                        <span className="admin-account-list-meta">
                          <span
                            className={`admin-account-role${
                              item.role === "admin" ? " is-admin" : ""
                            }`}
                          >
                            {roleLabel(item.role)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="admin-modal-footer">
              {viewingAccount ? (
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => setViewingAccount(null)}
                >
                  목록으로
                </button>
              ) : null}
              <button
                type="button"
                className="admin-button"
                onClick={closeAccounts}
              >
                닫기
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

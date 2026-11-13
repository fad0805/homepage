"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

import "@/public/styles/admin/main.scss";

type JobStatus = "queued" | "running" | "completed" | "failed";

interface ArchiveUser {
  id: number;
  username: string;
  role: string;
  is_self: boolean;
}

interface ArchiveJob {
  id: string;
  section: string;
  label: string;
  scope_user_id?: number | null;
  scope_label?: string | null;
  status: JobStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  size: number | null;
  error: string | null;
  progress: {
    stage: string;
    processed: number;
    total: number;
    percent: number;
  };
  download_url: string | null;
}

const SECTIONS = [
  {
    section: "profile",
    label: "프로필",
    description: "작가 소개와 프로필 정보",
  },
  {
    section: "characters",
    label: "등장인물",
    description: "등장인물·장소·인형·관계와 이미지",
  },
  {
    section: "books",
    label: "목차",
    description: "책·카테고리·챕터 본문",
  },
  {
    section: "illustrations",
    label: "삽화",
    description: "삽화와 원본 이미지",
  },
  {
    section: "memos",
    label: "주석",
    description: "주석 기록",
  },
  {
    section: "links",
    label: "놀러가기",
    description: "링크와 카테고리",
  },
] as const;

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "대기 중",
  running: "생성 중",
  completed: "완료",
  failed: "실패",
};

const STAGE_LABELS: Record<string, string> = {
  queued: "순서를 기다리는 중",
  images: "이미지 저장 중",
  data: "데이터 저장 중",
  books: "책 저장 중",
  chapters: "챕터 저장 중",
  finalizing: "마무리 중",
  completed: "완료",
  failed: "실패",
};

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const digits = index === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[index]}`;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export default function AdminExportPage() {
  const { ready, isAdmin } = useAuth();
  const [jobs, setJobs] = useState<ArchiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [users, setUsers] = useState<ArchiveUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [scope, setScope] = useState<string>("all");

  const loadJobs = useCallback(async () => {
    try {
      const next = await apiFetch<ArchiveJob[]>("/api/archive/jobs");
      setJobs(next);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "내보내기 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!ready) return;
    if (!isAdmin) {
      setScope("self");
      setUsers([]);
      return;
    }

    let cancelled = false;
    setUsersLoading(true);
    apiFetch<ArchiveUser[]>("/api/users")
      .then((data) => {
        if (!cancelled) setUsers(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "사용자 목록을 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, isAdmin]);

  const selfUser = useMemo(
    () => users.find((item) => item.is_self) ?? null,
    [users],
  );
  const otherUsers = useMemo(
    () => users.filter((item) => !item.is_self),
    [users],
  );
  const scopeReady =
    ready &&
    (!isAdmin ||
      scope === "all" ||
      (scope === "self" ? selfUser !== null : true));

  const activeJob = useMemo(
    () =>
      jobs.find(
        (job) => job.status === "queued" || job.status === "running",
      ) ?? null,
    [jobs],
  );
  const hasActive = activeJob !== null;

  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(loadJobs, 2000);
    return () => clearInterval(timer);
  }, [hasActive, loadJobs]);

  const latestJob = jobs[0] ?? null;
  const featuredJob =
    activeJob ?? (latestJob?.id === dismissedId ? null : latestJob);
  const otherJobs = jobs
    .filter((job) => job.id !== featuredJob?.id)
    .slice(0, 5);

  const startJob = async (section: string) => {
    if (hasActive || starting || !scopeReady) return;

    const params = new URLSearchParams({ section });
    if (isAdmin && scope !== "all") {
      if (scope === "self") {
        if (!selfUser) return;
        params.set("user_id", String(selfUser.id));
      } else {
        params.set("user_id", scope);
      }
    }

    setStarting(section);
    setError(null);
    try {
      await apiFetch<ArchiveJob>(
        `/api/archive/jobs?${params.toString()}`,
        { method: "POST" },
      );
      setDismissedId(null);
      await loadJobs();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "내보내기를 시작하지 못했습니다.",
      );
      await loadJobs();
    } finally {
      setStarting(null);
    }
  };

  return (
    <div id="admin-main">
      <header className="admin-dashboard-header">
        <div className="admin-dashboard-header__copy">
          <p className="admin-dashboard-eyebrow">Missing Island · Admin</p>
          <h1 className="admin-dashboard-title">내보내기</h1>
          <p className="admin-dashboard-subtitle">
            기록을 백그라운드에서 만들고, 완료되면 ZIP으로 내려받습니다.
          </p>
        </div>
        <div className="admin-export-scope">
          <label htmlFor="archive-scope">내보내기 대상</label>
          {isAdmin ? (
            <select
              id="archive-scope"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              disabled={
                hasActive ||
                starting !== null ||
                usersLoading
              }
            >
              <option value="all">전체</option>
              {selfUser ? (
                <option value="self">
                  내 것 ({selfUser.username})
                </option>
              ) : null}
              {otherUsers.length ? (
                <optgroup label="사용자별">
                  {otherUsers.map((user) => (
                    <option key={user.id} value={String(user.id)}>
                      {user.username}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          ) : (
            <select id="archive-scope" value="self" disabled>
              <option value="self">내 것</option>
            </select>
          )}
        </div>
      </header>

      {error ? (
        <div className="admin-notice admin-notice-error">{error}</div>
      ) : null}

      {featuredJob ? (
        <JobPanel
          job={featuredJob}
          onDismiss={() => setDismissedId(featuredJob.id)}
          onRetry={() => startJob(featuredJob.section)}
          retrying={starting === featuredJob.section}
        />
      ) : loading ? (
        <p className="admin-dashboard-state">
          내보내기 목록을 불러오는 중...
        </p>
      ) : null}

      <section className="admin-dashboard-panel admin-dashboard-archive">
        <header className="admin-dashboard-panel__head">
          <div>
            <h2>전체 내보내기</h2>
            <p>책·삽화·등장인물·링크·프로필·주석을 모두 담습니다.</p>
          </div>
        </header>
        <div className="admin-dashboard-archive__body">
          <p className="admin-dashboard-archive__note">
            서버 부담을 줄이기 위해 순차적으로 생성합니다. 창을 닫아도
            서버에서 계속 진행되며, 완료된 파일은 일정 기간 후 자동으로
            삭제됩니다.
          </p>
          <button
            type="button"
            className="admin-button primary"
            onClick={() => startJob("all")}
            disabled={
              hasActive || starting !== null || !scopeReady
            }
          >
            {starting === "all" ? "시작 중..." : "전체 ZIP 만들기"}
          </button>
        </div>
      </section>

      <section className="admin-dashboard-panel">
        <header className="admin-dashboard-panel__head">
          <div>
            <h2>부분 내보내기</h2>
            <p>선택한 범위만 담습니다. 전체 백업이 아닙니다.</p>
          </div>
        </header>
        <div className="admin-export-options">
          {SECTIONS.map((item) => (
            <article className="admin-export-option" key={item.section}>
              <div>
                <h3>{item.label}</h3>
                <p>{item.description}</p>
              </div>
              <button
                type="button"
                className="admin-button"
                onClick={() => startJob(item.section)}
                disabled={
                  hasActive || starting !== null || !scopeReady
                }
              >
                {starting === item.section ? "시작 중..." : "만들기"}
              </button>
            </article>
          ))}
        </div>
      </section>

      {otherJobs.length ? (
        <section className="admin-dashboard-panel">
          <header className="admin-dashboard-panel__head">
            <div>
              <h2>최근 내보내기</h2>
              <p>완료된 파일은 일정 기간 후 자동으로 삭제됩니다.</p>
            </div>
          </header>
          <ul className="admin-export-job-list">
            {otherJobs.map((job) => (
              <li key={job.id}>
                <div>
                  <strong>{job.label}</strong>
                  <span>
                    {formatDateTime(job.created_at)} ·{" "}
                    {STATUS_LABELS[job.status]}
                  </span>
                </div>
                {job.status === "completed" && job.download_url ? (
                  <a className="admin-button" href={job.download_url}>
                    내려받기
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="admin-export-footnote">
        사용자·세션, 방문·조회 기록, 갤러리 권한, Mastodon 설정·토큰,
        임시저장은 어떤 내보내기에도 포함되지 않습니다.
      </p>
    </div>
  );
}

function JobPanel({
  job,
  onDismiss,
  onRetry,
  retrying,
}: {
  job: ArchiveJob;
  onDismiss: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const active = job.status === "queued" || job.status === "running";
  const percent = clampPercent(job.progress.percent);

  if (active) {
    return (
      <section className="admin-dashboard-panel admin-export-job">
        <header className="admin-dashboard-panel__head">
          <div>
            <h2>
              {job.status === "queued"
                ? "내보내기 대기 중"
                : "내보내기 생성 중"}
            </h2>
            <p>
              {job.label} 범위를 백그라운드에서 만들고 있습니다.
            </p>
          </div>
          <span className="admin-export-job__status">
            {STATUS_LABELS[job.status]}
          </span>
        </header>
        <div className="admin-export-progress">
          <div
            className="admin-export-progress__bar"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="admin-export-job__meta">
          <span>
            {STAGE_LABELS[job.progress.stage] ?? job.progress.stage}
          </span>
          <span>{percent}%</span>
        </div>
        <p className="admin-export-job__hint">
          창을 닫아도 서버에서 계속 진행됩니다. 완료되면 이 페이지에서
          내려받을 수 있습니다.
        </p>
      </section>
    );
  }

  if (job.status === "completed") {
    return (
      <section className="admin-dashboard-panel admin-export-job">
        <header className="admin-dashboard-panel__head">
          <div>
            <h2>내보내기 완료</h2>
            <p>
              {job.label} · {formatBytes(job.size)} ·{" "}
              {job.completed_at
                ? formatDateTime(job.completed_at)
                : "-"}
            </p>
          </div>
          <span className="admin-export-job__status admin-export-job__status--done">
            완료
          </span>
        </header>
        <div className="admin-export-job__actions">
          <a
            className="admin-button primary"
            href={job.download_url ?? "#"}
          >
            ZIP 내려받기
          </a>
          <button
            type="button"
            className="admin-button"
            onClick={onDismiss}
          >
            닫기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-dashboard-panel admin-export-job">
      <header className="admin-dashboard-panel__head">
        <div>
          <h2>내보내기 실패</h2>
          <p>{job.label} 범위를 만들지 못했습니다.</p>
        </div>
        <span className="admin-export-job__status admin-export-job__status--failed">
          실패
        </span>
      </header>
      <p className="admin-export-error">
        {job.error ?? "알 수 없는 오류가 발생했습니다."}
      </p>
      <div className="admin-export-job__actions">
        <button
          type="button"
          className="admin-button primary"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? "시작 중..." : "다시 시도"}
        </button>
        <button
          type="button"
          className="admin-button"
          onClick={onDismiss}
        >
          닫기
        </button>
      </div>
    </section>
  );
}

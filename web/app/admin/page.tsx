"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { apiFetch } from "@/lib/api";

import "@/public/styles/admin/main.scss";

interface Book {
  id: number;
  title: string;
  description: string | null;
  tags: string[];
  order: number;
  visible: boolean;
  created_at: string | null;
  updated_at: string | null;
}

interface ChapterItem {
  id: number;
  book_id: number;
  title: string;
  subtitle: string | null;
  visible: boolean;
  view_count: number;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  book: { id: number; title: string } | null;
}

interface CharacterItem {
  id: number;
  name: string;
  visible: boolean;
  is_my_doll: boolean | null;
  location: { id: number; name: string } | null;
  created_at: string | null;
  updated_at: string | null;
}

interface LinkItem {
  id: number;
  name: string;
  url: string;
  order: number;
  category: { id: number; name: string; order: number } | null;
  created_at: string | null;
  updated_at: string | null;
}

interface VisitDay {
  date: string;
  visitors: number;
  visits: number;
}

interface VisitSource {
  source: string;
  visits: number;
  visitors: number;
}

interface VisitStats {
  today: { date: string; visitors: number; visits: number };
  week: {
    from: string;
    to: string;
    visitors: number;
    visits: number;
  };
  total: { visitors: number; visits: number };
  daily: VisitDay[];
  sources: VisitSource[];
}

interface DashboardData {
  books: Book[];
  chapters: ChapterItem[];
  characters: CharacterItem[];
  links: LinkItem[];
  visits: VisitStats;
}

interface BookStat {
  book: Book;
  chapters: number;
  views: number;
}

function timeValue(value: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatDayLabel(value: string) {
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[1]}.${parts[2]}` : value;
}

function formatSource(source: string) {
  if (source === "direct") return "직접 유입";
  if (source === "internal") return "내부 이동";
  return source;
}

function isChapterPublic(chapter: ChapterItem, now: number | null) {
  if (chapter.visible === false) return false;
  if (!chapter.published_at) return true;
  if (now === null) return true;
  const publishedAt = new Date(chapter.published_at).getTime();
  return Number.isNaN(publishedAt) || publishedAt <= now;
}

export default function AdminHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [books, chapters, characters, links, visits] =
        await Promise.all([
          apiFetch<Book[]>("/api/books"),
          apiFetch<ChapterItem[]>("/api/chapters"),
          apiFetch<CharacterItem[]>("/api/characters"),
          apiFetch<LinkItem[]>("/api/links"),
          apiFetch<VisitStats>("/api/visits/stats"),
        ]);
      setData({ books, chapters, characters, links, visits });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "대시보드 데이터를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const bookStats = useMemo<BookStat[]>(() => {
    if (!data) return [];

    const counts = new Map<number, { chapters: number; views: number }>();
    for (const chapter of data.chapters) {
      const current = counts.get(chapter.book_id) ?? {
        chapters: 0,
        views: 0,
      };
      current.chapters += 1;
      current.views += chapter.view_count ?? 0;
      counts.set(chapter.book_id, current);
    }

    return [...data.books]
      .sort((a, b) => a.order - b.order || a.id - b.id)
      .map((book) => ({
        book,
        chapters: counts.get(book.id)?.chapters ?? 0,
        views: counts.get(book.id)?.views ?? 0,
      }));
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return [];
    const publicBooks = data.books.filter(
      (book) => book.visible !== false,
    ).length;
    const publicChapters = data.chapters.filter((chapter) =>
      isChapterPublic(chapter, now),
    ).length;
    const publicCharacters = data.characters.filter(
      (character) =>
        character.visible !== false && character.is_my_doll === true,
    ).length;
    const categoryCount = new Set(
      data.links
        .map((link) => link.category?.id)
        .filter((id): id is number => typeof id === "number"),
    ).size;
    const totalViews = data.chapters.reduce(
      (sum, chapter) => sum + (chapter.view_count ?? 0),
      0,
    );

    return [
      {
        href: "/admin/books",
        label: "책",
        value: data.books.length,
        unit: "권",
        note: `공개 ${publicBooks}권`,
      },
      {
        href: "/admin/books",
        label: "챕터",
        value: data.chapters.length,
        unit: "개",
        note: `공개 ${publicChapters}개`,
      },
      {
        href: "/admin/characters",
        label: "등장인물",
        value: data.characters.length,
        unit: "명",
        note: `공개 ${publicCharacters}명`,
      },
      {
        href: "/admin/links",
        label: "링크",
        value: data.links.length,
        unit: "개",
        note: `카테고리 ${categoryCount}개`,
      },
      {
        href: "/admin/books",
        label: "총 조회수",
        value: totalViews,
        unit: "회",
        note: "챕터 조회 합계",
      },
    ];
  }, [data, now]);

  const popularChapters = useMemo(() => {
    if (!data) return [];
    return [...data.chapters]
      .sort(
        (a, b) =>
          (b.view_count ?? 0) - (a.view_count ?? 0) ||
          timeValue(b.updated_at ?? b.created_at) -
            timeValue(a.updated_at ?? a.created_at),
      )
      .slice(0, 8);
  }, [data]);

  const visitMax = useMemo(() => {
    if (!data) return 1;
    return Math.max(
      1,
      ...data.visits.daily.map((day) => day.visitors),
    );
  }, [data]);

  return (
    <div id="admin-main">
      <header className="admin-dashboard-header">
        <div className="admin-dashboard-header__copy">
          <p className="admin-dashboard-eyebrow">Missing Island · Admin</p>
          <h1 className="admin-dashboard-title">대시보드</h1>
          <p className="admin-dashboard-subtitle">
            책과 챕터, 등장인물과 링크의 현황을 한눈에 확인하세요.
          </p>
        </div>
        <div className="admin-dashboard-actions">
          <Link className="admin-button primary" href="/admin/books">
            책 관리
          </Link>
        </div>
      </header>

      {loading ? (
        <p className="admin-dashboard-state">대시보드를 불러오는 중...</p>
      ) : error ? (
        <div className="admin-dashboard-error">
          <p>{error}</p>
          <button
            type="button"
            className="admin-button primary"
            onClick={load}
          >
            다시 시도
          </button>
        </div>
      ) : data ? (
        <>
          <section className="admin-dashboard-stats" aria-label="콘텐츠 현황">
            {stats.map((stat) => (
              <Link
                key={stat.label}
                className="admin-dashboard-stat"
                href={stat.href}
              >
                <span className="admin-dashboard-stat__label">
                  {stat.label}
                </span>
                <span className="admin-dashboard-stat__value">
                  {stat.value}
                  <small>{stat.unit}</small>
                </span>
                <span className="admin-dashboard-stat__note">
                  {stat.note}
                </span>
                <span
                  className="admin-dashboard-stat__arrow"
                  aria-hidden="true"
                >
                  ↗
                </span>
              </Link>
            ))}
          </section>

          <section className="admin-dashboard-panel admin-dashboard-visitors">
            <header className="admin-dashboard-panel__head">
              <div>
                <h2>방문자 통계</h2>
                <p>관리자 방문을 제외한 순 방문자 기준입니다.</p>
              </div>
            </header>

            <div className="admin-dashboard-visitor-summary">
              <div className="admin-dashboard-visitor-metric">
                <span className="admin-dashboard-visitor-metric__label">
                  오늘 방문자
                </span>
                <strong>
                  {data.visits.today.visitors}
                  <small>명</small>
                </strong>
                <span className="admin-dashboard-visitor-metric__sub">
                  방문 {data.visits.today.visits}회
                </span>
              </div>
              <div className="admin-dashboard-visitor-metric">
                <span className="admin-dashboard-visitor-metric__label">
                  최근 7일
                </span>
                <strong>
                  {data.visits.week.visitors}
                  <small>명</small>
                </strong>
                <span className="admin-dashboard-visitor-metric__sub">
                  방문 {data.visits.week.visits}회
                </span>
              </div>
              <div className="admin-dashboard-visitor-metric">
                <span className="admin-dashboard-visitor-metric__label">
                  전체 방문자
                </span>
                <strong>
                  {data.visits.total.visitors}
                  <small>명</small>
                </strong>
                <span className="admin-dashboard-visitor-metric__sub">
                  방문 {data.visits.total.visits}회
                </span>
              </div>
            </div>

            <div className="admin-dashboard-visitor-body">
              <div className="admin-dashboard-chart">
                <div className="admin-dashboard-subhead">
                  <h3>최근 7일 방문자</h3>
                  <span>
                    {formatDayLabel(data.visits.week.from)} ~{" "}
                    {formatDayLabel(data.visits.week.to)}
                  </span>
                </div>
                <div className="admin-dashboard-chart__bars">
                  {data.visits.daily.map((day) => {
                    const height =
                      day.visitors === 0
                        ? 0
                        : Math.max(
                            8,
                            Math.round(
                              (day.visitors / visitMax) * 100,
                            ),
                          );
                    return (
                      <div
                        className="admin-dashboard-chart__bar"
                        key={day.date}
                      >
                        <span className="admin-dashboard-chart__count">
                          {day.visitors}
                        </span>
                        <span className="admin-dashboard-chart__track">
                          <span
                            className="admin-dashboard-chart__fill"
                            style={{ height: `${height}%` }}
                          />
                        </span>
                        <span className="admin-dashboard-chart__label">
                          {formatDayLabel(day.date)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="admin-dashboard-sources">
                <div className="admin-dashboard-subhead">
                  <h3>유입 경로</h3>
                  <span>최근 7일</span>
                </div>
                {data.visits.sources.length ? (
                  <ul>
                    {data.visits.sources.map((source) => (
                      <li key={source.source}>
                        <span
                          className="admin-dashboard-sources__name"
                          title={formatSource(source.source)}
                        >
                          {formatSource(source.source)}
                        </span>
                        <span className="admin-dashboard-sources__meta">
                          {source.visits}회 · {source.visitors}명
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-dashboard-empty">
                    아직 유입 기록이 없습니다.
                  </p>
                )}
              </div>
            </div>
          </section>

          <div className="admin-dashboard-lower">
            <section className="admin-dashboard-panel admin-dashboard-post-views">
              <header className="admin-dashboard-panel__head">
                <div>
                  <h2>게시글 조회수</h2>
                  <p>조회수 기준 상위 게시글입니다.</p>
                </div>
              </header>
              {popularChapters.length ? (
                <ul className="admin-dashboard-post-list">
                  {popularChapters.map((chapter, index) => (
                    <li key={chapter.id}>
                      <Link
                        className="admin-dashboard-post"
                        href={`/admin/books/${chapter.book_id}/chapters/${chapter.id}`}
                      >
                        <span className="admin-dashboard-post__rank">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="admin-dashboard-post__copy">
                          <strong>{chapter.title}</strong>
                          <span>{chapter.book?.title}</span>
                        </span>
                        <span className="admin-dashboard-post__views">
                          {chapter.view_count ?? 0}
                          <small>회</small>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-dashboard-empty">
                  등록된 게시글이 없습니다.
                </p>
              )}
            </section>

            <section className="admin-dashboard-panel admin-dashboard-book-list">
              <header className="admin-dashboard-panel__head">
                <div>
                  <h2>책별 현황</h2>
                  <p>책별 챕터 수와 누적 조회수입니다.</p>
                </div>
                <Link href="/admin/books">전체 보기 →</Link>
              </header>
              {bookStats.length ? (
                <ul className="admin-dashboard-books">
                  {bookStats.map(({ book, chapters, views }) => (
                    <li key={book.id}>
                      <Link
                        className="admin-dashboard-book"
                        href={`/admin/books/${book.id}`}
                      >
                        <span className="admin-dashboard-book__title">
                          {book.title}
                          {book.visible === false ? (
                            <span className="admin-dashboard-badge">
                              비공개
                            </span>
                          ) : null}
                        </span>
                        <span className="admin-dashboard-book__meta">
                          챕터 {chapters} · 조회 {views}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-dashboard-empty">
                  등록된 책이 없습니다.
                </p>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

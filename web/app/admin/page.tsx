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
  sources: VisitSource[];
  searches: VisitSearch[];
}

interface VisitSource {
  source: string;
  visits: number;
  visitors: number;
}

interface VisitSearch {
  query: string;
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
  searches: VisitSearch[];
}

interface IllustrationStats {
  count: number;
  visible: number;
  total_views: number;
}

interface PopularIllustration {
  id: number;
  title: string;
  view_count: number;
  representative_url: string | null;
}

interface DashboardData {
  books: Book[];
  chapters: ChapterItem[];
  characters: CharacterItem[];
  links: LinkItem[];
  illustrationStats: IllustrationStats;
  popularIllustrations: PopularIllustration[];
  visits: VisitStats;
}

interface StatSegment {
  label: string;
  value: number;
  unit: string;
}

interface StatValuePart {
  value: number;
  unit: string;
}

interface DashboardStat {
  href?: string;
  label: string;
  value?: number | string;
  unit?: string;
  valueParts?: StatValuePart[];
  note?: string;
  segments?: StatSegment[];
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
  const [showAllPosts, setShowAllPosts] = useState(false);
  const [showAllIllustrations, setShowAllIllustrations] = useState(false);
  const [selectedTrafficDate, setSelectedTrafficDate] = useState<
    string | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        books,
        chapters,
        characters,
        links,
        illustrationStats,
        popularIllustrations,
        visits,
      ] = await Promise.all([
        apiFetch<Book[]>("/api/books?mine=true"),
        apiFetch<ChapterItem[]>("/api/chapters?mine=true"),
        apiFetch<CharacterItem[]>("/api/characters"),
        apiFetch<LinkItem[]>("/api/links?mine=true"),
        apiFetch<IllustrationStats>("/api/illustrations/admin/stats"),
        apiFetch<PopularIllustration[]>(
          "/api/illustrations/admin/popular?limit=10",
        ),
        apiFetch<VisitStats>("/api/visits/stats"),
      ]);
      setData({
        books,
        chapters,
        characters,
        links,
        illustrationStats,
        popularIllustrations,
        visits,
      });
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

  const stats = useMemo<DashboardStat[]>(() => {
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
    const chapterViews = data.chapters.reduce(
      (sum, chapter) => sum + (chapter.view_count ?? 0),
      0,
    );
    const illustrationViews = data.illustrationStats.total_views;

    return [
      {
        href: "/admin/characters",
        label: "등장인물",
        value: data.characters.length,
        unit: "명",
        note: `공개 ${publicCharacters}명`,
      },
      {
        href: "/admin/books",
        label: "책 / 챕터",
        valueParts: [
          { value: data.books.length, unit: "권" },
          { value: data.chapters.length, unit: "장" },
        ],
        note: `공개 책 ${publicBooks}권 · 공개 챕터 ${publicChapters}장`,
      },
      {
        href: "/admin/illustrations",
        label: "삽화",
        value: data.illustrationStats.count,
        unit: "점",
        note: `공개 ${data.illustrationStats.visible}점 · 조회 ${illustrationViews.toLocaleString("ko-KR")}회`,
      },
      {
        href: "/admin/links",
        label: "링크",
        value: data.links.length,
        unit: "개",
        note: `카테고리 ${categoryCount}개`,
      },
      {
        label: "조회수 현황",
        segments: [
          {
            label: "총 조회수",
            value: chapterViews + illustrationViews,
            unit: "회",
          },
          {
            label: "챕터 조회수",
            value: chapterViews,
            unit: "회",
          },
          {
            label: "삽화 조회수",
            value: illustrationViews,
            unit: "회",
          },
        ],
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
      .slice(0, 10);
  }, [data]);

  const visiblePosts = showAllPosts
    ? popularChapters
    : popularChapters.slice(0, 5);

  const selectedTrafficDay = useMemo(() => {
    if (!data || selectedTrafficDate === null) return null;
    return (
      data.visits.daily.find(
        (day) => day.date === selectedTrafficDate,
      ) ?? null
    );
  }, [data, selectedTrafficDate]);

  const trafficLabel = selectedTrafficDay
    ? selectedTrafficDay.date === data?.visits.today.date
      ? "오늘"
      : formatDayLabel(selectedTrafficDay.date)
    : "최근 7일";
  const trafficSources =
    selectedTrafficDay?.sources ?? data?.visits.sources ?? [];
  const trafficSearches =
    selectedTrafficDay?.searches ?? data?.visits.searches ?? [];

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
            등장인물과 책·챕터, 삽화와 링크의 현황을 한눈에 확인하세요.
          </p>
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
            {stats.map((stat) =>
              stat.segments ? (
                <div
                  key={stat.label}
                  className="admin-dashboard-stat is-static"
                >
                  <span className="admin-dashboard-stat__label">
                    {stat.label}
                  </span>
                  <div className="admin-dashboard-stat__segments">
                    {stat.segments.map((segment) => (
                      <div
                        className="admin-dashboard-stat__segment"
                        key={segment.label}
                      >
                        <span className="admin-dashboard-stat__segment-label">
                          {segment.label}
                        </span>
                        <span className="admin-dashboard-stat__segment-value">
                          {segment.value.toLocaleString("ko-KR")}
                          <small>{segment.unit}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                  {stat.note ? (
                    <span className="admin-dashboard-stat__note">
                      {stat.note}
                    </span>
                  ) : null}
                </div>
              ) : (
                <Link
                  key={stat.label}
                  className="admin-dashboard-stat"
                  href={stat.href ?? "#"}
                >
                  <span className="admin-dashboard-stat__label">
                    {stat.label}
                  </span>
                  <span className="admin-dashboard-stat__value">
                    {stat.valueParts ? (
                      stat.valueParts.map((part, index) => (
                        <span
                          className="admin-dashboard-stat__value-part"
                          key={part.unit}
                        >
                          {index > 0 ? (
                            <span
                              className="admin-dashboard-stat__value-sep"
                              aria-hidden="true"
                            >
                              ·
                            </span>
                          ) : null}
                          {part.value}
                          <small>{part.unit}</small>
                        </span>
                      ))
                    ) : (
                      <>
                        {stat.value}
                        <small>{stat.unit}</small>
                      </>
                    )}
                  </span>
                  {stat.note ? (
                    <span className="admin-dashboard-stat__note">
                      {stat.note}
                    </span>
                  ) : null}
                  <span
                    className="admin-dashboard-stat__arrow"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                </Link>
              ),
            )}
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
                    const selected =
                      day.date === selectedTrafficDate;
                    return (
                      <div
                        className={`admin-dashboard-chart__bar is-clickable${
                          selected ? " is-selected" : ""
                        }`}
                        key={day.date}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        title={`${formatDayLabel(day.date)} 유입 경로와 검색어 보기`}
                        onClick={() =>
                          setSelectedTrafficDate((current) =>
                            current === day.date ? null : day.date,
                          )
                        }
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" ||
                            event.key === " "
                          ) {
                            event.preventDefault();
                            setSelectedTrafficDate((current) =>
                              current === day.date ? null : day.date,
                            );
                          }
                        }}
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

              <div className="admin-dashboard-traffic">
                <div className="admin-dashboard-sources">
                  <div className="admin-dashboard-subhead">
                    <h3>유입 경로</h3>
                    <span>
                      {trafficLabel}
                    </span>
                  </div>
                  {trafficSources.length ? (
                    <ul>
                      {trafficSources.map((source) => (
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

                <div className="admin-dashboard-sources admin-dashboard-searches">
                  <div className="admin-dashboard-subhead">
                    <h3>유입 검색어</h3>
                    <span>
                      {trafficLabel}
                    </span>
                  </div>
                  {trafficSearches.length ? (
                    <ul>
                      {trafficSearches.map((search) => (
                        <li key={search.query}>
                          <span
                            className="admin-dashboard-sources__name"
                            title={search.query}
                          >
                            {search.query}
                          </span>
                          <span className="admin-dashboard-sources__meta">
                            {search.visits}회 · {search.visitors}명
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="admin-dashboard-empty">
                      아직 검색어 유입이 없습니다.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="admin-dashboard-lower">
            <section className="admin-dashboard-panel admin-dashboard-illustration-views">
              <header className="admin-dashboard-panel__head">
                <div>
                  <h2>삽화 조회수</h2>
                  <p>
                    <span className="admin-dashboard-rank-copy is-desktop">
                      조회수 기준 상위 10개 삽화입니다.
                    </span>
                    <span className="admin-dashboard-rank-copy is-mobile">
                      {showAllIllustrations
                        ? "조회수 기준 상위 10개 삽화입니다."
                        : "조회수 기준 상위 5개 삽화입니다."}
                    </span>
                  </p>
                </div>
              </header>
              {data.popularIllustrations.length ? (
                <>
                <ul
                  className={`admin-dashboard-post-list${
                    showAllIllustrations ? " is-expanded" : ""
                  }`}
                >
                  {data.popularIllustrations.map((illustration, index) => (
                    <li key={illustration.id}>
                      <Link
                        className="admin-dashboard-post"
                        href={`/admin/illustrations?edit=${illustration.id}`}
                      >
                        <span className="admin-dashboard-post__rank">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="admin-dashboard-post__copy">
                          <strong>{illustration.title}</strong>
                        </span>
                        <span className="admin-dashboard-post__views">
                          {(illustration.view_count ?? 0).toLocaleString(
                            "ko-KR",
                          )}
                          <small>회</small>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {data.popularIllustrations.length > 5 ? (
                  <button
                    type="button"
                    className="admin-button admin-dashboard-post-more admin-dashboard-illustration-more"
                    onClick={() =>
                      setShowAllIllustrations((prev) => !prev)
                    }
                  >
                    {showAllIllustrations
                      ? "접기"
                      : `더보기 (${
                          data.popularIllustrations.length - 5
                        })`}
                  </button>
                ) : null}
                </>
              ) : (
                <p className="admin-dashboard-empty">
                  등록된 삽화가 없습니다.
                </p>
              )}
            </section>

            <section className="admin-dashboard-panel admin-dashboard-post-views">
              <header className="admin-dashboard-panel__head">
                <div>
                  <h2>게시글 조회수</h2>
                  <p>조회수 기준 상위 10개 게시글입니다.</p>
                </div>
              </header>
              {popularChapters.length ? (
                <>
                  <ul className="admin-dashboard-post-list">
                    {visiblePosts.map((chapter, index) => (
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
                  {popularChapters.length > 5 ? (
                    <button
                      type="button"
                      className="admin-button admin-dashboard-post-more"
                      onClick={() => setShowAllPosts((prev) => !prev)}
                    >
                      {showAllPosts
                        ? "접기"
                        : `더보기 (${popularChapters.length - 5})`}
                    </button>
                  ) : null}
                </>
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

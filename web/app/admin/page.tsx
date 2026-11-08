"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";

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

interface DashboardData {
  books: Book[];
  chapters: ChapterItem[];
  characters: CharacterItem[];
  links: LinkItem[];
}

interface BookStat {
  book: Book;
  chapters: number;
  views: number;
}

type ActivityKind = "book" | "chapter" | "character" | "link";

interface ActivityItem {
  key: string;
  kind: ActivityKind;
  title: string;
  subtitle: string;
  timestamp: string | null;
  href: string;
}

const KIND_LABEL: Record<ActivityKind, string> = {
  book: "책",
  chapter: "챕터",
  character: "등장인물",
  link: "링크",
};

function timeValue(value: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isChapterPublic(chapter: ChapterItem, now: number | null) {
  if (chapter.visible === false) return false;
  if (!chapter.published_at) return true;
  if (now === null) return true;
  return new Date(chapter.published_at).getTime() <= now;
}

function chapterStatus(chapter: ChapterItem, now: number | null) {
  if (chapter.visible === false) return "비공개";
  if (
    chapter.published_at &&
    now !== null &&
    new Date(chapter.published_at).getTime() > now
  ) {
    return "공개 예약";
  }
  return "공개";
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
      const [books, chapters, characters, links] = await Promise.all([
        apiFetch<Book[]>("/api/books"),
        apiFetch<ChapterItem[]>("/api/chapters"),
        apiFetch<CharacterItem[]>("/api/characters"),
        apiFetch<LinkItem[]>("/api/links"),
      ]);
      setData({ books, chapters, characters, links });
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

  const activity = useMemo<ActivityItem[]>(() => {
    if (!data) return [];

    const items: ActivityItem[] = [];
    const statsByBook = new Map(bookStats.map((item) => [item.book.id, item]));

    for (const book of data.books) {
      const bookStat = statsByBook.get(book.id);
      items.push({
        key: `book-${book.id}`,
        kind: "book",
        title: book.title,
        subtitle: [
          book.visible === false ? "비공개" : "공개",
          `챕터 ${bookStat?.chapters ?? 0}개`,
        ].join(" · "),
        timestamp: book.updated_at ?? book.created_at,
        href: `/admin/books/${book.id}`,
      });
    }

    for (const chapter of data.chapters) {
      items.push({
        key: `chapter-${chapter.id}`,
        kind: "chapter",
        title: chapter.title,
        subtitle: [
          chapter.book?.title,
          chapterStatus(chapter, now),
          `조회 ${chapter.view_count ?? 0}`,
        ]
          .filter(Boolean)
          .join(" · "),
        timestamp: chapter.updated_at ?? chapter.created_at,
        href: `/admin/books/${chapter.book_id}/chapters/${chapter.id}`,
      });
    }

    for (const character of data.characters) {
      items.push({
        key: `character-${character.id}`,
        kind: "character",
        title: character.name,
        subtitle: [
          character.location?.name,
          character.visible === false ? "비공개" : "공개",
        ]
          .filter(Boolean)
          .join(" · "),
        timestamp: character.updated_at ?? character.created_at,
        href: "/admin/characters",
      });
    }

    for (const link of data.links) {
      items.push({
        key: `link-${link.id}`,
        kind: "link",
        title: link.name,
        subtitle: link.category?.name ?? "카테고리 없음",
        timestamp: link.updated_at ?? link.created_at,
        href: "/admin/links",
      });
    }

    return items
      .sort(
        (a, b) => timeValue(b.timestamp) - timeValue(a.timestamp),
      )
      .slice(0, 8);
  }, [data, bookStats, now]);

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

          <div className="admin-dashboard-grid">
            <section className="admin-dashboard-panel admin-dashboard-activity">
              <header className="admin-dashboard-panel__head">
                <div>
                  <h2>최근 업데이트</h2>
                  <p>책·챕터·등장인물·링크의 최근 수정 순서입니다.</p>
                </div>
                <Link href="/admin/books">책 관리 →</Link>
              </header>
              {activity.length ? (
                <ul className="admin-dashboard-updates">
                  {activity.map((item) => (
                    <li
                      className="admin-dashboard-update"
                      key={item.key}
                    >
                      <Link
                        className="admin-dashboard-update__link"
                        href={item.href}
                      >
                        <span
                          className={`admin-dashboard-kind is-${item.kind}`}
                        >
                          {KIND_LABEL[item.kind]}
                        </span>
                        <span className="admin-dashboard-update__text">
                          <strong>{item.title}</strong>
                          <span>{item.subtitle}</span>
                        </span>
                        <time
                          dateTime={item.timestamp ?? undefined}
                        >
                          {formatDateTime(item.timestamp)}
                        </time>
                        <span
                          className="admin-dashboard-update__arrow"
                          aria-hidden="true"
                        >
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-dashboard-empty">
                  최근 업데이트가 없습니다.
                </p>
              )}
            </section>

            <div className="admin-dashboard-side">
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
          </div>
        </>
      ) : null}
    </div>
  );
}

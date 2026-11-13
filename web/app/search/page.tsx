import type { Metadata } from "next";
import Link from "next/link";

import { formatDate, formatDateTime } from "@/lib/datetime";
import type { IllustrationItem } from "@/lib/illustration-types";
import { serverApiFetch } from "@/lib/server-api";
import { getCurrentUser } from "@/lib/server-auth";
import type { Book, Chapter } from "../books/types";

import "@/public/styles/search.scss";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    noimageindex: true,
  },
};

const MAX_QUERY_LENGTH = 100;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchValues(
  values: Array<string | null | undefined>,
  query: string,
) {
  return values.some((value) =>
    (value ?? "").toLowerCase().includes(query),
  );
}

function matchTags(tags: string[] | undefined, query: string) {
  return (tags ?? []).some((tag) =>
    tag.toLowerCase().includes(query),
  );
}

function dateValue(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function compareCreatedDesc(
  a: string | null,
  b: string | null,
) {
  const aTime = dateValue(a);
  const bTime = dateValue(b);
  if (aTime === null && bTime === null) return 0;
  if (aTime === null) return 1;
  if (bTime === null) return -1;
  return bTime - aTime;
}

function TagLinks({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <div className="tag-list search-result__tags">
      {tags.map((tag) => (
        <Link
          className="tag is-clickable"
          href={`/search?q=${encodeURIComponent(tag)}`}
          key={tag}
        >
          {tag}
        </Link>
      ))}
    </div>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = (firstParam(params.q) ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const query = normalize(q);

  let books: Book[] = [];
  let chapters: Chapter[] = [];
  let illustrations: IllustrationItem[] = [];
  let failed = false;
  const currentUser = await getCurrentUser();

  try {
    [books, chapters, illustrations] = await Promise.all([
      serverApiFetch<Book[]>("/books", {
        tags: ["books"],
        auth: Boolean(currentUser),
      }),
      serverApiFetch<Chapter[]>("/chapters", {
        tags: ["chapters"],
        auth: Boolean(currentUser),
      }),
      serverApiFetch<IllustrationItem[]>("/illustrations", {
        tags: ["illustrations"],
        auth: Boolean(currentUser),
      }),
    ]);
  } catch (error) {
    console.error(error);
    failed = true;
  }

  const visibleBooks = currentUser
    ? books
    : books.filter((book) => book.visible !== false);
  const bookMap = new Map(visibleBooks.map((book) => [book.id, book]));
  const now = Date.now();
  const visibleChapters = chapters.filter(
    (chapter) =>
      (currentUser || chapter.visible !== false) &&
      bookMap.has(chapter.book_id) &&
      (!chapter.published_at ||
        new Date(chapter.published_at).getTime() <= now),
  );

  const matchedBooks = query
    ? visibleBooks.filter(
        (book) =>
          matchValues(
            [book.title, book.description, book.category?.name],
            query,
          ) || matchTags(book.tags, query),
      )
    : [];
  const matchedChapters = query
    ? visibleChapters.filter(
        (chapter) =>
          matchValues([chapter.title, chapter.subtitle], query) ||
          matchTags(chapter.tags, query),
      )
    : [];
  const matchedIllustrations = query
    ? illustrations.filter(
        (item) =>
          matchValues([item.title], query) ||
          matchTags(item.tags, query),
      )
    : [];

  matchedBooks.sort((a, b) => a.order - b.order || a.id - b.id);
  matchedChapters.sort(
    (a, b) => compareCreatedDesc(a.created_at, b.created_at) || b.id - a.id,
  );
  matchedIllustrations.sort(
    (a, b) =>
      compareCreatedDesc(a.created_at, b.created_at) || b.id - a.id,
  );

  const total =
    matchedBooks.length +
    matchedChapters.length +
    matchedIllustrations.length;

  return (
    <div id="search-page">
      <header className="search-header">
        <p className="search-eyebrow">SEARCH</p>
        <h1>종합검색</h1>
        <form className="search-form" action="/search" method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={MAX_QUERY_LENGTH}
            placeholder="태그, 제목, 설명 검색"
            aria-label="목차와 삽화 종합검색"
          />
          <button type="submit">검색</button>
        </form>
        {query ? (
          <p className="search-summary">
            <strong>‘{q}’</strong> 검색 결과 {total}건
          </p>
        ) : (
          <p className="search-summary">
            태그나 검색어를 입력하면 목차와 삽화를 함께 찾습니다.
          </p>
        )}
      </header>

      {failed ? (
        <p className="search-state">검색 결과를 불러오지 못했습니다.</p>
      ) : !query ? null : total === 0 ? (
        <p className="search-state">검색 결과가 없습니다.</p>
      ) : (
        <>
          {matchedChapters.length > 0 ? (
            <section className="search-section">
              <h2>
                목차 · 게시글
                <span>{matchedChapters.length}</span>
              </h2>
              <div className="search-list">
                {matchedChapters.map((chapter) => {
                  const book = bookMap.get(chapter.book_id);
                  return (
                    <article className="search-result" key={chapter.id}>
                      <p className="search-result__kind">게시글</p>
                      <Link
                        className="search-result__title"
                        href={`/books?book=${chapter.book_id}&chapter=${chapter.id}`}
                      >
                        {chapter.title}
                      </Link>
                      {chapter.subtitle ? (
                        <p className="search-result__description">
                          {chapter.subtitle}
                        </p>
                      ) : null}
                      <p className="search-result__meta">
                        {book?.title ?? "목차"} ·{" "}
                        {formatDateTime(chapter.created_at)}
                      </p>
                      <TagLinks tags={chapter.tags ?? []} />
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {matchedBooks.length > 0 ? (
            <section className="search-section">
              <h2>
                목차 · 책
                <span>{matchedBooks.length}</span>
              </h2>
              <div className="search-list">
                {matchedBooks.map((book) => (
                  <article className="search-result" key={book.id}>
                    <p className="search-result__kind">
                      {book.category?.name ?? "책"}
                    </p>
                    <Link
                      className="search-result__title"
                      href={`/books?book=${book.id}`}
                    >
                      {book.title}
                    </Link>
                    {book.description ? (
                      <p className="search-result__description">
                        {book.description}
                      </p>
                    ) : null}
                    <TagLinks tags={book.tags ?? []} />
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {matchedIllustrations.length > 0 ? (
            <section className="search-section">
              <h2>
                삽화
                <span>{matchedIllustrations.length}</span>
              </h2>
              <div className="search-list">
                {matchedIllustrations.map((item) => (
                  <article
                    className="search-result search-result--illustration"
                    key={item.id}
                  >
                    <Link
                      className="search-result__thumb"
                      href={`/illustrations/${item.id}`}
                      aria-label={`${item.title} 삽화 보기`}
                    >
                      {item.representative_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.representative_url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span>이미지 없음</span>
                      )}
                    </Link>
                    <div className="search-result__body">
                      <p className="search-result__kind">삽화</p>
                      <Link
                        className="search-result__title"
                        href={`/illustrations/${item.id}`}
                      >
                        {item.title}
                      </Link>
                      <p className="search-result__meta">
                        촬영 {formatDate(item.taken_at)}
                      </p>
                      <TagLinks tags={item.tags ?? []} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

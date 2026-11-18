import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formatDate, formatDateTime } from "@/lib/datetime";
import type { IllustrationItem } from "@/lib/illustration-types";
import { paginationPages } from "@/lib/pagination";
import { serverApiFetch, serverApiFetchWithTotal } from "@/lib/server-api";
import { matchesAllTokens, searchTokens } from "@/lib/search";
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
const CHAPTERS_PER_PAGE = 10;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchHref(q: string, chapterPage = 1) {
  const params = new URLSearchParams({ q });
  if (chapterPage > 1) {
    params.set("chapter_page", String(chapterPage));
  }
  return `/search?${params.toString()}`;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchAll(
  values: Array<string | null | undefined>,
  tags: string[] | undefined,
  tokens: string[],
) {
  return matchesAllTokens([...values, ...(tags ?? [])], tokens);
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
  searchParams: Promise<{
    q?: string | string[];
    chapter_page?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const q = (firstParam(params.q) ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const requestedChapterPage = Number(firstParam(params.chapter_page));
  const chapterPage =
    Number.isFinite(requestedChapterPage) && requestedChapterPage > 0
      ? Math.floor(requestedChapterPage)
      : 1;
  const normalizedQuery = normalize(q);
  const queryTokens = searchTokens(normalizedQuery);

  let books: Book[] = [];
  let chapters: Chapter[] = [];
  let illustrations: IllustrationItem[] = [];
  let chapterTotal = 0;
  let failed = false;
  const currentUser = await getCurrentUser();

  const searchSuffix = q ? `?q=${encodeURIComponent(q)}` : "";
  const chapterParams = new URLSearchParams({
    include_body: "false",
    page: String(chapterPage),
    page_size: String(CHAPTERS_PER_PAGE),
  });
  if (q) chapterParams.set("q", q);

  try {
    const [bookList, chapterPageResult, illustrationList] =
      await Promise.all([
        // Book metadata is needed to resolve every matching chapter's book.
        // Fetch the full visible list, then filter books below.
        serverApiFetch<Book[]>("/books", {
          tags: ["books"],
          auth: Boolean(currentUser),
        }),
        // The API already matches title, subtitle, tags, and body text. Keep
        // bodies out of this payload; the search page only renders metadata.
        serverApiFetchWithTotal<Chapter[]>(
          `/chapters?${chapterParams.toString()}`,
          {
            tags: ["chapters"],
            auth: Boolean(currentUser),
          },
        ),
        serverApiFetch<IllustrationItem[]>(
          `/illustrations?${searchSuffix ? `${searchSuffix.slice(1)}&` : ""}page_size=50`,
          {
            tags: ["illustrations"],
            auth: Boolean(currentUser),
          },
        ),
      ]);
    books = bookList;
    chapters = chapterPageResult.data;
    chapterTotal = chapterPageResult.total ?? chapters.length;
    illustrations = illustrationList;
  } catch (error) {
    console.error(error);
    failed = true;
  }

  const chapterTotalPages = Math.max(
    1,
    Math.ceil(chapterTotal / CHAPTERS_PER_PAGE),
  );
  if (
    !failed &&
    queryTokens.length > 0 &&
    chapterTotal > 0 &&
    chapterPage > chapterTotalPages
  ) {
    redirect(searchHref(q, chapterTotalPages));
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

  const matchedBooks = queryTokens.length
    ? visibleBooks.filter((book) =>
        matchAll(
          [book.title, book.description, book.category?.name],
          book.tags,
          queryTokens,
        ),
      )
    : [];
  const matchedChapters = queryTokens.length ? visibleChapters : [];
  const matchedIllustrations = queryTokens.length
    ? illustrations.filter((item) =>
        matchAll([item.title], item.tags, queryTokens),
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
    matchedBooks.length + chapterTotal + matchedIllustrations.length;

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
        {queryTokens.length > 0 ? (
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
      ) : queryTokens.length === 0 ? null : total === 0 ? (
        <p className="search-state">검색 결과가 없습니다.</p>
      ) : (
        <>
          {matchedChapters.length > 0 ? (
            <section className="search-section">
              <h2>
                목차 · 게시글
                <span>{chapterTotal}</span>
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
              {chapterTotalPages > 1 ? (
                <nav
                  className="search-pagination"
                  aria-label="게시글 검색 페이지 이동"
                >
                  {chapterPage > 1 ? (
                    <Link
                      className="search-pagination__button"
                      href={searchHref(q, chapterPage - 1)}
                      prefetch={false}
                    >
                      이전
                    </Link>
                  ) : (
                    <span className="search-pagination__button is-disabled">
                      이전
                    </span>
                  )}
                  {paginationPages(chapterPage, chapterTotalPages).map(
                    (value, index) =>
                      value === "ellipsis" ? (
                        <span
                          className="search-pagination__ellipsis"
                          key={`ellipsis-${index}`}
                        >
                          …
                        </span>
                      ) : (
                        <Link
                          className={`search-pagination__button${
                            value === chapterPage ? " is-active" : ""
                          }`}
                          href={searchHref(q, value)}
                          aria-current={
                            value === chapterPage ? "page" : undefined
                          }
                          prefetch={false}
                          key={value}
                        >
                          {value}
                        </Link>
                      ),
                  )}
                  {chapterPage < chapterTotalPages ? (
                    <Link
                      className="search-pagination__button"
                      href={searchHref(q, chapterPage + 1)}
                      prefetch={false}
                    >
                      다음
                    </Link>
                  ) : (
                    <span className="search-pagination__button is-disabled">
                      다음
                    </span>
                  )}
                </nav>
              ) : null}
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

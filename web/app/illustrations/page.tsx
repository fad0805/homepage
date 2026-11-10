import Link from "next/link";

import {
  dateInputValue,
  formatDate,
  todayDateInputValue,
} from "@/lib/datetime";
import type { IllustrationItem } from "@/lib/illustration-types";
import { serverApiFetch } from "@/lib/server-api";

import "@/public/styles/illustrations.scss";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

type SortKey = "taken" | "created";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | string[] | undefined) {
  const parsed = Number(firstParam(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function parseSort(value: string | string[] | undefined): SortKey {
  return firstParam(value) === "created" ? "created" : "taken";
}

function parseFilter(value: string | string[] | undefined): SortKey {
  return firstParam(value) === "created" ? "created" : "taken";
}

function parseDateParam(value: string | string[] | undefined) {
  const raw = firstParam(value)?.trim();
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : raw;
}

function dateValue(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function compareDateDesc(a: number | null, b: number | null) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function filterIllustrations(
  items: IllustrationItem[],
  basis: SortKey,
  from: string | null,
  to: string | null,
  includeUndated: boolean,
) {
  return items.filter((item) => {
    const value =
      basis === "taken"
        ? item.taken_at?.slice(0, 10) ?? null
        : dateInputValue(item.created_at) || null;
    if (!value) return includeUndated;
    if (from && value < from) return false;
    if (to && value > to) return false;
    return true;
  });
}

function sortIllustrations(items: IllustrationItem[], sort: SortKey) {
  return [...items].sort((a, b) => {
    if (sort === "created") {
      const created = compareDateDesc(
        dateValue(a.created_at),
        dateValue(b.created_at),
      );
      return created || b.id - a.id;
    }

    const taken = compareDateDesc(
      dateValue(a.taken_at),
      dateValue(b.taken_at),
    );
    if (taken !== 0) return taken;

    const created = compareDateDesc(
      dateValue(a.created_at),
      dateValue(b.created_at),
    );
    return created || b.id - a.id;
  });
}

function pageNumbers(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | "ellipsis"> = [1];
  if (page > 3) pages.push("ellipsis");

  for (
    let current = Math.max(2, page - 1);
    current <= Math.min(totalPages - 1, page + 1);
    current += 1
  ) {
    pages.push(current);
  }

  if (page < totalPages - 2) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}

function pageHref(
  page: number,
  sort: SortKey,
  filterBasis: SortKey,
  from: string | null,
  to: string | null,
) {
  const params = new URLSearchParams();
  if (sort !== "taken") params.set("sort", sort);
  if (filterBasis !== "taken") params.set("filter", filterBasis);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/illustrations?${query}` : "/illustrations";
}

export default async function IllustrationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    sort?: string | string[];
    filter?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const requestedPage = parsePage(params.page);
  const sort = parseSort(params.sort);
  const filterBasis = parseFilter(params.filter);
  const today = todayDateInputValue();
  const explicitRange =
    params.from !== undefined || params.to !== undefined;
  const rawFrom = parseDateParam(params.from);
  const rawTo = parseDateParam(params.to);
  let from =
    explicitRange && rawFrom && rawFrom <= today ? rawFrom : null;
  let to =
    explicitRange && rawTo && rawTo <= today ? rawTo : null;
  if (from && to && from > to) {
    [from, to] = [to, from];
  }
  const hasRange = explicitRange;
  const defaultEndDate = to ?? today;

  let illustrations: IllustrationItem[] = [];
  let failed = false;

  try {
    illustrations = await serverApiFetch<IllustrationItem[]>(
      "/illustrations",
      { tags: ["illustrations"] },
    );
  } catch (error) {
    console.error(error);
    failed = true;
  }

  const filtered = filterIllustrations(
    illustrations,
    filterBasis,
    from,
    to,
    !from,
  );
  const sorted = sortIllustrations(filtered, sort);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const visible = sorted.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );
  return (
    <div id="illustrations-page">
      {!failed && illustrations.length > 0 ? (
        <header className="illustrations-header">
          <div className="illustrations-controls">
            <form
              className="illustrations-filter"
              method="get"
              action="/illustrations"
            >
              {sort !== "taken" ? (
                <input type="hidden" name="sort" value={sort} />
              ) : null}
              <label className="illustrations-filter__basis">
                <span>범위</span>
                <select name="filter" defaultValue={filterBasis}>
                  <option value="taken">촬영일</option>
                  <option value="created">등록일</option>
                </select>
              </label>
              <label>
                <span>시작일</span>
                <input
                  type="date"
                  name="from"
                  max={today}
                  defaultValue={from ?? ""}
                />
              </label>
              <span className="illustrations-filter__dash">~</span>
              <label>
                <span>종료일</span>
                <input
                  type="date"
                  name="to"
                  max={today}
                  defaultValue={defaultEndDate}
                />
              </label>
              <button type="submit">조회</button>
              {hasRange ? (
                <Link
                  className="illustrations-filter__reset"
                  href={pageHref(1, sort, filterBasis, null, null)}
                >
                  초기화
                </Link>
              ) : null}
            </form>

            <nav className="illustrations-sort" aria-label="삽화 정렬">
              <span>정렬</span>
              <Link
                className={sort === "taken" ? "is-active" : ""}
                href={pageHref(1, "taken", filterBasis, from, to)}
              >
                촬영일
              </Link>
              <Link
                className={sort === "created" ? "is-active" : ""}
                href={pageHref(1, "created", filterBasis, from, to)}
              >
                등록일
              </Link>
            </nav>
          </div>
        </header>
      ) : null}

      {failed ? (
        <p className="illustrations-state">삽화를 불러오지 못했습니다.</p>
      ) : illustrations.length === 0 ? (
        <p className="illustrations-state">등록된 삽화가 없습니다.</p>
      ) : filtered.length === 0 ? (
        <p className="illustrations-state">
          조건에 맞는 삽화가 없습니다.
        </p>
      ) : (
        <>
          <div className="illustrations-grid">
            {visible.map((item) => (
              <article className="illustration-card" key={item.id}>
                <Link
                  className="illustration-card__link"
                  href={`/illustrations/${item.id}`}
                >
                  <div className="illustration-card__thumb">
                    {item.representative_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.representative_url}
                        alt={item.title}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="illustration-card__empty">
                        이미지 없음
                      </span>
                    )}
                    {item.image_count > 1 ? (
                      <span className="illustration-card__count">
                        {item.image_count}장
                      </span>
                    ) : null}
                  </div>
                  <div className="illustration-card__body">
                    <p className="illustration-card__title">
                      {item.title}
                    </p>
                    {item.description ? (
                      <p className="illustration-card__description">
                        {item.description}
                      </p>
                    ) : null}
                    <p className="illustration-card__meta">
                      촬영 {formatDate(item.taken_at)}
                    </p>
                  </div>
                </Link>
              </article>
            ))}
          </div>

          {totalPages > 1 ? (
            <nav
              className="illustrations-pagination"
              aria-label="삽화 페이지"
            >
              {page > 1 ? (
                <Link
                  className="illustrations-pagination__button"
                  href={pageHref(page - 1, sort, filterBasis, from, to)}
                >
                  이전
                </Link>
              ) : (
                <span className="illustrations-pagination__button is-disabled">
                  이전
                </span>
              )}

              {pageNumbers(page, totalPages).map((value, index) =>
                value === "ellipsis" ? (
                  <span
                    className="illustrations-pagination__ellipsis"
                    key={`ellipsis-${index}`}
                  >
                    …
                  </span>
                ) : (
                  <Link
                    className={`illustrations-pagination__button${
                      value === page ? " is-active" : ""
                    }`}
                    href={pageHref(value, sort, filterBasis, from, to)}
                    aria-current={value === page ? "page" : undefined}
                    key={value}
                  >
                    {value}
                  </Link>
                ),
              )}

              {page < totalPages ? (
                <Link
                  className="illustrations-pagination__button"
                  href={pageHref(page + 1, sort, filterBasis, from, to)}
                >
                  다음
                </Link>
              ) : (
                <span className="illustrations-pagination__button is-disabled">
                  다음
                </span>
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

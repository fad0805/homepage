import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { todayDateInputValue } from "@/lib/datetime";
import type { IllustrationItem } from "@/lib/illustration-types";
import { serverApiFetchWithTotal } from "@/lib/server-api";
import { getCurrentUser } from "@/lib/server-auth";

import { IllustrationGrid } from "./illustration-grid";
import { IllustrationSearch } from "./illustration-search";

import "@/public/styles/illustrations.scss";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    noimageindex: true,
    nosnippet: true,
  },
};

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
  return firstParam(value) === "taken" ? "taken" : "created";
}

function parseFilter(value: string | string[] | undefined): SortKey {
  return firstParam(value) === "taken" ? "taken" : "created";
}

function parseDateParam(value: string | string[] | undefined) {
  const raw = firstParam(value)?.trim();
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : raw;
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
  q: string | null = null,
) {
  const params = new URLSearchParams();
  if (sort !== "created") params.set("sort", sort);
  if (filterBasis !== "created") params.set("filter", filterBasis);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (q) params.set("q", q);
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
    q?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const q = (firstParam(params.q) ?? "").trim().slice(0, 100);
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
  let total: number | null = null;
  let failed = false;
  const currentUser = await getCurrentUser();

  try {
    const apiParams = new URLSearchParams();
    if (q) apiParams.set("q", q);
    if (sort !== "created") apiParams.set("sort", sort);
    if (filterBasis !== "created") apiParams.set("filter", filterBasis);
    if (from) apiParams.set("from", from);
    if (to) apiParams.set("to", to);
    apiParams.set("include_undated", from ? "false" : "true");
    apiParams.set("page", String(requestedPage));
    apiParams.set("page_size", String(PAGE_SIZE));

    const result = await serverApiFetchWithTotal<IllustrationItem[]>(
      `/illustrations?${apiParams.toString()}`,
      {
        tags: ["illustrations"],
        auth: Boolean(currentUser),
      },
    );
    illustrations = result.data;
    total = result.total;
  } catch (error) {
    console.error(error);
    failed = true;
  }

  const totalCount = total ?? illustrations.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  if (!failed && requestedPage > totalPages) {
    redirect(pageHref(page, sort, filterBasis, from, to, q));
  }
  const hasFilters = Boolean(q || hasRange);
  const visible = illustrations;
  return (
    <div id="illustrations-page">
      {!failed && (totalCount > 0 || hasFilters) ? (
        <header className="illustrations-header">
          <div className="illustrations-controls">
            <form
              className="illustrations-filter"
              method="get"
              action="/illustrations"
            >
              {sort !== "created" ? (
                <input type="hidden" name="sort" value={sort} />
              ) : null}
              {q ? <input type="hidden" name="q" value={q} /> : null}
              <div className="illustrations-filter__range">
                <label className="illustrations-filter__basis">
                  <span>범위</span>
                  <select name="filter" defaultValue={filterBasis}>
                    <option value="created">등록일</option>
                    <option value="taken">촬영일</option>
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
                <IllustrationSearch
                  query={q}
                  sort={sort}
                  filterBasis={filterBasis}
                  from={from}
                  to={to}
                  today={today}
                />
                {hasRange || q ? (
                  <Link
                    className="illustrations-filter__reset"
                    href={pageHref(1, sort, filterBasis, null, null, null)}
                  >
                    초기화
                  </Link>
                ) : null}
              </div>
            </form>

            <nav className="illustrations-sort" aria-label="삽화 정렬">
              <span>정렬</span>
              <Link
                className={sort === "created" ? "is-active" : ""}
                href={pageHref(1, "created", filterBasis, from, to, q)}
              >
                등록일
              </Link>
              <Link
                className={sort === "taken" ? "is-active" : ""}
                href={pageHref(1, "taken", filterBasis, from, to, q)}
              >
                촬영일
              </Link>
            </nav>
          </div>
        </header>
      ) : null}

      {failed ? (
        <p className="illustrations-state">삽화를 불러오지 못했습니다.</p>
      ) : totalCount === 0 ? (
        <p className="illustrations-state">
          {hasFilters
            ? "조건에 맞는 삽화가 없습니다."
            : "등록된 삽화가 없습니다."}
        </p>
      ) : (
        <>
          <IllustrationGrid
            items={visible.map((item) => ({
              id: item.id,
              title: item.title,
              taken_at: item.taken_at,
              representative_url: item.representative_url,
              image_count: item.image_count,
              visible: item.visible,
              protected: item.protected,
              locked: item.locked,
            }))}
          />

          {totalPages > 1 ? (
            <nav
              className="illustrations-pagination"
              aria-label="삽화 페이지"
            >
              {page > 1 ? (
                <Link
                  className="illustrations-pagination__button"
                  href={pageHref(page - 1, sort, filterBasis, from, to, q)}
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
                    href={pageHref(value, sort, filterBasis, from, to, q)}
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
                  href={pageHref(page + 1, sort, filterBasis, from, to, q)}
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

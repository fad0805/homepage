import { headers } from "next/headers";

export interface RssBook {
  id: number;
  title: string;
  description: string | null;
  order: number;
  visible: boolean;
  protected: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface RssChapter {
  id: number;
  book_id: number;
  title: string;
  subtitle: string | null;
  body: string | null;
  order: number;
  visible: boolean;
  protected: boolean;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface RssItem {
  title: string;
  link: string;
  pubDate: Date;
  description: string;
  content: string;
}

const API_BASE = process.env.API_INTERNAL_URL ?? "http://api:8000";

export async function fetchLibrary() {
  const [booksResponse, chaptersResponse] = await Promise.all([
    fetch(`${API_BASE}/books`, { cache: "no-store" }),
    fetch(`${API_BASE}/chapters`, { cache: "no-store" }),
  ]);

  if (!booksResponse.ok || !chaptersResponse.ok) {
    throw new Error("목차 데이터를 불러오지 못했습니다.");
  }

  const [books, chapters] = await Promise.all([
    booksResponse.json() as Promise<RssBook[]>,
    chaptersResponse.json() as Promise<RssChapter[]>,
  ]);

  return { books, chapters };
}

export async function getSiteUrl() {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:2222";
  const proto =
    headerStore.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const configured = process.env.SITE_URL?.trim();
  return (configured || `${proto}://${host}`).replace(/\/+$/, "");
}

export function isPublished(chapter: RssChapter) {
  if (chapter.visible === false) return false;
  if (!chapter.published_at) return true;
  return new Date(chapter.published_at).getTime() <= Date.now();
}

export function chapterDate(chapter: RssChapter) {
  const value =
    chapter.published_at ?? chapter.created_at ?? new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function plainText(html: string | null) {
  return (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildRss(options: {
  title: string;
  description: string;
  siteUrl: string;
  feedUrl: string;
  items: RssItem[];
}) {
  const { title, description, siteUrl, feedUrl, items } = options;

  const itemXml = items
    .map((item) => {
      const content = item.content.replace(/]]>/g, "]]]]><![CDATA[>");
      return [
        "<item>",
        `<title>${escapeXml(item.title)}</title>`,
        `<link>${escapeXml(item.link)}</link>`,
        `<guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
        `<pubDate>${item.pubDate.toUTCString()}</pubDate>`,
        `<description>${escapeXml(item.description)}</description>`,
        `<content:encoded><![CDATA[${content}]]></content:encoded>`,
        "</item>",
      ].join("");
    })
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(title)}</title>`,
    `<link>${escapeXml(`${siteUrl}/books`)}</link>`,
    `<description>${escapeXml(description)}</description>`,
    "<language>ko</language>",
    `<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    itemXml,
    "</channel>",
    "</rss>",
  ].join("");
}

export function rssItemForChapter(
  chapter: RssChapter,
  book: RssBook | undefined,
  siteUrl: string,
  includeBookTitle: boolean,
): RssItem {
  const link = `${siteUrl}/books?book=${chapter.book_id}&chapter=${chapter.id}`;
  const title =
    includeBookTitle && book
      ? `${book.title} — ${chapter.title}`
      : chapter.title;
  const isProtected =
    chapter.protected || book?.protected === true;

  return {
    title,
    link,
    pubDate: chapterDate(chapter),
    // Protected posts expose only their title through RSS.
    description: isProtected
      ? ""
      : plainText(chapter.body).slice(0, 280),
    content: isProtected ? "" : chapter.body ?? "",
  };
}

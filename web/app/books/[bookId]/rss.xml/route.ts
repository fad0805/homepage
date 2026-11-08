import {
  buildRss,
  chapterDate,
  fetchLibrary,
  getSiteUrl,
  isPublished,
  rssItemForChapter,
} from "@/lib/rss";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const id = Number(bookId);
  if (!Number.isFinite(id)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const { books, chapters } = await fetchLibrary();
    const book = books.find(
      (item) => item.id === id && item.visible !== false,
    );
    if (!book) {
      return new Response("Not found", { status: 404 });
    }

    const siteUrl = await getSiteUrl();
    const items = chapters
      .filter(
        (chapter) => chapter.book_id === id && isPublished(chapter),
      )
      .sort(
        (a, b) => chapterDate(b).getTime() - chapterDate(a).getTime(),
      )
      .map((chapter) =>
        rssItemForChapter(chapter, book, siteUrl, false),
      );

    const xml = buildRss({
      title: `${book.title} — 어디에도 없는 섬`,
      description:
        book.description ?? `${book.title}의 챕터 목차입니다.`,
      siteUrl,
      feedUrl: `${siteUrl}/books/${book.id}/rss.xml`,
      items,
    });

    return new Response(xml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("RSS를 생성하지 못했습니다.", { status: 500 });
  }
}

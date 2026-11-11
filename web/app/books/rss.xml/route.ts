import {
  buildRss,
  chapterDate,
  fetchLibrary,
  getSiteUrl,
  isPublished,
  rssItemForChapter,
} from "@/lib/rss";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { books, chapters } = await fetchLibrary();
    const siteUrl = await getSiteUrl();
    const visibleBooks = books.filter((book) => book.visible !== false);
    const bookMap = new Map(visibleBooks.map((book) => [book.id, book]));

    const published = chapters.filter(
      (chapter) =>
        isPublished(chapter) && bookMap.has(chapter.book_id),
    );

    // A protected book is announced once, when its first chapter is
    // published. Later chapters stay out of the full feed.
    const firstProtected = new Map<
      number,
      (typeof published)[number]
    >();
    for (const chapter of published) {
      const book = bookMap.get(chapter.book_id);
      if (!book?.protected) continue;
      const current = firstProtected.get(chapter.book_id);
      if (
        !current ||
        chapterDate(chapter).getTime() <
          chapterDate(current).getTime()
      ) {
        firstProtected.set(chapter.book_id, chapter);
      }
    }

    const items = published
      .filter((chapter) => {
        const book = bookMap.get(chapter.book_id);
        if (!book?.protected) return true;
        return (
          firstProtected.get(chapter.book_id)?.id === chapter.id
        );
      })
      .sort(
        (a, b) => chapterDate(b).getTime() - chapterDate(a).getTime(),
      )
      .map((chapter) =>
        rssItemForChapter(
          chapter,
          bookMap.get(chapter.book_id),
          siteUrl,
          true,
        ),
      );

    const xml = buildRss({
      title: "어디에도 없는 섬 — 목차",
      description: "어디에도 없는 섬의 전체 목차입니다.",
      siteUrl,
      feedUrl: `${siteUrl}/books/rss.xml`,
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

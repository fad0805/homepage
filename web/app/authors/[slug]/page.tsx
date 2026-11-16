import { IndexContent } from "@/components/index-content";
import {
  authorSlugFromParam,
  fetchAuthorPage,
} from "@/lib/author-page";

import "@/public/styles/main.scss";
import "@/public/styles/author.scss";
import "@/public/styles/index-content.scss";

export const dynamic = "force-dynamic";

export default async function AuthorHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  authorSlugFromParam(slug);
  const author = await fetchAuthorPage(slug);

  return (
    <div id="main">
      {author.index_html ? (
        <IndexContent html={author.index_html} />
      ) : (
        <p className="author-state">
          인덱스 페이지가 아직 등록되지 않았습니다.
        </p>
      )}
    </div>
  );
}

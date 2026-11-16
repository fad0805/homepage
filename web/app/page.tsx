import { redirect } from "next/navigation";

import { IndexContent } from "@/components/index-content";
import { DEFAULT_INDEX_HTML } from "@/config/index-page";
import { fetchSingleAuthorSlug } from "@/lib/author-page";
import { serverApiFetch } from "@/lib/server-api";

import "@/public/styles/main.scss";
import "@/public/styles/index-content.scss";

export default async function Home() {
  const singleAuthorSlug = await fetchSingleAuthorSlug();
  if (singleAuthorSlug) {
    redirect(`/@${singleAuthorSlug}`);
  }

  let contentHtml = DEFAULT_INDEX_HTML;

  try {
    const page = await serverApiFetch<{ content_html: string }>(
      "/index-page?scope=integrated",
      { tags: ["index"] },
    );
    contentHtml = page.content_html;
  } catch (error) {
    console.error("Failed to load the integrated index page.", error);
  }

  return (
    <div id="main">
      <IndexContent html={contentHtml} />
    </div>
  );
}

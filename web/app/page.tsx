import { IndexContent } from "@/components/index-content";
import { getIntegratedIndexPage } from "@/lib/index-page";

import "@/public/styles/main.scss";
import "@/public/styles/index-content.scss";

export default async function Home() {
  const page = await getIntegratedIndexPage();

  return (
    <div id="main">
      <IndexContent html={page.content_html} />
    </div>
  );
}

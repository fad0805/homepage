import {
  DEFAULT_COPYRIGHT_NAME,
  DEFAULT_INDEX_HTML,
  DEFAULT_INDEX_SUBTITLE,
  DEFAULT_INDEX_TITLE,
} from "@/config/index-page";
import { serverApiFetch } from "@/lib/server-api";

export interface IntegratedIndexPage {
  title: string;
  subtitle: string;
  copyright_name: string;
  favicon_url: string | null;
  content_html: string;
}

const FALLBACK: IntegratedIndexPage = {
  title: DEFAULT_INDEX_TITLE,
  subtitle: DEFAULT_INDEX_SUBTITLE,
  copyright_name: DEFAULT_COPYRIGHT_NAME,
  favicon_url: null,
  content_html: DEFAULT_INDEX_HTML,
};

/** Load the public index together with the editable site title/caption. */
export async function getIntegratedIndexPage(): Promise<IntegratedIndexPage> {
  try {
    const page = await serverApiFetch<Partial<IntegratedIndexPage>>(
      "/index-page?scope=integrated",
      { tags: ["index"] },
    );
    return {
      title: page.title ?? FALLBACK.title,
      subtitle: page.subtitle ?? FALLBACK.subtitle,
      copyright_name: page.copyright_name ?? FALLBACK.copyright_name,
      favicon_url: page.favicon_url ?? FALLBACK.favicon_url,
      content_html: page.content_html ?? FALLBACK.content_html,
    };
  } catch (error) {
    console.error("Failed to load the integrated index page.", error);
    return FALLBACK;
  }
}

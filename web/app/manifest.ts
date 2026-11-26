import type { MetadataRoute } from "next";

import { DEFAULT_INDEX_TITLE } from "@/config/index-page";
import { getIntegratedIndexPage } from "@/lib/index-page";

export const dynamic = "force-dynamic";

type ManifestIcons = NonNullable<MetadataRoute.Manifest["icons"]>;

const DEFAULT_ICONS: ManifestIcons = [
  {
    src: "/icons/icon-192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/icons/icon-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/icons/icon-maskable-192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "maskable",
  },
  {
    src: "/icons/icon-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
  {
    src: "/icons/icon-monochrome-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "monochrome",
  },
];

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const index = await getIntegratedIndexPage();
  const title = index.title || DEFAULT_INDEX_TITLE;
  const icons: ManifestIcons = index.favicon_url
    ? [
        {
          src: index.favicon_url,
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: index.favicon_url,
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: index.favicon_url,
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable",
        },
        {
          src: index.favicon_url,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ]
    : DEFAULT_ICONS;

  return {
    id: "/",
    name: title,
    short_name: title,
    description: "한 소녀가 있었다.",
    lang: "ko",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#bedbbb",
    theme_color: "#bedbbb",
    categories: ["books", "entertainment"],
    icons,
    shortcuts: [
      { name: "목차", short_name: "목차", url: "/books" },
      { name: "삽화", short_name: "삽화", url: "/illustrations" },
      { name: "주석", short_name: "주석", url: "/memo" },
      { name: "책갈피", short_name: "책갈피", url: "/bookmark" },
    ],
  };
}

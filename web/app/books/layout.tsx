import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  alternates: {
    types: {
      "application/rss+xml": [
        {
          url: "/books/rss.xml",
          title: "어디에도 없는 섬 — 목차 RSS",
        },
      ],
    },
  },
};

export default function BooksLayout({ children }: { children: ReactNode }) {
  return children;
}

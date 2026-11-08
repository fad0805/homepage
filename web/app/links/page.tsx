"use client";

import { useEffect, useMemo, useState } from "react";

import "@/public/styles/links.scss";

interface Category {
  id: number;
  name: string;
  order: number;
}

interface LinkItem {
  id: number;
  name: string;
  url: string;
  banner_url: string | null;
  description: string | null;
  order: number;
  category: Category;
}

export default function Links() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/links/categories").then((response) => {
        if (!response.ok) throw new Error("카테고리를 불러오지 못했습니다.");
        return response.json() as Promise<Category[]>;
      }),
      fetch("/api/links").then((response) => {
        if (!response.ok) throw new Error("링크를 불러오지 못했습니다.");
        return response.json() as Promise<LinkItem[]>;
      }),
    ])
      .then(([categoryData, linkData]) => {
        if (cancelled) return;
        setCategories(
          [...categoryData].sort(
            (a, b) => a.order - b.order || a.id - b.id,
          ),
        );
        setLinks(linkData);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        items: links
          .filter((link) => link.category.id === category.id)
          .sort((a, b) => a.order - b.order || a.id - b.id),
      }))
      .filter((group) => group.items.length > 0);
  }, [categories, links]);

  return (
    <div id="links-page">
      <main>
        {loading ? (
          <p>불러오는 중...</p>
        ) : (
          grouped.map((group) => (
            <div key={group.category.id}>
              <div className="links-section">
                <p>{group.category.name}</p>
              </div>
              <div className="links-contents">
                {group.items.map((link) => (
                  <a
                    key={link.id}
                    className="links-banner"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.banner_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={link.banner_url} alt={link.name} />
                    ) : (
                      <span
                        className="links-banner__placeholder"
                        aria-hidden="true"
                      >
                        이미지 없음
                      </span>
                    )}
                    <p>{link.name}</p>
                  </a>
                ))}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}

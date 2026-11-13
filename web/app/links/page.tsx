import { serverApiFetch } from "@/lib/server-api";

import "@/public/styles/links.scss";

export const dynamic = "force-dynamic";

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
  category: Category | null;
}

export default async function Links() {
  let links: LinkItem[] = [];
  let failed = false;

  try {
    links = await serverApiFetch<LinkItem[]>("/links", {
      tags: ["links"],
    });
  } catch (error) {
    console.error(error);
    failed = true;
  }

  const categoriesById = new Map<number, Category>();
  for (const link of links) {
    const category = link.category;
    if (category && !categoriesById.has(category.id)) {
      categoriesById.set(category.id, category);
    }
  }

  const grouped = [...categoriesById.values()]
    .sort((a, b) => a.order - b.order || a.id - b.id)
    .map((category) => ({
      category,
      items: links
        .filter((link) => link.category?.id === category.id)
        .sort((a, b) => a.order - b.order || a.id - b.id),
    }));

  return (
    <div id="links-page">
      <main>
        {failed ? (
          <p>링크를 불러오지 못했습니다.</p>
        ) : grouped.length === 0 ? (
          <p>등록된 링크가 없습니다.</p>
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
                    <div className="links-banner__image">
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
                    </div>
                    <p className="links-banner__name">{link.name}</p>
                    {link.description ? (
                      <p className="links-banner__description">
                        {link.description}
                      </p>
                    ) : null}
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

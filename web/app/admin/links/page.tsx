"use client";
import { useEffect, useState } from 'react';
import { Image, Link } from "@heroui/react";

import '@/public/styles/admin/links.scss';

interface LinkData {
  id: string;
  name: string;
  url: string;
  banner_url: string;
  order: number;
  category: {
    id: string;
    name: string;
    order: number;
  };
}

interface CategorisedLinks {
  categoryId: string;
  links: LinkData[];
}

export default function AdminLinks() {
  const [links, setLinks] = useState<CategorisedLinks[]>([]);

  useEffect(() => {
    fetch('/api/links').then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    }).then(data => {
      data.sort((a: LinkData, b: LinkData) => a.category.order - b.category.order);
      data.sort((a: LinkData, b: LinkData) => a.order - b.order);
      const linkslist = categorisingLinks(data);
      setLinks(linkslist);
    }).catch(error => {
      console.error('There was a problem with the fetch operation:', error);
    });
  }, []);

  const categorisingLinks = (linkslist: LinkData[]) => {
    const categories = Array.from(new Set(linkslist.map(link => link.category.id)));
    const categorisedLinks = categories.map(categoryId => {
      return {
        categoryId,
        links: linkslist.filter(link => link.category.id === categoryId)
      };
    });
    return categorisedLinks;
  };

  return (
    <div id="links-page">
      <main>
        {
          links.map((category: CategorisedLinks) => (
            <div className="links-category" key={category.categoryId}>
              <div className="links-section">
                <p>{category.links[0].category.name}</p>
              </div>
              <div className="links-contents">
                { category.links.map((link: LinkData) => (
                  <Link
                    key={link.id}
                    className="links-banner"
                    href={`/admin/links/${link.id}`}
                  >
                    <Image
                      src={link.banner_url}
                      alt={link.name}
                      radius="none"
                    />
                    <p>{links.name}</p>
                  </Link>
                )) }
              </div>
            </div>
          ))
        }
      </main>
    </div>
  );
}

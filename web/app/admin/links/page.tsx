"use client";
import { useEffect, useState } from 'react';
import { Image, Link } from "@heroui/react";

import '@/public/styles/admin/links.scss';

export default function AdminLinks() {
  const [links, setLinks] = useState([]);

  useEffect(() => {
    fetch('/api/links').then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    }).then(data => {
      data.sort((a, b) => a.category.order - b.category.order);
      data.sort((a, b) => a.order - b.order);
      const linkslist = categorisingLinks(data);
      setLinks(linkslist);
    }).catch(error => {
      console.error('There was a problem with the fetch operation:', error);
    });
  }, []);

  const categorisingLinks = (linkslist) => {
    const categories = Array.from(new Set(linkslist.map(link => link.category.id)));
    const categorisedLinks = categories.map(categoryId => {
      return {
        categoryId,
        links: linkslist.filter(link => link.category.id === categoryId)
      };
    });
    console.log(categorisedLinks);
    return categorisedLinks;
  };

  return (
    <div id="links-page">
      <main>
        {
          links.map(categories => (
            <div className="links-category" key={categories.categoryId}>
              <div className="links-section">
                <p>{categories.links[0].category.name}</p>
              </div>
              <div className="links-contents">
                { categories.links.map(link => (
                  <Link
                    key={link.id}
                    className="links-banner"
                    href={`/admin/links/${link.id}`}
                  >
                    <Image
                      src={link.image}
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

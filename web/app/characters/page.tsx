"use client";

import { useEffect, useMemo, useState } from "react";

import "@/public/styles/characters.scss";

interface CharacterLocation {
  id: number;
  name: string;
  description: string | null;
  order: number;
}

interface CharacterItem {
  id: number;
  name: string;
  thumbnail: string | null;
  location_id: number | null;
  visible: boolean;
  order_in_location: number | null;
  location: CharacterLocation | null;
}

export default function Characters() {
  const [locations, setLocations] = useState<CharacterLocation[]>([]);
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/characters/locations").then((response) => {
        if (!response.ok) throw new Error("위치를 불러오지 못했습니다.");
        return response.json() as Promise<CharacterLocation[]>;
      }),
      fetch("/api/characters").then((response) => {
        if (!response.ok) throw new Error("등장인물을 불러오지 못했습니다.");
        return response.json() as Promise<CharacterItem[]>;
      }),
    ])
      .then(([locationData, characterData]) => {
        if (cancelled) return;
        setLocations(
          [...locationData].sort(
            (a, b) => a.order - b.order || a.id - b.id,
          ),
        );
        setCharacters(characterData);
      })
      .catch((reason) => {
        console.error(reason);
        if (!cancelled) {
          setError("등장인물을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    return locations
      .map((location) => ({
        location,
        characters: characters
          .filter(
            (character) =>
              character.visible !== false &&
              character.location_id === location.id,
          )
          .sort(
            (a, b) =>
              (a.order_in_location ?? 0) - (b.order_in_location ?? 0) ||
              a.id - b.id,
          ),
      }))
      .filter((group) => group.characters.length > 0);
  }, [characters, locations]);

  return (
    <div id="characters-list">
      {loading ? (
        <p>불러오는 중...</p>
      ) : error ? (
        <p>{error}</p>
      ) : grouped.length === 0 ? (
        <p>등록된 등장인물이 없습니다.</p>
      ) : (
        grouped.map((group) => (
          <div className="characters-list__item" key={group.location.id}>
            <h2>{group.location.name}</h2>
            <div className="characters">
              {group.characters.map((character) => (
                <a
                  key={character.id}
                  className="character"
                  href={`/characters/profile?character=${character.id}`}
                >
                  <div
                    className={`image${character.thumbnail ? "" : " is-empty"}`}
                  >
                    <p>{character.name}</p>
                    {character.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={character.thumbnail} alt={character.name} />
                    ) : null}
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

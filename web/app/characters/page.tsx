import { serverApiFetch } from "@/lib/server-api";

import "@/public/styles/characters.scss";

export const dynamic = "force-dynamic";

interface CharacterLocation {
  id: number;
  name: string;
  description: string | null;
  order: number;
}

type CharacterLayout = "auto" | "left" | "center" | "right";

interface CharacterItem {
  id: number;
  name: string;
  thumbnail: string | null;
  location_id: number | null;
  visible: boolean;
  is_my_doll: boolean | null;
  order_in_location: number | null;
  layout: CharacterLayout | null;
  location: CharacterLocation | null;
}

export default async function Characters() {
  let locations: CharacterLocation[] = [];
  let characters: CharacterItem[] = [];
  let failed = false;

  try {
    [locations, characters] = await Promise.all([
      serverApiFetch<CharacterLocation[]>("/characters/locations", {
        tags: ["characters"],
      }),
      serverApiFetch<CharacterItem[]>("/characters", {
        tags: ["characters"],
      }),
    ]);
  } catch (error) {
    console.error(error);
    failed = true;
  }

  const sortedLocations = [...locations].sort(
    (a, b) => a.order - b.order || a.id - b.id,
  );
  const grouped = sortedLocations
    .map((location) => ({
      location,
      characters: characters
        .filter(
          (character) =>
            character.visible !== false &&
            character.is_my_doll === true &&
            character.location_id === location.id,
        )
        .sort(
          (a, b) =>
            (a.order_in_location ?? 0) - (b.order_in_location ?? 0) ||
            a.id - b.id,
        ),
    }))
    .filter((group) => group.characters.length > 0);

  return (
    <div id="characters-list">
      {failed ? (
        <p>등장인물을 불러오지 못했습니다.</p>
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
                  className={`character is-${character.layout ?? "auto"}`}
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

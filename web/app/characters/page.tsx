"use client";

import '@/public/styles/characters.scss';

export default function Characters() {
  const characters = [
    { category: "꿈의 바깥",
      characters: [
        {
          name: "윤 미르",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/a1627ac1-3e00-46f8-9f4f-6208ccc6b0f3.webp",
        },
        {
          name: "유 시안",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/ce7f0b36-6cad-48be-bb75-888eddc5a373.webp",
        },
        {
          name: "유 시연",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/829ed28f-761a-4c66-a422-9a120900705c.webp",
        },
      ]
    },
    { category: "별의 아이들",
      characters: [
        {
          name: "루시안",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/fc355ca2-5cc9-42a2-b692-00c4d4803f2a.webp",
        },
        {
          name: "루시엘",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/635fd37e-b2f7-4b0f-84ef-1342175b19c3.webp",
        },
        {
          name: "루아란",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/2bf3b392-e5c1-46d3-a1a3-74bfe8631a98.webp",
        },
        {
          name: "루이린",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/3b12d7cc-e84e-495c-a96e-c2ead1b783c7.webp",
        },
        {
          name: "루 시",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/1bb40094-96ae-4f71-9d09-c4ebb751b638.webp",
        },
      ]
    },
    { category: "얼음 산의 괴물",
      characters: [
        {
          name: "호루하이",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/318082c7-ae82-4374-b5b7-6a2487d18e69.webp",
        },
        {
          name: "노히바즈",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/93ba6a43-0797-4c19-93b8-618c4bf4576a.webp",
        },
        {
          name: "버찌",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/af370fd8-67d6-408f-a0b9-85ed85ab0c5c.webp",
        },
        {
          name: "살구",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/eba9cd1d-795b-4277-b3f4-9d790c40b93a.webp",
        },
      ]
    },
    { category: "태양의 여정",
      characters: [
        {
          name: "여명",
          image: "#",
        },
        {
          name: "황혼",
          image: "#",
        },
        {
          name: "정오",
          image: "#",
        },
        {
          name: "자정",
          image: "#",
        },
      ]
    },
    { category: "시공의 미아",
      characters: [
        {
          name: "미니",
          image: "#",
        },
        {
          name: "해진",
          image: "#",
        },
      ]
    },
  ];

  return (
    <div id="characters-list">
      { characters.map((categories, index) => (
        <div className="characters-list__item" key={index}>
          <h2>{categories.category}</h2>
          <div className="characters">
            { categories.characters && categories.characters.map((character, index) => (
              <div key={index} className="character">
                <div className="image">
                  <img src={character.image} alt={character.name} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

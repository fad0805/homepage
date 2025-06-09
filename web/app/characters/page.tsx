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
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/9d2a8956-9a22-4a98-8a87-7ffd004d8e44.webp",
        },
      ]
    },
    { category: "별의 아이들",
      characters: [
        {
          name: "루시안",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/489b7d7b-dbfc-4959-a54b-c7f5c8d5da55.webp",
        },
        {
          name: "루시엘",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/5795453c-68da-4d07-84ec-9646e485829b.webp",
        },
        {
          name: "루아란",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/45477d54-deb3-419b-a494-3cde4b86f03a.webp",
        },
        {
          name: "루이린",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/1bfdf4f2-1f2c-45df-a2a4-e2298b05c2f6.webp",
        },
        {
          name: "루 시",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/a3546ef4-f76e-4fd3-b77d-0eb5c6ec4d23.webp",
        },
      ]
    },
    { category: "얼음 산의 괴물",
      characters: [
        {
          name: "호루하이",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/75e054bb-c9f0-454d-bd57-7164387d7930.webp",
        },
        {
          name: "노히바즈",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/abfd59b2-f41b-446e-a56f-13e8674163eb.webp",
        },
        {
          name: "버찌",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/4afa42cd-fb65-4ffc-8cb7-3dcef975a316.webp",
        },
        {
          name: "살구",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/5b18c578-a4b8-4d0c-be82-8bda378a6f42.webp",
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

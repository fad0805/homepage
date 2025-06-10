"use client";

import '@/public/styles/characters.scss';

export default function Characters() {
  const characters = [
    { category: "꿈의 바깥",
      characters: [
        {
          name: "윤 미르",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/66a00078-1943-459a-ad9b-8e9211b11422.webp",
        },
        {
          name: "유 시안",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/ba3f1857-e7b3-48f8-a849-29d1b8901beb.webp",
        },
        {
          name: "유 시연",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/2fb5c25d-3087-490b-ab48-4aa5beffab44.webp",
        },
      ]
    },
    { category: "별의 아이들",
      characters: [
        {
          name: "루시안",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/7b7b4164-e6b9-4d8a-91fc-bafecd5ec3ee.webp",
        },
        {
          name: "루시엘",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/247e7859-615b-4380-8919-9423258a0832.webp",
        },
        {
          name: "루아란",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/1ce34586-9ed4-49e9-9dee-26472486a027.webp",
        },
        {
          name: "루이린",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/4951e0c8-96a6-47e5-b3e1-0d7c66d83724.webp",
        },
        {
          name: "루 시",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/7a912db5-fbbb-4cf8-aaac-8e7a110c4fd9.webp",
        },
      ]
    },
    { category: "얼음 산의 괴물",
      characters: [
        {
          name: "호루하이",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/0737795c-83dc-4d86-bcc0-8f5bc8e64d36.webp",
        },
        {
          name: "노히바즈",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/b3916e89-a3f8-4159-b71a-79838b4fce7a.webp",
        },
        {
          name: "버찌",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/c0e01347-00a7-48be-93d9-3b95eef2b622.webp",
        },
        {
          name: "살구",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/ba7bd37b-0ba8-4487-866b-17248281b27e.webp",
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

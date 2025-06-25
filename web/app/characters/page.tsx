"use client";

import '@/public/styles/characters.scss';

export default function Characters() {
  const characters = [
    { category: "꿈의 바깥",
      characters: [
        {
          name: "윤 미르",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/7fec14b4-a93f-4607-9206-feda8e8403d3.webp",
          link: "윤-미르",
        },
        {
          name: "유 시안",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/f4761290-a1b2-4c9f-b1b2-b521f4b63992.webp",
          link: "유-시안",
        },
        {
          name: "유 시연",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/545a4295-872e-4272-bf9f-08891e691280.webp",
          link: "유-시연",
        },
      ]
    },
    { category: "별의 아이들",
      characters: [
        {
          name: "루시안",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/7b7b4164-e6b9-4d8a-91fc-bafecd5ec3ee.webp",
          link: "루시안",
        },
        {
          name: "루시엘",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/247e7859-615b-4380-8919-9423258a0832.webp",
          link: "루시엘",
        },
        {
          name: "루아란",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/1ce34586-9ed4-49e9-9dee-26472486a027.webp",
          link: "루아란",
        },
        {
          name: "루이린",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/4951e0c8-96a6-47e5-b3e1-0d7c66d83724.webp",
          link: "루이린",
        },
        {
          name: "루 시",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/7a912db5-fbbb-4cf8-aaac-8e7a110c4fd9.webp",
          link: "루-시",
        },
      ]
    },
    { category: "얼음 산의 괴물",
      characters: [
        {
          name: "호루하이",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/0737795c-83dc-4d86-bcc0-8f5bc8e64d36.webp",
          link: "호루하이",
        },
        {
          name: "노히바즈",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/b3916e89-a3f8-4159-b71a-79838b4fce7a.webp",
          link: "노히바즈",
        },
        {
          name: "버찌",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/c0e01347-00a7-48be-93d9-3b95eef2b622.webp",
          link: "버찌",
        },
        {
          name: "살구",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/ba7bd37b-0ba8-4487-866b-17248281b27e.webp",
          link: "살구",
        },
      ]
    },
    { category: "태양의 여정",
      characters: [
        {
          name: "여명",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/83d4e97f-3351-498b-ac7a-aee53dddf8a8.webp",
          link: "여명",
        },
        {
          name: "황혼",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/c617db13-3ef3-4af4-9fdd-427967e9f55e.webp",
          link: "황혼",
        },
        {
          name: "정오",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/fa8732e2-d4e3-42b2-b66a-ba186bd5f679.webp",
          link: "정오",
        },
        {
          name: "자정",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/f1e4924b-d32c-47ef-ac0f-3ffae8937958.webp",
          link: "자정",
        },
      ]
    },
    { category: "시공의 미아",
      characters: [
        {
          name: "미니",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/0bacac99-9632-476c-91d0-d6bcfc84577e.webp",
          link: "미니",
        },
        {
          name: "해진",
          image: "https://objectstorage.ap-seoul-1.oraclecloud.com/n/cnftfbml9zxa/b/bucket-20230907-0739/o/misskey/06775339-0fd5-4bf6-b49f-8af8707b8b06.webp",
          link: "해진",
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
              <a key={index} className="character" href={`/characters/profile?character=${character.link}`}>
                <div className="image">
                  <p>{character.name}</p>
                  <img src={character.image} alt={character.name} />
                </div>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

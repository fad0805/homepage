"use client";

import '@/public/styles/characters.scss';

export default function Characters() {
  const characters = [
    { category: "꿈의 바깥",
      characters: [
        {
          name: "윤 미르",
          image: "#",
        },
        {
          name: "윤 시안",
          image: "#",
        },
        {
          name: "윤 시연",
          image: "#",
        },
      ]
    },
    { category: "별의 아이들",
      characters: [
        {
          name: "루시안",
          image: "#",
        },
        {
          name: "루시엘",
          image: "#",
        },
        {
          name: "루아란",
          image: "#",
        },
        {
          name: "루이린",
          image: "#",
        },
        {
          name: "루 시",
          image: "#",
        },
      ]
    },
    { category: "얼음 산의 괴물",
      characters: [
        {
          name: "호루하이",
          image: "#",
        },
        {
          name: "노히바즈",
          image: "#",
        },
        {
          name: "버찌",
          image: "#",
        },
        {
          name: "살구",
          image: "#",
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

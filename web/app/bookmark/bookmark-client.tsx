import "@/public/styles/bookmark.scss";

export default function BookmarkClient({ username }: { username: string }) {
  return (
    <div id="bookmark-page">
      <main>
        <header className="bookmark-header">
          <p className="bookmark-eyebrow">{username}의 비공개 기록</p>
          <h1>책갈피</h1>
          <p className="bookmark-description">
            루틴, 목표, 회고를 모아둘 공간입니다. 이 화면은 로그인한
            본인에게만 보입니다.
          </p>
        </header>

        <section className="bookmark-empty" aria-label="책갈피 기록">
          <p>아직 책갈피 기록이 없습니다.</p>
          <p className="bookmark-empty-note">
            기록을 추가하면 이곳에서만 확인할 수 있습니다.
          </p>
        </section>
      </main>
    </div>
  );
}

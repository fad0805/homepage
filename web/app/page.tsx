import "@/public/styles/main.scss";

export default function Home() {
  return (
    <div id="main">
      <section className="hero">
        <div className="hero__copy">
          <p className="hero__eyebrow">Missing Island · Story Archive</p>

          <h1 className="hero__title">
            당신은 어떤
            <br />
            <span className="hero__title-accent">이야기</span>를
            <br />
            가지고 있나요?
          </h1>

          <p className="hero__lead">
            어서오세요.
            <br />
            이 곳은 어디에나 있지만, 어디에도 없는 섬.
          </p>
        </div>
      </section>
    </div>
  );
}

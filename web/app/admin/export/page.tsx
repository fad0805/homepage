import "@/public/styles/admin/main.scss";

const SECTIONS = [
  {
    section: "profile",
    label: "프로필",
    description: "작가 소개와 프로필 정보",
  },
  {
    section: "characters",
    label: "등장인물",
    description: "등장인물·장소·인형·관계와 이미지",
  },
  {
    section: "books",
    label: "목차",
    description: "책·카테고리·챕터 본문",
  },
  {
    section: "illustrations",
    label: "삽화",
    description: "삽화와 원본 이미지",
  },
  {
    section: "memos",
    label: "주석",
    description: "주석 기록",
  },
  {
    section: "links",
    label: "놀러가기",
    description: "링크와 카테고리",
  },
] as const;

export default function AdminExportPage() {
  return (
    <div id="admin-main">
      <header className="admin-dashboard-header">
        <div className="admin-dashboard-header__copy">
          <p className="admin-dashboard-eyebrow">Missing Island · Admin</p>
          <h1 className="admin-dashboard-title">내보내기</h1>
          <p className="admin-dashboard-subtitle">
            전체 기록 또는 필요한 범위만 골라 내려받습니다.
          </p>
        </div>
      </header>

      <section className="admin-dashboard-panel admin-dashboard-archive">
        <header className="admin-dashboard-panel__head">
          <div>
            <h2>전체 내보내기</h2>
            <p>책·삽화·등장인물·링크·프로필·주석을 모두 담습니다.</p>
          </div>
        </header>
        <div className="admin-dashboard-archive__body">
          <p className="admin-dashboard-archive__note">
            원본 이미지까지 하나의 ZIP으로 저장합니다. 이미지가 많으면
            잠시 걸릴 수 있으며, 비공개 기록이 포함될 수 있으므로 안전하게
            보관하세요.
          </p>
          <a
            className="admin-button primary"
            href="/api/archive/export?section=all"
          >
            전체 ZIP 내려받기
          </a>
        </div>
      </section>

      <section className="admin-dashboard-panel">
        <header className="admin-dashboard-panel__head">
          <div>
            <h2>부분 내보내기</h2>
            <p>선택한 범위만 담습니다. 전체 백업이 아닙니다.</p>
          </div>
        </header>
        <div className="admin-export-options">
          {SECTIONS.map((item) => (
            <article className="admin-export-option" key={item.section}>
              <div>
                <h3>{item.label}</h3>
                <p>{item.description}</p>
              </div>
              <a
                className="admin-button"
                href={`/api/archive/export?section=${item.section}`}
              >
                내려받기
              </a>
            </article>
          ))}
        </div>
      </section>

      <p className="admin-export-footnote">
        사용자·세션, 방문·조회 기록, 갤러리 권한, Mastodon 설정·토큰,
        임시저장은 어떤 내보내기에도 포함되지 않습니다.
      </p>
    </div>
  );
}
